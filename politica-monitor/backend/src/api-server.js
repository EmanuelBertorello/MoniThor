require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');

const logger = require('./lib/logger');
const { connectDB } = require('./lib/db');
const { admin, getDb } = require('./lib/firebase');
const { marcarActividad } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const campaignRoutes = require('./routes/campaigns');
const mentionRoutes = require('./routes/mentions');
const keywordRoutes = require('./routes/keywords');
const analyticsRoutes = require('./routes/analytics');
const alertRoutes = require('./routes/alerts');
const reportRoutes = require('./routes/reports');
const sourceRoutes = require('./routes/sources');
const userRoutes = require('./routes/users');
const analyzerRoutes = require('./routes/analyzer');
const socialAuthRoutes = require('./routes/social-auth');
const scraperTestRoutes = require('./routes/scraperTest');

// FRONTEND_URL acepta varios origenes separados por coma: el sitio de Firebase
// responde tanto en muni-8ed74.web.app como en muni-8ed74.firebaseapp.com, y
// con un solo origen permitido el otro dominio quedaba bloqueado por CORS.
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',').map(o => o.trim()).filter(Boolean);

function corsOrigin(origin, callback) {
  // Sin Origin (curl, health checks de Render, server-to-server) se deja pasar.
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
  return callback(new Error(`Origen no permitido: ${origin}`));
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);
global.io = io;

// Cada cuánto el socket vuelve a marcar que la persona sigue online. Tiene que
// ser mayor que el intervalo de marcarActividad (5 min) para que no lo descarte
// el anti-rebote, y bastante menor que PAUSE_AFTER_IDLE_MINUTES (15) para que
// una pestaña abierta nunca se de por ida.
const LATIDO_PRESENCIA_MS = 6 * 60 * 1000;

io.on('connection', async (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  // Presencia real: el job horario solo scrapea campañas de gente online, y
  // "online" no puede depender de que la persona haga clicks — con el panel
  // abierto mirando el dashboard no sale ningún request durante minutos. El
  // socket late mientras la pestaña viva y eso es lo que mantiene activas sus
  // campañas.
  let latido = null;
  try {
    const token = socket.handshake.auth?.token;
    if (token) {
      const decoded = await admin.auth().verifyIdToken(token);
      const db = getDb();
      marcarActividad(db, decoded.uid);
      latido = setInterval(() => marcarActividad(db, decoded.uid), LATIDO_PRESENCIA_MS);
    }
  } catch (err) {
    // Socket sin token o con token vencido: se deja conectar (solo recibe
    // eventos) pero no cuenta como presencia.
    logger.warn(`Socket ${socket.id} sin presencia: ${err.message}`);
  }

  socket.on('join:campaign', (campaignId) => {
    socket.join(`campaign:${campaignId}`);
  });
  socket.on('leave:campaign', (campaignId) => {
    socket.leave(`campaign:${campaignId}`);
  });
  socket.on('disconnect', () => {
    if (latido) clearInterval(latido);
  });
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(morgan('combined', { stream: { write: (msg) => logger.http(msg.trim()) } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'api', timestamp: new Date().toISOString(), version: '2.1.0' });
});

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

// Endpoint interno: los scrapers notifican menciones nuevas → Socket.IO las pushea en tiempo real
app.post('/api/internal/new-mentions', express.json(), (req, res) => {
  const { campaignId, count, mentions } = req.body;
  if (!campaignId) return res.status(400).json({ error: 'campaignId required' });
  io.to(`campaign:${campaignId}`).emit('mentions:new', {
    count: count || mentions?.length || 0,
    mentions: (mentions || []).slice(0, 10),
  });
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await connectDB();
    logger.info('[API] Firestore conectada');
  } catch (err) {
    logger.warn('[API] Firebase no disponible — rutas de DB fallarán:', err.message);
  }

  server.listen(PORT, () => {
    logger.info(`[API] Servidor en http://localhost:${PORT}`);
    logger.info(`[API] Socket.IO listo`);
  });
}

start();

module.exports = { app, io };
