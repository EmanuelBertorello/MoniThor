const axios   = require('axios');
const cheerio = require('cheerio');
const logger  = require('../lib/logger');
const { analyzeSentiment } = require('./sentimentService');
const { normalize, containsKeyword } = require('./scraperService');
const { getDb } = require('../lib/firebase');
const { toDocs } = require('../lib/db');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept-Language': 'es-AR,es;q=0.9',
};

async function scrapeCustomUrl(url, keywords, type) {
  // El dominio manda sobre el "type" guardado — fuentes de FB/IG cargadas
  // como "Sitio web" (único tipo disponible antes en el front) igual se
  // scrapean con el selector correcto en vez del genérico de sitio de noticias.
  const effectiveType = /facebook\.com/i.test(url) ? 'FACEBOOK_PAGE'
    : /instagram\.com/i.test(url) ? 'INSTAGRAM_PROFILE'
    : type;

  switch (effectiveType) {
    case 'RSS_FEED':           return scrapeRss(url, keywords);
    case 'FACEBOOK_PAGE':      return scrapeFacebookPage(url, keywords);
    case 'INSTAGRAM_PROFILE':  return scrapeInstagramProfile(url, keywords);
    case 'WEBSITE':
    default:                   return scrapeWebsite(url, keywords);
  }
}

async function scrapeWebsite(url, keywords) {
  return scrapeWithCheerio(url, keywords);
}

async function scrapeWithCheerio(url, keywords) {
  try {
    const res = await axios.get(url, { headers: HEADERS, timeout: 15000, maxRedirects: 5 });
    const $ = cheerio.load(res.data);
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();

    if (bodyText.length < 200 || bodyText.includes('function(') || bodyText.includes('var p;')) {
      return [];
    }

    $('nav, script, style, footer, header, aside, .ads, .sidebar, .related').remove();
    const pageTitle = $('title').text().trim() || $('h1').first().text().trim();
    const isHomepage = !url.match(/\/(articulo|noticia|nota|post|[0-9]{4}\/[0-9]{2})\//i) && !url.match(/\.html?$/i);

    if (isHomepage) {
      const articleLinks = [];
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href') || '';
        const linkText = $(el).text().trim();
        if (!linkText || linkText.length < 15) return;
        try {
          const fullUrl = href.startsWith('http') ? href : new URL(href, url).toString();
          if (!fullUrl.includes(extractDomain(url))) return;
          if (keywords.some(kw => normalize(linkText).includes(normalize(kw).split(' ')[0]))) {
            articleLinks.push({ url: fullUrl, title: linkText });
          }
        } catch {}
      });

      const results = [];
      for (const article of articleLinks.slice(0, 5)) {
        try {
          const artRes = await axios.get(article.url, { headers: HEADERS, timeout: 12000 });
          const art$ = cheerio.load(artRes.data);
          art$('nav, script, style, footer, header, aside, .ads, .sidebar, .related, .menu, #menu, .header, #header, .nav, #nav').remove();

          let content = '';
          for (const sel of ['article .entry-content','article .post-content','article .content',
                             '.article-body','.entry-content','.post-content',
                             '.noticia-cuerpo','.nota-cuerpo','.post-body',
                             'article p', 'main article']) {
            const els = art$(sel);
            if (els.length > 0) {
              const t = els.text().replace(/\s+/g, ' ').trim();
              if (t.length > 100) { content = t; break; }
            }
          }

          if (!content) {
            const paras = art$('article p, main p, .content p')
              .map((i, el) => art$(el).text().trim())
              .get()
              .filter(t => t.length > 30);
            content = paras.join(' ');
          }

          if (!content || content.length < 50) continue;

          const matchedKw = keywords.find(kw => {
            const kwBase = normalize(kw).split(' ')[0];
            return normalize(content).includes(kwBase);
          });

          if (!matchedKw) continue;

          const { sentiment, score } = await analyzeSentiment(content);
          results.push({
            sourceUrl: article.url,
            sourceName: extractDomain(url),
            content: `[${article.title}] ${content.slice(0, 600)}`,
            snippet: content.slice(0, 300),
            keyword: matchedKw,
            sentiment, sentimentScore: score,
            reach: 0, source: 'WEB',
          });
          await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          logger.warn(`Error artículo ${article.url}: ${err.message}`);
        }
      }
      return results;
    }

    let content = '';
    for (const sel of ['article','.article-body','.entry-content','.post-content','.noticia-cuerpo','main']) {
      const t = $(sel).text().replace(/\s+/g, ' ').trim();
      if (t.length > 100) { content = t; break; }
    }
    if (!content) content = $('p').map((i, el) => $(el).text().trim()).get().filter(t => t.length > 30).join(' ');
    if (!content || content.length < 50) return [];

    const matchedKw = keywords.find(kw => containsKeyword(content, kw));
    if (!matchedKw) return [];

    const { sentiment, score } = await analyzeSentiment(content);
    return [{
      sourceUrl: url, sourceName: extractDomain(url),
      content: `[${pageTitle}] ${content.slice(0, 600)}`,
      snippet: content.slice(0, 300),
      keyword: matchedKw, sentiment, sentimentScore: score,
      reach: 0, source: 'WEB',
    }];
  } catch (err) {
    logger.warn(`Cheerio ${url}: ${err.message}`);
    return [];
  }
}

async function scrapeRss(url, keywords) {
  try {
    const Parser = require('rss-parser');
    const parser = new Parser({ timeout: 12000 });
    const feed = await parser.parseURL(url);
    const results = [];
    for (const item of feed.items.slice(0, 30)) {
      const text = (item.title || '') + ' ' + (item.contentSnippet || '');
      const matchedKw = keywords.find(kw => containsKeyword(text, kw));
      if (!matchedKw) continue;
      const { sentiment, score } = await analyzeSentiment(text);
      results.push({
        sourceUrl: item.link || url, sourceName: feed.title || extractDomain(url),
        author: item.creator || null,
        content: text.slice(0, 1000), snippet: text.slice(0, 300),
        keyword: matchedKw, sentiment, sentimentScore: score,
        reach: 0, source: 'WEB',
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
      });
    }
    return results;
  } catch (err) {
    logger.warn(`RSS ${url}: ${err.message}`);
    return [];
  }
}

// Las pages de Facebook necesitan un navegador real (login wall). Playwright
// no corre en Cloud Functions, asi que las fuentes custom de tipo FACEBOOK_PAGE
// quedan sin cubrir: el descubrimiento de FB va por el actor de busqueda de
// Apify (scrapers/apifyFacebookScraper.js), que no toma una page puntual.
async function scrapeFacebookPage(url) {
  logger.warn(`Fuente custom FACEBOOK_PAGE no soportada (requiere navegador): ${url}`);
  return [];
}

// Idem Facebook: el perfil de IG necesita el actor de Apify, no un fetch simple.
async function scrapeInstagramProfile(url) {
  logger.warn(`Fuente custom INSTAGRAM_PROFILE no soportada (requiere Apify): ${url}`);
  return [];
}

async function scrapeCustomSources(campaignId) {
  const db = getDb();
  const sourcesSnap = await db.collection('customSources')
    .where('campaignId', '==', campaignId)
    .where('isActive', '==', true).get();

  const sources = toDocs(sourcesSnap);
  if (!sources.length) return { saved: 0, mentions: [] };

  const kwSnap = await db.collection('keywords')
    .where('campaignId', '==', campaignId)
    .where('isActive', '==', true).get();
  const keywordDocs = toDocs(kwSnap);
  const keywords = keywordDocs.map(k => k.term);
  if (!keywords.length) return { saved: 0, mentions: [] };

  const allMentions = [];

  for (const src of sources) {
    try {
      const results = await scrapeCustomUrl(src.url, keywords, src.type);

      for (const r of results) {
        const kwRecord = keywordDocs.find(k =>
          normalize(k.term).includes(normalize(r.keyword || '').split(' ')[0])
        );
        allMentions.push({
          campaignId,
          keywordId: kwRecord?.id || null,
          source: r.source,
          sourceUrl: r.sourceUrl,
          sourceName: r.sourceName,
          author: r.author || null,
          content: r.content,
          snippet: r.snippet,
          sentiment: r.sentiment,
          sentimentScore: r.sentimentScore,
          reach: r.reach || 0,
          publishedAt: r.publishedAt || new Date(),
        });
      }

      await db.collection('customSources').doc(src.id).update({ lastScraped: new Date() });

      logger.info(`Custom ${src.type} ${extractDomain(src.url)}: ${results.length} menciones`);
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      logger.error(`Custom source ${src.url}: ${err.message}`);
    }
  }

  return { saved: allMentions.length, mentions: allMentions };
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

module.exports = { scrapeCustomUrl, scrapeCustomSources };
