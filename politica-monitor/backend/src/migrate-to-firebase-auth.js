require('dotenv').config();
const { initFirebase, getDb, admin } = require('./lib/firebase');

// One-off: create Firebase Auth accounts for existing Firestore users (preserving uid),
// then strip the legacy bcrypt password field.
const USERS = [
  { uid: 'cfa88610-40b3-434a-9ee0-7755a78537cf', email: 'demo@politicamonitor.com', password: 'demo1234' },
  { uid: '1f725402-3d73-4c2c-b860-a25b4fbf9186', email: 'ema-ber2011@live.com.ar', password: 'totito12' },
];

async function migrate() {
  initFirebase();
  const db = getDb();

  for (const u of USERS) {
    try {
      await admin.auth().getUser(u.uid);
      console.log(`${u.email}: ya existe en Firebase Auth`);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        await admin.auth().createUser({ uid: u.uid, email: u.email, password: u.password });
        console.log(`${u.email}: creado en Firebase Auth (uid=${u.uid})`);
      } else {
        throw err;
      }
    }

    await db.collection('users').doc(u.uid).update({
      password: admin.firestore.FieldValue.delete(),
    });
  }

  console.log('Migración completa');
  process.exit(0);
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
