require('dotenv').config();
const crypto = require('crypto');
const { initFirebase, getDb } = require('./lib/firebase');
const { generateId } = require('./lib/db');
const { launchStealth } = require('./lib/stealth-browser');
const logger = require('./lib/logger');

const USER_ID = '1f725402-3d73-4c2c-b860-a25b4fbf9186';
const EMAIL = 'carucabrall3@gmail.com';
const PASSWORD = 'totito12A';

const ENCRYPT_KEY = (process.env.JWT_SECRET || 'default-key-change-me').slice(0, 32).padEnd(32, '0');

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPT_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

async function main() {
  initFirebase();
  const db = getDb();

  let context = null;
  try {
    const profileName = `${USER_ID}-facebook`;
    context = await launchStealth({ headless: false, profileName, channel: 'chrome' });
    const page = context.pages()[0] || await context.newPage();

    await page.goto('https://www.facebook.com/login/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    const currentUrl = page.url();
    const alreadyLoggedIn = currentUrl.includes('facebook.com') && !currentUrl.includes('/login');

    if (alreadyLoggedIn) {
      logger.info('[Reconnect FB] Ya estaba logueado (perfil persistente)');
    } else {
      const fbEmail = await page.$('input[name="email"], input#email');
      if (fbEmail) { await fbEmail.click(); await page.keyboard.type(EMAIL, { delay: 60 }); }
      const fbPass = await page.$('input[name="pass"], input#pass');
      if (fbPass) { await fbPass.click(); await page.keyboard.type(PASSWORD, { delay: 60 }); }
      await page.keyboard.press('Enter');
      logger.info('[Reconnect FB] Credenciales ingresadas. Si hay captcha, resolvelo en la ventana de Chromium...');
    }

    const successPatterns = ['facebook.com/home', 'facebook.com/?', 'facebook.com/feed', 'facebook.com/#'];
    const maxWait = 180000;
    const startTime = Date.now();
    let loggedIn = alreadyLoggedIn;

    while (!loggedIn && (Date.now() - startTime < maxWait)) {
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
      console.log('RESULT: TIMEOUT');
      await context.close();
      process.exit(1);
    }

    logger.info('[Reconnect FB] Login exitoso. Capturando cookies...');
    const cookies = await context.cookies();
    await context.close();
    context = null;

    if (cookies.length === 0) {
      console.log('RESULT: NO_COOKIES');
      process.exit(1);
    }

    const encryptedCookies = encrypt(JSON.stringify(cookies));
    const encryptedPassword = encrypt(PASSWORD);

    const existing = await db.collection('socialAccounts')
      .where('userId', '==', USER_ID)
      .where('platform', '==', 'facebook')
      .limit(1).get();

    const accountData = {
      userId: USER_ID,
      platform: 'facebook',
      email: EMAIL,
      password: encryptedPassword,
      cookies: encryptedCookies,
      status: 'connected',
      lastLogin: new Date(),
    };

    if (existing.empty) {
      accountData.connectedAt = new Date();
      await db.collection('socialAccounts').doc(generateId()).set(accountData);
    } else {
      await db.collection('socialAccounts').doc(existing.docs[0].id).update(accountData);
    }

    console.log(`RESULT: OK cookies=${cookies.length}`);
    process.exit(0);
  } catch (err) {
    console.log('RESULT: ERROR', err.message);
    if (context) await context.close().catch(() => {});
    process.exit(1);
  }
}

main();
