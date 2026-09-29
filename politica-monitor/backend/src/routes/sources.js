const express = require('express');
const { getDb } = require('../lib/firebase');
const { generateId, toDocs, serializeDates } = require('../lib/db');
const { authenticate } = require('../middleware/auth');
const { leerCampana } = require('../lib/cacheLecturas');
const { puedeAcceder } = require('../middleware/ownership');
const { scrapeCustomUrl } = require('../services/customScraper');

const router = express.Router();
router.use(authenticate);

// GET /api/sources?campaignId=
router.get('/', async (req, res) => {
  try {
    const { campaignId } = req.query;
    const db = getDb();

    const campana = await leerCampana(db, campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    const snap = await db.collection('customSources')
      .where('campaignId', '==', campaignId)
      .get();

    const sources = toDocs(snap).map(serializeDates);
    sources.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ sources });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener fuentes' });
  }
});

// POST /api/sources
router.post('/', async (req, res) => {
  try {
    const { campaignId, url, name, type, notes } = req.body;
    if (!campaignId || !url) {
      return res.status(400).json({ error: 'campaignId y url son requeridos' });
    }

    const db = getDb();
    const campana = await leerCampana(db, campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    try { new URL(url); } catch {
      return res.status(400).json({ error: 'URL inválida' });
    }

    const detectedType = type || detectSourceType(url);
    const sourceId = generateId();
    const sourceData = {
      campaignId,
      url: url.trim(),
      name: name || extractDomain(url),
      type: detectedType,
      notes: notes || '',
      isActive: true,
      lastScraped: null,
      createdAt: new Date(),
    };

    await db.collection('customSources').doc(sourceId).set(sourceData);
    res.status(201).json({ source: { id: sourceId, ...sourceData } });
  } catch (err) {
    res.status(500).json({ error: 'Error al agregar fuente' });
  }
});

// PUT /api/sources/:id
router.put('/:id', async (req, res) => {
  try {
    const db = getDb();
    const srcDoc = await db.collection('customSources').doc(req.params.id).get();
    if (!srcDoc.exists) return res.status(404).json({ error: 'Fuente no encontrada' });

    const src = srcDoc.data();
    const campana = await leerCampana(db, src.campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Fuente no encontrada' });
    }

    const updates = {};
    if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
    if (req.body.name) updates.name = req.body.name;
    if (req.body.notes !== undefined) updates.notes = req.body.notes;

    await db.collection('customSources').doc(req.params.id).update(updates);
    const updated = await db.collection('customSources').doc(req.params.id).get();
    res.json({ source: serializeDates({ id: updated.id, ...updated.data() }) });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar fuente' });
  }
});

// DELETE /api/sources/:id
router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const srcDoc = await db.collection('customSources').doc(req.params.id).get();
    if (!srcDoc.exists) return res.status(404).json({ error: 'Fuente no encontrada' });

    const src = srcDoc.data();
    const campana = await leerCampana(db, src.campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Fuente no encontrada' });
    }

    await db.collection('customSources').doc(req.params.id).delete();
    res.json({ message: 'Fuente eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar fuente' });
  }
});

// POST /api/sources/:id/test
router.post('/:id/test', async (req, res) => {
  try {
    const db = getDb();
    const srcDoc = await db.collection('customSources').doc(req.params.id).get();
    if (!srcDoc.exists) return res.status(404).json({ error: 'Fuente no encontrada' });

    const src = srcDoc.data();
    const campana = await leerCampana(db, src.campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Fuente no encontrada' });
    }

    const kwSnap = await db.collection('keywords')
      .where('campaignId', '==', src.campaignId)
      .where('isActive', '==', true)
      .get();
    const keywords = kwSnap.docs.map(d => d.data().term);

    const results = await scrapeCustomUrl(src.url, keywords, src.type);

    res.json({
      url: src.url,
      type: src.type,
      found: results.length,
      preview: results.slice(0, 3),
    });
  } catch (err) {
    res.status(500).json({ error: `Error al testear fuente: ${err.message}` });
  }
});

function detectSourceType(url) {
  const lower = url.toLowerCase();
  if (lower.includes('facebook.com')) return 'FACEBOOK_PAGE';
  if (lower.includes('instagram.com')) return 'INSTAGRAM_PROFILE';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'TWITTER_PROFILE';
  if (lower.includes('youtube.com')) return 'YOUTUBE_CHANNEL';
  if (lower.includes('reddit.com')) return 'REDDIT';
  if (lower.endsWith('.xml') || lower.includes('/feed') || lower.includes('/rss') || lower.includes('atom')) return 'RSS_FEED';
  return 'WEBSITE';
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

module.exports = router;
