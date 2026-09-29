// Corrida horaria: junta publicaciones nuevas para cada campaña activa,
// apuntando a un mínimo por corrida. Nunca lanza: una fuente caída, Apify sin
// presupuesto o Firestore con un error se registran y la corrida sigue, para
// no perder lo ya guardado ni romper el scheduler.
const logger = require('../lib/logger');
const { getDb } = require('../lib/firebase');
const { generateId } = require('../lib/db');
const {
  loadCampaignContext, collectFreeSources, persistMentions, setMaxAge,
} = require('../services/scraperService');
const {
  runFacebookScrape, runInstagramScrape, getActiveCampaignsWithKeywords,
} = require('../scrapers/orchestrator');
const { resultsAllowanceForRun } = require('../lib/apifyBudget');
const { checkAlertRules } = require('../services/notificationService');

// Objetivo de publicaciones NUEVAS por corrida. Es un objetivo, no una
// garantía: si el mundo real no produjo tantas menciones en la ventana, se
// guarda lo que haya y se registra el faltante (nunca se inventa ni se
// re-guarda lo mismo para llegar al número).
const TARGET_PER_RUN = Number(process.env.TARGET_MENTIONS_PER_RUN || 20);

// Escalera de ampliación: si con la ventana corta no se llega al objetivo, se
// vuelve a barrer con una ventana más ancha. Lo ya guardado lo filtra el
// dedup, así que ampliar solo puede sumar material viejo NO visto.
const WINDOW_LADDER_HOURS = [72, 168, 720];

// Colchón de tiempo: Cloud Functions corta a los 540s. Si nos pasamos de este
// presupuesto dejamos de escalar y guardamos lo que haya, en vez de que nos
// maten a mitad de una escritura.
const TIME_BUDGET_MS = Number(process.env.SCRAPE_TIME_BUDGET_MS || 420000);

// Minutos desde la última señal de vida tras los cuales se considera que la
// persona ya no está usando el sistema y sus campañas dejan de scrapearse.
//
// Antes esto eran 24 horas: alcanzaba con haber entrado ayer para que todas
// tus campañas siguieran consumiendo Apify y cuota de Firestore toda la noche.
// Ahora la regla es la que pidió el usuario: se scrapea solo para quien está
// online. 15 minutos es el margen mínimo sensato, porque la señal de vida se
// escribe como mucho cada 5 (ver marcarActividad en middleware/auth.js y el
// latido del socket en api-server.js): con 15 se toleran dos latidos perdidos
// sin dar por ido a alguien que tiene el panel abierto.
const MINUTOS_INACTIVIDAD = Number(process.env.PAUSE_AFTER_IDLE_MINUTES || 15);

// Usuarios habilitados para scrapear: cuenta activa Y online ahora.
// `lastSeenAt` lo escriben el middleware de autenticación (en los requests) y
// el socket del dashboard (mientras la pestaña está abierta, aunque nadie
// toque nada).
async function activeUserIds(db) {
  const snap = await db.collection('users').where('isActive', '==', true).get();
  const corte = Date.now() - MINUTOS_INACTIVIDAD * 60000;

  const habilitados = new Set();
  const dormidos = [];

  for (const d of snap.docs) {
    const u = d.data();
    const visto = u.lastSeenAt?.toDate ? u.lastSeenAt.toDate() : (u.lastSeenAt ? new Date(u.lastSeenAt) : null);

    // Sin `lastSeenAt` no hay forma de saber que esté online, así que no se
    // scrapea. En cuanto entre una vez queda registrado y vuelve solo.
    if (visto && visto.getTime() >= corte) habilitados.add(d.id);
    else if (visto) dormidos.push(`${u.email} (${Math.round((Date.now() - visto.getTime()) / 60000)}min)`);
    else dormidos.push(`${u.email} (nunca entró)`);
  }

  if (dormidos.length) {
    logger.info(`[Hourly] Offline hace más de ${MINUTOS_INACTIVIDAD}min, sus campañas quedan en pausa: ${dormidos.join(', ')}`);
  }
  return habilitados;
}

async function activeCampaigns(db) {
  const snap = await db.collection('campaigns').where('isActive', '==', true).get();
  const campaigns = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Doble condición: la campaña activa Y su dueño online. Sin esto se seguía
  // pagando Apify y quemando cuota de Firestore por campañas de cuentas que
  // nadie tiene abiertas.
  let activos;
  try {
    activos = await activeUserIds(db);
  } catch (err) {
    // Si no se puede verificar quién está online, no se scrapea. Antes se
    // seguía igual con todas las campañas, que es justo lo que satura los
    // límites cuando el que falla es Firestore por cuota agotada.
    logger.warn(`[Hourly] No se pudo verificar quién está online, se saltea la corrida: ${err.message}`);
    return [];
  }

  // Una campaña sin dueño (`userId` vacío) tampoco se scrapea: no hay nadie
  // que pueda estar online para justificar el gasto.
  const habilitadas = campaigns.filter(c => c.userId && activos.has(c.userId));
  const frenadas = campaigns.length - habilitadas.length;
  if (frenadas > 0) {
    logger.info(`[Hourly] ${frenadas} campaña(s) omitida(s): su usuario está desactivado, offline o la campaña no tiene dueño`);
  }
  return habilitadas;
}

// Las campañas nuevas se crean en WARMING_UP con un `warmupUntil` a 1 hora.
// Alguien tiene que pasarlas a ACTIVE cuando ese plazo vence: si no, el banner
// de "campaña en calentamiento" del dashboard no se va nunca.
async function promoteFinishedWarmups(db, campaigns) {
  const now = new Date();
  let promoted = 0;

  for (const c of campaigns) {
    if (c.status !== 'WARMING_UP') continue;
    const until = c.warmupUntil?.toDate ? c.warmupUntil.toDate() : new Date(c.warmupUntil || 0);
    if (now < until) continue;

    try {
      await db.collection('campaigns').doc(c.id).update({ status: 'ACTIVE' });
      c.status = 'ACTIVE';
      promoted++;
      logger.info(`[Hourly] "${c.name}" completó el warmup → ACTIVE`);
    } catch (err) {
      logger.warn(`[Hourly] No se pudo promover "${c.name}": ${err.message}`);
    }
  }

  return promoted;
}

async function scrapeCampaign(campaignId, { target = TARGET_PER_RUN, startedAt = Date.now() } = {}) {
  const db = getDb();
  const ctx = await loadCampaignContext(campaignId);
  if (!ctx) return { saved: 0, reason: 'campaña inexistente' };

  const { campaign, geo } = ctx;
  if (!campaign.keywords.length) return { saved: 0, reason: 'sin keywords activas' };

  let saved = 0;
  const steps = [];
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - startedAt);

  // ── Paso 1..N: fuentes gratis, ampliando la ventana hasta llegar al objetivo
  for (const hours of WINDOW_LADDER_HOURS) {
    if (saved >= target) break;
    if (timeLeft() <= 0) { steps.push({ step: `web:${hours}h`, skipped: 'sin tiempo' }); break; }

    try {
      setMaxAge(hours);
      const raw = await collectFreeSources(campaign, geo);
      const result = await persistMentions(campaignId, raw, { enrichLimit: 10 });
      saved += result.saved;
      steps.push({ step: `web:${hours}h`, raw: raw.length, saved: result.saved, dups: result.duplicates });
      logger.info(`[Hourly] "${campaign.name}" ventana ${hours}h → ${result.saved} nuevas (acumulado ${saved}/${target})`);

      if (result.saved > 0) {
        await checkAlertRules(campaignId, result.mentions, null).catch(err =>
          logger.warn(`[Hourly] Alertas: ${err.message}`));
      }
    } catch (err) {
      steps.push({ step: `web:${hours}h`, error: err.message });
      logger.error(`[Hourly] "${campaign.name}" ventana ${hours}h falló: ${err.message}`);
    }
  }

  return { saved, steps, campaignName: campaign.name };
}

// Complemento pago: solo se usa si las fuentes gratis no alcanzaron el
// objetivo, y acotado al cupo que el presupuesto mensual banca esta hora.
// `skipComments` va en true a propósito: el actor de comentarios es ~95% del
// costo de Apify y hundiría el presupuesto en días.
// Corrida de redes sociales. Antes esto era un "relleno": solo salía si las
// fuentes gratis no llegaban al objetivo, y como Google News casi siempre lo
// supera, Facebook e Instagram no se consultaban nunca. Ahora corre todas las
// horas por derecho propio: son la data que justifica pagar Apify.
//
// `skipComments` va en true a propósito: el actor de comentarios es ~95% del
// costo y a este ritmo se comería el presupuesto en días.
async function apifySocialRun({ startedAt, idsHabilitados = null }) {
  if (process.env.APIFY_SCRAPING_ENABLED !== 'true') {
    return { saved: 0, reason: 'Apify deshabilitado' };
  }
  if (Date.now() - startedAt > TIME_BUDGET_MS) {
    return { saved: 0, reason: 'sin tiempo en esta corrida' };
  }

  const allowance = await resultsAllowanceForRun({ label: 'hourly' });
  if (allowance <= 0) return { saved: 0, reason: 'sin presupuesto Apify este mes' };

  // Las campañas se cargan una sola vez y se le pasan a las dos redes, para no
  // repetir la lectura de Firestore.
  //
  // `idsHabilitados` son las campañas que pasaron el filtro de usuario online.
  // Sin esta intersección, el filtro solo alcanzaba a las fuentes gratis y
  // Apify —la parte que se paga— seguía corriendo para TODAS las campañas
  // activas, incluidas las de cuentas que nadie abre hace días. Es justo al
  // revés de lo que se quería al agregar el filtro.
  const todas = await getActiveCampaignsWithKeywords();
  const campaigns = idsHabilitados
    ? todas.filter(c => idsHabilitados.has(c.id))
    : todas;
  if (!campaigns.length) {
    return { saved: 0, reason: idsHabilitados ? 'sin campañas de usuarios online' : 'sin campañas activas' };
  }

  // El cupo es de resultados TOTALES de la corrida, y el actor se paga por
  // resultado devuelto en cada llamada. Como se llama una vez por keyword y por
  // red, hay que repartirlo entre todas esas llamadas: repartirlo solo entre las
  // dos redes multiplicaba el gasto por la cantidad de campañas y agotaba el
  // presupuesto del mes en la primera semana.
  const totalKeywords = campaigns.reduce((n, c) => n + c.keywords.length, 0) || 1;
  const llamadasPorCorrida = totalKeywords * 2;   // x Facebook e Instagram
  const perKeyword = Math.max(1, Math.floor(allowance / llamadasPorCorrida));
  const maxResults = Math.max(1, Math.min(
    perKeyword,
    Number(process.env.APIFY_POSTS_PER_KEYWORD || 3),
  ));

  logger.info(`[Hourly] Apify: cupo ${allowance} resultados / ${llamadasPorCorrida} llamadas = ${perKeyword} por keyword y red`);

  // Las dos redes van en paralelo: son ~25s por llamada al actor y en serie la
  // corrida se iba a ~4 minutos, que contra las ~450 corridas del mes no entra
  // en los 2000 minutos de GitHub Actions. El plan de Apify admite 32 actores
  // simultáneos, así que no hay riesgo de encolarse.
  const plataformas = [['facebook', runFacebookScrape], ['instagram', runInstagramScrape]];

  const resultados = await Promise.allSettled(
    plataformas.map(([, fn]) => fn({ maxPerKeyword: perKeyword, maxResults, campaigns, skipComments: true })),
  );

  let saved = 0;
  const detail = {};
  resultados.forEach((res, i) => {
    const name = plataformas[i][0];
    if (res.status === 'fulfilled') {
      saved += res.value.saved || 0;
      detail[name] = res.value.skipped ? 'omitido' : (res.value.saved || 0);
    } else {
      detail[name] = `error: ${res.reason?.message || res.reason}`;
      logger.error(`[Hourly] Apify ${name}: ${res.reason?.message || res.reason}`);
    }
  });

  return { saved, allowance, perKeyword, maxResults, campanas: campaigns.length, detail };
}

async function runHourlyScrape() {
  const startedAt = Date.now();
  const runId = generateId();
  const db = getDb();
  const summary = { runId, startedAt: new Date(), campaigns: [], totalSaved: 0 };

  try {
    const campaigns = await activeCampaigns(db);
    if (!campaigns.length) {
      logger.warn('[Hourly] No hay campañas con isActive=true — nada que scrapear');
      summary.warning = 'sin campañas activas';
    }

    summary.warmupsPromovidos = await promoteFinishedWarmups(db, campaigns);

    for (const c of campaigns) {
      const r = await scrapeCampaign(c.id, { startedAt });
      summary.campaigns.push({ id: c.id, name: c.name, ...r });
      summary.totalSaved += r.saved || 0;

      const status = r.error ? 'error' : 'ok';
      await db.collection('campaigns').doc(c.id).update({
        lastScraped: new Date(),
        scrapeStatus: status,
        lastScrapeCount: r.saved || 0,
      }).catch(err => logger.warn(`[Hourly] No se pudo marcar lastScraped: ${err.message}`));
    }

    // Facebook e Instagram corren siempre, independientemente de cuánto hayan
    // traído las fuentes gratis.
    summary.apify = await apifySocialRun({
      startedAt,
      idsHabilitados: new Set(campaigns.map(c => c.id)),
    });
    summary.totalSaved += summary.apify.saved || 0;

    if (summary.totalSaved < TARGET_PER_RUN) {
      summary.shortfall = TARGET_PER_RUN - summary.totalSaved;
      logger.warn(`[Hourly] Objetivo ${TARGET_PER_RUN}, obtenidas ${summary.totalSaved} — faltaron ${summary.shortfall} (no hay más material nuevo disponible)`);
    }
  } catch (err) {
    // Red de seguridad: nada de acá arriba puede tirar el scheduler.
    summary.error = err.message;
    logger.error(`[Hourly] Error no controlado: ${err.stack}`);
  }

  summary.finishedAt = new Date();
  summary.durationMs = Date.now() - startedAt;
  logger.info(`[Hourly] Fin — ${summary.totalSaved} menciones nuevas en ${(summary.durationMs / 1000).toFixed(1)}s`);

  // Registro de la corrida: sirve para auditar si se cumple el mínimo horario.
  await db.collection('scrapeRuns').doc(runId).set(summary)
    .catch(err => logger.warn(`[Hourly] No se pudo registrar la corrida: ${err.message}`));

  return summary;
}

module.exports = { runHourlyScrape, scrapeCampaign, apifySocialRun, TARGET_PER_RUN, WINDOW_LADDER_HOURS };
