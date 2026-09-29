const logger = require('../lib/logger');
const { getDb } = require('../lib/firebase');
const { generateId, toDocs } = require('../lib/db');
const { analyzeSentiment } = require('../services/sentimentService');
const { scrapeInstagram } = require('./apifyInstagramScraper');
const { scrapeFacebook } = require('./apifyFacebookScraper');
const { dedupeBatch, dedupeKey } = require('../lib/dedupe');
const { withinBudget } = require('../lib/apifyBudget');

// El actor de FB solo acepta hasta 15 caracteres de "location". Preferimos
// provincia (alcance más amplio) — si no entra, la achicamos sacando espacios
// primero ("TierradelFuego") y si todavía no entra la truncamos a 15
// (probado: sigue matcheando geo real, no lo ignora silenciosamente). Cae a
// ciudad solo si no hay provincia configurada.
function fbLocationFor(campaign) {
  try {
    const { provincia, ciudad } = JSON.parse(campaign.description || '{}');
    if (provincia) {
      if (provincia.length <= 15) return provincia;
      const noSpaces = provincia.replace(/\s+/g, '');
      if (noSpaces.length <= 15) return noSpaces;
      return noSpaces.slice(0, 15);
    }
    if (ciudad && ciudad.length <= 15) return ciudad;
  } catch {}
  return undefined;
}

async function getActiveCampaignsWithKeywords() {
  const db = getDb();
  const snap = await db.collection('campaigns').where('isActive', '==', true).get();

  const campaigns = [];
  for (const doc of snap.docs) {
    const campaign = { id: doc.id, ...doc.data() };
    const kwSnap = await db.collection('keywords')
      .where('campaignId', '==', doc.id)
      .where('isActive', '==', true).get();
    campaign.keywordDocs = toDocs(kwSnap);
    campaign.keywords = campaign.keywordDocs.map(k => k.term);
    if (campaign.keywords.length) campaigns.push(campaign);
  }
  return campaigns;
}

async function analyzeComments(texts) {
  return Promise.all(texts.map(async text => {
    const { sentiment } = await analyzeSentiment(text);
    return { text, sentiment };
  }));
}

async function saveMentions(campaignId, keywordDocs, rawMentions) {
  if (!rawMentions.length) return 0;
  const db = getDb();

  // Identidad canónica compartida con el resto del sistema (URL normalizada
  // por red, o hash de contenido si no hay URL usable).
  const batchIn = dedupeBatch(rawMentions);

  const urls = batchIn.map(m => m.sourceUrl).filter(Boolean);
  const existingByKey = new Map();
  const lookup = async (field, values) => {
    const uniq = [...new Set(values.filter(Boolean))];
    for (let i = 0; i < uniq.length; i += 30) {
      const chunk = uniq.slice(i, i + 30);
      const snap = await db.collection('mentions')
        .where('campaignId', '==', campaignId)
        .where(field, 'in', chunk).get();
      snap.docs.forEach(d => {
        const key = d.data().dedupeKey || dedupeKey(d.data());
        existingByKey.set(key, d);
      });
    }
  };
  await lookup('dedupeKey', batchIn.map(m => m.dedupeKey));
  await lookup('sourceUrl', urls);

  // Si ya existe pero le faltan los comentarios (guardado antes de que el
  // scraper los trajera), lo actualizamos en vez de descartarlo.
  const toEnrich = [];
  for (const m of batchIn) {
    const existingDoc = existingByKey.get(m.dedupeKey);
    if (!existingDoc) continue;
    const existingComments = existingDoc.data().commentsList || [];
    const incomingComments = m.extra?.comments || [];
    if (existingComments.length === 0 && incomingComments.length > 0) {
      toEnrich.push({ ref: existingDoc.ref, incomingComments, extra: m.extra });
    }
  }
  for (const { ref, incomingComments, extra } of toEnrich) {
    try {
      const commentsList = await analyzeComments(incomingComments);
      await ref.update({ commentsList, extra });
    } catch (err) {
      logger.warn(`[SaveMentions] No se pudo enriquecer ${ref.id}: ${err.message}`);
    }
  }

  const newOnly = batchIn.filter(m => !existingByKey.has(m.dedupeKey));

  const toSave = [];
  for (const m of newOnly) {
    const { sentiment, score } = await analyzeSentiment(m.content || '');
    const kwDoc = keywordDocs.find(k => {
      const base = k.term.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(' ')[0];
      return (m.content || '').toLowerCase().includes(base);
    });
    const commentsList = await analyzeComments(m.extra?.comments || []);

    toSave.push({
      campaignId,
      keywordId: kwDoc?.id || null,
      dedupeKey: m.dedupeKey,
      source: m.source,
      sourceUrl: m.sourceUrl || null,
      sourceName: m.sourceName || m.source,
      author: m.author || null,
      content: (m.content || '').slice(0, 2000),
      snippet: (m.snippet || m.content || '').slice(0, 300),
      sentiment,
      sentimentScore: score,
      reach: m.reach || 0,
      engagement: m.engagement || 0,
      isRead: false,
      publishedAt: m.publishedAt || new Date(),
      createdAt: new Date(),
      commentsList,
      extra: m.extra || null,
    });
  }

  if (toSave.length > 0) {
    try {
      for (let i = 0; i < toSave.length; i += 500) {
        const batch = db.batch();
        toSave.slice(i, i + 500).forEach(mention => {
          batch.set(db.collection('mentions').doc(generateId()), mention);
        });
        await batch.commit();
      }
    } catch (err) {
      logger.error(`[SaveMentions] Error guardando: ${err.message}`);
      return 0;
    }
  }

  if (toEnrich.length > 0) logger.info(`[SaveMentions] ${toEnrich.length} mención(es) existentes actualizadas con comentarios`);

  return toSave.length;
}

// URLs de FB/IG ya guardadas, acotadas a los últimos N días. Sirve solo para
// no pagar el actor de comentarios sobre posts que ya tenemos; leer la
// colección entera en cada corrida era un costo de Firestore innecesario.
async function recentSocialUrls(db, campaignId, days = 7) {
  const since = new Date(Date.now() - days * 86400000);
  const base = db.collection('mentions')
    .where('campaignId', '==', campaignId)
    .where('source', 'in', ['FACEBOOK', 'INSTAGRAM']);

  try {
    // Camino rápido: el rango de fechas lo filtra Firestore. Necesita el índice
    // compuesto (campaignId, source, createdAt) de firestore.indexes.json.
    const snap = await base.where('createdAt', '>=', since).get();
    return new Set(snap.docs.map(d => d.data().sourceUrl).filter(Boolean));
  } catch (err) {
    if (err.code !== 9 && !/requires an index/i.test(err.message || '')) {
      logger.warn(`[Orchestrator] No se pudieron leer URLs recientes: ${err.message}`);
      return new Set();
    }
    // Sin ese índice desplegado: solo filtros de igualdad (no lo necesitan) y
    // el recorte por fecha en memoria. Más caro en lecturas, pero funciona.
    logger.warn('[Orchestrator] Índice (campaignId, source, createdAt) ausente — uso el camino lento');
    try {
      const snap = await base.get();
      const urls = snap.docs
        .filter(d => {
          const c = d.data().createdAt;
          const t = c?.toDate ? c.toDate() : new Date(c || 0);
          return t >= since;
        })
        .map(d => d.data().sourceUrl)
        .filter(Boolean);
      return new Set(urls);
    } catch (err2) {
      logger.warn(`[Orchestrator] No se pudieron leer URLs recientes: ${err2.message}`);
      return new Set();
    }
  }
}

async function runPlatformScrape(platform, scrapeFn, { maxAgeMins, maxPerKeyword, maxResults = 1, skipComments = false, campaigns: preloaded } = {}) {
  if (process.env.APIFY_SCRAPING_ENABLED !== 'true') {
    logger.info(`[${platform}] Apify scraping deshabilitado (APIFY_SCRAPING_ENABLED != true) — omitido`);
    return { saved: 0, skipped: true };
  }

  if (!(await withinBudget(platform))) return { saved: 0, skipped: true };

  const campaigns = preloaded || await getActiveCampaignsWithKeywords();
  let totalSaved = 0;

  for (const campaign of campaigns) {
    if (!(await withinBudget(platform))) {
      logger.warn(`[${platform}] Tope alcanzado a mitad de run — corto acá, ${campaigns.length - campaigns.indexOf(campaign)} campaña(s) sin correr`);
      break;
    }
    try {
      const location = platform === 'Facebook' ? fbLocationFor(campaign) : undefined;
      const db = getDb();
      const excludeUrls = await recentSocialUrls(db, campaign.id);

      const mentions = await scrapeFn({
        keywords: campaign.keywords, maxAgeMins, maxPerKeyword, maxResults,
        campaignId: campaign.id, location, excludeUrls, skipComments,
      });
      const saved = await saveMentions(campaign.id, campaign.keywordDocs, mentions);
      totalSaved += saved;
      if (saved > 0) logger.info(`[${platform}] "${campaign.name}": ${saved} nuevas`);
    } catch (err) {
      // Una campaña que falla no corta las demás ni tira la corrida.
      logger.error(`[${platform}] "${campaign.name}": ${err.message}`);
    }
  }

  return { saved: totalSaved };
}

// Ventana de 24h y no de 90min: la búsqueda por keyword de FB/IG no devuelve
// necesariamente lo más reciente, así que con una ventana angosta el actor se
// pagaba igual y no matcheaba nada. Con 24h cada corrida puede encontrar
// cualquier post del último día que todavía no se haya visto; lo ya guardado lo
// descarta el dedup, así que ampliar no genera repetidos.
const SOCIAL_WINDOW_MINS = Number(process.env.APIFY_WINDOW_MINS || 1440);

async function runFacebookScrape(opts = {}) {
  return runPlatformScrape('Facebook', scrapeFacebook, { maxAgeMins: SOCIAL_WINDOW_MINS, maxPerKeyword: 20, ...opts });
}

async function runInstagramScrape(opts = {}) {
  return runPlatformScrape('Instagram', scrapeInstagram, { maxAgeMins: SOCIAL_WINDOW_MINS, maxPerKeyword: 20, ...opts });
}

// Corrida manual/test: FB + IG juntas para UNA campaña puntual
async function runCrawlerScrape(campaignId, opts = {}) {
  if (process.env.APIFY_SCRAPING_ENABLED !== 'true') {
    logger.info('[Orchestrator][manual] Apify scraping deshabilitado (APIFY_SCRAPING_ENABLED != true) — omitido');
    return { saved: 0, mentions: [], skipped: true };
  }

  const { warmup = false } = opts;
  const db = getDb();
  const campDoc = await db.collection('campaigns').doc(campaignId).get();
  if (!campDoc.exists) return { saved: 0, mentions: [] };

  const campaign = campDoc.data();
  const kwSnap = await db.collection('keywords')
    .where('campaignId', '==', campaignId)
    .where('isActive', '==', true).get();
  const keywordDocs = toDocs(kwSnap);
  const keywords = keywordDocs.map(k => k.term);
  if (!keywords.length) return { saved: 0, mentions: [] };

  const maxAgeMins = warmup ? 2880 : 20;
  const maxPerKeyword = warmup ? 20 : 10;
  const args = { keywords, maxAgeMins, maxPerKeyword, campaignId };

  logger.info(`[Orchestrator][manual] "${campaign.name}" | ${keywords.length} keywords`);

  const allResults = [];
  const fb = await scrapeFacebook(args).catch(e => { logger.error(`[Orchestrator] Facebook: ${e.message}`); return []; });
  allResults.push(...fb);
  const ig = await scrapeInstagram(args).catch(e => { logger.error(`[Orchestrator] Instagram: ${e.message}`); return []; });
  allResults.push(...ig);

  const saved = await saveMentions(campaignId, keywordDocs, allResults);
  return { saved, mentions: allResults };
}

module.exports = { runFacebookScrape, runInstagramScrape, runPlatformScrape, runCrawlerScrape, saveMentions, getActiveCampaignsWithKeywords, recentSocialUrls, fbLocationFor, analyzeComments };
