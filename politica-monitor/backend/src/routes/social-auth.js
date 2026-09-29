const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../lib/firebase');
const { generateId } = require('../lib/db');
const { authenticate } = require('../middleware/auth');
const { launchStealth } = require('../lib/stealth-browser');
const logger = require('../lib/logger');

const router = express.Router();
router.use(authenticate);

// A pesar del nombre, JWT_SECRET no firma ningún JWT: el login va por Firebase
// Auth y el paquete jsonwebtoken ya no se usa. Acá es solo la clave AES con la
// que se cifran las cookies de sesión de Facebook/Instagram en `socialAccounts`.
//
// Antes esto lanzaba al cargar el módulo, así que sin la variable no arrancaba
// NADA de la API — aunque estas rutas no se usen (el scraping va por Apify y el
// flujo de conexión necesita un navegador, que no existe en serverless). Ahora
// el resto de la API levanta igual y el error aparece solo si alguien entra acá.
const ENCRYPT_KEY = process.env.JWT_SECRET
  ? process.env.JWT_SECRET.slice(0, 32).padEnd(32, '0')
  : null;

function requireEncryptKey(res) {
  if (ENCRYPT_KEY) return true;
  logger.warn('[social-auth] Ruta usada sin JWT_SECRET configurado');
  res.status(503).json({
    error: 'Las cuentas sociales necesitan la variable JWT_SECRET configurada en el servidor',
  });
  return false;
}

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPT_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPT_KEY, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// GET /api/social-auth/status
router.get('/status', async (req, res) => {
  if (!requireEncryptKey(res)) return;
  try {
    const db = getDb();
    const snap = await db.collection('socialAccounts')
      .where('userId', '==', req.user.id).get();

    const accounts = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        platform: data.platform,
        email: data.email,
        status: data.status,
        lastLogin: data.lastLogin,
        connectedAt: data.connectedAt,
      };
    });

    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener cuentas' });
  }
});

// Loguea en la plataforma y devuelve las cookies de sesión. Compartido entre
// el connect manual (headless:false, para poder resolver captcha) y el
// auto-reconnect de los workers (headless:true, sin humano presente).
async function loginAndGetCookies({ userId, platform, email, password, headless, maxWaitMs }) {
  const profileName = `${userId}-${platform}`;
  const context = await launchStealth({ headless, profileName });

  try {
    const page = context.pages()[0] || await context.newPage();

    const loginUrl = platform === 'facebook'
      ? 'https://www.facebook.com/login/'
      : 'https://www.instagram.com/accounts/login/';

    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const alreadyLoggedIn = platform === 'facebook'
      ? (currentUrl.includes('facebook.com') && !currentUrl.includes('/login'))
      : (currentUrl.includes('instagram.com') && !currentUrl.includes('/login') && !currentUrl.includes('/accounts/'));

    if (alreadyLoggedIn) {
      logger.info(`[SocialAuth] Ya estaba logueado en ${platform} (perfil persistente)`);
    } else {
      if (platform === 'facebook') {
        const fbEmail = await page.$('input[name="email"], input#email');
        if (fbEmail) { await fbEmail.click(); await page.keyboard.type(email, { delay: 60 }); }
        const fbPass = await page.$('input[name="pass"], input#pass');
        if (fbPass) { await fbPass.click(); await page.keyboard.type(password, { delay: 60 }); }
        await page.keyboard.press('Enter');
      } else {
        try {
          const cookieBtn = await page.$('button:has-text("Allow"), button:has-text("Permitir"), button:has-text("Accept")');
          if (cookieBtn) await cookieBtn.click();
          await page.waitForTimeout(1000);
        } catch {}
        const igUser = await page.$('input[name="email"], input[name="username"], input[autocomplete*="username"]');
        if (igUser) { await igUser.click(); await page.keyboard.type(email, { delay: 60 }); }
        await page.waitForTimeout(300);
        const igPass = await page.$('input[name="password"], input[type="password"]');
        if (igPass) { await igPass.click(); await page.keyboard.type(password, { delay: 60 }); }
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
      }

      logger.info(`[SocialAuth] Credenciales ingresadas para ${platform} (${headless ? 'headless' : 'ventana visible'})...`);
    }

    const successPatterns = platform === 'facebook'
      ? ['facebook.com/home', 'facebook.com/?', 'facebook.com/feed', 'facebook.com/#']
      : ['instagram.com/', 'instagram.com/accounts/onetap'];

    const startTime = Date.now();
    let loggedIn = alreadyLoggedIn;

    while (!loggedIn && (Date.now() - startTime < maxWaitMs)) {
      const url = page.url();

      if (successPatterns.some(p => url.includes(p)) && !url.includes('/login') && !url.includes('/challenge')) {
        loggedIn = true;
        break;
      }

      try {
        const skip = await page.$('button:has-text("Not Now"), button:has-text("Ahora no"), button:has-text("Skip")');
        if (skip) { await skip.click(); await page.waitForTimeout(1000); }
      } catch {}

      await page.waitForTimeout(2000);
    }

    if (!loggedIn) {
      throw new Error(`Timeout: no se completó el login de ${platform} en ${Math.round(maxWaitMs / 1000)}s`);
    }

    logger.info(`[SocialAuth] Login exitoso en ${platform}. Capturando cookies...`);
    const cookies = await context.cookies();
    if (cookies.length === 0) throw new Error('No se pudieron obtener las cookies');
    return cookies;
  } finally {
    // NO cerrar con error de por medio hasta acá arriba — el perfil persistente queda guardado en disco
    await context.close().catch(() => {});
  }
}

function saveAccount(userId, platform, email, password, cookies) {
  const db = getDb();
  const encryptedPassword = encrypt(password);

  const accountData = {
    userId,
    platform,
    email,
    password: encryptedPassword,
    status: 'connected',
    lastLogin: new Date(),
  };

  if (cookies) {
    accountData.cookies = encrypt(JSON.stringify(cookies));
  }

  return db.collection('socialAccounts')
    .where('userId', '==', userId)
    .where('platform', '==', platform)
    .limit(1).get()
    .then(existing => {
      if (existing.empty) {
        accountData.connectedAt = new Date();
        return db.collection('socialAccounts').doc(generateId()).set(accountData);
      }
      return db.collection('socialAccounts').doc(existing.docs[0].id).update(accountData);
    });
}

// POST /api/social-auth/connect
router.post('/connect', async (req, res) => {
  if (!requireEncryptKey(res)) return;
  const { platform, email, password } = req.body;

  if (!platform || !email || !password) {
    return res.status(400).json({ error: 'platform, email y password requeridos' });
  }

  if (!['facebook', 'instagram', 'twitter'].includes(platform)) {
    return res.status(400).json({ error: 'Plataforma debe ser facebook, instagram o twitter' });
  }

  logger.info(`[SocialAuth] Conectando ${platform} para ${req.user.email}`);

  // Twitter/X no se loguea acá con Playwright: las credenciales solo se
  // guardan encriptadas y las consume el actor de Apify (x-scraper) al
  // ejecutar el scraping, que hace su propio login.
  if (platform === 'twitter') {
    try {
      await saveAccount(req.user.id, platform, email, password, null);
      logger.info(`[SocialAuth] Twitter/X guardado (sin verificación local, la usa el actor de Apify)`);
      res.json({ status: 'connected', platform, email });
    } catch (err) {
      logger.error(`[SocialAuth] Error guardando Twitter/X: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
    return;
  }

  try {
    const cookies = await loginAndGetCookies({
      userId: req.user.id, platform, email, password, headless: false, maxWaitMs: 180000,
    });

    await saveAccount(req.user.id, platform, email, password, cookies);

    logger.info(`[SocialAuth] ${platform} conectado (${cookies.length} cookies, perfil persistente guardado)`);
    res.json({ status: 'connected', platform, email, cookiesCount: cookies.length });
  } catch (err) {
    logger.error(`[SocialAuth] Error: ${err.message}`);
    const status = err.message.startsWith('Timeout') ? 408 : 500;
    res.status(status).json({ error: err.message });
  }
});

// DELETE /api/social-auth/:id
router.delete('/:id', async (req, res) => {
  if (!requireEncryptKey(res)) return;
  try {
    const db = getDb();
    const doc = await db.collection('socialAccounts').doc(req.params.id).get();
    if (!doc.exists || doc.data().userId !== req.user.id) {
      return res.status(404).json({ error: 'Cuenta no encontrada' });
    }
    await db.collection('socialAccounts').doc(req.params.id).delete();
    res.json({ message: 'Cuenta desconectada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al desconectar' });
  }
});

async function getSavedCookies(userId, platform) {
  const db = getDb();
  const snap = await db.collection('socialAccounts')
    .where('userId', '==', userId)
    .where('platform', '==', platform)
    .where('status', '==', 'connected')
    .limit(1).get();

  if (snap.empty) return null;

  try {
    const data = snap.docs[0].data();
    return JSON.parse(decrypt(data.cookies));
  } catch {
    return null;
  }
}

// Siempre loguea de cero con el usuario/contraseña que se cargaron al
// conectar la cuenta desde el front (headless, sin usar cookies cacheadas).
// Pensado para correr desatendido en el worker de scraping.
async function ensureCookies(userId, platform) {
  const db = getDb();
  const snap = await db.collection('socialAccounts')
    .where('userId', '==', userId)
    .where('platform', '==', platform)
    .limit(1).get();

  if (snap.empty) return null;

  const accountDoc = snap.docs[0];
  const data = accountDoc.data();

  let email, password;
  try {
    email = data.email;
    password = decrypt(data.password);
  } catch {
    return null;
  }

  logger.info(`[SocialAuth] Logueando en ${platform} con usuario/contraseña guardado...`);
  try {
    const freshCookies = await loginAndGetCookies({
      userId, platform, email, password, headless: true, maxWaitMs: 60000,
    });
    await saveAccount(userId, platform, email, password, freshCookies);
    logger.info(`[SocialAuth] Reconexión automática de ${platform} exitosa`);
    return freshCookies;
  } catch (err) {
    logger.error(`[SocialAuth] Reconexión automática de ${platform} falló: ${err.message}`);
    await accountDoc.ref.update({ status: 'error' }).catch(() => {});
    return null;
  }
}

module.exports = router;
module.exports.getSavedCookies = getSavedCookies;
module.exports.ensureCookies = ensureCookies;
