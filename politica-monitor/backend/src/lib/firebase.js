const admin = require('firebase-admin');
const logger = require('./logger');

let db = null;

function initFirebase() {
  if (db) return db;

  try {
    const inCloudFunctions = process.env.FUNCTION_TARGET || process.env.K_SERVICE;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else if (!inCloudFunctions && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    } else {
      // Cloud Functions (Cloud Run): metadata server provides credentials.
      // Local .env may set GOOGLE_APPLICATION_CREDENTIALS to a key file that
      // doesn't exist here — clear it so ADC falls through to the metadata server.
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      admin.initializeApp();
    }

    db = admin.firestore();
    db.settings({ ignoreUndefinedProperties: true });
    logger.info('Firebase Firestore inicializado');
  } catch (err) {
    logger.error(`Error inicializando Firebase: ${err.message}`);
    return null;
  }

  return db;
}

function getDb() {
  if (!db) return initFirebase();
  return db;
}

module.exports = { initFirebase, getDb, admin };
