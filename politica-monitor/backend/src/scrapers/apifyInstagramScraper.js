const { runActor } = require('../lib/apifyClient');
const { containsKeyword, isWithinRange, topWords, isForeignScript, isForeignCountry, isPortuguese, isSportsNoise, isEnglishNoise, logger } = require('./base');

const IG_ACTOR = 'apify~instagram-api-scraper';

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

// Mención cruda SIN `extra`. Una sola definición: se usa tanto para calcular la
// identidad (dedupeKey) al chequear existencia como para el resultado final,
// así el ID que consulta el scraper es el mismo que después usa saveMentions.
function baseMention(post, keyword, campaignId) {
  const caption = post.caption || '';
  return {
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
  };
}

// Filtro de fecha en ORIGEN: `onlyPostsNewerThan` (solo aplica con
// resultsType 'posts'). Se envía como fecha absoluta YYYY-MM-DD (UTC); el
// actor también acepta ventanas relativas ("1 day"), pero la fecha exacta del
// delta es más precisa.
function dateFilterInput(since) {
  if (!since) return {};
  return { onlyPostsNewerThan: since.toISOString().slice(0, 10) };
}

// Granularidad de día en el actor: el chequeo exacto por timestamp es la garantía real.
function isBefore(ts, since) {
  if (!since || !ts) return false;
  const t = new Date(ts);
  return !isNaN(t.getTime()) && t < since;
}

// Pide posts al actor. Con `feedCache` (Map por campaña/corrida) un mismo feed
// con el mismo límite y fecha se paga UNA vez aunque lo consulten varias
// keywords: en modo geográfico el feed de la ubicación es idéntico para todas.
async function fetchPosts(directUrls, limit, since, feedCache) {
  const input = { directUrls, resultsType: 'posts', resultsLimit: limit, ...dateFilterInput(since) };
  if (!feedCache) return runActor(IG_ACTOR, input);
  const key = JSON.stringify(input);
  if (!feedCache.has(key)) feedCache.set(key, await runActor(IG_ACTOR, input));
  return feedCache.get(key);
}

// `knownChecker` (lib/knownMentions.createKnownChecker) reemplaza a la descarga
// de 7 días de URLs. `excludeUrls` se sigue aceptando por compatibilidad con
// otros llamadores; se puede borrar cuando se confirme que nadie más lo pasa.
//
// since:     Date. Límite inferior (delta) enviado al actor como onlyPostsNewerThan.
// geoUrls:   URLs de ubicaciones de Instagram de la campaña
//            (https://www.instagram.com/explore/locations/<id>/<slug>/). Si hay,
//            se scrapea el feed de esas ubicaciones EN LUGAR del hashtag global,
//            y la keyword se busca en caption/cuenta (filtro de abajo).
//            Sin geoUrls: comportamiento histórico por hashtag.
// feedCache: Map opcional, compartido entre keywords de una misma campaña.
async function scrapeInstagram({ keywords, maxAgeMins, maxPerKeyword = 15, maxResults = 1, campaignId, excludeUrls, knownChecker, since, geoUrls = [], feedCache, maxAttempts = 2, maxLimitCap = 40, skipComments = false }) {
  const exclude = excludeUrls instanceof Set ? excludeUrls : new Set(excludeUrls || []);
  const geoMode = Array.isArray(geoUrls) && geoUrls.length > 0;
  const results = [];

  for (const keyword of keywords) {
    const tag = hashtagSlug(keyword);
    if (!geoMode && !tag) continue;
    const label = geoMode ? `geo x${geoUrls.length}` : `#${tag}`;

    try {
      // Si el lote no trae ningún post nuevo (todos ya vistos), pedimos un
      // lote más grande antes de darnos por vencidos. Tope de intentos y de
      // tamaño para no pagar de más por eventos que después descartamos.
      let items = [];
      let matches = [];
      let limit = maxPerKeyword;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const directUrls = geoMode ? geoUrls : [`https://www.instagram.com/explore/tags/${tag}/`];
        items = await fetchPosts(directUrls, limit, since, feedCache);

        // Si el actor ignorara el filtro de fecha, casi todo vendría "viejo".
        if (since && items.length >= 5) {
          const stale = items.filter(p => isBefore(p.timestamp, since)).length;
          if (stale / items.length > 0.5) {
            logger.warn(`[IG-Apify] "${keyword}" (${label}): ${stale}/${items.length} posts anteriores a ${since.toISOString()} — el actor no está aplicando onlyPostsNewerThan`);
          }
        }

        // Fase 1 (síncrona, gratis): relevancia. Igual que en Facebook: la
        // cuenta que publica cuenta como texto. Un post del propio candidato
        // rara vez lo nombra en el caption.
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

        // Insistimos hasta juntar la cantidad exacta pedida, o hasta que el
        // actor ya no tenga más para dar (items.length < limit = se acabó).
        if (matches.length >= maxResults || items.length < limit) break;
        limit = Math.min(limit * 2, maxLimitCap);
      }

      if (matches.length === 0) {
        logger.info(`[IG-Apify] "${keyword}" (${label}): ${items.length} posts revisados, sin match nuevo`);
        continue;
      }

      for (const post of matches) {
        const caption = post.caption || '';

        let commentTexts = [];
        if (post.url && !skipComments) {
          let succeeded = false;
          for (let attempt = 0; attempt < 2 && !succeeded; attempt++) {
            try {
              const comments = await runActor(IG_ACTOR, {
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
          ...baseMention(post, keyword, campaignId),
          extra: {
            commentsCount: post.commentsCount,
            hashtags: post.hashtags,
            comments: commentTexts.slice(0, 20),
            topWords: topWords(caption, 3),
            commentsTopWords: topWords(commentTexts.join(' '), 5),
          },
        });
      }
      logger.info(`[IG-Apify] "${keyword}" (${label}): ${items.length} posts, ${matches.length} match`);
    } catch (err) {
      logger.error(`[IG-Apify] "${keyword}": ${err.message}`);
    }
  }

  return results;
}

module.exports = { scrapeInstagram };
