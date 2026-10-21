const crypto = require('crypto');
const { dedupeKey } = require('./dedupe');

// ID del documento de `mentions`: SHA-256 de campaña + identidad canónica. Así
// la propia colección es el filtro de duplicados (getAll por ID, sin índices).
// El campaignId va adentro del hash porque la misma nota puede pertenecer a
// varias campañas y cada una necesita su propio documento.
function mentionDocId(campaignId, key) {
  return crypto.createHash('sha256').update(`${campaignId}|${key}`).digest('hex');
}

const LEGACY_LOOKUP = process.env.DEDUPE_LEGACY_LOOKUP !== 'false';
const GETALL_CHUNK = 300;

// Chequeo de "¿ya lo tenemos?" para los scrapers de Apify, una instancia por
// campaña. Reemplaza a la descarga de 7 días de URLs: solo se leen los
// candidatos que pasaron los filtros de relevancia, y por tandas.
function createKnownChecker(db, campaignId) {
  const col = db.collection('mentions');
  const known = new Set();    // ya en Firestore
  const claimed = new Set();  // ya devuelto por esta instancia (otra keyword)

  async function lookupKnown(keys, urls) {
    const pending = keys.filter(k => !known.has(k));
    if (!pending.length) return;

    // 1) Por ID determinista.
    const refs = pending.map(k => col.doc(mentionDocId(campaignId, k)));
    const snaps = await db.getAll(...refs, { fieldMask: ['dedupeKey'] });
    snaps.forEach((s, i) => { if (s.exists) known.add(pending[i]); });

    // 2) LEGADO: documentos con ID aleatorio, guardados antes del ID por hash.
    if (!LEGACY_LOOKUP) return;
    const rest = pending.filter(k => !known.has(k));
    if (!rest.length) return;
    const lookup = async (field, values) => {
      const uniq = [...new Set(values.filter(Boolean))];
      for (let i = 0; i < uniq.length; i += 30) {
        const snap = await col
          .where('campaignId', '==', campaignId)
          .where(field, 'in', uniq.slice(i, i + 30)).get();
        snap.docs.forEach(d => known.add(d.data().dedupeKey || dedupeKey(d.data())));
      }
    };
    await lookup('dedupeKey', rest);
    await lookup('sourceUrl', urls);
  }

  // Devuelve hasta `max` posts crudos de `candidates` que todavía no están
  // guardados. `toMention(post)` arma la mención para calcular su identidad.
  async function firstUnknown(candidates, max, toMention) {
    const out = [];
    for (let i = 0; i < candidates.length && out.length < max; i += GETALL_CHUNK) {
      const lote = candidates.slice(i, i + GETALL_CHUNK).map(post => {
        const m = toMention(post);
        return { post, key: dedupeKey(m), url: m.sourceUrl };
      });
      await lookupKnown(lote.map(x => x.key), lote.map(x => x.url));
      for (const { post, key } of lote) {
        if (out.length >= max) break;
        if (known.has(key) || claimed.has(key)) continue;
        claimed.add(key);
        out.push(post);
      }
    }
    return out;
  }

  return { firstUnknown };
}

module.exports = { mentionDocId, createKnownChecker };
