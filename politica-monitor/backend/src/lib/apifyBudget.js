const axios = require('axios');
const logger = require('./logger');

const CACHE_MS = 5 * 60 * 1000;
let cache = { checkedAt: 0, usageUsd: 0 };

// Costo promedio por resultado de los actores que usamos (posts de búsqueda
// FB/IG). Es una estimación: sirve para repartir el presupuesto entre las
// corridas del mes, no para facturar. El tope real lo pone `withinBudget`
// leyendo el uso verdadero de la API de Apify.
const USD_PER_RESULT = Number(process.env.APIFY_USD_PER_RESULT || 0.003);

// Cuánta plata del mes se reserva como colchón (no se reparte entre corridas),
// para que un pico de precio no cruce el tope duro.
const RESERVE_RATIO = 0.1;

function monthlyCapUsd() {
  return Number(process.env.APIFY_MONTHLY_BUDGET_USD || 15);
}

async function getMonthlyUsageUsd() {
  const now = Date.now();
  if (now - cache.checkedAt < CACHE_MS) return cache.usageUsd;

  const token = process.env.APIFY_API_KEY;
  const { data } = await axios.get('https://api.apify.com/v2/users/me/usage/monthly', {
    params: { token },
    timeout: 15000,
  });
  const usageUsd = data.data.totalUsageCreditsUsdAfterVolumeDiscount || 0;
  cache = { checkedAt: now, usageUsd };
  return usageUsd;
}

async function withinBudget(label = '') {
  const cap = monthlyCapUsd();
  try {
    const usage = await getMonthlyUsageUsd();
    if (usage >= cap) {
      logger.warn(`[ApifyBudget] Uso mensual $${usage.toFixed(2)} >= tope $${cap} — ${label} scraping pausado hasta el próximo ciclo`);
      return false;
    }
    return true;
  } catch (err) {
    logger.error(`[ApifyBudget] No se pudo chequear uso mensual: ${err.message}`);
    // Falla del chequeo != falta de presupuesto. Dejamos pasar, porque el
    // tope duro de la cuenta de Apify sigue vigente del otro lado.
    return true;
  }
}

function hoursLeftInMonth(now = new Date()) {
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max((endOfMonth - now) / 3600000, 1);
}

// Cuántos resultados pagos se pueden pedir en ESTA corrida sin arruinar el
// resto del mes: reparte lo que queda del presupuesto entre las corridas que
// faltan (una por hora). Se autocorrige solo — si un día no se gasta, las
// corridas siguientes tienen más margen.
async function resultsAllowanceForRun({ runsPerDay = 24, label = '' } = {}) {
  const cap = monthlyCapUsd();
  let usage;
  try {
    usage = await getMonthlyUsageUsd();
  } catch (err) {
    logger.warn(`[ApifyBudget] Sin lectura de uso (${err.message}) — uso cupo conservador`);
    usage = cap * 0.5;
  }

  const remaining = Math.max(cap * (1 - RESERVE_RATIO) - usage, 0);
  if (remaining <= 0) {
    logger.warn(`[ApifyBudget] Sin presupuesto restante este mes (uso $${usage.toFixed(2)} / tope $${cap}) — ${label} omitido`);
    return 0;
  }

  const runsLeft = Math.max(Math.ceil(hoursLeftInMonth() * (runsPerDay / 24)), 1);
  const usdPerRun = remaining / runsLeft;
  const allowance = Math.floor(usdPerRun / USD_PER_RESULT);

  logger.info(`[ApifyBudget] ${label}: quedan $${remaining.toFixed(2)} / ${runsLeft} corridas → $${usdPerRun.toFixed(4)} = ${allowance} resultados`);
  return allowance;
}

module.exports = { withinBudget, getMonthlyUsageUsd, resultsAllowanceForRun, monthlyCapUsd, USD_PER_RESULT };
