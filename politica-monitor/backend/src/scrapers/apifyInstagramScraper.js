const { runActor } = require('../lib/apifyClient');
const { containsKeyword, isWithinRange, topWords, isForeignScript, isForeignCountry, isPortuguese, isSportsNoise, isEnglishNoise, logger } = require('./base');

function hashtagSlug(keyword) {
  return keyword.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '').trim();
}

// Texto sobre el que se decide si un post es relevante: caption + cuenta que
// publica (usuario y nombre visible).
function haystack(post) {
  return [post.caption || '', post.ownerFullName || '', post.ownerUsername || '']
    .filter(Boolean).join(' . ');
}

async function scrapeInstagram({ keywords, maxAgeMins, maxPerKeyword = 15, maxResults = 1, campaignId, excludeUrls, maxAttempts = 2, maxLimitCap = 40, skipComments = false }) {
  const exclude = excludeUrls instanceof Set ? excludeUrls : new Set(excludeUrls || []);
  const results = [];

  for (const keyword of keywords) {
    const tag = hashtagSlug(keyword);
    if (!tag) continue;

    try {
      // Si el lote no trae ningún post nuevo (todos ya vistos), pedimos un
      // lote más grande antes de darnos por vencidos. Tope de intentos y de
      // tamaño para no pagar de más por eventos que después descartamos.
      let items = [];
      let matches = [];
      let limit = maxPerKeyword;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        items = await runActor('apify~instagram-api-scraper', {
          directUrls: [`https://www.instagram.com/explore/tags/${tag}/`],
          resultsType: 'posts',
          resultsLimit: limit,
        });
        matches = items.filter(p => {
          // Igual que en Facebook: la cuenta que publica cuenta como texto. Un
          // post del propio candidato rara vez lo nombra en el caption.
          const texto = haystack(p);
          return containsKeyword(texto, keyword)
            && isWithinRange(p.timestamp, maxAgeMins)
            && !isForeignScript(texto)
            && !isForeignCountry(texto)
            && !isPortuguese(texto)
            && !isSportsNoise(texto)
            && !isEnglishNoise(texto)
            && !exclude.has(p.url);
        }).slice(0, maxResults);
        // Insistimos hasta juntar la cantidad exacta pedida, o hasta que el
        // actor ya no tenga más para dar (items.length < limit = se acabó).
        if (matches.length >= maxResults || items.length < limit) break;
        limit = Math.min(limit * 2, maxLimitCap);
      }

      if (matches.length === 0) {
        logger.info(`[IG-Apify] "${keyword}" (#${tag}): ${items.length} posts revisados, sin match nuevo`);
        continue;
      }

      for (const post of matches) {
        const caption = post.caption || '';

        let commentTexts = [];
        if (post.url && !skipComments) {
          let succeeded = false;
          for (let attempt = 0; attempt < 2 && !succeeded; attempt++) {
            try {
              const comments = await runActor('apify~instagram-api-scraper', {
                directUrls: [post.url],
                resultsType: 'comments',
                resultsLimit: 50, // tope real del actor por post
              });
              commentTexts = comments.map(c => c.text || '').filter(Boolean);
              // El post dice que tiene comments pero vino vacío — falla
              // transitoria del actor, no que realmente no haya. Reintentar.
              succeeded = commentTexts.length > 0 || !post.commentsCount;
            } catch (err) {
              logger.error(`[IG-Apify] comments "${keyword}" (intento ${attempt + 1}): ${err.message}`);
            }
          }
        }

        results.push({
          campaignId, source: 'INSTAGRAM',
          sourceUrl: post.url,
          sourceName: post.ownerUsername ? `@${post.ownerUsername}` : 'Instagram',
          author: post.ownerUsername ? `@${post.ownerUsername}` : null,
          content: caption.slice(0, 2000),
          snippet: caption.slice(0, 300),
          reach: post.likesCount || 0,
          engagement: (post.likesCount || 0) + (post.commentsCount || 0),
          publishedAt: post.timestamp ? new Date(post.timestamp) : new Date(),
          keyword,
          extra: {
            commentsCount: post.commentsCount,
            hashtags: post.hashtags,
            comments: commentTexts.slice(0, 20),
            topWords: topWords(caption, 3),
            commentsTopWords: topWords(commentTexts.join(' '), 5),
          },
        });
      }
      logger.info(`[IG-Apify] "${keyword}" (#${tag}): ${items.length} posts, ${matches.length} match`);
    } catch (err) {
      logger.error(`[IG-Apify] "${keyword}": ${err.message}`);
    }
  }

  return results;
}

module.exports = { scrapeInstagram };
