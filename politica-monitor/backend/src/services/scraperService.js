const Parser = require('rss-parser');
const axios  = require('axios');
const cheerio = require('cheerio');
const logger = require('../lib/logger');
const { analyzeSentiment } = require('./sentimentService');
const { getDb } = require('../lib/firebase');
const { invalidarCampana } = require('../lib/cacheLecturas');
const { toDocs } = require('../lib/db');
const { dedupeBatch, dedupeKey } = require('../lib/dedupe');
const { mentionDocId } = require('../lib/knownMentions');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'es-AR,es;q=0.9',
};

async function resolveGoogleNewsUrl(url) {
  if (!url.includes('news.google.com')) return url;
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 8000, maxRedirects: 10 });
    const $ = cheerio.load(res.data);
    const canonical = $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content') || '';
    if (canonical && !canonical.includes('news.google.com')) return canonical;
    const redirect = $('a[href]').filter((i, el) => {
      const href = $(el).attr('href') || '';
      return href.startsWith('http') && !href.includes('google.com') && !href.includes('gstatic');
    }).first().attr('href');
    return redirect || url;
  } catch { return url; }
}

async function extractArticleComments(url) {
  try {
    const realUrl = await resolveGoogleNewsUrl(url);
    const res = await axios.get(realUrl, { headers: HEADERS, timeout: 10000, maxRedirects: 5 });
    const $ = cheerio.load(res.data);

    const comments = [];
    const seen = new Set();

    // Disqus, Facebook Comments, sistemas nativos — selectores comunes
    const selectors = [
      '.comment-body', '.comment-text', '.comment-content',
      '.comentario', '.comentario-texto',
      'div[data-testid="comment"]', '.post-comment',
      '.comment p', '.comments-list .text',
      'article.comment', '.reader-comment',
      '.comment-item', '.user-comment',
      'li.comment .comment-text',
    ];

    for (const sel of selectors) {
      $(sel).each((i, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ');
        if (text.length > 10 && text.length < 500 && !seen.has(text.slice(0, 40))) {
          seen.add(text.slice(0, 40));
          // Buscar autor cerca
          const parent = $(el).closest('li, div, article');
          const authorEl = parent.find('.comment-author, .author, .user-name, .nombre, strong a, b a').first();
          const author = authorEl.text().trim().slice(0, 30) || 'Lector';
          comments.push({ author, text: text.slice(0, 500), likes: 0 });
        }
      });
    }

    // Fallback: buscar comentarios por estructura genérica
    if (comments.length === 0) {
      $('div[id*="comment"], section[id*="comment"], div[class*="comment"]').find('p, span').each((i, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ');
        if (text.length > 15 && text.length < 500 && !seen.has(text.slice(0, 40))) {
          seen.add(text.slice(0, 40));
          comments.push({ author: 'Lector', text: text.slice(0, 500), likes: 0 });
        }
      });
    }

    // Extraer og:image también
    const ogImage = $('meta[property="og:image"]').attr('content') || '';

    return { comments: comments.slice(0, 8), ogImage };
  } catch {
    return { comments: [], ogImage: '' };
  }
}

const rssParser = new Parser({
  timeout: 12000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PoliticaMonitor/1.0)' },
});

let MAX_AGE_HOURS = 168;

// El job horario controla la ventana con su propia escalera (72h/7d/30d).
// El piso de 1h evita que un valor accidental de 0 descarte todo.
function setMaxAge(hours) {
  MAX_AGE_HOURS = Math.max(Number(hours) || 0, 1);
}

function isTooOld(dateStr) {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;
  return (Date.now() - d.getTime()) / 3600000 > MAX_AGE_HOURS;
}

function normalize(text) {
  if (!text) return '';
  return text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function containsKeyword(text, keyword) {
  if (!text || !keyword) return false;
  const normText = normalize(text);
  const parts = normalize(keyword).split(' ').filter(w => w.length > 3);
  if (parts.length === 0) return normText.includes(normalize(keyword));
  return parts.every(p => normText.includes(p));
}

// Une titulo y resumen evitando la repeticion: si el resumen ya arranca con el
// titulo (o lo contiene), se queda solo con el resumen.
function joinTitleAndSnippet(title, snippet) {
  const t = (title || '').trim();
  const sn = (snippet || '').trim();
  if (!sn) return t;
  if (!t) return sn.slice(0, 600);

  const nt = normalize(t);
  const ns = normalize(sn);
  if (nt && (ns.startsWith(nt) || ns.includes(nt))) return sn.slice(0, 600);
  if (ns && nt.startsWith(ns)) return t;

  return `${t}. ${sn.slice(0, 500)}`;
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return ''; }
}

async function scrapeGoogleNews(query, campaignId, keywordId, useTimeFilter = true) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es-419&gl=AR&ceid=AR:es-419${useTimeFilter ? '&tbs=qdr:d3' : ''}`;

  try {
    const feed = await rssParser.parseURL(url);
    const results = [];
    let skipped = 0;

    for (const item of feed.items.slice(0, 100)) {
      if (isTooOld(item.pubDate)) { skipped++; continue; }

      const rawTitle = item.title || '';
      const snippet  = item.contentSnippet || '';
      const fullText = rawTitle + ' ' + snippet;

      const kwParts = query
        .replace(/site:\S+/gi, '')
        .replace(/["()]/g, '')
        .trim()
        .split(/\s+/)
        .filter(w => w.length > 3);
      const normFull = normalize(fullText);
      if (kwParts.length > 0 && !kwParts.some(p => normFull.includes(normalize(p)))) {
        skipped++;
        continue;
      }

      const mediaSep = rawTitle.lastIndexOf(' - ');
      const cleanTitle = mediaSep > 15 ? rawTitle.slice(0, mediaSep).trim() : rawTitle;
      const mediaName  = mediaSep > 15
        ? rawTitle.slice(mediaSep + 3).trim()
        : (item.creator || extractDomain(item.link || '') || 'Noticias');

      // Sentimiento y comentarios NO se calculan acá: son una llamada de red
      // por resultado y la mayoría de lo que sale de este feed ya está
      // guardado. Se enriquece después de deduplicar, sobre lo que realmente
      // se va a guardar (ver enrichNewMentions).
      results.push({
        campaignId,
        keywordId,
        source: 'NEWS',
        sourceUrl: item.link || '',
        sourceName: mediaName,
        // Google News suele repetir el titulo dentro del contentSnippet: si se
        // concatenan a ciegas, la mencion queda con el texto duplicado.
        content: joinTitleAndSnippet(cleanTitle, snippet),
        snippet: snippet.slice(0, 300) || cleanTitle.slice(0, 300),
        reach: 0,
        engagement: 0,
        publishedAt: new Date(item.pubDate),
      });
    }

    if (skipped > 0) logger.debug(`Google News "${query}": ${results.length} válidos, ${skipped} descartados`);
    return results;
  } catch (err) {
    logger.warn(`Google News "${query}": ${err.message}`);
    return [];
  }
}

async function scrapeNewsAPI(keyword, geo, campaignId, keywordId) {
  if (!process.env.NEWS_API_KEY) return [];
  const { provincia, ciudad } = geo;
  const geoDomains = getGeoNewsSites(provincia, ciudad);

  try {
    const from = new Date(Date.now() - MAX_AGE_HOURS * 3600000).toISOString().split('T')[0];
    const params = {
      q: keyword,
      language: 'es',
      sortBy: 'publishedAt',
      pageSize: 20,
      from,
      apiKey: process.env.NEWS_API_KEY,
      ...(geoDomains.length > 0 && { domains: geoDomains.slice(0, 5).join(',') }),
    };

    const res = await axios.get('https://newsapi.org/v2/everything', { params, timeout: 10000 });
    const results = [];

    for (const a of (res.data.articles || [])) {
      if (isTooOld(a.publishedAt)) continue;
      const content = (a.title || '') + '. ' + (a.description || '');
      if (!containsKeyword(content, keyword)) continue;

      // Sentimiento NO se calcula acá (una llamada de red por artículo, antes de
      // deduplicar): lo hace enrichNewMentions sobre lo que realmente se guarda.
      results.push({
        campaignId, keywordId,
        source: 'NEWS',
        sourceUrl: a.url || '',
        sourceName: a.source?.name || extractDomain(a.url || '') || 'NewsAPI',
        author: a.author || null,
        content: content.slice(0, 800),
        snippet: (a.description || '').slice(0, 300),
        reach: 0,
        engagement: 0,
        publishedAt: a.publishedAt ? new Date(a.publishedAt) : new Date(),
      });
    }

    return results;
  } catch (err) {
    logger.warn(`NewsAPI "${keyword}": ${err.message}`);
    return [];
  }
}

async function scrapeOpenSearch(keyword, geo, campaignId, keywordId, tags = []) {
  const { provincia, ciudad } = geo;
  const results = [];

  // Tags propios de la keyword (ej: "Rio Grande", "Municipio de Rio Grande") —
  // acotan la búsqueda web a esa zona/tema puntual, más específico que la
  // geo de campaña (provincia/ciudad), sin pisarla.
  for (const tag of tags) {
    const rTag = await scrapeGoogleNews(`"${keyword}" "${tag}"`, campaignId, keywordId);
    results.push(...rTag);
    if (rTag.length > 0) logger.info(`  Tag "${tag}" "${keyword}": ${rTag.length}`);
  }

  // Siempre buscar sin geo primero (captura nacional)
  const rNacional = await scrapeGoogleNews(`"${keyword}"`, campaignId, keywordId);
  results.push(...rNacional);
  logger.info(`  Nacional "${keyword}": ${rNacional.length}`);

  if (!provincia && !ciudad) {
    return results;
  }

  logger.info(`  Búsqueda geo: "${keyword}" en "${ciudad||provincia}"`);

  const r1 = await scrapeGoogleNews(`"${keyword}" "${provincia}"`, campaignId, keywordId);
  results.push(...r1);

  if (ciudad) {
    const r2 = await scrapeGoogleNews(`"${keyword}" "${ciudad}"`, campaignId, keywordId);
    results.push(...r2);
  }

  for (const alias of getZonaAliases(provincia, ciudad)) {
    const r = await scrapeGoogleNews(`"${keyword}" "${alias}"`, campaignId, keywordId);
    results.push(...r);
  }

  const geoSites = getGeoNewsSites(provincia, ciudad);
  if (geoSites.length > 0) {
    for (let i = 0; i < geoSites.length; i += 5) {
      const chunk = geoSites.slice(i, i + 5);
      const siteFilter = chunk.map(s => `site:${s}`).join(' OR ');
      const r = await scrapeGoogleNews(`"${keyword}" (${siteFilter})`, campaignId, keywordId, false);
      r.forEach(m => { m.source = 'NEWS'; });
      results.push(...r);
    }
  }

  const r5 = await scrapeGoogleNews(`"${keyword}" "${provincia}" site:facebook.com`, campaignId, keywordId);
  r5.forEach(m => { m.source = 'FACEBOOK'; m.sourceName = 'Facebook'; });
  results.push(...r5);

  if (ciudad) {
    const r5b = await scrapeGoogleNews(`"${keyword}" "${ciudad}" site:facebook.com`, campaignId, keywordId);
    r5b.forEach(m => { m.source = 'FACEBOOK'; m.sourceName = 'Facebook'; });
    results.push(...r5b);
  }

  const r6 = await scrapeGoogleNews(`"${keyword}" "${provincia}" site:instagram.com`, campaignId, keywordId);
  r6.forEach(m => { m.source = 'INSTAGRAM'; m.sourceName = 'Instagram'; });
  results.push(...r6);

  const r7 = await scrapeGoogleNews(`"${keyword}" "${provincia}" (site:twitter.com OR site:x.com)`, campaignId, keywordId);
  r7.forEach(m => { m.source = 'TWITTER'; m.sourceName = 'Twitter/X'; });
  results.push(...r7);

  logger.info(`  Total "${keyword}": ${results.length} menciones brutas`);
  return results;
}

async function scrapeSocial(keyword, geo, campaignId, keywordId) {
  try {
    const { searchFacebookGeneral, searchInstagramGeneral } = require('./facebookScraper');
    const [fb, ig] = await Promise.allSettled([
      searchFacebookGeneral(keyword, geo, campaignId, keywordId),
      searchInstagramGeneral(keyword, geo, campaignId, keywordId),
    ]);
    return [
      ...(fb.status === 'fulfilled' ? fb.value : []),
      ...(ig.status === 'fulfilled' ? ig.value : []),
    ];
  } catch (err) {
    logger.warn(`Social scrape error: ${err.message}`);
    return [];
  }
}

// Enriquecimiento caro (una llamada de red por mención): sentimiento siempre,
// comentarios + og:image solo para las primeras `enrichLimit` noticias. Corre
// DESPUÉS de deduplicar, así no se paga por menciones que se van a descartar.
async function enrichNewMentions(mentions, { enrichLimit = 10, concurrency = 5 } = {}) {
  // El sentimiento es una llamada de red por mención: en serie, 30 menciones
  // son ~60s. Con un pool chico baja a ~12s sin castigar a la API.
  let cursor = 0;
  let enriched = 0;

  async function worker() {
    while (cursor < mentions.length) {
      const m = mentions[cursor++];

      if (!m.sentiment) {
        try {
          const { sentiment, score } = await analyzeSentiment(m.content || m.snippet || '');
          m.sentiment = sentiment;
          m.sentimentScore = score;
        } catch (err) {
          m.sentiment = 'NEUTRAL';
          m.sentimentScore = 0;
          logger.warn(`Sentimiento falló: ${err.message}`);
        }
      }

      const wantsComments = m.source === 'NEWS' && m.sourceUrl && !m.commentsList;
      if (wantsComments && enriched < enrichLimit) {
        enriched++;
        try {
          const extra = await extractArticleComments(m.sourceUrl);
          m.commentsList = extra.comments;
          if (!m.imageUrl && extra.ogImage) m.imageUrl = extra.ogImage;
        } catch {
          m.commentsList = [];
        }
      }
      if (!m.commentsList) m.commentsList = [];
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, mentions.length || 1) }, worker)
  );

  return mentions;
}

// Recolecta UNA keyword de las fuentes web (Google News + portales geo, NewsAPI)
// SIN guardar. `includeSocial` mantiene el comportamiento histórico de
// collectFreeSources (scrapeSocial en paralelo); el flujo secuencial lo apaga
// porque FB/IG tienen su propio paso (Apify) y no deben dispararse dos veces.
async function collectKeywordSources(campaignId, geo, kw, { includeSocial = true } = {}) {
  try {
    const [openSearch, newsApi, social] = await Promise.allSettled([
      scrapeOpenSearch(kw.term, geo, campaignId, kw.id, kw.tags || []),
      scrapeNewsAPI(kw.term, geo, campaignId, kw.id),
      includeSocial ? scrapeSocial(kw.term, geo, campaignId, kw.id) : Promise.resolve([]),
    ]);

    const batch = [
      ...(openSearch.status === 'fulfilled' ? openSearch.value : []),
      ...(newsApi.status   === 'fulfilled' ? newsApi.value   : []),
      ...(social.status    === 'fulfilled' ? social.value    : []),
    ];

    // Una fuente caída no puede tumbar la corrida ni las otras keywords.
    [openSearch, newsApi, social].forEach(r => {
      if (r.status === 'rejected') logger.warn(`Fuente falló en "${kw.term}": ${r.reason?.message || r.reason}`);
    });

    logger.info(`OK "${kw.term}": ${batch.length} menciones brutas`);
    return batch;
  } catch (err) {
    logger.error(`ERROR "${kw.term}": ${err.message}`);
    return [];
  }
}

// Fuentes custom de la campaña (no dependen de la keyword). Devuelve el crudo.
async function collectCampaignCustomSources(campaignId) {
  try {
    const { scrapeCustomSources } = require('./customScraper');
    const customResult = await scrapeCustomSources(campaignId);
    return customResult.mentions || [];
  } catch (err) {
    logger.warn(`Custom sources: ${err.message}`);
    return [];
  }
}

// Recolecta de todas las fuentes gratis (Google News, NewsAPI, portales geo,
// fuentes custom) SIN guardar. Devuelve el crudo; guardar es responsabilidad
// del que llama, que decide la ventana temporal y el objetivo de volumen.
// (Flujo histórico: todas las keywords en paralelo. El flujo secuencial usa
// collectKeywordSources / collectCampaignCustomSources directamente.)
async function collectFreeSources(campaign, geo, opts = {}) {
  const campaignId = campaign.id;
  const allResults = [];

  const jobs = campaign.keywords.map(kw => collectKeywordSources(campaignId, geo, kw));
  const results = await Promise.allSettled(jobs);
  results.forEach(r => { if (r.status === 'fulfilled') allResults.push(...r.value); });

  if (opts.includeCustomSources !== false) {
    allResults.push(...await collectCampaignCustomSources(campaignId));
  }

  return allResults;
}

// Carga campaña + keywords activas + geo parseada del campo description.
async function loadCampaignContext(campaignId) {
  const db = getDb();
  const campDoc = await db.collection('campaigns').doc(campaignId).get();
  if (!campDoc.exists) return null;

  const campaign = { id: campDoc.id, ...campDoc.data() };
  const kwSnap = await db.collection('keywords')
    .where('campaignId', '==', campaignId)
    .where('isActive', '==', true).get();
  campaign.keywords = toDocs(kwSnap);

  let geo = { provincia: '', ciudad: '' };
  try {
    if (campaign.description?.startsWith('{')) {
      const parsed = JSON.parse(campaign.description);
      geo = { provincia: parsed.provincia || '', ciudad: parsed.ciudad || '' };
    }
  } catch {}

  return { campaign, geo };
}

// ─────────────────────────────────────────────────────────────────────────────
// Delta por fecha (solo FB/IG vía Apify; NewsAPI/Google News NO lo usan)
// ─────────────────────────────────────────────────────────────────────────────
// Límite inferior cronológico para pedirle al actor solo lo posterior a lo que
// ya tenemos. Dos piezas:
//   getLastPublishedAt: 1 lectura (última mención de la campaña y fuente).
//   computeSince:       lo convierte en el `since` efectivo.
//
// REQUIERE índice compuesto en firestore.indexes.json (mentions):
//   campaignId ASC, source ASC, publishedAt DESC
// Sin él, getLastPublishedAt avisa y devuelve el valor por defecto (no rompe).

const DELTA_DEFAULT_DAYS = Number(process.env.DELTA_DEFAULT_DAYS || 7);
// Margen hacia atrás: un post puede publicarse ANTES de la última mención
// guardada y aparecer en la búsqueda recién después (indexación tardía). Sin
// margen, ese post quedaría por debajo de la marca para siempre. Lo ya visto
// dentro del margen lo descarta el dedup por hash.
const DELTA_OVERLAP_MINS = Number(process.env.DELTA_OVERLAP_MINS || 360);

// Fecha (`publishedAt`) de la última mención guardada para campaña + fuente.
// Sin registros previos (o ante error): ahora - DELTA_DEFAULT_DAYS.
async function getLastPublishedAt(db, campaignId, source) {
  // Límite estático de 24 horas hacia atrás. 
  // TODO: Emanuel reemplazará esto por la lectura en la memoria caché SSR
  return new Date(Date.now() - 24 * 60 * 60 * 1000); 
}

// `since` efectivo = el más reciente entre:
//   - la última publicación guardada menos el margen de solapamiento, y
//   - el tope de ventana (no se le pide al actor más de lo que el scraper
//     igualmente aceptaría; si no, se pagan resultados que se descartan).
function computeSince(lastPublishedAt, { windowMins = 1440, overlapMins = DELTA_OVERLAP_MINS } = {}) {
  const floor = Date.now() - windowMins * 60000;
  const fromDelta = lastPublishedAt.getTime() - overlapMins * 60000;
  return new Date(Math.max(floor, fromDelta));
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistencia con ID determinista (SHA-256), igual que orchestrator.js.
//
// ID del documento = mentionDocId(campaignId, dedupeKey): la propia colección
// `mentions` es el filtro de duplicados (sin límite de ventana, sin índice extra).
// ─────────────────────────────────────────────────────────────────────────────

// LEGADO: noticias guardadas antes de este cambio tienen ID aleatorio
// (generateId) y getAll no las ve. Se las busca por dedupeKey/sourceUrl SOLO
// para los candidatos que getAll no encontró. dailyCleanup borra todo a los 90
// días: pasado ese plazo desde el deploy, DEDUPE_LEGACY_LOOKUP=false y borrar
// el bloque "LEGADO" de findExistingKeys.
const LEGACY_LOOKUP = process.env.DEDUPE_LEGACY_LOOKUP !== 'false';
const GETALL_CHUNK = 300;   // refs por db.getAll()
const BATCH_LIMIT = 500;    // máx. operaciones por WriteBatch
const ALREADY_EXISTS = 6;   // código gRPC

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Devuelve Set<dedupeKey> con las menciones que YA existen en la campaña.
async function findExistingKeys(db, campaignId, items) {
  const col = db.collection('mentions');
  const existing = new Set();

  // 1) Por ID determinista: 1 lectura por candidato, sin índices ni límite de 30.
  //    fieldMask mínimo: solo hace falta saber si el documento existe.
  for (const lote of chunk(items, GETALL_CHUNK)) {
    const refs = lote.map(m => col.doc(mentionDocId(campaignId, m.dedupeKey)));
    const snaps = await db.getAll(...refs, { fieldMask: ['dedupeKey'] });
    snaps.forEach((s, i) => { if (s.exists) existing.add(lote[i].dedupeKey); });
  }

  // 2) LEGADO (temporal): solo para lo que (1) no encontró. Sin select(): el
  //    cálculo de dedupeKey() para docs viejos sin ese campo puede necesitar
  //    cualquiera de sus campos.
  if (LEGACY_LOOKUP) {
    const rest = items.filter(m => !existing.has(m.dedupeKey));
    const lookup = async (field, values) => {
      const uniq = [...new Set(values.filter(Boolean))];
      for (const lote of chunk(uniq, 30)) {
        const snap = await col
          .where('campaignId', '==', campaignId)
          .where(field, 'in', lote).get();
        snap.docs.forEach(d => existing.add(d.data().dedupeKey || dedupeKey(d.data())));
      }
    };
    await lookup('dedupeKey', rest.map(m => m.dedupeKey));
    await lookup('sourceUrl', rest.map(m => m.sourceUrl));
  }

  return existing;
}

// Inserta con create(): si el ID ya existe (otro proceso ganó la carrera) lo
// ignora sin pisarlo. Devuelve los datos de los documentos realmente creados.
async function createIgnoringExisting(db, entries) {
  const created = [];
  for (const lote of chunk(entries, BATCH_LIMIT)) {
    const batch = db.batch();
    lote.forEach(({ ref, data }) => batch.create(ref, data));
    try {
      await batch.commit();
      created.push(...lote.map(e => e.data));
    } catch (err) {
      if (err.code !== ALREADY_EXISTS) throw err;
      // Carrera: algún ID ya existía y el batch (atómico) no escribió nada.
      // Reintento uno a uno, saltando los que ya están.
      for (const { ref, data } of lote) {
        try { await ref.create(data); created.push(data); }
        catch (e) { if (e.code !== ALREADY_EXISTS) throw e; }
      }
    }
  }
  return created;
}

// Guarda un lote ya recolectado. Orden deliberado (lo caro va al final):
//   1) dedupe dentro del lote (en memoria, gratis)
//   2) descartar lo que ya está en Firestore (getAll por ID hash)
//   3) enriquecer SOLO lo nuevo (sentimiento + comentarios = llamadas de red)
//   4) escribir con create() en batches de 500
async function persistMentions(campaignId, rawMentions, opts = {}) {
  const db = getDb();

  // 1) Identidad canónica compartida con orchestrator.js. Si algún ítem no
  //    trajera dedupeKey se lo calcula: sin clave, todos colapsarían en un
  //    mismo ID.
  const batchIn = dedupeBatch(rawMentions)
    .map(m => (m.dedupeKey ? m : { ...m, dedupeKey: dedupeKey(m) }));

  // 2) Existencia en Firestore.
  const existing = await findExistingKeys(db, campaignId, batchIn);
  const fresh = batchIn.filter(m => !existing.has(m.dedupeKey));
  const seenCount = rawMentions.length - fresh.length;

  if (seenCount > 0) logger.info(`Deduplicación: ${seenCount} ya existentes/repetidas descartadas`);
  if (!fresh.length) return { saved: 0, mentions: [], duplicates: seenCount };

  // 3) Recién ahora se gasta IA / red: solo sobre lo que realmente es nuevo.
  await enrichNewMentions(fresh, opts);

  const col = db.collection('mentions');
  const entries = fresh.map(m => ({
    ref: col.doc(mentionDocId(campaignId, m.dedupeKey)),
    data: {
      ...m,
      reach: typeof m.reach === 'number' && m.reach > 0 && m.reach < 100000 ? m.reach : 0,
      engagement: typeof m.engagement === 'number' ? m.engagement : 0,
      isRead: false,
      createdAt: new Date(),
      publishedAt: m.publishedAt || new Date(),
    },
  }));

  // 4) Escritura segura ante concurrencia.
  let created;
  try {
    created = await createIgnoringExisting(db, entries);
  } catch (err) {
    // No relanzamos: perder una escritura no puede tumbar la corrida ni el
    // histórico ya guardado.
    logger.error(`Error guardando menciones: ${err.message}`);
    return { saved: 0, mentions: [], duplicates: seenCount, error: err.message };
  }

  const lostToRace = fresh.length - created.length;
  if (lostToRace > 0) logger.info(`Concurrencia: ${lostToRace} mención(es) ya las había guardado otro proceso`);

  // Los analytics cacheados de esta campaña ya no reflejan lo guardado.
  if (created.length) invalidarCampana(campaignId);

  return { saved: created.length, mentions: created, duplicates: seenCount + lostToRace };
}

async function scrapeAllSources(campaignId, opts = {}) {
  if (opts.maxAgeHours) setMaxAge(opts.maxAgeHours);

  const ctx = await loadCampaignContext(campaignId);
  if (!ctx) {
    logger.info(`Campaign ${campaignId}: no encontrada`);
    return { saved: 0, mentions: [] };
  }

  const { campaign, geo } = ctx;
  if (!campaign.keywords.length) {
    logger.info(`Campaign ${campaignId}: sin keywords activas`);
    return { saved: 0, mentions: [] };
  }

  const zonaLabel = [geo.ciudad, geo.provincia].filter(Boolean).join(', ') || 'sin zona';
  logger.info(`--- "${campaign.name}" | zona: "${zonaLabel}" | ${campaign.keywords.length} keyword(s) | ventana ${MAX_AGE_HOURS}h ---`);

  const raw = await collectFreeSources(campaign, geo, opts);
  const result = await persistMentions(campaignId, raw, opts);

  logger.info(result.saved > 0
    ? `"${campaign.name}": ${result.saved} nuevas menciones guardadas`
    : `"${campaign.name}": sin menciones nuevas en este ciclo`);

  return result;
}

function getGeoNewsSites(provincia) {
  const { getDomainsByProvince } = require('../data/news-portals');
  return getDomainsByProvince(provincia);
}

function getGeoFacebookPages(provincia, ciudad) {
  const p = normalize(provincia || '');
  const map = {
    'tierra del fuego': ['https://www.facebook.com/minutofueguino','https://www.facebook.com/airelibrefm','https://www.facebook.com/19640noticias','https://www.facebook.com/noventauno','https://www.facebook.com/OceaniaFueguina'],
    'cordoba':          ['https://www.facebook.com/lavozdelinterior','https://www.facebook.com/lacivicacba','https://www.facebook.com/cba24n'],
    'santa fe':         ['https://www.facebook.com/ellitoralsantafe','https://www.facebook.com/unosantafe'],
    'mendoza':          ['https://www.facebook.com/losandes.mendoza','https://www.facebook.com/mdzol'],
    'tucuman':          ['https://www.facebook.com/lagaceta'],
    'salta':            ['https://www.facebook.com/ElTribuno','https://www.facebook.com/SaltaInforma'],
    'jujuy':            ['https://www.facebook.com/eltribuno.jujuy','https://www.facebook.com/jujuyalfilo'],
    'neuquen':          ['https://www.facebook.com/LMNeuquen','https://www.facebook.com/rionegro.com.ar'],
    'entre rios':       ['https://www.facebook.com/unoentrerios','https://www.facebook.com/eldiariodeparana'],
    'misiones':         ['https://www.facebook.com/primera.edicion.misiones','https://www.facebook.com/misionesonline'],
    'buenos aires':     ['https://www.facebook.com/infobae','https://www.facebook.com/lanacion','https://www.facebook.com/clarin'],
  };
  for (const [k, v] of Object.entries(map)) {
    if (p.includes(k)) return v;
  }
  return [];
}

function getZonaAliases(provincia, ciudad) {
  const p = normalize(provincia || '');
  const map = {
    'tierra del fuego': ['Río Grande','Ushuaia','Tolhuin'],
    'cordoba':          ['Córdoba Capital','Villa Carlos Paz','Río Cuarto'],
    'buenos aires':     ['La Plata','Gran Buenos Aires','CABA'],
    'santa fe':         ['Rosario','Santa Fe Capital'],
    'mendoza':          ['Mendoza Capital','Godoy Cruz'],
    'tucuman':          ['San Miguel de Tucumán'],
    'salta':            ['Salta Capital','Orán'],
    'neuquen':          ['Neuquén Capital','Cipolletti'],
    'rio negro':        ['Viedma','Bariloche','General Roca'],
    'chubut':           ['Comodoro Rivadavia','Trelew','Puerto Madryn'],
    'santa cruz':       ['Río Gallegos','El Calafate'],
    'misiones':         ['Posadas','Oberá'],
    'entre rios':       ['Paraná','Concordia'],
    'corrientes':       ['Corrientes Capital','Goya'],
    'chaco':            ['Resistencia'],
    'jujuy':            ['San Salvador de Jujuy'],
  };
  for (const [k, v] of Object.entries(map)) {
    if (p.includes(k)) return v.slice(0, 2);
  }
  return [];
}

module.exports = {
  scrapeAllSources,
  collectFreeSources,
  collectKeywordSources,
  collectCampaignCustomSources,
  getLastPublishedAt,
  computeSince,
  loadCampaignContext,
  persistMentions,
  enrichNewMentions,
  setMaxAge,
  scrapeGoogleNews,
  getGeoNewsSites,
  getGeoFacebookPages,
  getZonaAliases,
  normalize,
  containsKeyword,
  isTooOld,
};
