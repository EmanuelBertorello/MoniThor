const { runActor } = require('../lib/apifyClient');
const { containsKeyword, isWithinRange, topWords, isForeignScript, isForeignCountry, isPortuguese, isSportsNoise, isEnglishNoise, logger } = require('./base');

// Texto sobre el que se decide si un post es relevante: cuerpo + nombre de la
// página que publica.
function haystack(post) {
  return [post.postText || '', post.author?.name || ''].filter(Boolean).join(' . ');
}

async function scrapeFacebook({ keywords, maxAgeMins, maxPerKeyword = 15, maxResults = 1, campaignId, excludeUrls, location, maxAttempts = 2, maxLimitCap = 40, skipComments = false }) {
  const exclude = excludeUrls instanceof Set ? excludeUrls : new Set(excludeUrls || []);
  const results = [];

  for (const keyword of keywords) {
    try {
      // Si el lote no trae ningún post nuevo (todos ya vistos), pedimos un
      // lote más grande antes de darnos por vencidos. Tope de intentos y de
      // tamaño para no pagar de más por eventos que después descartamos.
      let items = [];
      let matches = [];
      let limit = maxPerKeyword;
      let useLocation = !!location;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        items = await runActor('scraper_one~facebook-posts-search', {
          query: keyword,
          resultsCount: limit,
          ...(useLocation ? { location } : {}),
        });
        matches = items.filter(p => {
          // El nombre de la página cuenta como parte del texto a matchear: los
          // posts que publica el propio candidato casi nunca lo nombran en el
          // cuerpo ("Seguimos sumando herramientas para transformar Río
          // Grande!"), y mirando solo postText se descartaban justo esos.
          // También rescata los posts de solo imagen, que vienen sin texto.
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
        if (matches.length >= maxResults) break;

        // El actor no reconoce algunas ciudades (ambigüedad, ej. "Río Grande"
        // vs Rio Grande de Brasil) y devuelve 0 posts en vez de fallar. Si
        // pasó eso, reintentamos la keyword sola, sin el filtro geográfico,
        // en vez de descartar el post entero.
        if (useLocation && items.length === 0) {
          useLocation = false;
          continue;
        }

        // Insistimos hasta juntar la cantidad exacta pedida, o hasta que el
        // actor ya no tenga más para dar (items.length < limit = se acabó).
        if (items.length < limit) break;
        limit = Math.min(limit * 2, maxLimitCap);
      }

      if (matches.length === 0) {
        logger.info(`[FB-Apify] "${keyword}": ${items.length} posts revisados, sin match nuevo`);
        continue;
      }

      for (const post of matches) {
        const text = post.postText || '';

        let commentTexts = [];
        if (post.url && !skipComments) {
          let succeeded = false;
          for (let attempt = 0; attempt < 2 && !succeeded; attempt++) {
            try {
              const comments = await runActor('scraper_one~facebook-comments-scraper', {
                postUrls: [post.url], resultsLimit: 30, commentsSortType: 'all',
              });
              commentTexts = comments.map(c => c.commentText || c.text || c.message || '').filter(Boolean);
              // El post dice que tiene comments pero vino vacío — falla
              // transitoria del actor, no que realmente no haya. Reintentar.
              succeeded = commentTexts.length > 0 || !post.commentsCount;
            } catch (err) {
              logger.error(`[FB-Apify] comments "${keyword}" (intento ${attempt + 1}): ${err.message}`);
            }
          }
        }

        results.push({
          campaignId, source: 'FACEBOOK',
          sourceUrl: post.url,
          sourceName: post.author?.name || 'Facebook',
          author: post.author?.name || null,
          content: text.slice(0, 2000),
          snippet: text.slice(0, 300),
          reach: post.reactionsCount || 0,
          engagement: (post.reactionsCount || 0) + (post.commentsCount || 0) + (post.sharesCount || 0),
          publishedAt: post.timestamp ? new Date(post.timestamp) : new Date(),
          keyword,
          extra: {
            reactions: post.reactions,
            sharesCount: post.sharesCount,
            commentsCount: post.commentsCount,
            comments: commentTexts,
            topWords: topWords(text, 3),
            commentsTopWords: topWords(commentTexts.join(' '), 5),
          },
        });
      }
      logger.info(`[FB-Apify] "${keyword}": ${items.length} posts, ${matches.length} match`);
    } catch (err) {
      logger.error(`[FB-Apify] "${keyword}": ${err.message}`);
    }
  }

  return results;
}

module.exports = { scrapeFacebook };
