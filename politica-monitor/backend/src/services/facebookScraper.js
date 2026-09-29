// Descubrimiento de menciones de FB/IG a traves de Google News (gratis).
// Ojo: lo que sale de aca NO son posts de la red social, son notas que las
// mencionan — por eso se etiquetan WEB y no FACEBOOK/INSTAGRAM.
// Los posts reales los trae Apify (src/scrapers/apify*Scraper.js).
const logger = require('../lib/logger');
const { analyzeSentiment } = require('./sentimentService');
const { containsKeyword, isTooOld } = require('./scraperService');

const RSS_TIMEOUT_MS = 10000;
const ITEMS_PER_QUERY = 10;

function newsRssUrl(query) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es-419&gl=AR&ceid=AR:es-419`;
}

async function collectFromQueries(queries, keyword, campaignId, keywordId) {
  const Parser = require('rss-parser');
  const parser = new Parser({ timeout: RSS_TIMEOUT_MS });
  const results = [];

  for (const q of queries) {
    try {
      const feed = await parser.parseURL(newsRssUrl(q));
      for (const item of feed.items.slice(0, ITEMS_PER_QUERY)) {
        if (isTooOld(item.pubDate)) continue;
        const text = `${item.title || ''} ${item.contentSnippet || ''}`;
        if (!containsKeyword(text, keyword)) continue;
        const { sentiment, score } = await analyzeSentiment(text);
        results.push({
          campaignId, keywordId, source: 'WEB',
          sourceUrl: item.link || '',
          sourceName: 'Google News',
          content: text.slice(0, 1000),
          snippet: text.slice(0, 300),
          sentiment, sentimentScore: score, reach: 0,
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        });
      }
    } catch (err) {
      logger.warn(`Google News "${q}": ${err.message}`);
    }
  }

  return results;
}

async function searchFacebookGeneral(keyword, geo, campaignId, keywordId) {
  const { provincia, ciudad } = geo || {};
  const queries = [
    provincia ? `"${keyword}" "${provincia}" site:facebook.com` : null,
    ciudad ? `"${keyword}" "${ciudad}" site:facebook.com` : null,
    !provincia && !ciudad ? `"${keyword}" site:facebook.com` : null,
  ].filter(Boolean);
  return collectFromQueries(queries, keyword, campaignId, keywordId);
}

async function searchInstagramGeneral(keyword, geo, campaignId, keywordId) {
  const { provincia, ciudad } = geo || {};
  const zona = ciudad || provincia || '';
  const queries = [zona ? `"${keyword}" "${zona}" site:instagram.com` : `"${keyword}" site:instagram.com`];
  return collectFromQueries(queries, keyword, campaignId, keywordId);
}

module.exports = {
  searchFacebookGeneral,
  searchInstagramGeneral,
  getActiveStrategy: () => 'google-news-rss',
};
