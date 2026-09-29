const express = require('express');
const { getDb } = require('../lib/firebase');
const { toDocs, serializeDates } = require('../lib/db');
const { authenticate } = require('../middleware/auth');
const { puedeAcceder } = require('../middleware/ownership');
const { leerCampana, analyticsCacheado } = require('../lib/cacheLecturas');

const router = express.Router();
router.use(authenticate);

router.get('/summary', async (req, res) => {
  try {
    const { campaignId, period = '24h' } = req.query;
    const db = getDb();

    const campana = await leerCampana(db, campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    // El resultado es el mismo para cualquiera que mire la misma campaña y
    // periodo, y cada llamada baja el rango entero de menciones. Sin cache,
    // cambiar de pestaña tres veces son miles de lecturas de Firestore.
    const respuesta = await analyticsCacheado(`${campaignId}|summary|${period}`, () => calcularSummary(db, campaignId, period));
    return res.json(respuesta);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener analytics' });
  }
});

async function calcularSummary(db, campaignId, period) {
  const hours = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 }[period] || 24;
  const since = new Date(Date.now() - hours * 3600000);
  const prevSince = new Date(since.getTime() - (Date.now() - since.getTime()));

  // El rango de fechas lo filtra Firestore. Antes se leia la coleccion
  // entera de la campana en cada request para descartar casi todo en JS.
  // El orderBy no es decorativo: sin el, Firestore pide un indice
  // (campaignId, publishedAt ASC) que no existe. Con orderBy desc usa el
  // indice (campaignId, publishedAt DESC) que ya esta desplegado.
  const allSnap = await db.collection('mentions')
    .where('campaignId', '==', campaignId)
    .where('publishedAt', '>=', prevSince)
    .orderBy('publishedAt', 'desc')
    .get();

  const allMentions = toDocs(allSnap).map(serializeDates);
  const current = allMentions.filter(m => new Date(m.publishedAt) >= since);
  const previous = allMentions.filter(m => {
    const d = new Date(m.publishedAt);
    return d >= prevSince && d < since;
  }).length;
  const total = current.length;

  // Group by source
  const bySourceMap = {};
  current.forEach(m => {
    if (!bySourceMap[m.source]) bySourceMap[m.source] = { count: 0, reach: 0 };
    bySourceMap[m.source].count++;
    bySourceMap[m.source].reach += m.reach || 0;
  });
  const bySource = Object.entries(bySourceMap).map(([source, data]) => ({
    source, count: data.count, reach: data.reach,
  }));

  // Group by sentiment
  const bySentimentMap = {};
  current.forEach(m => {
    if (!bySentimentMap[m.sentiment]) bySentimentMap[m.sentiment] = 0;
    bySentimentMap[m.sentiment]++;
  });
  const bySentiment = Object.entries(bySentimentMap).map(([sentiment, count]) => ({
    sentiment, count,
  }));

  // Group by keyword (top 5)
  const byKeywordMap = {};
  current.filter(m => m.keywordId).forEach(m => {
    if (!byKeywordMap[m.keywordId]) byKeywordMap[m.keywordId] = 0;
    byKeywordMap[m.keywordId]++;
  });
  const byKeyword = Object.entries(byKeywordMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([keywordId, count]) => ({ keywordId, _count: count }));

  // Top mentions by reach
  const topMentions = [...current]
    .sort((a, b) => (b.reach || 0) - (a.reach || 0))
    .slice(0, 5);

  // Enrich top mentions with keyword term
  for (const m of topMentions) {
    if (m.keywordId) {
      const kwDoc = await db.collection('keywords').doc(m.keywordId).get();
      if (kwDoc.exists) m.keyword = { term: kwDoc.data().term };
    }
  }

    return {
      period,
      mentions: {
        total,
        delta: previous > 0 ? Math.round(((total - previous) / previous) * 100) : 0,
      },
      reach: bySource.reduce((a, b) => a + b.reach, 0),
      bySource,
      bySentiment,
      byKeyword,
    topMentions,
  };
}

router.get('/timeseries', async (req, res) => {
  try {
    const { campaignId, period = '24h', interval = 'hour' } = req.query;
    const db = getDb();

    const campana = await leerCampana(db, campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    const respuesta = await analyticsCacheado(
      `${campaignId}|timeseries|${period}|${interval}`,
      () => calcularTimeseries(db, campaignId, period, interval),
    );
    return res.json(respuesta);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener serie de tiempo', series: [] });
  }
});

async function calcularTimeseries(db, campaignId, period, interval) {
  // 90d/180d los usa el calendario de actividad del dashboard, que mira
  // las ultimas ~18 semanas.
  const hours = { '1h': 1, '24h': 24, '7d': 168, '30d': 720, '90d': 2160, '180d': 4320 }[period] || 24;
  const since = new Date(Date.now() - hours * 3600000);

  const snap = await db.collection('mentions')
    .where('campaignId', '==', campaignId)
    .where('publishedAt', '>=', since)
    .orderBy('publishedAt', 'desc')
    .get();

  const mentions = toDocs(snap).map(serializeDates)
    .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));

  const buckets = {};
  for (const m of mentions) {
    const d = new Date(m.publishedAt);
    interval === 'day' ? d.setHours(0, 0, 0, 0) : d.setMinutes(0, 0, 0);
    const key = d.toISOString();
    if (!buckets[key]) buckets[key] = { time: key, total: 0, positive: 0, negative: 0, neutral: 0 };
    buckets[key].total++;
    if (m.sentiment === 'POSITIVE') buckets[key].positive++;
    else if (m.sentiment === 'NEGATIVE') buckets[key].negative++;
    else buckets[key].neutral++;
  }

  return { series: Object.values(buckets).sort((a, b) => new Date(a.time) - new Date(b.time)) };
}

module.exports = router;
