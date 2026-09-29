// Ventana de scraping continuo para UNA campaña puntual.
//
// Para qué: juntar data de una campaña durante N horas seguidas sin depender
// de que su dueño tenga el panel abierto. El job horario (jobs/hourlyScrape)
// solo scrapea campañas de usuarios online, y eso lo deja sin correr cuando
// nadie está mirando; acá ese filtro no aplica porque la campaña la elige una
// persona a mano al lanzar el script.
//
// Tampoco se toca `lastSeenAt` para simular presencia: eso habilitaría TODAS
// las campañas de ese usuario y multiplicaría el gasto de Apify.
//
//   node src/scripts/ventana-scraping.js --campana=<id> [--horas=4] [--cada=30]
//                                        [--dolares=3] [--apify-cada=3]
//
// `--dolares` fija cuánto se puede gastar en Apify durante TODA la ventana.
// Sin él se usa el cupo automático del presupuesto mensual (unos centavos por
// corrida), que sirve para el régimen permanente pero queda corto cuando lo
// que se quiere es juntar material de golpe. El gasto se mide contra el uso
// real que reporta Apify, no contra una estimación: lo que una corrida no
// gasta queda disponible para las siguientes.
//
// Cada corrida queda registrada en la colección `scrapeRuns` con origen
// "ventana-manual", para poder auditar después qué trajo cada una.
require('dotenv').config();

const axios = require('axios');
const logger = require('../lib/logger');
const { connectDB, generateId } = require('../lib/db');
const { getDb } = require('../lib/firebase');
const { scrapeCampaign } = require('../jobs/hourlyScrape');
const {
  runFacebookScrape, runInstagramScrape, getActiveCampaignsWithKeywords,
} = require('../scrapers/orchestrator');
const { resultsAllowanceForRun, USD_PER_RESULT, monthlyCapUsd } = require('../lib/apifyBudget');

function arg(nombre, porDefecto) {
  const hit = process.argv.find(a => a.startsWith(`--${nombre}=`));
  return hit ? hit.split('=').slice(1).join('=') : porDefecto;
}

const CAMPANA = arg('campana', '');
const HORAS = Number(arg('horas', 4));
const CADA_MIN = Number(arg('cada', 30));
const DOLARES = Number(arg('dolares', 0));   // 0 = cupo mensual automático

// Cada cuántas corridas se consulta Apify. Las fuentes gratis pueden correr
// cada 10 minutos sin costo, pero Apify cobra un fee fijo por llamada: pedirle
// lotes chicos muy seguido paga ese fee una y otra vez para revisar casi los
// mismos posts. Espaciarlo hace lotes más grandes por el mismo dinero.
const APIFY_CADA = Math.max(1, Number(arg('apify-cada', 1)));

// Tope de resultados por llamada al actor cuando hay presupuesto en dólares.
// El costo lo manda esto (se paga por resultado devuelto), no la cantidad de
// posts que después matchean la keyword.
const TOPE_POR_LLAMADA = Number(process.env.VENTANA_MAX_POR_LLAMADA || 150);

// Piso de plata por debajo del cual no se llama a Apify. Medido: una corrida
// con 3 keywords cuesta ~$0.25-0.30 reales, bastante más que lo que estima
// USD_PER_RESULT (los actores devuelven lotes más grandes de lo pedido y cada
// llamada tiene fee fijo). Sin este piso, la última corrida se pasa del
// presupuesto porque el gasto recién se puede medir después de gastarlo.
const MINIMO_POR_CORRIDA = Number(process.env.VENTANA_MINIMO_USD || 0.3);

const dormir = ms => new Promise(r => setTimeout(r, ms));

// Uso del ciclo de facturación actual, leído fresco. `apifyBudget` lo cachea 5
// minutos: sirve para decidir si seguir gastando, no para medir cuánto gastó
// la corrida anterior.
async function usoApifyUsd() {
  const { data } = await axios.get('https://api.apify.com/v2/users/me/usage/monthly', {
    params: { token: process.env.APIFY_API_KEY },
    timeout: 15000,
  });
  return data.data.totalUsageCreditsUsdAfterVolumeDiscount || 0;
}

// Mismo criterio que el job horario: sin comentarios (el actor de comentarios
// es ~95% del costo de Apify), y acotado a la campaña elegida.
async function apifyDeLaCampana(campanaApify, { presupuestoUsd = 0, modoDolares = false } = {}) {
  if (process.env.APIFY_SCRAPING_ENABLED !== 'true') return { saved: 0, reason: 'Apify deshabilitado' };
  if (!campanaApify) return { saved: 0, reason: 'la campaña no tiene keywords activas' };

  // En modo dólares, sin plata asignada no se cae al cupo mensual automático:
  // eso gastaría igual, solo que unos centavos por afuera del presupuesto.
  if (modoDolares && presupuestoUsd <= 0) return { saved: 0, reason: 'corrida sin presupuesto asignado' };

  const llamadas = campanaApify.keywords.length * 2;          // Facebook + Instagram
  let perKeyword;
  let allowance;

  if (presupuestoUsd > 0) {
    // Modo presupuesto explícito: la plata se convierte en resultados pedidos.
    allowance = Math.floor(presupuestoUsd / USD_PER_RESULT);
    perKeyword = Math.max(1, Math.min(Math.floor(allowance / llamadas), TOPE_POR_LLAMADA));
  } else {
    allowance = await resultsAllowanceForRun({ label: 'ventana' });
    if (allowance <= 0) return { saved: 0, reason: 'sin presupuesto Apify este mes' };
    perKeyword = Math.max(1, Math.floor(allowance / llamadas));
  }

  // Cuántos de los posts revisados se guardan. Con presupuesto grande no tiene
  // sentido tirar los matches de más: lo caro es revisarlos, guardarlos ya está
  // pago. Los repetidos los filtra el dedup igual.
  const maxResults = presupuestoUsd > 0
    ? perKeyword
    : Math.max(1, Math.min(perKeyword, Number(process.env.APIFY_POSTS_PER_KEYWORD || 3)));

  // `maxLimitCap` acompaña a perKeyword: si no, el escalado interno del actor
  // queda clavado en 40 resultados y el presupuesto no se puede gastar.
  const opciones = {
    maxPerKeyword: perKeyword,
    maxResults,
    maxLimitCap: Math.max(40, perKeyword * 2),
    campaigns: [campanaApify],
    skipComments: true,
  };
  if (presupuestoUsd > 0) {
    logger.info(`[Ventana] Apify: presupuesto $${presupuestoUsd.toFixed(3)} → ${perKeyword} resultados por keyword y red`);
  }

  const redes = [['facebook', runFacebookScrape], ['instagram', runInstagramScrape]];
  const res = await Promise.allSettled(redes.map(([, fn]) => fn(opciones)));

  let saved = 0;
  const detail = {};
  res.forEach((r, i) => {
    const red = redes[i][0];
    if (r.status === 'fulfilled') {
      saved += r.value.saved || 0;
      detail[red] = r.value.skipped ? 'omitido' : (r.value.saved || 0);
    } else {
      detail[red] = `error: ${r.reason?.message || r.reason}`;
      logger.error(`[Ventana] Apify ${red}: ${r.reason?.message || r.reason}`);
    }
  });

  return { saved, allowance, perKeyword, maxResults, detail };
}

async function corrida(n, total, { presupuestoUsd = 0, modoDolares = false } = {}) {
  const db = getDb();
  const runId = generateId();
  const startedAt = Date.now();
  const resumen = { runId, origen: 'ventana-manual', corrida: `${n}/${total}`, startedAt: new Date(), campaigns: [], totalSaved: 0 };

  try {
    const r = await scrapeCampaign(CAMPANA, { startedAt });
    resumen.campaigns.push({ id: CAMPANA, ...r });
    resumen.totalSaved += r.saved || 0;

    await db.collection('campaigns').doc(CAMPANA).update({
      lastScraped: new Date(),
      scrapeStatus: r.error ? 'error' : 'ok',
      lastScrapeCount: r.saved || 0,
    }).catch(err => logger.warn(`[Ventana] No se pudo marcar lastScraped: ${err.message}`));

    // Las campañas de Apify se releen en cada corrida a propósito: si alguien
    // agrega o desactiva una keyword mientras la ventana corre, se respeta.
    const campanaApify = (await getActiveCampaignsWithKeywords()).find(c => c.id === CAMPANA);
    resumen.apify = await apifyDeLaCampana(campanaApify, { presupuestoUsd, modoDolares });
    resumen.totalSaved += resumen.apify.saved || 0;
  } catch (err) {
    // Una corrida que falla no puede cortar la ventana entera.
    resumen.error = err.message;
    logger.error(`[Ventana] Corrida ${n} falló: ${err.stack}`);
  }

  resumen.finishedAt = new Date();
  resumen.durationMs = Date.now() - startedAt;
  logger.info(`[Ventana] Corrida ${n}/${total} — ${resumen.totalSaved} menciones nuevas en ${(resumen.durationMs / 1000).toFixed(1)}s`);

  await db.collection('scrapeRuns').doc(runId).set(resumen)
    .catch(err => logger.warn(`[Ventana] No se pudo registrar la corrida: ${err.message}`));

  return resumen.totalSaved;
}

async function main() {
  if (!CAMPANA) throw new Error('Falta --campana=<id>');

  await connectDB();
  const doc = await getDb().collection('campaigns').doc(CAMPANA).get();
  if (!doc.exists) throw new Error(`La campaña ${CAMPANA} no existe`);

  const corridas = Math.max(1, Math.floor((HORAS * 60) / CADA_MIN));
  logger.info(`[Ventana] "${doc.data().name}" — ${HORAS}h, una corrida cada ${CADA_MIN}min (${corridas} en total)`);

  // Punto de partida del gasto: todo lo que Apify cobre de acá en adelante es
  // de esta ventana. Si la lectura falla se sigue con el cupo mensual
  // automático, en vez de gastar sin poder medir.
  let usoInicial = null;
  if (DOLARES > 0) {
    try {
      usoInicial = await usoApifyUsd();
      logger.info(`[Ventana] Presupuesto de la ventana: $${DOLARES} (uso del ciclo hasta ahora: $${usoInicial.toFixed(2)}, tope mensual $${monthlyCapUsd()})`);
    } catch (err) {
      logger.warn(`[Ventana] No se pudo leer el uso de Apify (${err.message}) — sigo con el cupo mensual automático`);
    }
  }

  let total = 0;
  for (let i = 1; i <= corridas; i++) {
    // Lo que queda del presupuesto se reparte entre las corridas que faltan.
    // Como se recalcula con el gasto REAL, una corrida que gastó poco le deja
    // más margen a las siguientes y el total nunca pasa del objetivo.
    let presupuestoUsd = 0;
    const tocaApify = (i - 1) % APIFY_CADA === 0;
    if (usoInicial !== null && tocaApify) {
      try {
        const gastado = Math.max(await usoApifyUsd() - usoInicial, 0);
        const restante = Math.max(DOLARES - gastado, 0);
        const corridasConApify = Math.max(Math.ceil((corridas - i + 1) / APIFY_CADA), 1);
        presupuestoUsd = restante / corridasConApify;
        logger.info(`[Ventana] Gastado en Apify: $${gastado.toFixed(3)} de $${DOLARES} — quedan $${restante.toFixed(3)}`);

        // Con menos que el piso no se llama: una corrida cuesta lo que cuesta,
        // y el gasto solo se puede medir DESPUÉS de hacerla. Mejor dejar el
        // resto sin usar que pasarse del presupuesto pactado.
        if (presupuestoUsd < MINIMO_POR_CORRIDA) {
          if (restante >= MINIMO_POR_CORRIDA) {
            // Queda plata pero repartida es polvo: se junta en una sola corrida
            // que valga la pena en vez de gotearla.
            presupuestoUsd = restante;
          } else {
            presupuestoUsd = 0;
            logger.info(`[Ventana] Quedan $${restante.toFixed(3)}, menos que el mínimo de $${MINIMO_POR_CORRIDA} — el resto de la ventana va solo con fuentes gratis`);
          }
        }
      } catch (err) {
        logger.warn(`[Ventana] No se pudo medir el gasto (${err.message}) — esta corrida va sin Apify`);
      }
    } else if (usoInicial !== null) {
      logger.info(`[Ventana] Corrida ${i}: solo fuentes gratis (Apify va 1 de cada ${APIFY_CADA})`);
    }

    total += await corrida(i, corridas, { presupuestoUsd, modoDolares: usoInicial !== null });
    if (i < corridas) {
      logger.info(`[Ventana] Acumulado ${total} menciones — próxima corrida en ${CADA_MIN}min`);
      await dormir(CADA_MIN * 60000);
    }
  }

  if (usoInicial !== null) {
    try {
      logger.info(`[Ventana] Gasto final de Apify en la ventana: $${(await usoApifyUsd() - usoInicial).toFixed(3)}`);
    } catch {}
  }
  logger.info(`[Ventana] Fin de la ventana — ${total} menciones nuevas en ${HORAS}h`);
  process.exit(0);
}

main().catch(err => { logger.error(`[Ventana] ${err.message}`); process.exit(1); });
