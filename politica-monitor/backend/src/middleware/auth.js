const { admin, getDb } = require('../lib/firebase');
const { toDoc, serializeDates } = require('../lib/db');
const { usuarios: cacheUsuarios, esFalloTransitorio } = require('../lib/cacheLecturas');
const logger = require('../lib/logger');

// Cada request autenticado actualiza `lastSeenAt`, pero no en todas: escribir
// en Firestore una vez por request sería un costo absurdo (el dashboard hace
// varias llamadas por pantalla). Con recordar el último guardado en memoria y
// espaciarlo alcanza: el job horario solo necesita saber si la persona entró
// en las últimas horas, no el segundo exacto.
const INTERVALO_ACTIVIDAD_MS = 5 * 60 * 1000;
const ultimoGuardado = new Map();

function marcarActividad(db, uid) {
  const ahora = Date.now();
  const previo = ultimoGuardado.get(uid) ?? 0;
  if (ahora - previo < INTERVALO_ACTIVIDAD_MS) return;
  ultimoGuardado.set(uid, ahora);

  // Sin await: es telemetría, no puede demorar la respuesta ni hacerla fallar.
  db.collection('users').doc(uid)
    .update({ lastSeenAt: new Date() })
    .catch(() => {});
}

// Trae el perfil de Firestore pasando por cache (ver lib/cacheLecturas).
// Devuelve { user } o, si Firestore no contesta y no hay nada cacheado,
// { errorDb } — que NO es lo mismo que un token inválido.
async function perfilDelUsuario(db, uid) {
  const enCache = cacheUsuarios.get(uid);
  if (enCache !== undefined) return { user: enCache };

  try {
    const snap = await db.collection('users').doc(uid).get();
    return { user: cacheUsuarios.set(uid, toDoc(snap)) };
  } catch (err) {
    if (esFalloTransitorio(err)) {
      const vencido = cacheUsuarios.getVencido(uid);
      if (vencido !== undefined) return { user: vencido };
    }
    return { errorDb: err };
  }
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  // El token se valida aparte del resto: antes todo estaba en un solo try, asi
  // que cualquier error de Firestore (cuota agotada, red caida) salia como
  // "Token invalido o expirado" 401 y mandaba a buscar el bug al lado
  // equivocado — el login funcionaba y cualquier accion daba 401.
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(header.split(' ')[1]);
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  try {
    const db = getDb();
    const { user, errorDb } = await perfilDelUsuario(db, decoded.uid);

    if (errorDb) {
      logger.error(`[Auth] Firestore no responde (${errorDb.code}): ${errorDb.details || errorDb.message}`);
      return res.status(503).json({
        error: 'La base de datos no está disponible en este momento. Probá de nuevo en unos minutos.',
        code: 'DB_UNAVAILABLE',
      });
    }

    // 401 a proposito: el front lo usa para mandar al login. Una cuenta
    // desactivada o sin perfil no tiene que seguir navegando.
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Usuario no autorizado' });
    }

    if (user.demoExpiresAt && new Date() > new Date(user.demoExpiresAt)) {
      return res.status(401).json({
        error: 'Tu sesión demo ha expirado. Contactá al administrador.',
        code: 'DEMO_EXPIRED',
      });
    }

    // Marca de actividad: la usa el job horario para no gastar Apify en
    // campañas de gente que no está entrando al sistema.
    marcarActividad(db, decoded.uid);

    const { password, ...userSafe } = serializeDates(user);
    req.user = userSafe;
    next();
  } catch (err) {
    logger.error(`[Auth] Error inesperado: ${err.message}`);
    return res.status(500).json({ error: 'Error al autenticar' });
  }
}

async function verifyFirebaseToken(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const token = header.split(' ')[1];
    req.firebaseUser = await admin.auth().verifyIdToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Sin permisos suficientes para esta acción' });
    }
    next();
  };
}

function canWrite(req, res, next) {
  if (req.user.role === 'VIEWER') {
    return res.status(403).json({
      error: 'Tu rol de Monitor solo permite ver datos y descargar reportes.',
      code: 'READ_ONLY',
    });
  }
  next();
}

module.exports = { authenticate, verifyFirebaseToken, authorize, canWrite, marcarActividad };
