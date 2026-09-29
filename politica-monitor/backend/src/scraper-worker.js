// Worker local de desarrollo. En PRODUCCIÓN el scraping lo dispara Cloud
// Scheduler (ver exports.hourlyScrape en functions-entry.js) — este proceso
// existe para probar el mismo job sin deployar, y para backfills manuales.
//
//   npm run start:scraper          → cron horario
//   npm run start:scraper -- --now → una corrida y sale
require('dotenv').config();
const cron = require('node-cron');
const logger = require('./lib/logger');
const { connectDB } = require('./lib/db');
const { runHourlyScrape } = require('./jobs/hourlyScrape');

const RUN_ONCE = process.argv.includes('--now');
const CRON_EXPR = process.env.SCRAPE_CRON || '0 * * * *';

let running = false;

async function tick(label) {
  if (running) {
    logger.warn(`[Worker] ${label}: ya hay una corrida en curso — salteo`);
    return;
  }
  running = true;
  try {
    const summary = await runHourlyScrape();
    logger.info(`[Worker] ${label}: ${summary.totalSaved} menciones nuevas`);
  } catch (err) {
    // runHourlyScrape ya captura lo suyo; esto es la última red para que el
    // proceso no se muera y deje de schedulear.
    logger.error(`[Worker] ${label} error: ${err.message}`);
  } finally {
    running = false;
  }
}

async function start() {
  try {
    await connectDB();
    logger.info('[Worker] Firestore conectada');

    if (RUN_ONCE) {
      await tick('corrida única');
      process.exit(0);
    }

    cron.schedule(CRON_EXPR, () => tick('tick horario'));
    logger.info(`[Worker] Scheduler activo — cron "${CRON_EXPR}"`);

    // Primera corrida a los 10s de arrancar, para no esperar a la hora en punto.
    setTimeout(() => tick('corrida inicial'), 10000);
  } catch (err) {
    logger.error(`[Worker] Error al iniciar: ${err.message}`);
    process.exit(1);
  }
}

start();
