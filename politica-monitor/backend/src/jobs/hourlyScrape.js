// hourlyScrape.js
// Refactorizado para usar la arquitectura secuencial "Round-Robin" (FB -> IG -> Web)

const logger = require('../lib/logger');
const { getDb } = require('../lib/firebase');
const { generateId } = require('../lib/db');
const { loadCampaignContext, collectFreeSources, persistMentions, setMaxAge } = require('../services/scraperService');
const { runSequentialScrape } = require('../scrapers/orchestrator');
const { resultsAllowanceForRun } = require('../lib/apifyBudget');
const { checkAlertRules } = require('../services/notificationService');

const TARGET_PER_RUN = Number(process.env.TARGET_MENTIONS_PER_RUN || 20);
const WINDOW_LADDER_HOURS = [72, 168, 720];
const TIME_BUDGET_MS = Number(process.env.SCRAPE_TIME_BUDGET_MS || 420000);
const MINUTOS_INACTIVIDAD = Number(process.env.PAUSE_AFTER_IDLE_MINUTES || 15);

async function activeUserIds(db) {
  const snap = await db.collection('users').where('isActive', '==', true).get();
  const corte = Date.now() - MINUTOS_INACTIVIDAD * 60000;
  const habilitados = new Set();

  for (const d of snap.docs) {
    const u = d.data();
    const visto = u.lastSeenAt?.toDate ? u.lastSeenAt.toDate() : (u.lastSeenAt ? new Date(u.lastSeenAt) : null);
    if (visto && visto.getTime() >= corte) habilitados.add(d.id);
  }
  return habilitados;
}

async function activeCampaigns(db) {
  const snap = await db.collection('campaigns').where('isActive', '==', true).get();
  const campaigns = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  let activos;
  try {
    activos = await activeUserIds(db);
  } catch (err) {
    logger.warn(`[Hourly] No se pudo verificar quién está online: ${err.message}`);
    return [];
  }

  return campaigns.filter(c => c.userId && activos.has(c.userId));
}

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

// Fallback: Si la pasada secuencial no alcanzó el objetivo, se ensancha la búsqueda Web
async function fallbackWebLadder(campaign, target, currentSaved, startedAt) {
  let saved = 0;
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - startedAt);
  const ctx = await loadCampaignContext(campaign.id);
  if (!ctx) return 0;

  // Arrancamos desde el segundo escalón (168h) porque 72h ya se hizo en la pasada principal
  for (const hours of WINDOW_LADDER_HOURS.slice(1)) {
    if (currentSaved + saved >= target) break;
    if (timeLeft() <= 0) break;

    try {
      setMaxAge(hours);
      const raw = await collectFreeSources(ctx.campaign, ctx.geo);
      const result = await persistMentions(campaign.id, raw, { enrichLimit: 10 });
      saved += result.saved;
      logger.info(`[Hourly] "${campaign.name}" escalera Web ampliada ${hours}h → ${result.saved} nuevas`);

      if (result.saved > 0 && result.mentions) {
        await checkAlertRules(campaign.id, result.mentions, null).catch(err =>
          logger.warn(`[Hourly] Alertas: ${err.message}`));
      }
    } catch (err) {
      logger.error(`[Hourly] "${campaign.name}" escalera Web ${hours}h falló: ${err.message}`);
    }
  }
  return saved;
}

async function runHourlyScrape() {
  const startedAt = Date.now();
  const runId = generateId();
  const db = getDb();
  const summary = { runId, startedAt: new Date(), totalSaved: 0, bySource: {} };

  try {
    const campaigns = await activeCampaigns(db);
    if (!campaigns.length) {
      logger.warn('[Hourly] No hay campañas habilitadas — nada que scrapear');
      return { saved: 0 };
    }

    summary.warmupsPromovidos = await promoteFinishedWarmups(db, campaigns);

    // 1. Calcular presupuesto Apify antes de arrancar
    const allowance = await resultsAllowanceForRun({ label: 'hourly' });
    const totalKeywords = campaigns.reduce((n, c) => n + c.keywords.length, 0) || 1;
    const llamadasPorCorrida = totalKeywords * 2;
    const perKeyword = allowance > 0 ? Math.max(1, Math.floor(allowance / llamadasPorCorrida)) : 0;
    const maxResults = Math.max(1, Math.min(perKeyword, Number(process.env.APIFY_POSTS_PER_KEYWORD || 3)));

    logger.info(`[Hourly] Iniciando orquestación secuencial. Apify: cupo ${perKeyword} por kw/red`);

    // 2. Pasada Secuencial (FB -> IG -> Web a 72h) delegada al orquestador
    const resultSeq = await runSequentialScrape({
      campaigns,
      maxPerKeyword: perKeyword,
      maxResults: maxResults,
      skipComments: true,
      webMaxAgeHours: WINDOW_LADDER_HOURS[0],
      timeBudgetMs: TIME_BUDGET_MS,
      // Callback inyectado para disparar notificaciones cuando el orquestador guarda datos
      onMentionsSaved: async (campId, mentions) => {
        await checkAlertRules(campId, mentions, null).catch(e => logger.warn(`Alertas fallaron: ${e.message}`));
      }
    });

    summary.totalSaved += resultSeq.totalSaved || 0;
    summary.bySource = resultSeq.bySource || {};

    // 3. Fallback: Si no llegamos a las 20 menciones, corremos la escalera ancha solo para Web
    if (summary.totalSaved < TARGET_PER_RUN) {
      logger.info(`[Hourly] Objetivo ${TARGET_PER_RUN} no alcanzado (${summary.totalSaved}). Activando escalera Web...`);
      for (const c of campaigns) {
        if (summary.totalSaved >= TARGET_PER_RUN) break;
        const extra = await fallbackWebLadder(c, TARGET_PER_RUN, summary.totalSaved, startedAt);
        summary.totalSaved += extra;
        summary.bySource.WEB = (summary.bySource.WEB || 0) + extra;
      }
    }

    // Actualizar metadata de las campañas
    for (const c of campaigns) {
      await db.collection('campaigns').doc(c.id).update({
        lastScraped: new Date(),
        scrapeStatus: 'ok',
        lastScrapeCount: summary.totalSaved
      }).catch(err => logger.warn(`[Hourly] Error al actualizar estado: ${err.message}`));
    }

  } catch (err) {
    summary.error = err.message;
    logger.error(`[Hourly] Error no controlado: ${err.stack}`);
  }

  summary.finishedAt = new Date();
  summary.durationMs = Date.now() - startedAt;
  logger.info(`[Hourly] Fin — ${summary.totalSaved} menciones nuevas en ${(summary.durationMs / 1000).toFixed(1)}s`);

  await db.collection('scrapeRuns').doc(runId).set(summary).catch(e => {});
  return summary;
}

module.exports = { runHourlyScrape, TARGET_PER_RUN, WINDOW_LADDER_HOURS };