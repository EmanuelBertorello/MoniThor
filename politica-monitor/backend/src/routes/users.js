const express = require('express');
const { admin, getDb } = require('../lib/firebase');
const { serializeDates } = require('../lib/db');
const { authenticate, authorize } = require('../middleware/auth');
const { usuarios: cacheUsuarios } = require('../lib/cacheLecturas');

const router = express.Router();
router.use(authenticate);

// GET /api/users
router.get('/', authorize('ADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('users').orderBy('createdAt', 'desc').get();

    const users = [];
    for (const doc of snap.docs) {
      const u = serializeDates({ id: doc.id, ...doc.data() });
      const campCount = await db.collection('campaigns')
        .where('userId', '==', doc.id).count().get();
      const { password, ...userSafe } = u;
      userSafe._count = { campaigns: campCount.data().count };
      users.push(userSafe);
    }

    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// POST /api/users
router.post('/', authorize('ADMIN'), async (req, res) => {
  try {
    const { email, name, role = 'VIEWER', plan = 'BASICO', isDemo = false, password } = req.body;
    if (!email || !name) return res.status(400).json({ error: 'Email y nombre requeridos' });
    if (password && String(password).length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const db = getDb();
    const existing = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!existing.empty) return res.status(400).json({ error: 'El email ya está registrado' });

    // Si el formulario mandó una contraseña se usa esa. Antes se ignoraba
    // siempre y se generaba una al azar que la UI no mostraba, con lo que el
    // usuario recién creado no podía entrar nunca.
    const tempPassword = password || generateTempPassword();
    const generada = !password;
    const demoExpiresAt = isDemo ? new Date(Date.now() + 30 * 60 * 1000) : null;

    const userRecord = await admin.auth().createUser({ email, password: tempPassword, displayName: name });
    const userId = userRecord.uid;
    const now = new Date();
    await db.collection('users').doc(userId).set({
      email, name, role, plan,
      isActive: true, demoExpiresAt,
      createdAt: now, updatedAt: now,
    });

    const user = { id: userId, email, name, role, plan, isActive: true, demoExpiresAt, createdAt: now };
    // `generada` le avisa al front si tiene que mostrar la contraseña: cuando
    // la eligió el admin no hace falta, cuando la invento el servidor sí, o se
    // pierde y la cuenta queda inaccesible.
    res.status(201).json({ user, tempPassword, generada });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PUT /api/users/:id
router.put('/:id', authorize('ADMIN'), async (req, res) => {
  try {
    const { name, role, plan, isActive, resetPassword, extendDemo, password: nuevaPassword } = req.body;
    const db = getDb();
    const updates = { updatedAt: new Date() };

    if (name) updates.name = name;
    if (role) updates.role = role;
    if (plan) updates.plan = plan;
    if (isActive !== undefined) updates.isActive = isActive;
    if (extendDemo) updates.demoExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    let newPassword = null;
    if (nuevaPassword) {
      if (String(nuevaPassword).length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      }
      await admin.auth().updateUser(req.params.id, { password: nuevaPassword });
    } else if (resetPassword) {
      newPassword = generateTempPassword();
      await admin.auth().updateUser(req.params.id, { password: newPassword });
    }

    await db.collection('users').doc(req.params.id).update(updates);
    // El middleware de auth cachea el perfil 60s: sin esto, desactivar a
    // alguien o cambiarle el rol tardaba en surtir efecto.
    cacheUsuarios.invalidar(req.params.id);

    // Las campañas siguen el estado del usuario: activar una cuenta reactiva
    // sus campañas y pausarla las frena a todas. Sin esto, desactivar a alguien
    // le cortaba el login pero el scraper seguía gastando en sus campañas.
    let campaignsUpdated = 0;
    if (isActive !== undefined) {
      campaignsUpdated = await syncCampaignsWithUser(db, req.params.id, isActive);
    }

    const updated = await db.collection('users').doc(req.params.id).get();
    const { password, ...userSafe } = serializeDates({ id: updated.id, ...updated.data() });

    res.json({ user: userSafe, campaignsUpdated, ...(newPassword && { newPassword }) });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', authorize('ADMIN'), async (req, res) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'No podés eliminarte a vos mismo' });
    }
    const db = getDb();
    await db.collection('users').doc(req.params.id).delete();
    cacheUsuarios.invalidar(req.params.id);
    await admin.auth().deleteUser(req.params.id).catch(() => {});
    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

// POST /api/users/demo
router.post('/demo', authorize('ADMIN'), async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Nombre y email requeridos' });

    const db = getDb();
    const existing = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!existing.empty) return res.status(400).json({ error: 'Email ya registrado' });

    const tempPassword = generateTempPassword();
    const demoExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const userRecord = await admin.auth().createUser({ email, password: tempPassword, displayName: name });
    const userId = userRecord.uid;
    const now = new Date();
    await db.collection('users').doc(userId).set({
      email, name,
      role: 'VIEWER', plan: 'BASICO',
      isActive: true, demoExpiresAt,
      createdAt: now, updatedAt: now,
    });

    res.status(201).json({
      user: { id: userId, email, name, role: 'VIEWER', demoExpiresAt },
      tempPassword, expiresIn: '30 minutos',
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear usuario demo' });
  }
});

// DELETE /api/users/cleanup-demos
router.delete('/cleanup-demos', authorize('ADMIN'), async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('users')
      .where('role', '==', 'VIEWER')
      .where('demoExpiresAt', '<', new Date())
      .get();

    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    if (!snap.empty) await batch.commit();

    await Promise.all(snap.docs.map(d => admin.auth().deleteUser(d.id).catch(() => {})));

    res.json({ message: `${snap.size} usuarios demo expirados eliminados` });
  } catch (err) {
    res.status(500).json({ error: 'Error al limpiar demos' });
  }
});

// Pone todas las campañas de un usuario en el mismo estado que la cuenta.
// Devuelve cuántas cambiaron (las que ya estaban así no se tocan).
async function syncCampaignsWithUser(db, userId, isActive) {
  const snap = await db.collection('campaigns').where('userId', '==', userId).get();
  const aCambiar = snap.docs.filter(d => d.data().isActive !== isActive);
  if (!aCambiar.length) return 0;

  const batch = db.batch();
  const now = new Date();
  aCambiar.forEach(d => batch.update(d.ref, { isActive, updatedAt: now }));
  await batch.commit();
  return aCambiar.length;
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

module.exports = router;
