const logger = require('../lib/logger');
const { getDb } = require('../lib/firebase');
const { generateId, toDocs } = require('../lib/db');
const { analyzeSentiment } = require('../services/sentimentService');
const { scrapeInstagram } = require('./apifyInstagramScraper');
const { scrapeFacebook } = require('./apifyFacebookScraper');
const { dedupeBatch, dedupeKey } = require('../lib/dedupe');
const { withinBudget } = require('../lib/apifyBudget');
const { createKnownChecker, mentionDocId } = require('../lib/knownMentions');
const {
  getLastPublishedAt, computeSince,
  collectKeywordSources, collectCampaignCustomSources, persistMentions, setMaxAge,
} = require('../services/scraperService');

// El actor de FB solo acepta hasta 15 caracteres de "location". Preferimos
// provincia (alcance más amplio) — si no entra, la achicamos sacando espacios
// primero ("TierradelFuego") y si todavía no entra la truncamos a 15
// (probado: sigue matcheando geo real, no lo ignora silenciosamente). Cae a
// ciudad solo si no hay provincia configurada.
function fbLocationFor(campaign) {
  try {
    const { provincia, ciudad, fbLocationId } = JSON.parse(campaign.description || '{}');
    // ID numérico de lugar de Facebook (opcional): el actor lo acepta y evita la
    // ambigüedad por nombre ("Río Grande" AR vs BR).
    if (fbLocationId) return String(fbLocationId);
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

// Zona de la campaña, guardada como JSON en `description`:
//   { "provincia": "...", "ciudad": "...",
//     "fbLocationId": "106...",                       // opcional: ID de lugar de Facebook
//     "igLocationUrls": ["https://www.instagram.com/explore/locations/<id>/<slug>/"] } // opcional
function campaignGeoConfig(campaign) {
  const empty = { provincia: '', ciudad: '', fbLocationId: '', igLocationUrls: [] };
  try {
    const cfg = JSON.parse(campaign.description || '{}');
    return {
      provincia: cfg.provincia || '',
      ciudad: cfg.ciudad || '',
      fbLocationId: cfg.fbLocationId ? String(cfg.fbLocationId) : '',
      igLocationUrls: Array.isArray(cfg.igLocationUrls) ? cfg.igLocationUrls.filter(Boolean) : [],
    };
  } catch { return empty; }
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

const LEGACY_LOOKUP = process.env.DEDUPE_LEGACY_LOOKUP !== 'false';
const GETALL_CHUNK = 300;
const BATCH_LIMIT = 500;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Devuelve Map<dedupeKey, DocumentSnapshot> con lo que ya existe.
async function findExisting(db, campaignId, items) {
  const col = db.collection('mentions');
  const existing = new Map();

  // 1) Por ID determinista. fieldMask: solo viaja commentsList (lo único que
  //    necesita la lógica de enriquecimiento). Se factura 1 lectura por ref.
  for (const lote of chunk(items, GETALL_CHUNK)) {
    const refs = lote.map(m => col.doc(mentionDocId(campaignId, m.dedupeKey)));
    const snaps = await db.getAll(...refs, { fieldMask: ['commentsList'] });
    snaps.forEach((s, i) => { if (s.exists) existing.set(lote[i].dedupeKey, s); });
  }

  // 2) LEGADO: documentos con ID aleatorio. Solo para lo que (1) no encontró.
  if (LEGACY_LOOKUP) {
    const rest = items.filter(m => !existing.has(m.dedupeKey));
    const lookup = async (field, values) => {
      const uniq = [...new Set(values.filter(Boolean))];
      for (let i = 0; i < uniq.length; i += 30) {
        const snap = await col
          .where('campaignId', '==', campaignId)
          .where(field, 'in', uniq.slice(i, i + 30)).get();
        snap.docs.forEach(d => {
          const key = d.data().dedupeKey || dedupeKey(d.data());
          if (!existing.has(key)) existing.set(key, d);
        });
      }
    };
    await lookup('dedupeKey', rest.map(m => m.dedupeKey));
    await lookup('sourceUrl', rest.map(m => m.sourceUrl));
  }

  return existing;
}

// Inserta con create(): si el ID ya existe (carrera), lo ignora sin pisarlo.
// Devuelve cuántos documentos se crearon realmente.
async function createIgnoringExisting(entries) {
  const ALREADY_EXISTS = 6;
  let created = 0;
  for (const lote of chunk(entries, BATCH_LIMIT)) {
    const batch = getDb().batch();
    lote.forEach(({ ref, data }) => batch.create(ref, data));
    try {
      await batch.commit();
      created += lote.length;
    } catch (err) {
      if (err.code !== ALREADY_EXISTS) throw err;
      // Carrera: algún ID ya existía y el batch (atómico) no escribió nada.
      // Reintento uno a uno, saltando los que ya están.
      for (const { ref, data } of lote) {
        try { await ref.create(data); created++; }
        catch (e) { if (e.code !== ALREADY_EXISTS) throw e; }
      }
    }
  }
  return created;
}

async function saveMentions(campaignId, keywordDocs, rawMentions) {
  if (!rawMentions.length) return 0;
  const db = getDb();

  // Duplicados dentro del propio lote (identidad canónica compartida).
  const batchIn = dedupeBatch(rawMentions);

  const existingByKey = await findExisting(db, campaignId, batchIn);

  // Si ya existe pero le faltan los comentarios, lo actualizamos (sin cambios).
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
      ref: db.collection('mentions').doc(mentionDocId(campaignId, m.dedupeKey)),
      data: {
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
      },
    });
  }

  let saved = 0;
  if (toSave.length > 0) {
    try {
      saved = await createIgnoringExisting(toSave);
    } catch (err) {
      logger.error(`[SaveMentions] Error guardando: ${err.message}`);
      return 0;
    }
  }

  if (toEnrich.length > 0) logger.info(`[SaveMentions] ${toEnrich.length} mención(es) existentes actualizadas con comentarios`);

  return saved;
}

const STRICT_LOCATION = process.env.FB_STRICT_LOCATION === 'true';

// Límite inferior (delta) para una campaña y fuente: 1 lectura.
async function deltaFor(db, campaignId, source, maxAgeMins) {
  const last = await getLastPublishedAt(db, campaignId, source);
  return computeSince(last, { windowMins: maxAgeMins || SOCIAL_WINDOW_MINS });
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
      const knownChecker = createKnownChecker(db, campaign.id);
      const since = await deltaFor(db, campaign.id, platform === 'Facebook' ? 'FACEBOOK' : 'INSTAGRAM', maxAgeMins);

      const mentions = await scrapeFn({
        keywords: campaign.keywords, maxAgeMins, maxPerKeyword, maxResults,
        campaignId: campaign.id, location, knownChecker, skipComments,
        since, strictLocation: STRICT_LOCATION,
        geoUrls: campaignGeoConfig(campaign).igLocationUrls, feedCache: new Map(),
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

// ─────────────────────────────────────────────────────────────────────────────
// Flujo SECUENCIAL por keyword (reemplaza el paralelismo masivo entre fuentes)
// ─────────────────────────────────────────────────────────────────────────────
// Por cada campaña, y dentro de ella por cada keyword:
//     Facebook  -> guarda  ->  Instagram -> guarda  ->  Web -> guarda
// Un paso a la vez: nada compite por red/Apify y los datos van entrando a
// Firestore por partes. Un paso que falla no frena a los demás.
//
// Delta: la marca de FB e IG se lee UNA vez por campaña, antes de recorrer las
// keywords (2 lecturas), no antes de cada keyword. Si se releyera después de
// guardar la keyword 1, la marca avanzaría y la keyword 2 perdería los posts
// que son más viejos que lo recién guardado pero todavía no vistos.
//
// Tiempo: secuencial es más lento que paralelo y la función tiene tope de 540s.
// `timeBudgetMs` corta ANTES de iniciar un paso nuevo (nunca a mitad de uno). Para
// que lo que queda sin correr no sea siempre lo mismo, campañas y keywords
// rotan su punto de partida en cada corrida (round-robin).
const SCRAPE_INTERVAL_MINS = Number(process.env.SCRAPE_INTERVAL_MINS || 60);

function rotate(arr, offset) {
  if (arr.length < 2) return arr;
  const k = offset % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

async function runStep(label, fn) {
  try {
    const saved = await fn();
    if (saved > 0) logger.info(`[Seq] ${label}: ${saved} nuevas`);
    return saved || 0;
  } catch (err) {
    logger.error(`[Seq] ${label}: ${err.message}`);
    return 0;
  }
}

async function runSequentialScrape(opts = {}) {
  const {
    campaigns: preloaded,
    maxAgeMins = SOCIAL_WINDOW_MINS,
    maxPerKeyword = 20,
    maxResults = 1,
    skipComments = false,
    strictLocation = STRICT_LOCATION,
    webMaxAgeHours,
    webOpts = {},
    sources = {},
    // 0 = sin límite (worker local). En Cloud Functions dejar >= 90s bajo el timeout.
    timeBudgetMs = Number(process.env.SCRAPE_TIME_BUDGET_MS ?? 450000),
  } = opts;
  const use = { facebook: true, instagram: true, web: true, ...sources };

  const startedAt = Date.now();
  const timeUp = () => timeBudgetMs > 0 && Date.now() - startedAt >= timeBudgetMs;
  const apifyOn = process.env.APIFY_SCRAPING_ENABLED === 'true';
  const summary = { totalSaved: 0, bySource: { FACEBOOK: 0, INSTAGRAM: 0, WEB: 0 }, stoppedEarly: false };

  if (webMaxAgeHours) setMaxAge(webMaxAgeHours);

  const slot = Math.floor(Date.now() / (SCRAPE_INTERVAL_MINS * 60000));
  const campaigns = rotate(preloaded || await getActiveCampaignsWithKeywords(), slot);
  const db = getDb();

  for (const campaign of campaigns) {
    if (timeUp()) { summary.stoppedEarly = true; break; }

    const geoCfg = campaignGeoConfig(campaign);
    const knownChecker = createKnownChecker(db, campaign.id);
    const igFeedCache = new Map(); // el feed de una ubicación se paga una vez por campaña

    // Presupuesto de Apify: una consulta por campaña y plataforma.
    const fbActive = use.facebook && apifyOn && await withinBudget('Facebook');
    const igActive = use.instagram && apifyOn && await withinBudget('Instagram');

    // Delta: una vez por campaña y fuente (ver nota de arriba).
    const sinceFB = fbActive ? await deltaFor(db, campaign.id, 'FACEBOOK', maxAgeMins) : null;
    const sinceIG = igActive ? await deltaFor(db, campaign.id, 'INSTAGRAM', maxAgeMins) : null;

    for (const kw of rotate(campaign.keywordDocs, slot)) {
      if (timeUp()) { summary.stoppedEarly = true; break; }
      const label = `"${campaign.name}" · "${kw.term}"`;

      // 1) Facebook
      if (fbActive) {
        summary.bySource.FACEBOOK += await runStep(`FB ${label}`, async () => {
          const mentions = await scrapeFacebook({
            keywords: [kw.term], maxAgeMins, maxPerKeyword, maxResults,
            campaignId: campaign.id, location: fbLocationFor(campaign),
            knownChecker, skipComments, since: sinceFB, strictLocation,
          });
          const saved = await saveMentions(campaign.id, campaign.keywordDocs, mentions);
          if (opts.onMentionsSaved && mentions.length > 0) await opts.onMentionsSaved(campaign.id, mentions);
          return saved; 
        });
      }

      // 2) Instagram
      if (igActive && !timeUp()) {
        summary.bySource.INSTAGRAM += await runStep(`IG ${label}`, async () => {
          const mentions = await scrapeInstagram({
            keywords: [kw.term], maxAgeMins, maxPerKeyword, maxResults,
            campaignId: campaign.id, knownChecker, skipComments,
            since: sinceIG, geoUrls: geoCfg.igLocationUrls, feedCache: igFeedCache,
          });
          const saved = await saveMentions(campaign.id, campaign.keywordDocs, mentions);
          if (opts.onMentionsSaved && mentions.length > 0) await opts.onMentionsSaved(campaign.id, mentions);
          return saved;
        });
      }

      // 3) Web (Google News + NewsAPI). Sin filtros de delta; scrapeSocial queda
      //    fuera porque FB/IG ya tienen su propio paso.
      if (use.web && !timeUp()) {
        summary.bySource.WEB += await runStep(`WEB ${label}`, async () => {
          const raw = await collectKeywordSources(
            campaign.id, { provincia: geoCfg.provincia, ciudad: geoCfg.ciudad }, kw, { includeSocial: false }
          );
          const result = await persistMentions(campaign.id, raw, webOpts);
          return result.saved;
        });
      }
    }

    // Fuentes custom: son de la campaña, no de una keyword. Una vez, al final.
    if (use.web && !timeUp()) {
      summary.bySource.WEB += await runStep(`WEB custom "${campaign.name}"`, async () => {
        const raw = await collectCampaignCustomSources(campaign.id);
        if (!raw.length) return 0;
        const result = await persistMentions(campaign.id, raw, webOpts);
        return result.saved;
      });
    }
  }

  summary.totalSaved = summary.bySource.FACEBOOK + summary.bySource.INSTAGRAM + summary.bySource.WEB;
  if (summary.stoppedEarly) {
    logger.warn(`[Seq] Presupuesto de tiempo agotado (${Math.round((Date.now() - startedAt) / 1000)}s): quedaron pasos sin correr; la próxima corrida arranca en otro punto`);
  }
  logger.info(`[Seq] fin: ${summary.totalSaved} nuevas (FB ${summary.bySource.FACEBOOK}, IG ${summary.bySource.INSTAGRAM}, WEB ${summary.bySource.WEB})`);
  return summary;
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
  const knownChecker = createKnownChecker(db, campaignId);
  const args = { keywords, maxAgeMins, maxPerKeyword, campaignId, knownChecker };

  logger.info(`[Orchestrator][manual] "${campaign.name}" | ${keywords.length} keywords`);

  const allResults = [];
  const fb = await scrapeFacebook(args).catch(e => { logger.error(`[Orchestrator] Facebook: ${e.message}`); return []; });
  allResults.push(...fb);
  const ig = await scrapeInstagram(args).catch(e => { logger.error(`[Orchestrator] Instagram: ${e.message}`); return []; });
  allResults.push(...ig);

  const saved = await saveMentions(campaignId, keywordDocs, allResults);
  return { saved, mentions: allResults };
}

module.exports = { runSequentialScrape, runFacebookScrape, runInstagramScrape, runPlatformScrape, runCrawlerScrape, saveMentions, getActiveCampaignsWithKeywords, fbLocationFor, campaignGeoConfig, analyzeComments };
