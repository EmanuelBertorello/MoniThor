// La geo de una campaña (provincia/ciudad) vive empaquetada como JSON dentro
// del campo `description` de Firestore. Es una decisión histórica, pero la
// consumen el scraper (búsquedas por zona, aliases, portales locales) y el
// actor de Facebook de Apify (`fbLocationFor`), así que hay que respetarla.
//
// Estas funciones son el único lugar que conoce ese formato: el resto del
// código trabaja con `{ provincia, ciudad, text }` plano.

function parseGeo(description) {
  if (typeof description !== 'string' || !description.startsWith('{')) {
    return { provincia: '', ciudad: '', text: description || '' };
  }
  try {
    const parsed = JSON.parse(description);
    return {
      provincia: parsed.provincia || '',
      ciudad: parsed.ciudad || '',
      text: parsed.text || '',
    };
  } catch {
    return { provincia: '', ciudad: '', text: description };
  }
}

// Arma el valor de `description` a guardar. Los campos que no vengan en
// `input` se toman de lo que ya estaba: sin esto, un update que solo cambia
// el texto borraba la provincia y la campaña perdía su orientación geográfica.
function buildDescription(existingDescription, input = {}) {
  const current = parseGeo(existingDescription);
  const next = {
    provincia: input.provincia !== undefined ? (input.provincia || '') : current.provincia,
    ciudad: input.ciudad !== undefined ? (input.ciudad || '') : current.ciudad,
    text: input.description !== undefined ? (input.description || '') : current.text,
  };

  // Sin geo no tiene sentido el JSON: se guarda el texto pelado, que es lo que
  // esperan las campañas viejas.
  if (!next.provincia && !next.ciudad) return next.text || null;
  return JSON.stringify(next);
}

// Forma de campaña que consume el front: la geo desempaquetada al lado del
// `description` crudo, para que nadie más tenga que parsear JSON.
function toCampaignView(campaign) {
  const geo = parseGeo(campaign.description);
  return { ...campaign, provincia: geo.provincia, ciudad: geo.ciudad, descriptionText: geo.text };
}

module.exports = { parseGeo, buildDescription, toCampaignView };
