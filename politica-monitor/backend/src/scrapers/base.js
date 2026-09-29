const logger = require('../lib/logger');

function normalize(text) {
  if (!text) return '';
  return text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

const STOPWORDS = new Set([
  'de','la','el','en','y','a','que','los','del','las','un','una','con','para',
  'por','se','su','es','no','lo','como','más','mas','pero','sus','le','ya',
  'o','este','esta','entre','cuando','muy','sin','sobre','también','tambien',
  'me','hasta','hay','donde','quien','desde','todo','nos','durante','todos',
  'uno','les','ni','contra','otros','ese','eso','ante','ellos','e','esto',
  'mí','antes','algunos','qué','unos','yo','otro','otras','otra','él','tanto',
  'esa','estos','mucho','quienes','nada','muchos','cual','poco','ella','estar',
  'estas','algunas','algo','nosotros','mi','mis','tú','te','ti','tu','tus',
  'era','son','fue','ser','han','the','and','for','with',
]);

function topWords(text, n = 3) {
  if (!text) return [];
  const counts = {};
  normalize(text).split(' ').forEach(w => {
    if (w.length > 3 && !STOPWORDS.has(w)) counts[w] = (counts[w] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Palabra completa, no substring — "martin" no debe matchear dentro de
// "Martins" (apellido de otra persona). Sin esto, keywords cortas pegaban
// falsos positivos en cualquier texto que tuviera esas letras seguidas.
function containsKeyword(text, keyword) {
  if (!text || !keyword) return false;
  const normText = normalize(text);
  const parts = normalize(keyword).split(' ').filter(w => w.length > 3);
  const words = parts.length > 0 ? parts : [normalize(keyword)];
  return words.every(w => new RegExp(`\\b${escapeRegExp(w)}\\b`).test(normText));
}

// Descarta ruido de otras regiones/idiomas (ej. "Martin Perez" pitcher de MLB
// en China/Taiwán) — nuestras campañas son de política argentina en español.
const FOREIGN_SCRIPT_RE = /[぀-ヿ㐀-鿿가-힯؀-ۿЀ-ӿ]/;
function isForeignScript(text) {
  if (!text) return false;
  return FOREIGN_SCRIPT_RE.test(text);
}

// Ruido de otros países hispanohablantes (mismo idioma, script latino, no lo
// agarra isForeignScript) — ej. un "Martín Pérez" alcalde en Nariño, Colombia.
const FOREIGN_COUNTRY_HINTS = [
  'colombia', 'méxico', 'mexico', 'perú', 'peru', 'ecuador', 'bolivia',
  'venezuela', 'chile', 'uruguay', 'paraguay', 'panamá', 'panama', 'honduras',
  'guatemala', 'nicaragua', 'el salvador', 'república dominicana', 'costa rica',
  'puerto rico', 'españa', 'cuba',
  // departamentos/regiones comunes de otros países que suelen aparecer en el
  // texto aunque no digan el nombre del país explícitamente
  'nariño', 'antioquia', 'cundinamarca', 'boyacá', 'tolima', 'huila', 'cauca',
  'putumayo', 'caquetá',
  'jalisco', 'oaxaca', 'chiapas', 'yucatán', 'veracruz', 'michoacán', 'sinaloa',
];
// Frase completa, no substring — "chile" no debe matchear dentro de
// "Chilecito" (La Rioja), "cuba" no debe matchear dentro de "cubano".
function containsAnyPhrase(text, phrases) {
  if (!text) return false;
  const t = normalize(text);
  return phrases.some(p => new RegExp(`\\b${escapeRegExp(normalize(p))}\\b`).test(t));
}

function isForeignCountry(text) {
  return containsAnyPhrase(text, FOREIGN_COUNTRY_HINTS);
}

// Ruido deportivo — hay jugadores/pitchers reales con el mismo nombre y
// apellido que candidatos políticos (ej. "Martín Pérez" pitcher de los
// Atlanta Braves en MLB). El match de palabra es correcto pero es la
// persona equivocada. Estos términos casi nunca aparecen en política.
// ("ERA" de béisbol se saca del todo: como palabra suelta es el verbo "era"
// de "ser", usadísimo en español — imposible distinguir de forma confiable).
const SPORTS_NOISE_HINTS = [
  'mlb', 'grandes ligas', 'nba', 'nfl', 'nhl',
  'cuadrangular', 'jonron', 'jonrón', 'ponches', 'bateo', 'pitcheo',
  'entradas lanzadas', 'whip', 'woba', 'ops diario',
  'liga mx', 'champions league', 'copa libertadores', 'copa sudamericana',
  // Béisbol en inglés: el homónimo más insistente es Martín Pérez, pitcher
  // de los Braves. Sus posts no traen ningún término deportivo en español,
  // así que sin esto se cuelan como si fueran del intendente.
  'pitched', 'pitcher', 'pitching', 'innings', 'inning', 'strikeout',
  'strikeouts', 'shutout', 'bullpen', 'lhp', 'rhp', 'home run', 'homer',
  'ballpark', 'rbi', 'braves', 'yankees', 'dodgers', 'red sox', 'astros',
  'rangers', 'orioles', 'padres', 'mariners', 'phillies', 'cardinals',
  'baseball', 'starting rotation', 'earned run',
];
function isSportsNoise(text) {
  return containsAnyPhrase(text, SPORTS_NOISE_HINTS);
}

// Ruido en inglés — nuestras campañas son política argentina en español.
// "Martin Perez on the mound tonight" (pitcher de Atlanta) no tiene ningún
// término deportivo en español que lo agarre, pero está en inglés — señal
// fuerte de que es el homónimo de EEUU, no el candidato. Palabras cortas
// exclusivas del inglés (no existen como tales en español), 2+ para evitar
// falsos positivos de una sola coincidencia suelta.
// Palabras frecuentes del inglés que NO existen en español, para no pisar
// texto legítimo. Se excluyen a propósito las que se escriben igual en los dos
// idiomas ("a", "son", "has", "no", "en"): darían falsos positivos sobre
// noticias en castellano.
const ENGLISH_HINTS = [
  'the', 'and', 'with', 'watch', 'listen', 'tonight', 'mound', 'tomorrow',
  'this', 'that', 'these', 'those', 'from', 'have', 'been', 'his', 'her',
  'they', 'their', 'them', 'was', 'were', 'will', 'would', 'should', 'could',
  'about', 'after', 'before', 'while', 'into', 'than', 'then', 'there',
  'where', 'which', 'what', 'when', 'who', 'because', 'through', 'against',
  'between', 'during', 'under', 'over', 'across', 'without', 'within',
  'together', 'however', 'already', 'always', 'never', 'often', 'only',
  'first', 'last', 'next', 'back', 'down', 'out', 'off', 'still', 'even',
  'every', 'each', 'both', 'other', 'another', 'some', 'many', 'much',
  'very', 'well', 'good', 'great', 'best', 'new', 'old', 'here', 'today',
  'yesterday', 'week', 'year', 'years', 'night', 'season', 'game', 'team',
  'our', 'are', 'you', 'your', 'my', 'is', 'it', 'just', 'more', 'most',
  'make', 'made', 'take', 'said', 'says', 'know', 'think', 'want', 'need',
  'like', 'love', 'time', 'people', 'life', 'world', 'work', 'home', 'photos',
];
function isEnglishNoise(text) {
  if (!text) return false;
  const t = normalize(text);
  const hits = ENGLISH_HINTS.filter(h => new RegExp(`\\b${escapeRegExp(h)}\\b`).test(t));
  return hits.length >= 2;
}

// Portugués (Brasil) — mismo alfabeto que español pero usa ã/õ/ê/ô/ç, que el
// español no usa nunca. Hay que chequear el texto CRUDO (sin normalize, que
// saca los acentos). Sin esto, ruido de fútbol/noticias de Brasil se cuela
// cuando el location del actor de Apify no filtra bien por geo.
const PORTUGUESE_RE = /[ãõêôç]/;
function isPortuguese(text) {
  if (!text) return false;
  return PORTUGUESE_RE.test(text);
}

function isWithinRange(dateStr, maxAgeMins) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return (Date.now() - d.getTime()) / 60000 <= maxAgeMins;
}

function parseRelativeDate(text) {
  if (!text) return new Date();
  const t = text.toLowerCase().trim();
  const now = Date.now();
  let m;
  if ((m = t.match(/(\d+)\s*s/))) return new Date(now - parseInt(m[1]) * 1000);
  if ((m = t.match(/(\d+)\s*m/))) return new Date(now - parseInt(m[1]) * 60000);
  if ((m = t.match(/(\d+)\s*h/))) return new Date(now - parseInt(m[1]) * 3600000);
  if ((m = t.match(/(\d+)\s*d/))) return new Date(now - parseInt(m[1]) * 86400000);
  if (t.includes('ahora') || t.includes('just now')) return new Date(now - 30000);
  const parsed = new Date(text);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function delay(minMs = 1500, maxMs = 4000) {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  return new Promise(r => setTimeout(r, ms));
}

async function setupStealth(page) {
  await page.route('**/*.{png,jpg,jpeg,gif,webp,svg,ico,woff,woff2,ttf,mp4,webm,ogg,mp3}', route => route.abort());
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'es-AR,es;q=0.9,en;q=0.7',
  });
}

module.exports = {
  normalize, containsKeyword, isWithinRange, parseRelativeDate, topWords, isForeignScript, isForeignCountry, isPortuguese, isSportsNoise, isEnglishNoise,
  delay, setupStealth, logger,
};
