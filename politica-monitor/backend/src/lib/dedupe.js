const crypto = require('crypto');

// Parámetros que no cambian el contenido apuntado — Google News rota `oc`,
// las redes agregan fbclid/igshid, las campañas de mail agregan utm_*. Sin
// sacarlos, la misma nota entra de nuevo en cada corrida con otra query.
const TRACKING_PARAMS = new Set([
  'oc', 'hl', 'gl', 'ceid', 'fbclid', 'igshid', 'igsh', 'gclid', 'msclkid',
  'ref', 'ref_src', 'ref_url', 'source', 'spm', 'mc_cid', 'mc_eid', '_ga',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
]);

function normalizeText(text) {
  if (!text) return '';
  return String(text).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Devuelve la URL en forma canónica, o '' si no sirve como identidad.
function canonicalUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return '';
  }
  if (!/^https?:$/.test(u.protocol)) return '';

  const host = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');

  // Google News: el ID del artículo ya es único y estable. El resto de la URL
  // (querystring con `oc`, idioma, edición) cambia entre corridas.
  if (host === 'news.google.com') {
    const m = u.pathname.match(/\/(?:rss\/)?articles\/([^/?#]+)/);
    if (m) return `gnews:${m[1]}`;
  }

  // Instagram/Facebook: el shortcode / id del post es la identidad.
  if (host === 'instagram.com') {
    const m = u.pathname.match(/\/(?:p|reel|tv)\/([^/?#]+)/);
    if (m) return `ig:${m[1].toLowerCase()}`;
  }
  if (host === 'facebook.com') {
    const story = u.searchParams.get('story_fbid');
    if (story) return `fb:${story}`;
    const m = u.pathname.match(/\/(?:posts|videos|reel|permalink\.php)\/?([^/?#]*)/);
    if (m && m[1]) return `fb:${m[1].toLowerCase()}`;
  }

  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAMS.has(k.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  const qs = params.length ? '?' + params.map(([k, v]) => `${k}=${v}`).join('&') : '';
  const path = u.pathname.replace(/\/+$/, '');

  const out = `${host}${path}${qs}`.toLowerCase();
  return out.length >= 10 ? out : '';
}

// Fallback cuando no hay URL utilizable: hash de las primeras palabras del
// contenido. Corto a 24 palabras para que un mismo texto re-publicado con un
// "…" o un emoji extra al final siga colapsando en la misma clave.
function contentHash(content) {
  const norm = normalizeText(content).split(' ').slice(0, 24).join(' ');
  if (norm.length < 15) return '';
  return 'h:' + crypto.createHash('sha1').update(norm).digest('hex').slice(0, 24);
}

// Clave de identidad de una mención. Siempre devuelve algo: si no hay ni URL
// ni texto suficiente cae a un random, para que una mención degenerada se
// guarde una vez y no bloquee ni colisione con otras.
function dedupeKey(mention) {
  const url = canonicalUrl(mention.sourceUrl);
  if (url) return url;
  const hash = contentHash(mention.content || mention.snippet);
  if (hash) return hash;
  return 'r:' + crypto.randomBytes(12).toString('hex');
}

// Deduplica un lote en memoria (antes de tocar Firestore).
function dedupeBatch(mentions) {
  const seen = new Set();
  const out = [];
  for (const m of mentions || []) {
    const key = dedupeKey(m);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...m, dedupeKey: key });
  }
  return out;
}

// Filtra contra lo ya guardado en Firestore. Chequea `dedupeKey` y además
// `sourceUrl` crudo, para que las menciones viejas (guardadas antes de que
// existiera dedupeKey) sigan contando como vistas hasta que corra el backfill.
async function filterAlreadySaved(db, campaignId, mentions) {
  const batch = dedupeBatch(mentions);
  if (!batch.length) return { fresh: [], seenCount: 0 };

  const seen = new Set();

  const lookup = async (field, values) => {
    const uniq = [...new Set(values.filter(Boolean))];
    for (let i = 0; i < uniq.length; i += 30) {
      const chunk = uniq.slice(i, i + 30);
      const snap = await db.collection('mentions')
        .where('campaignId', '==', campaignId)
        .where(field, 'in', chunk).get();
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.dedupeKey) seen.add(data.dedupeKey);
        if (data.sourceUrl) seen.add(canonicalUrl(data.sourceUrl) || data.sourceUrl);
      });
    }
  };

  await lookup('dedupeKey', batch.map(m => m.dedupeKey));
  await lookup('sourceUrl', batch.map(m => m.sourceUrl));

  const fresh = batch.filter(m => !seen.has(m.dedupeKey));
  return { fresh, seenCount: batch.length - fresh.length };
}

module.exports = {
  canonicalUrl, contentHash, dedupeKey, dedupeBatch, filterAlreadySaved, normalizeText,
};
