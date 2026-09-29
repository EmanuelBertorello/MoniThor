const express = require('express');
const { getDb } = require('../lib/firebase');
const { toDocs, serializeDates } = require('../lib/db');
const { authenticate } = require('../middleware/auth');
const { leerCampana } = require('../lib/cacheLecturas');
const { puedeAcceder } = require('../middleware/ownership');

const router = express.Router();
router.use(authenticate);

router.post('/generate', async (req, res) => {
  try {
    const { campaignId, period = '24h', type = 'FULL', source, sentiment } = req.body;
    const db = getDb();

    const campana = await leerCampana(db, campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }
    const campaign = campana;

    const hours = { '1h': 1, '24h': 24, '7d': 168, '30d': 720, '90d': 2160 }[period] || 24;
    const since = new Date(Date.now() - hours * 3600000);
    const prevSince = new Date(since.getTime() - (Date.now() - since.getTime()));

    // Fetch all mentions for campaign, filter in JS
    const allSnap = await db.collection('mentions')
      .where('campaignId', '==', campaignId).get();
    const allRaw = toDocs(allSnap).map(serializeDates);

    let allMentions = allRaw.filter(m => new Date(m.publishedAt) >= since);
    if (source && source !== 'ALL') allMentions = allMentions.filter(m => m.source === source);
    if (sentiment && sentiment !== 'ALL') allMentions = allMentions.filter(m => m.sentiment === sentiment);
    const total = allMentions.length;

    let prevMentions = allRaw.filter(m => {
      const d = new Date(m.publishedAt);
      return d >= prevSince && d < since;
    });
    if (source && source !== 'ALL') prevMentions = prevMentions.filter(m => m.source === source);
    if (sentiment && sentiment !== 'ALL') prevMentions = prevMentions.filter(m => m.sentiment === sentiment);
    const prevTotal = prevMentions.length;

    // Group by sentiment
    const sentMap = {};
    allMentions.forEach(m => {
      if (!sentMap[m.sentiment]) sentMap[m.sentiment] = { count: 0, reach: 0 };
      sentMap[m.sentiment].count++;
      sentMap[m.sentiment].reach += m.reach || 0;
    });

    // Group by source
    const srcMap = {};
    allMentions.forEach(m => {
      if (!srcMap[m.source]) srcMap[m.source] = { count: 0, reach: 0, engagement: 0 };
      srcMap[m.source].count++;
      srcMap[m.source].reach += m.reach || 0;
      srcMap[m.source].engagement += m.engagement || 0;
    });
    const bySource = Object.entries(srcMap)
      .map(([s, d]) => ({ source: s, count: d.count, reach: d.reach, engagement: d.engagement, pct: Math.round((d.count / (total || 1)) * 100) }))
      .sort((a, b) => b.count - a.count);

    const pos = sentMap.POSITIVE?.count || 0;
    const neg = sentMap.NEGATIVE?.count || 0;
    const neu = sentMap.NEUTRAL?.count || 0;

    // Keywords
    const kwSnap = await db.collection('keywords')
      .where('campaignId', '==', campaignId)
      .where('isActive', '==', true)
      .get();
    const kwSortedDocs = [...kwSnap.docs].sort((a, b) => {
      const aTime = a.data().createdAt?.toDate?.() || new Date(a.data().createdAt || 0);
      const bTime = b.data().createdAt?.toDate?.() || new Date(b.data().createdAt || 0);
      return aTime - bTime;
    });
    const keywords = [];
    for (const doc of kwSortedDocs) {
      const kw = doc.data();
      const kwMentionCount = allMentions.filter(m => m.keywordId === doc.id).length;
      keywords.push({
        term: kw.term, color: kw.color, mentions: kwMentionCount,
        pct: Math.round((kwMentionCount / (total || 1)) * 100),
      });
    }

    // Top mentions, negative mentions
    const topMentions = [...allMentions].sort((a, b) => (b.reach || 0) - (a.reach || 0)).slice(0, 20);
    const negativeMentions = allMentions.filter(m => m.sentiment === 'NEGATIVE')
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, 20);

    // Enrich with keyword terms
    const kwMap = {};
    kwSnap.docs.forEach(d => { kwMap[d.id] = { term: d.data().term }; });
    topMentions.forEach(m => { if (m.keywordId && kwMap[m.keywordId]) m.keyword = kwMap[m.keywordId]; });
    negativeMentions.forEach(m => { if (m.keywordId && kwMap[m.keywordId]) m.keyword = kwMap[m.keywordId]; });

    // Negative word cloud
    const negWords = {};
    negativeMentions.forEach(m => {
      (m.content || '').toLowerCase().split(/\s+/).forEach(w => { if (w.length > 4) negWords[w] = (negWords[w] || 0) + 1; });
    });

    // Hourly volume
    const hourBuckets = {};
    allMentions.forEach(m => {
      const d = new Date(m.publishedAt); d.setMinutes(0, 0, 0);
      const k = d.toISOString();
      if (!hourBuckets[k]) hourBuckets[k] = { hour: k, total: 0, positive: 0, negative: 0, neutral: 0 };
      hourBuckets[k].total++;
      if (m.sentiment === 'POSITIVE') hourBuckets[k].positive++;
      else if (m.sentiment === 'NEGATIVE') hourBuckets[k].negative++;
      else hourBuckets[k].neutral++;
    });

    const reportData = {
      meta: { campaign: campaign.name, campaignId, period, generatedAt: new Date().toISOString(), filters: { source: source || 'ALL', sentiment: sentiment || 'ALL' }, analyst: req.user.name },
      summary: { total, prevTotal, delta: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0, totalReach: bySource.reduce((a, b) => a + b.reach, 0), totalEngagement: bySource.reduce((a, b) => a + b.engagement, 0) },
      sentiment: {
        positive: { count: pos, pct: Math.round((pos / (pos + neg + neu || 1)) * 100), reach: sentMap.POSITIVE?.reach || 0 },
        negative: { count: neg, pct: Math.round((neg / (pos + neg + neu || 1)) * 100), reach: sentMap.NEGATIVE?.reach || 0 },
        neutral: { count: neu, pct: Math.round((neu / (pos + neg + neu || 1)) * 100), reach: sentMap.NEUTRAL?.reach || 0 },
      },
      bySource,
      keywords,
      topMentions, negativeMentions, allMentions,
      hourlyVolume: Object.values(hourBuckets).sort((a, b) => new Date(a.hour) - new Date(b.hour)),
      topNegWords: Object.entries(negWords).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count })),
    };

    res.json({ data: reportData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al generar reporte: ' + err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { campaignId } = req.query;
    const db = getDb();

    const campana = await leerCampana(db, campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    const snap = await db.collection('reports')
      .where('campaignId', '==', campaignId)
      .get();

    const reports = snap.docs.map(d => {
      const data = d.data();
      return serializeDates({ id: d.id, type: data.type, period: data.period, createdAt: data.createdAt });
    });
    reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ reports: reports.slice(0, 30) });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection('reports').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Reporte no encontrado' });

    const report = serializeDates({ id: doc.id, ...doc.data() });
    const campana = await leerCampana(db, report.campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }

    report.campaign = serializeDates(campana);
    res.json({ report });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reporte' });
  }
});

module.exports = router;
