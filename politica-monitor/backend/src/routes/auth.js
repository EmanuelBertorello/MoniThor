const express = require('express');
const { z } = require('zod');
const { getDb } = require('../lib/firebase');
const { generateId, serializeDates } = require('../lib/db');
const { authenticate, verifyFirebaseToken } = require('../middleware/auth');

const router = express.Router();

const registerSchema = z.object({
  name: z.string().min(2, 'Nombre requerido'),
});

// POST /api/auth/register
// El usuario ya se creó en Firebase Auth desde el cliente (createUserWithEmailAndPassword).
// Este endpoint crea el perfil en Firestore + campaña inicial para ese uid.
router.post('/register', verifyFirebaseToken, async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    const db = getDb();
    const userId = req.firebaseUser.uid;
    const now = new Date();

    const existing = await db.collection('users').doc(userId).get();
    if (existing.exists) return res.status(400).json({ error: 'El usuario ya tiene perfil' });

    await db.collection('users').doc(userId).set({
      email: req.firebaseUser.email,
      name: data.name,
      role: 'ANALYST',
      plan: 'BASICO',
      isActive: true,
      demoExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const campaignId = generateId();
    await db.collection('campaigns').doc(campaignId).set({
      name: 'Mi primera campaña',
      description: 'Campaña de monitoreo principal',
      userId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({
      user: { id: userId, email: req.firebaseUser.email, name: data.name, role: 'ANALYST', plan: 'BASICO' },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: err.errors[0].message });
    }
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/profile
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    const db = getDb();
    const updates = { updatedAt: new Date() };

    if (name) updates.name = name;

    await db.collection('users').doc(req.user.id).update(updates);

    const updatedSnap = await db.collection('users').doc(req.user.id).get();
    const { password, ...userSafe } = serializeDates({ id: updatedSnap.id, ...updatedSnap.data() });

    res.json({ user: { id: userSafe.id, email: userSafe.email, name: userSafe.name, role: userSafe.role, plan: userSafe.plan } });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

module.exports = router;
