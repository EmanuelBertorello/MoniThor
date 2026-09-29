// Use production env when running in Cloud Functions (K_SERVICE is set by Cloud Run)
require('dotenv').config({ path: process.env.K_SERVICE ? '.env.production' : '.env' });
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const logger = require('./src/lib/logger');
const { connectDB } = require('./src/lib/db');

const authRoutes = require('./src/routes/auth');
const campaignRoutes = require('./src/routes/campaigns');
const mentionRoutes = require('./src/routes/mentions');
const keywordRoutes = require('./src/routes/keywords');
const analyticsRoutes = require('./src/routes/analytics');
const alertRoutes = require('./src/routes/alerts');
const reportRoutes = require('./src/routes/reports');
const sourceRoutes = require('./src/routes/sources');
const userRoutes = require('./src/routes/users');
const analyzerRoutes = require('./src/routes/analyzer');
const socialAuthRoutes = require('./src/routes/social-auth');
const scraperTestRoutes = require('./src/routes/scraperTest');

const app = express();

// io stub — scrapers can't push real-time in Cloud Functions
app.set('io', { to: () => ({ emit: () => {} }) });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('combined', { stream: { write: (msg) => logger.http(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api-cf', timestamp: new Date().toISOString(), version: '2.1.0' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'api-cf', timestamp: new Date().toISOString(), version: '2.1.0' }));

app.use('/api/auth', authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/mentions', mentionRoutes);
app.use('/api/keywords', keywordRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sources', sourceRoutes);
app.use('/api/users', userRoutes);
app.use('/api/analyzer', analyzerRoutes);
app.use('/api/social-auth', socialAuthRoutes);
app.use('/api/scraper-test', scraperTestRoutes);

app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

connectDB().catch(err => logger.warn('Firebase init:', err.message));

// Corrida horaria de scraping. Antes esto vivía en src/scraper-worker.js con
// node-cron, que nunca se deployó: Cloud Functions no corre procesos
// persistentes, así que en producción no se ejecutaba nada. Ahora lo dispara
// Cloud Scheduler.
exports.hourlyScrape = onSchedule({
  schedule: 'every 60 minutes',
  timeZone: 'America/Argentina/Buenos_Aires',
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '512MiB',
  retryCount: 0, // reintentar duplicaría el gasto de Apify; la próxima hora reintenta sola
}, async () => {
  const { runHourlyScrape } = require('./src/jobs/hourlyScrape');
  const summary = await runHourlyScrape();
  logger.info(`[Scheduler] ${summary.totalSaved} menciones nuevas`);
});

// Limpieza diaria: menciones de más de 90 días.
exports.dailyCleanup = onSchedule({
  schedule: '0 3 * * *',
  timeZone: 'America/Argentina/Buenos_Aires',
  region: 'us-central1',
  timeoutSeconds: 300,
}, async () => {
  const { getDb } = require('./src/lib/firebase');
  const db = getDb();
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  let removed = 0;
  // De a 500 por vuelta: un solo batch no alcanza si se acumuló backlog.
  for (let pass = 0; pass < 10; pass++) {
    const snap = await db.collection('mentions').where('createdAt', '<', cutoff).limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < 500) break;
  }
  if (removed) logger.info(`[Cleanup] ${removed} menciones viejas eliminadas`);
});

exports.api = onRequest({
  region: 'us-central1',
  // El botón de prueba corre varias keywords x FB/IG contra Apify en un solo
  // request y puede tardar varios minutos — 60s por defecto lo cortaba a mitad.
  timeoutSeconds: 540,
  memory: '512MiB',
}, app);
