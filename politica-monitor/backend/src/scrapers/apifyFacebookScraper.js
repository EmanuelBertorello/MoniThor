const { runActor } = require('../lib/apifyClient');
const { containsKeyword, isWithinRange, topWords, isForeignScript, isForeignCountry, isPortuguese, isSportsNoise, isEnglishNoise, logger } = require('./base');

// Texto sobre el que se decide si un post es relevante: cuerpo + nombre de la
// página que publica.
function haystack(post) {
  return [post.postText || '', post.author?.name || ''].filter(Boolean).join(' . ');
}

// Mención cruda SIN `extra`. Una sola definición: se usa tanto para calcular la
// identidad (dedupeKey) al chequear existencia como para el resultado final,
// así el ID que consulta el scraper es el mismo que después usa saveMentions.
function baseMention(post, keyword, campaignId) {
  const text = post.postText || '';
  return {
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
  };
}

// Filtro de fecha en ORIGEN. El actor scraper_one~facebook-posts-search lo
// expresa con `startDate` (YYYY-MM-DD, día completo en UTC) y ordena con
// `searchType` ('top' = más populares, 'latest' = más recientes). Para extraer
// por delta conviene 'latest': el límite de resultados se agota con lo más
// nuevo, no con lo más popular. (`onlyPostsNewerThan`, `since` y
// `filter_by_recent_posts` son de OTROS actores de Facebook; si se cambia de
// actor, este es el único lugar a tocar.)
function dateFilterInput(since) {
  if (!since) return {};
  return { startDate: since.toISOString().slice(0, 10), searchType: 'latest' };
}

// `startDate` tiene granularidad de día: el actor puede devolver posts de ese
// mismo día anteriores a `since`. Este chequeo exacto es la garantía real.
function isBefore(ts, since) {
  if (!since || !ts) return false;
  const t = new Date(ts);
  return !isNaN(t.getTime()) && t < since;
}

// `knownChecker` (lib/knownMentions.createKnownChecker) reemplaza a la descarga
// de 7 días de URLs. `excludeUrls` se sigue aceptando por compatibilidad con
// otros llamadores; se puede borrar cuando se confirme que nadie más lo pasa.
//
// since:          Date. Límite inferior (delta). Sin él, no se filtra por fecha en origen.
// strictLocation: true => si el actor no reconoce la zona NO se reintenta sin
//                 `location` (ese reintento trae resultados globales, "sin zona").
async function scrapeFacebook({ keywords, maxAgeMins, maxPerKeyword = 15, maxResults = 1, campaignId, excludeUrls, knownChecker, location, since, strictLocation = false, maxAttempts = 2, maxLimitCap = 40, skipComments = false }) {
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
          ...dateFilterInput(since),
        });

        // Si el actor ignorara el filtro de fecha, casi todo vendría "viejo":
        // se deja constancia para detectarlo (el resultado igual es correcto,
        // porque abajo se vuelve a filtrar, pero el ahorro en Apify no existiría).
        if (since && items.length >= 5) {
          const stale = items.filter(p => isBefore(p.timestamp, since)).length;
          if (stale / items.length > 0.5) {
            logger.warn(`[FB-Apify] "${keyword}": ${stale}/${items.length} posts anteriores a ${since.toISOString()} — el actor no está aplicando startDate`);
          }
        }

        // Fase 1 (síncrona, gratis): relevancia. El nombre de la página cuenta
        // como parte del texto a matchear: los posts que publica el propio
        // candidato casi nunca lo nombran en el cuerpo, y mirando solo
        // postText se descartaban justo esos. También rescata los posts de solo
        // imagen, que vienen sin texto.
        const candidates = items.filter(p => {
          const texto = haystack(p);
          return containsKeyword(texto, keyword)
            && isWithinRange(p.timestamp, maxAgeMins)
            && !isBefore(p.timestamp, since)
            && !isForeignScript(texto)
            && !isForeignCountry(texto)
            && !isPortuguese(texto)
            && !isSportsNoise(texto)
            && !isEnglishNoise(texto)
            && !exclude.has(p.url);
        });

        // Fase 2 (Firestore, solo sobre los candidatos): descartar los que ya
        // tenemos. Revisa por tandas y corta al juntar `maxResults` nuevos.
        matches = knownChecker
          ? await knownChecker.firstUnknown(candidates, maxResults, p => baseMention(p, keyword, campaignId))
          : candidates.slice(0, maxResults);
        if (matches.length >= maxResults) break;

        // El actor no reconoce algunas ciudades (ambigüedad, ej. "Río Grande"
        // vs Rio Grande de Brasil) y devuelve 0 posts en vez de fallar. Por
        // defecto reintentamos la keyword sola, sin el filtro geográfico, en
        // vez de descartar el post entero. Con strictLocation NO: ese reintento
        // devuelve resultados de cualquier zona.
        if (useLocation && items.length === 0) {
          if (strictLocation) {
            logger.info(`[FB-Apify] "${keyword}": el actor no reconoció la zona "${location}" — strictLocation, no se reintenta sin zona`);
            break;
          }
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
          ...baseMention(post, keyword, campaignId),
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
