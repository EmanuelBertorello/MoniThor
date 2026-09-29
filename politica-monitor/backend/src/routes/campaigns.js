const express = require('express');
const { getDb } = require('../lib/firebase');
const { generateId, toDocs, serializeDates } = require('../lib/db');
const { buildDescription, toCampaignView } = require('../lib/campaignGeo');
const { authenticate } = require('../middleware/auth');
const { puedeAcceder, filtrarPorDueno } = require('../middleware/ownership');
const { invalidarCampana } = require('../lib/cacheLecturas');

function canWrite(req, res, next) {
  if (req.user && req.user.role === 'VIEWER') {
    return res.status(403).json({ error: 'Tu rol de Monitor solo permite ver datos.' });
  }
  next();
}

const router = express.Router();
router.use(authenticate);

// GET /api/campaigns
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    // Un ADMIN ve todas las campañas; el resto solo las suyas.
    const snap = await filtrarPorDueno(db.collection('campaigns'), req.user).get();

    const campaigns = [];
    for (const doc of snap.docs) {
      // toCampaignView desempaqueta provincia/ciudad del description, para que
      // el front no tenga que saber que van adentro de un JSON.
      const campaign = toCampaignView(serializeDates({ id: doc.id, ...doc.data() }));

      const kwSnap = await db.collection('keywords')
        .where('campaignId', '==', doc.id)
        .where('isActive', '==', true)
        .get();
      campaign.keywords = toDocs(kwSnap).map(serializeDates);

      const mentionCount = await db.collection('mentions')
        .where('campaignId', '==', doc.id)
        .count().get();
      campaign._count = { mentions: mentionCount.data().count };

      campaigns.push(campaign);
    }

    res.json({ campaigns });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener campañas' });
  }
});

// POST /api/campaigns
router.post('/', canWrite, async (req, res) => {
  try {
    const { name, description, enableWarmup, provincia, ciudad } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

    const db = getDb();
    const campaignId = generateId();
    const now = new Date();

    const doWarmup = enableWarmup === true;
    const warmupUntil = doWarmup ? new Date(now.getTime() + 1 * 60 * 60 * 1000) : null;

    const campaignData = {
      name,
      // La geo va empaquetada acá adentro (ver lib/campaignGeo). Antes el POST
      // la ignoraba y solo el PUT la guardaba, así que toda campaña recién
      // creada arrancaba sin zona y el scraper buscaba a nivel nacional.
      description: buildDescription(null, { description, provincia, ciudad }),
      userId: req.user.id,
      isActive: true,
      status: doWarmup ? 'WARMING_UP' : 'ACTIVE',
      warmupUntil,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection('campaigns').doc(campaignId).set(campaignData);
    invalidarCampana(campaignId);

    const defaultSources = [
      { type: 'WEB', name: 'Sitios Web' },
      { type: 'NEWS', name: 'Google News' },
      { type: 'FACEBOOK', name: 'Facebook Público' },
      { type: 'INSTAGRAM', name: 'Instagram' },
      { type: 'TWITTER', name: 'Twitter/X' },
    ];

    const batch = db.batch();
    for (const s of defaultSources) {
      const ref = db.collection('sources').doc(generateId());
      batch.set(ref, { ...s, campaignId, isActive: true, lastScraped: null, createdAt: now });
    }
    await batch.commit();

    res.status(201).json({ campaign: toCampaignView({ id: campaignId, ...campaignData }) });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear campaña' });
  }
});

// GET /api/campaigns/:id
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection('campaigns').doc(req.params.id).get();
    if (!doc.exists || !puedeAcceder(req.user, doc.data())) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    const campaign = toCampaignView(serializeDates({ id: doc.id, ...doc.data() }));

    const [kwSnap, srcSnap, ruleSnap, mentionCount] = await Promise.all([
      db.collection('keywords').where('campaignId', '==', doc.id).where('isActive', '==', true).get(),
      db.collection('sources').where('campaignId', '==', doc.id).get(),
      db.collection('alertRules').where('campaignId', '==', doc.id).get(),
      db.collection('mentions').where('campaignId', '==', doc.id).count().get(),
    ]);

    campaign.keywords = toDocs(kwSnap).map(serializeDates);
    campaign.sources = toDocs(srcSnap).map(serializeDates);
    campaign.alertRules = toDocs(ruleSnap).map(serializeDates);
    campaign._count = { mentions: mentionCount.data().count };

    res.json({ campaign });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener campaña' });
  }
});

// PUT /api/campaigns/:id
router.put('/:id', canWrite, async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection('campaigns').doc(req.params.id).get();
    if (!doc.exists || !puedeAcceder(req.user, doc.data())) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    const { name, description, isActive, provincia, ciudad } = req.body;
    const updates = { updatedAt: new Date() };

    // Merge, no reemplazo: un update que solo trae `description` conservaba
    // antes el texto pero borraba provincia/ciudad.
    const touchesDescription = description !== undefined
      || provincia !== undefined || ciudad !== undefined;

    if (name) updates.name = name;
    if (touchesDescription) {
      updates.description = buildDescription(doc.data().description, { description, provincia, ciudad });
    }
    if (isActive !== undefined) updates.isActive = isActive;

    await db.collection('campaigns').doc(req.params.id).update(updates);
    // La ficha y los analytics de esta campaña quedaron viejos en el cache.
    invalidarCampana(req.params.id);

    const updated = await db.collection('campaigns').doc(req.params.id).get();
    res.json({ campaign: toCampaignView(serializeDates({ id: updated.id, ...updated.data() })) });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar campaña' });
  }
});

// DELETE /api/campaigns/:id
router.delete('/:id', canWrite, async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection('campaigns').doc(req.params.id).get();
    if (!doc.exists || !puedeAcceder(req.user, doc.data())) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    const id = req.params.id;

    const collections = ['alerts', 'alertRules', 'mentions', 'keywords', 'sources', 'reports', 'customSources'];
    for (const col of collections) {
      let field = 'campaignId';
      if (col === 'alerts') {
        const rulesSnap = await db.collection('alertRules').where('campaignId', '==', id).get();
        const ruleIds = rulesSnap.docs.map(d => d.id);
        if (ruleIds.length > 0) {
          for (const ruleId of ruleIds) {
            const alertsSnap = await db.collection('alerts').where('ruleId', '==', ruleId).get();
            const batch = db.batch();
            alertsSnap.docs.forEach(d => batch.delete(d.ref));
            if (!alertsSnap.empty) await batch.commit();
          }
        }
        continue;
      }

      const snap = await db.collection(col).where(field, '==', id).get();
      if (!snap.empty) {
        const batchSize = 500;
        for (let i = 0; i < snap.docs.length; i += batchSize) {
          const batch = db.batch();
          snap.docs.slice(i, i + batchSize).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
    }

    await db.collection('campaigns').doc(id).delete();
    invalidarCampana(id);
    res.json({ message: 'Campaña eliminada correctamente' });
  } catch (err) {
    console.error('Error eliminando campaña:', err);
    res.status(500).json({ error: 'Error al eliminar campaña: ' + err.message });
  }
});

module.exports = router;
