// Backfill de `dedupeKey` sobre las menciones ya guardadas.
// Correr una sola vez, local:  node src/scripts/backfill-dedupe-keys.js
// Idempotente: saltea las que ya lo tienen. Con --dry no escribe nada.
require('dotenv').config();
const { getDb } = require('../lib/firebase');
const { dedupeKey } = require('../lib/dedupe');

const DRY = process.argv.includes('--dry');

(async () => {
  const db = getDb();
  const snap = await db.collection('mentions').get();
  console.log(`${snap.size} menciones leidas${DRY ? ' (dry-run)' : ''}`);

  const seen = new Set();
  const updates = [];
  let already = 0;
  let dupes = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.dedupeKey) { already++; continue; }
    const key = dedupeKey(data);
    updates.push({ ref: doc.ref, key });

    const campKey = `${data.campaignId}|${key}`;
    if (seen.has(campKey)) dupes++;
    seen.add(campKey);
  }

  console.log(`ya tenian clave: ${already} | a escribir: ${updates.length} | duplicadas detectadas (misma campana): ${dupes}`);

  if (DRY || !updates.length) return process.exit(0);

  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    updates.slice(i, i + 400).forEach(({ ref, key }) => batch.update(ref, { dedupeKey: key }));
    await batch.commit();
    console.log(`  ${Math.min(i + 400, updates.length)}/${updates.length}`);
  }

  console.log('Backfill completo.');
  process.exit(0);
})().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
