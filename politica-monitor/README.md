# 📡 PoliticaMonitor

Sistema de monitoreo político en tiempo real — trackea menciones de campañas/candidatos en Facebook, Instagram, y sitios de noticias/RSS.

---

## 🗂️ Stack real

- **Backend**: Node.js + Express + Socket.IO. Deploy dual:
  - `src/api-server.js` — server standalone (dev local, puerto `PORT` env, default 4000), con Socket.IO para tiempo real.
  - `functions-entry.js` — mismas rutas empaquetadas como Firebase Cloud Function (`onRequest`, región `us-central1`), sin Socket.IO (stub no-op, Cloud Functions no soporta conexiones persistentes).
- **Base de datos**: Firestore (Firebase), no PostgreSQL/Prisma. Helpers en `src/lib/firebase.js` (init) y `src/lib/db.js` (utils).
- **Scraping**:
  - Web/RSS/Google News (`src/services/scraperService.js`, Cheerio + rss-parser) — gratis, corre siempre cada 3-10min vía `node-cron` en `src/scraper-worker.js`.
  - Facebook + Instagram vía **Apify** (actors `scraper_one/facebook-posts-search` + `facebook-comments-scraper`, `apify/instagram-api-scraper`) — corre cada 1h dentro de una ventana horaria configurable (`ACTIVE_HOUR_START`/`ACTIVE_HOUR_END` en `scraper-worker.js`), con guard de presupuesto mensual (`src/lib/apifyBudget.js`) y kill switch (`APIFY_SCRAPING_ENABLED` env var).
  - Twitter/X y YouTube: **no implementado** — tipos de fuente deshabilitados en el frontend (`sources.js`).
- **Sentiment**: `src/services/sentimentService.js` (OpenAI + fallback por keywords).
- **Frontend**: Next.js 14, export estático (`frontend/out/`), Firebase client SDK para auth, `recharts`/`xlsx`/`jspdf` para reportes.

No hay Docker, Redis, Bull ni PostgreSQL en el stack actual — ese setup quedó obsoleto en la migración a Firebase/Apify.

---

## 🚀 Correr en local

```bash
# Backend
cd backend
cp .env.example .env   # completar JWT_SECRET, APIFY_API_KEY, credenciales Firebase
npm install
npm run dev            # api-server.js, puerto 4000
npm run dev:scraper     # scraper-worker.js, proceso aparte (cron de scraping)

# Frontend
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

**Login demo:** `demo@politicamonitor.com` / `demo1234` (creado con `npm run seed` en backend).

---

## 🗂️ Estructura del proyecto

```
politica-monitor/
├── backend/
│   ├── functions-entry.js       # Entry point Firebase Cloud Function
│   └── src/
│       ├── api-server.js        # Entry point server standalone + Socket.IO
│       ├── scraper-worker.js    # Proceso cron: web/RSS + Facebook/Instagram (Apify)
│       ├── routes/              # auth, campaigns, mentions, keywords, analytics,
│       │                        # alerts, reports, sources, users, analyzer,
│       │                        # social-auth, scraper-test
│       ├── scrapers/
│       │   ├── orchestrator.js          # Orquesta runFacebookScrape/runInstagramScrape
│       │   ├── apifyFacebookScraper.js  # Actor Apify Facebook
│       │   ├── apifyInstagramScraper.js # Actor Apify Instagram
│       │   └── base.js                  # Filtros/dedup compartidos
│       ├── services/
│       │   ├── scraperService.js    # Web/RSS/Google News (gratis)
│       │   ├── sentimentService.js  # OpenAI + fallback keywords
│       │   └── notificationService.js
│       ├── lib/
│       │   ├── firebase.js    # Init Firestore
│       │   ├── db.js          # Helpers Firestore
│       │   ├── apifyClient.js # Wrapper llamadas Apify
│       │   └── apifyBudget.js # Guard de gasto mensual
│       └── middleware/auth.js
└── frontend/                  # Next.js 14
    └── src/
        ├── pages/
        │   ├── index.js       # Redirect según sesión
        │   ├── login.js       # Auth Firebase
        │   ├── landing.js     # Marketing/pricing
        │   ├── dashboard.js   # Dashboard tiempo real
        │   ├── reports.js     # Reportes + export XLSX/PDF
        │   ├── sources.js     # Gestión de fuentes (Facebook/IG/web/RSS/Reddit)
        │   ├── users.js       # Admin usuarios/roles/planes
        │   └── analyzer.js    # Analizador de URL puntual
        ├── hooks/useSocket.js
        └── lib/{api,auth}.js
```

---

## ⚙️ Variables de entorno clave (`backend/.env`)

| Variable | Descripción | Obligatorio |
|----------|-------------|-------------|
| `JWT_SECRET` | Clave para JWT + encriptar cookies de sesión FB/IG guardadas. La app **no arranca** sin esto seteado. | ✅ |
| Credenciales Firebase (service account) | Acceso a Firestore | ✅ |
| `APIFY_API_KEY` | Scraping Facebook/Instagram | ✅ para scraping social |
| `APIFY_SCRAPING_ENABLED` | Kill switch — `true`/`false`, corta todo scraping Apify sin tocar cron | ✅ |
| `APIFY_MONTHLY_BUDGET_USD` | Tope de gasto mensual Apify — se corta el scraping si se supera | Recomendado |
| `OPENAI_API_KEY` | Análisis de sentimiento por IA | Opcional (fallback por keywords si falta) |
| `SMTP_HOST/USER/PASS` | Alertas por email | Opcional |

---

## 🔌 APIs y fuentes de datos

| Fuente | Método | Costo |
|--------|--------|-------|
| Google News / RSS | Scraping directo | Gratis |
| Facebook | Apify (`scraper_one/facebook-posts-search` + `facebook-comments-scraper`) | Pay-as-you-go, con tope mensual configurable |
| Instagram | Apify (`apify/instagram-api-scraper`) | Pay-as-you-go, con tope mensual configurable |
| Análisis sentimiento | OpenAI GPT-4o-mini (fallback: keywords) | ~$0.002/análisis |
| Alertas email | SMTP propio | Gratis |

Twitter/X y YouTube no están integrados actualmente (scrapers removidos en la migración a Apify).

---

## 📡 Endpoints principales

```
POST   /api/auth/login
GET    /api/auth/me

GET    /api/campaigns
POST   /api/campaigns

GET    /api/keywords?campaignId=
POST   /api/keywords

GET    /api/mentions?campaignId=&source=&sentiment=&page=&limit=

GET    /api/analytics/summary?campaignId=&period=24h

GET    /api/alerts?campaignId=
POST   /api/alerts/rules

POST   /api/reports/generate
GET    /api/reports?campaignId=

GET    /api/sources?campaignId=
POST   /api/sources

POST   /api/scraper-test/run     # Trigger manual de scraping (test button UI)
GET    /api/scraper-test/status
```

### WebSocket (solo en `api-server.js`, no disponible vía Cloud Function)

```javascript
socket.emit('join:campaign', campaignId)
socket.on('mentions:new', { count, mentions })
socket.on('alert', { type, rule, message, campaignId })
```

---

## 🔐 Seguridad

1. `JWT_SECRET` debe ser una clave aleatoria larga (`openssl rand -hex 32`) — sin esta variable la app no arranca.
2. Cookies de sesión de Facebook/Instagram se guardan encriptadas (AES-256-CBC) en Firestore, nunca en texto plano.
3. Rate limiting vía `express-rate-limit` en rutas sensibles.
4. Revisar `APIFY_SCRAPING_ENABLED` y `APIFY_MONTHLY_BUDGET_USD` antes de activar scraping social en un ambiente nuevo — evita sorpresas de gasto.
