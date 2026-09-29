const axios = require('axios');
const logger = require('../lib/logger');

// Modelo remoto opcional. Si no hay API key configurada, o si el endpoint
// responde con error varias veces seguidas, se usa el analizador local y no
// se vuelve a intentar por el resto de la vida del proceso: una llamada
// fallida por mención cuesta latencia en cada corrida y no aporta nada.
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';
const API_URL = process.env.SENTIMENT_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
// meta/llama-3.1-8b-instruct fue dado de baja por NVIDIA y devolvía 410 Gone
// en cada llamada. deepseek-v4-flash es el que responde hoy con esta cuenta.
const MODEL = process.env.SENTIMENT_MODEL || 'deepseek-ai/deepseek-v4-flash-0731';

// El modelo tarda ~6s por mención. Una corrida con 150 menciones nuevas se
// comería varios minutos del presupuesto del job, así que se acota cuántas se
// analizan con IA; el resto usa el analizador local, que es instantáneo.
// Cada consulta tarda ~25s porque el modelo razona antes de contestar. Con 5
// por corrida y 2 en paralelo son ~60s, que es lo que tolera el presupuesto de
// GitHub Actions (ver el calculo en .github/workflows/scrape.yml). El resto lo resuelve el analizador local, que no es un modelo
// pero acierta bien cuando el texto trae vocabulario claro.
const MAX_REMOTE_PER_RUN = Number(process.env.SENTIMENT_MAX_REMOTE_PER_RUN || 5);
let remoteCallsThisRun = 0;

const cache = new Map();
const CACHE_MAX = 3000;

let dailyCalls = 0;
let lastReset = new Date().toDateString();
const DAILY_LIMIT = 1400;

// Circuit breaker: tres fallos seguidos y se apaga el camino remoto.
const MAX_CONSECUTIVE_FAILURES = Number(process.env.SENTIMENT_MAX_FAILURES || 6);
let consecutiveFailures = 0;
let remoteDisabled = !NVIDIA_API_KEY;

// El modelo aguanta mal varias consultas a la vez: con 5 en paralelo las
// respuestas se encolaban, pasaban los 20s de timeout y el circuit breaker
// apagaba la IA para toda la corrida. Se limita a 2 en vuelo; como solo van las
// menciones ambiguas, alcanza de sobra y no frena al resto del enriquecimiento.
const MAX_EN_VUELO = Number(process.env.SENTIMENT_CONCURRENCY || 2);
let enVuelo = 0;
const esperando = [];

function tomarTurno() {
  if (enVuelo < MAX_EN_VUELO) {
    enVuelo++;
    return Promise.resolve();
  }
  return new Promise(resolve => esperando.push(resolve));
}

function liberarTurno() {
  const siguiente = esperando.shift();
  if (siguiente) siguiente();     // le cede el turno sin bajar el contador
  else enVuelo--;
}

function resetIfNewDay() {
  const today = new Date().toDateString();
  if (today !== lastReset) { dailyCalls = 0; lastReset = today; }
}

function cacheKey(text) {
  return text.toLowerCase().slice(0, 120);
}

function remember(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

async function analyzeSentiment(text) {
  if (!text || text.length < 5) return { sentiment: 'NEUTRAL', score: 0 };

  const key = cacheKey(text);
  if (cache.has(key)) return cache.get(key);

  resetIfNewDay();

  // Se calcula primero el local: es instantáneo y resuelve bien los casos con
  // vocabulario claro ("denuncian corrupción", "inauguraron el hospital").
  const local = localSentiment(text);

  const sinRemoto = remoteDisabled || dailyCalls >= DAILY_LIMIT;
  const sinCupo = remoteCallsThisRun >= MAX_REMOTE_PER_RUN;

  if (sinRemoto || localEsConfiable(local)) {
    return remember(key, local);
  }

  if (sinCupo) {
    if (remoteCallsThisRun === MAX_REMOTE_PER_RUN) {
      remoteCallsThisRun++;   // que el aviso salga una sola vez
      logger.info(`Sentimiento: alcanzado el tope de ${MAX_REMOTE_PER_RUN} consultas a la IA en esta corrida — el resto queda con el analizador local`);
    }
    return remember(key, local);
  }
  remoteCallsThisRun++;

  await tomarTurno();
  try {
    const snippet = text.slice(0, 400).replace(/\n/g, ' ');
    const res = await axios.post(API_URL, {
      model: MODEL,
      messages: [
        {
          role: 'user',
          content: `Analiza el sentimiento político argentino del siguiente texto. Responde SOLO con JSON sin texto extra:\n{"sentiment":"POSITIVE","score":0.8}\nTexto: "${snippet}"`,
        },
      ],
      temperature: 0.2,
      // deepseek-v4-flash razona antes de responder y ese "pensamiento" gasta
      // tokens de la misma cuota. Con 60 se los consumia enteros y devolvia
      // content vacio; hace falta margen para el razonamiento MAS la respuesta.
      max_tokens: Number(process.env.SENTIMENT_MAX_TOKENS || 400),
    }, {
      headers: {
        'Authorization': `Bearer ${NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      // El modelo tarda ~6s suelto y mas bajo concurrencia, con picos. 20s da
      // aire sin dejar que una respuesta lenta se coma el presupuesto del job:
      // si se pasa, esa mencion se resuelve con el analizador local y listo.
      timeout: Number(process.env.SENTIMENT_TIMEOUT_MS || 30000),
    });

    // Algunos modelos envuelven el JSON en texto o en un bloque de código: se
    // recorta al primer objeto en vez de confiar en que la respuesta sea JSON puro.
    // Si el modelo se queda sin tokens la respuesta puede venir solo en
    // reasoning_content; se busca el JSON en los dos lados.
    const msg = res.data.choices?.[0]?.message || {};
    const raw = `${msg.content || ''} ${msg.reasoning_content || ''}`
      .replace(/```json|```/g, '').trim();
    const objeto = raw.match(/\{[\s\S]*?\}/);
    if (!objeto) throw new Error('respuesta sin JSON');
    const parsed = JSON.parse(objeto[0]);
    consecutiveFailures = 0;
    dailyCalls++;
    return remember(key, {
      sentiment: ['POSITIVE', 'NEGATIVE', 'NEUTRAL'].includes(parsed.sentiment) ? parsed.sentiment : 'NEUTRAL',
      score: typeof parsed.score === 'number' ? Math.max(-1, Math.min(1, parsed.score)) : 0,
    });
  } catch (err) {
    if (err.response?.status === 429) dailyCalls = DAILY_LIMIT;

    consecutiveFailures++;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      remoteDisabled = true;
      logger.warn(`Sentimiento: API remota deshabilitada tras ${consecutiveFailures} fallos seguidos (${err.response?.status || err.message}) — se usa el analizador local`);
    }
    return remember(key, local);
  } finally {
    liberarTurno();
  }
}

function normalize(text) {
  return (text || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Raíces, no palabras completas: "denunci" cubre denuncia/denuncian/denunció.
// Se matchean con límite de palabra a ambos lados del sufijo, NUNCA como
// substring suelto — con includes(), "tambien" contenía "bien" y marcaba como
// positivo prácticamente cualquier texto en español.
//
// Importante: acá van solo palabras que cargan sentimiento. Los TEMAS
// (salud, educación, obras, empleo, seguridad) se sacaron a propósito: no son
// positivos por sí mismos, y hacían que "crisis en salud" empatara en NEUTRAL.
const POSITIVE_STEMS = [
  'excelente', 'exitos', 'exito', 'logr', 'avanc', 'victoria', 'triunf',
  'progres', 'mejor', 'gano', 'ganaron', 'ganador', 'benefici',
  'crecimient', 'crecio', 'crece',
  'solucion', 'celebr', 'respald', 'lider', 'inaugur', 'destac', 'felicit',
  'reconocimient', 'aprob', 'apoy', 'homenaje', 'premi', 'acuerd',
  'historico', 'impuls', 'fortalec', 'agradec',
];

const NEGATIVE_STEMS = [
  'crisis', 'fracas', 'corrupcion', 'corrupt', 'escandal', 'problem',
  'denunci', 'critic', 'polemic', 'rechaz', 'protest', 'perdio', 'derrot',
  'acus', 'fall', 'deuda', 'robo', 'robaron', 'roban', 'fraud', 'mentir',
  'renunci', 'inflacion',
  'pobreza', 'desemple', 'inseguridad', 'colaps', 'ajuste', 'impunidad',
  'negligenc', 'incapaz', 'desastr', 'caos', 'ataqu', 'imputad', 'imputaron',
  'violenc', 'abus', 'acos', 'agresion', 'maltrat', 'investigan', 'procesad',
  'detenid', 'preso', 'presos', 'sospech', 'ilegal', 'irregular',
  'sobresei', 'embarg',
  'inhibid', 'cautelar', 'traicion', 'verguenza', 'indignacion', 'repudi',
  'abandon', 'reclam', 'quej', 'marcha', 'paro', 'conflict', 'amenaz',
  'extorsion', 'sobborn', 'soborn', 'coima', 'nepotism', 'noqui',
  'despilfarr', 'despid', 'recort', 'censur', 'encubrimient', 'complicidad',
  'sobreprecio', 'malversacion', 'peculad', 'allanamient', 'condena',
  'muerte', 'murio', 'femicidi', 'narcotrafic',
];

// Palabras que invierten el signo de lo que viene justo después
// ("no hubo avances", "sin mejoras", "lejos de un acuerdo").
const NEGATORS = ['no', 'nunca', 'jamas', 'sin', 'tampoco', 'ningun', 'ninguna', 'nada'];
const NEGATION_WINDOW = 3;

// Una raiz matchea si la palabra empieza con ella y le sobran como mucho
// MAX_SUFFIX caracteres de flexion. El tope importa: sin el, raices cortas
// se comen palabras sin relacion ("pres" en "presento", "rob" en "roble").
const MAX_SUFFIX = 3;
const MIN_STEM = 4;

function stemHits(words, stems) {
  const hits = [];
  words.forEach((w, i) => {
    const match = stems.some(st =>
      st.length >= MIN_STEM && w.startsWith(st) && w.length - st.length <= MAX_SUFFIX);
    if (match) hits.push(i);
  });
  return hits;
}

function isNegated(words, index) {
  const from = Math.max(0, index - NEGATION_WINDOW);
  return words.slice(from, index).some(w => NEGATORS.includes(w));
}

// Analizador local: cuenta raíces con sentimiento y aplica negación por
// ventana. No es un modelo, pero es determinista, gratis y no depende de que
// un endpoint externo siga vivo.
function localSentiment(text) {
  const words = normalize(text).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return { sentiment: 'NEUTRAL', score: 0 };

  let pos = 0;
  let neg = 0;

  for (const i of stemHits(words, POSITIVE_STEMS)) {
    if (isNegated(words, i)) neg += 1; else pos += 1;
  }
  for (const i of stemHits(words, NEGATIVE_STEMS)) {
    // "no hubo corrupción" no es una buena noticia, pero tampoco es la
    // acusación: se atenúa en vez de invertirse.
    if (isNegated(words, i)) neg += 0.5; else neg += 1;
  }

  const hits = pos + neg;
  if (hits === 0) return { sentiment: 'NEUTRAL', score: 0, hits: 0 };

  const score = (pos - neg) / hits;
  // Banda muerta: una diferencia mínima no alcanza para etiquetar.
  if (Math.abs(score) < 0.2) return { sentiment: 'NEUTRAL', score: Number(score.toFixed(2)), hits };
  if (score > 0) return { sentiment: 'POSITIVE', score: Math.min(score, 1), hits };
  return { sentiment: 'NEGATIVE', score: Math.max(score, -1), hits };
}

// El local acierta solo cuando encontró varias señales que apuntan al mismo
// lado. Con una sola palabra, o con señales contradictorias, conviene gastar
// una llamada al modelo.
function localEsConfiable(r) {
  return r.hits >= 2 && Math.abs(r.score) >= 0.5;
}

module.exports = { analyzeSentiment, localSentiment };
