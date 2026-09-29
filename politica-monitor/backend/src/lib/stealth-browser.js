const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const PROFILES_DIR = path.join(__dirname, '../../browser-profiles');

// Playwright se carga en demanda: no es dependencia del proyecto (no corre en
// Cloud Functions, donde no hay navegador) y este modulo lo importa
// social-auth.js al arrancar. Un require a nivel de modulo tiraba abajo el
// boot de toda la API. Para usar esto en local: npm i -D playwright.
function loadChromium() {
  try {
    return require('playwright').chromium;
  } catch {
    throw new Error('Playwright no esta instalado — este flujo solo corre en local (npm i -D playwright)');
  }
}

async function launchStealth({ headless = false, profileName = 'default', channel = null } = {}) {
  const chromium = loadChromium();
  const userDataDir = path.join(PROFILES_DIR, profileName);

  // Asegurar que el directorio existe
  fs.mkdirSync(userDataDir, { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    ...(channel ? { channel } : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
    ],
    viewport: { width: 1366, height: 768 },
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    ignoreDefaultArgs: ['--enable-automation'],
  });

  // Inyectar stealth manualmente
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['es-AR', 'es', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    window.chrome = { runtime: {} };
  });

  logger.info(`[StealthBrowser] Lanzado con perfil "${profileName}" (headless: ${headless})`);
  return context;
}

module.exports = { launchStealth, PROFILES_DIR };
