const express = require('express');
const { getDb } = require('../lib/firebase');
const { generateId, toDocs, serializeDates } = require('../lib/db');
const { authenticate } = require('../middleware/auth');
const { leerCampana } = require('../lib/cacheLecturas');
const { puedeAcceder } = require('../middleware/ownership');

function canWrite(req, res, next) {
  if (req.user && req.user.role === 'VIEWER') {
    return res.status(403).json({ error: 'Tu rol de Monitor solo permite ver datos.' });
  }
  next();
}

const router = express.Router();
router.use(authenticate);

// GET /api/keywords?campaignId=xxx
router.get('/', async (req, res) => {
  try {
    const { campaignId } = req.query;
    if (!campaignId) return res.status(400).json({ error: 'campaignId requerido' });

    const db = getDb();
    const campana = await leerCampana(db, campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    // Por defecto solo las activas (es lo que consume el resto del sistema),
    // pero el panel de keywords necesita ver las desactivadas para poder
    // reactivarlas: filtradas siempre, quedaban invisibles para siempre.
    const includeInactive = req.query.includeInactive === 'true';
    let query = db.collection('keywords').where('campaignId', '==', campaignId);
    if (!includeInactive) query = query.where('isActive', '==', true);
    const kwSnap = await query.get();

    const keywords = [];
    const sortedDocs = [...kwSnap.docs].sort((a, b) => {
      const aTime = a.data().createdAt?.toDate?.() || new Date(a.data().createdAt || 0);
      const bTime = b.data().createdAt?.toDate?.() || new Date(b.data().createdAt || 0);
      return aTime - bTime;
    });
    for (const doc of sortedDocs) {
      const kw = serializeDates({ id: doc.id, ...doc.data() });
      const mentionCount = await db.collection('mentions')
        .where('keywordId', '==', doc.id)
        .count().get();
      kw._count = { mentions: mentionCount.data().count };
      keywords.push(kw);
    }

    res.json({ keywords });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener keywords' });
  }
});

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map(t => t.trim()).filter(Boolean);
  return [];
}

// POST /api/keywords
router.post('/', canWrite, async (req, res) => {
  try {
    const { term, campaignId, color, tags } = req.body;
    if (!term || !campaignId) {
      return res.status(400).json({ error: 'term y campaignId son requeridos' });
    }

    const db = getDb();
    const campana = await leerCampana(db, campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    // Check if keyword already exists (upsert behavior)
    const existing = await db.collection('keywords')
      .where('term', '==', term)
      .where('campaignId', '==', campaignId)
      .limit(1).get();

    let keywordId;
    const kwColor = color || '#3b82f6';
    const kwTags = normalizeTags(tags);

    if (!existing.empty) {
      keywordId = existing.docs[0].id;
      await db.collection('keywords').doc(keywordId).update({
        isActive: true,
        color: kwColor,
        ...(tags !== undefined && { tags: kwTags }),
      });
    } else {
      keywordId = generateId();
      await db.collection('keywords').doc(keywordId).set({
        term,
        campaignId,
        color: kwColor,
        tags: kwTags,
        isActive: true,
        createdAt: new Date(),
      });
    }

    const kwDoc = await db.collection('keywords').doc(keywordId).get();
    res.status(201).json({ keyword: serializeDates({ id: kwDoc.id, ...kwDoc.data() }) });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear keyword' });
  }
});

// PUT /api/keywords/:id
router.put('/:id', canWrite, async (req, res) => {
  try {
    const { color, tags, term, isActive } = req.body;
    const db = getDb();
    const kwDoc = await db.collection('keywords').doc(req.params.id).get();
    if (!kwDoc.exists) return res.status(404).json({ error: 'Keyword no encontrada' });

    const kw = kwDoc.data();
    const campana = await leerCampana(db, kw.campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Keyword no encontrada' });
    }

    const updates = {};
    if (color !== undefined) updates.color = color;
    if (tags !== undefined) updates.tags = normalizeTags(tags);
    if (term !== undefined && String(term).trim()) updates.term = String(term).trim();
    if (isActive !== undefined) updates.isActive = !!isActive;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Nada para actualizar' });
    }
    await db.collection('keywords').doc(req.params.id).update(updates);

    const updated = await db.collection('keywords').doc(req.params.id).get();
    res.json({ keyword: serializeDates({ id: updated.id, ...updated.data() }) });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar keyword' });
  }
});

// DELETE /api/keywords/:id
router.delete('/:id', canWrite, async (req, res) => {
  try {
    const db = getDb();
    const kwDoc = await db.collection('keywords').doc(req.params.id).get();
    if (!kwDoc.exists) return res.status(404).json({ error: 'Keyword no encontrada' });

    const kw = kwDoc.data();
    const campana = await leerCampana(db, kw.campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Keyword no encontrada' });
    }

    await db.collection('keywords').doc(req.params.id).update({ isActive: false });
    res.json({ message: 'Keyword eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar keyword' });
  }
});

module.exports = router;
