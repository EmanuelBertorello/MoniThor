const axios = require('axios');
const logger = require('./logger');

const BASE = 'https://api.apify.com/v2';

async function runActor(actorId, input, { timeoutSecs = 120 } = {}) {
  const token = process.env.APIFY_API_KEY;
  if (!token) throw new Error('APIFY_API_KEY no configurado');

  const url = `${BASE}/acts/${actorId}/run-sync-get-dataset-items`;
  try {
    const { data } = await axios.post(url, input, {
      params: { token, timeout: timeoutSecs },
      timeout: (timeoutSecs + 30) * 1000,
    });
    return Array.isArray(data) ? data : [];
  } catch (err) {
    const apiMsg = err.response?.data?.error?.message;
    logger.error(`[Apify] ${actorId}: ${apiMsg || err.message}`);
    return [];
  }
}

module.exports = { runActor };
