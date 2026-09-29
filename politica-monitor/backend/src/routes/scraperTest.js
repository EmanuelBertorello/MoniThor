const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getDb } = require('../lib/firebase');
const { generateId, toDocs } = require('../lib/db');
const { scrapeFacebook } = require('../scrapers/apifyFacebookScraper');
const { scrapeInstagram } = require('../scrapers/apifyInstagramScraper');
const { saveMentions, fbLocationFor } = require('../scrapers/orchestrator');
const { withinBudget } = require('../lib/apifyBudget');

const router = express.Router();
router.use(authenticate);

// Evita repetir la misma llamada a Apify (keyword+red+campaña) si se corrió
// hace poco. Guardado en Firestore (no en memoria) porque Cloud Functions
// recicla instancias seguido — un Map en RAM se pierde entre invocaciones y
// deja de proteger nada en producción.
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

function dedupKeyFor(campaignId, keyword, platform) {
  return `${campaignId}_${platform}_${encodeURIComponent(keyword)}`;
}

async function wasRunRecently(db, campaignId, keyword, platform) {
  const doc = await db.collection('scraperTestDedup').doc(dedupKeyFor(campaignId, keyword, platform)).get();
  if (!doc.exists) return false;
  const last = doc.data().lastRunAt?.toDate?.() || new Date(0);
  return Date.now() - last.getTime() < DEDUP_WINDOW_MS;
}

async function markRunNow(db, campaignId, keyword, platform) {
  await db.collection('scraperTestDedup').doc(dedupKeyFor(campaignId, keyword, platform)).set({ lastRunAt: new Date() });
}

// Tope duro de keywords por corrida de prueba — cada keyword extra son N
// llamadas pagas a Apify (posts + comments). Si querés más, corré varias veces.
const MAX_TEST_KEYWORDS = 5;

async function runWithConcurrency(tasks, limit) {
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

// Botón de prueba (solo dev/test, sacar en producción): corre FB+IG para las
// keywords elegidas, sin filtrar por antigüedad, y guarda igual que una
// corrida normal (mentions + aviso por socket al feed, solo a la campaña).
router.post('/run', async (req, res) => {
  const { campaignId, count, runId, platforms, keywords: selectedKeywords, skipComments } = req.body;

  if (!campaignId) return res.status(400).json({ error: 'campaignId requerido' });
  if (process.env.APIFY_SCRAPING_ENABLED !== 'true') {
    return res.status(400).json({ error: 'Apify deshabilitado (APIFY_SCRAPING_ENABLED != true)' });
  }

  const wantFacebook = !Array.isArray(platforms) || platforms.includes('facebook');
  const wantInstagram = !Array.isArray(platforms) || platforms.includes('instagram');
  if (!wantFacebook && !wantInstagram) {
    return res.status(400).json({ error: 'Seleccioná al menos una red social' });
  }

  if (!(await withinBudget('test-button'))) {
    return res.status(429).json({ error: 'Tope de gasto mensual de Apify alcanzado — probá de nuevo el próximo ciclo' });
  }

  const maxResults = Math.min(Math.max(parseInt(count, 10) || 1, 1), 10);
  const io = global.io;
  // Además de socket (solo sirve en local) escribimos el progreso en Firestore
  // para que el front pueda hacer polling — es lo único que funciona en
  // Cloud Functions, donde no hay conexión persistente.
  const db = getDb();
  const runDocId = runId || generateId();
  const emit = (payload) => {
    if (io) io.to(`campaign:${campaignId}`).emit('scraper-test:progress', { runId, ...payload });
    const { results, ...progressOnly } = payload; // el array completo no va a Firestore, es pesado
    db.collection('scraperTestRuns').doc(runDocId).update(progressOnly).catch(() => {});
  };

  const startedAt = new Date();
  await db.collection('scraperTestRuns').doc(runDocId).set({
    campaignId, userId: req.user.id, status: 'running', startedAt, total: 0, done: 0,
  });

  try {
    const kwSnap = await db.collection('keywords')
      .where('campaignId', '==', campaignId)
      .where('isActive', '==', true).get();
    let keywordDocs = toDocs(kwSnap);
    if (Array.isArray(selectedKeywords) && selectedKeywords.length > 0) {
      keywordDocs = keywordDocs.filter(k => selectedKeywords.includes(k.term));
    }

    if (keywordDocs.length === 0) {
      return res.status(400).json({ error: 'No hay keywords seleccionadas (o activas) para esta campaña' });
    }

    // Tope duro: más keywords = más llamadas pagas a Apify por click.
    const capped = keywordDocs.length > MAX_TEST_KEYWORDS;
    if (capped) keywordDocs = keywordDocs.slice(0, MAX_TEST_KEYWORDS);
    const keywords = keywordDocs.map(k => k.term);

    // Acotado a los ultimos 7 dias: solo sirve para no pagar el actor de
    // comentarios sobre posts ya guardados, no como dedup (de eso se encarga
    // saveMentions con dedupeKey).
    const { recentSocialUrls } = require('../scrapers/orchestrator');
    const excludeUrls = await recentSocialUrls(db, campaignId);

    const campana = await leerCampana(db, campaignId);
    const location = campana ? fbLocationFor(campana) : undefined;

    const jobs = [];
    keywords.forEach(keyword => {
      if (wantFacebook) jobs.push({ keyword, platform: 'facebook' });
      if (wantInstagram) jobs.push({ keyword, platform: 'instagram' });
    });
    const total = jobs.length;

    // Reparto equitativo: si pedís 10 y corren las 2 redes, 5 de cada una
    // en vez de hasta 10 de cada una (20 en total).
    const platformCount = (wantFacebook ? 1 : 0) + (wantInstagram ? 1 : 0);
    const perPlatformMax = platformCount > 1 ? Math.max(1, Math.round(maxResults / platformCount)) : maxResults;

    await db.collection('scraperTestRuns').doc(runDocId).update({
      keywords, platforms: [wantFacebook && 'facebook', wantInstagram && 'instagram'].filter(Boolean), count: maxResults,
      capped, skipComments: !!skipComments, total,
    });

    let done = 0;
    const allResults = [];
    let skipped = 0;

    emit({ status: 'start', total, done });

    const tasks = jobs.map(({ keyword, platform }) => async () => {
      if (await wasRunRecently(db, campaignId, keyword, platform)) {
        skipped++;
        done++;
        emit({ status: 'skipped', total, done, keyword, platform, reason: 'corrido hace menos de 5min' });
        return;
      }

      emit({ status: 'running', total, done, keyword, platform });
      try {
        const scrapeFn = platform === 'facebook' ? scrapeFacebook : scrapeInstagram;
        const items = await scrapeFn({
          keywords: [keyword], maxAgeMins: 999999999, maxPerKeyword: 10, maxResults: perPlatformMax,
          campaignId, excludeUrls, location: platform === 'facebook' ? location : undefined,
          skipComments: !!skipComments,
        });
        allResults.push(...items);
        await markRunNow(db, campaignId, keyword, platform);
      } catch (err) {
        emit({ status: 'error', total, done, keyword, platform, error: err.message });
      }
      done++;
      emit({ status: 'running', total, done, keyword, platform });
    });

    // Concurrencia acotada: no queremos disparar todo junto a la API de Apify.
    await runWithConcurrency(tasks, 3);

    const saved = await saveMentions(campaignId, keywordDocs, allResults);
    if (io && saved > 0) {
      io.to(`campaign:${campaignId}`).emit('mentions:new', {
        count: saved,
        mentions: allResults.slice(0, 10),
      });
    }

    await db.collection('scraperTestRuns').doc(runDocId).update({
      status: 'done', finishedAt: new Date(), resultCount: allResults.length, saved, skipped,
    });

    emit({ status: 'done', total, done, results: allResults, saved, skipped, capped });
    res.json({ results: allResults, saved, skipped, capped });
  } catch (err) {
    emit({ status: 'error', error: err.message });
    await db.collection('scraperTestRuns').doc(runDocId).update({ status: 'error', error: err.message, finishedAt: new Date() }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// Estado de una corrida puntual — el front hace polling acá (funciona en
// Cloud Functions, donde el socket no sirve porque no hay conexión persistente).
router.get('/status', async (req, res) => {
  const { runId } = req.query;
  if (!runId) return res.status(400).json({ error: 'runId requerido' });
  try {
    const db = getDb();
    const doc = await db.collection('scraperTestRuns').doc(runId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Corrida no encontrada' });
    res.json({ run: doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Historial de corridas de prueba (para no perderlo al recargar la página).
router.get('/history', async (req, res) => {
  const { campaignId } = req.query;
  if (!campaignId) return res.status(400).json({ error: 'campaignId requerido' });
  try {
    const db = getDb();
    const snap = await db.collection('scraperTestRuns')
      .where('campaignId', '==', campaignId)
      .limit(50).get();
    const toTime = (v) => (v?.toDate ? v.toDate() : new Date(v)).getTime();
    const runs = toDocs(snap).sort((a, b) => toTime(b.startedAt) - toTime(a.startedAt)).slice(0, 20);
    res.json({ runs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
