const express = require('express');
const { getDb } = require('../lib/firebase');
const { generateId, toDocs, serializeDates } = require('../lib/db');
const { authenticate } = require('../middleware/auth');
const { leerCampana } = require('../lib/cacheLecturas');
const { puedeAcceder } = require('../middleware/ownership');

const router = express.Router();
router.use(authenticate);

// GET /api/alerts?campaignId=
router.get('/', async (req, res) => {
  try {
    const { campaignId } = req.query;
    const db = getDb();

    const campana = await leerCampana(db, campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    const rulesSnap = await db.collection('alertRules')
      .where('campaignId', '==', campaignId).get();

    const rules = [];
    for (const doc of rulesSnap.docs) {
      const rule = serializeDates({ id: doc.id, ...doc.data() });
      const alertsSnap = await db.collection('alerts')
        .where('ruleId', '==', doc.id)
        .get();
      rule.alerts = toDocs(alertsSnap).map(serializeDates)
        .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
        .slice(0, 5);
      rules.push(rule);
    }

    const recentSnap = await db.collection('alerts')
      .where('userId', '==', req.user.id)
      .where('isRead', '==', false)
      .get();

    const recentAlerts = [];
    for (const doc of recentSnap.docs) {
      const alert = serializeDates({ id: doc.id, ...doc.data() });
      const ruleDoc = await db.collection('alertRules').doc(alert.ruleId).get();
      if (ruleDoc.exists) {
        const ruleData = serializeDates({ id: ruleDoc.id, ...ruleDoc.data() });
        const campData = await leerCampana(db, ruleData.campaignId);
        ruleData.campaign = campData ? serializeDates(campData) : null;
        alert.rule = ruleData;
      }
      recentAlerts.push(alert);
    }

    recentAlerts.sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
    res.json({ rules, recentAlerts: recentAlerts.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alertas' });
  }
});

// POST /api/alerts/rules
router.post('/rules', async (req, res) => {
  try {
    const { campaignId, name, condition, channels, recipients } = req.body;
    const db = getDb();

    const campana = await leerCampana(db, campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    const ruleId = generateId();
    const ruleData = {
      campaignId,
      name,
      condition: JSON.stringify(condition),
      channels: channels || ['email'],
      recipients: recipients || [req.user.email],
      isActive: true,
      createdAt: new Date(),
    };

    await db.collection('alertRules').doc(ruleId).set(ruleData);
    res.status(201).json({ rule: { id: ruleId, ...ruleData } });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear regla de alerta' });
  }
});

// PUT /api/alerts/rules/:id/toggle
router.put('/rules/:id/toggle', async (req, res) => {
  try {
    const db = getDb();
    const ruleDoc = await db.collection('alertRules').doc(req.params.id).get();
    if (!ruleDoc.exists) return res.status(404).json({ error: 'Regla no encontrada' });

    const rule = ruleDoc.data();
    const campana = await leerCampana(db, rule.campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Regla no encontrada' });
    }

    await db.collection('alertRules').doc(req.params.id).update({ isActive: !rule.isActive });
    const updated = await db.collection('alertRules').doc(req.params.id).get();
    res.json({ rule: serializeDates({ id: updated.id, ...updated.data() }) });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar regla' });
  }
});

// PUT /api/alerts/:id/read
router.put('/:id/read', async (req, res) => {
  try {
    const db = getDb();
    const alertDoc = await db.collection('alerts').doc(req.params.id).get();
    if (alertDoc.exists && alertDoc.data().userId === req.user.id) {
      await db.collection('alerts').doc(req.params.id).update({ isRead: true });
    }
    res.json({ message: 'Alerta marcada como leída' });
  } catch (err) {
    res.status(500).json({ error: 'Error al marcar alerta' });
  }
});

module.exports = router;
