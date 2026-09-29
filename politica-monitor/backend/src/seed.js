require('dotenv').config();
const { initFirebase, getDb, admin } = require('./lib/firebase');
const { generateId } = require('./lib/db');

async function seed() {
  console.log('Seeding Firestore...');

  initFirebase();
  const db = getDb();

  const now = new Date();

  // Check if demo user exists
  const existingUser = await db.collection('users').where('email', '==', 'demo@politicamonitor.com').limit(1).get();
  let userId;

  if (existingUser.empty) {
    const userRecord = await admin.auth().createUser({
      email: 'demo@politicamonitor.com',
      password: 'demo1234',
      displayName: 'Usuario Demo',
    });
    userId = userRecord.uid;
    await db.collection('users').doc(userId).set({
      email: 'demo@politicamonitor.com',
      name: 'Usuario Demo',
      role: 'ADMIN',
      plan: 'CAMPANA',
      isActive: true,
      demoExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    });
    console.log('Demo user created');
  } else {
    userId = existingUser.docs[0].id;
    console.log('Demo user already exists');
  }
  console.log('Login: demo@politicamonitor.com / demo1234');

  // Create campaign
  const campaignId = 'demo-campaign-001';
  const campDoc = await db.collection('campaigns').doc(campaignId).get();

  if (!campDoc.exists) {
    await db.collection('campaigns').doc(campaignId).set({
      name: 'Campaña Presidencial 2027',
      description: 'Monitoreo principal de la campaña presidencial',
      userId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log('Campaign created');
  }

  // Add keywords
  const keywords = [
    { term: 'García Morales', color: '#3b82f6' },
    { term: 'reforma fiscal', color: '#8b5cf6' },
    { term: 'debate presidencial', color: '#10b981' },
    { term: 'campaña 2027', color: '#f59e0b' },
  ];

  for (const kw of keywords) {
    const existing = await db.collection('keywords')
      .where('term', '==', kw.term)
      .where('campaignId', '==', campaignId)
      .limit(1).get();

    if (existing.empty) {
      await db.collection('keywords').doc(generateId()).set({
        ...kw,
        campaignId,
        isActive: true,
        createdAt: now,
      });
    }
  }
  console.log(`${keywords.length} keywords created`);

  // Add sources
  const sources = [
    { type: 'NEWS', name: 'Google News' },
    { type: 'WEB', name: 'Sitios Web' },
    { type: 'FACEBOOK', name: 'Facebook' },
    { type: 'INSTAGRAM', name: 'Instagram' },
    { type: 'TWITTER', name: 'Twitter/X' },
  ];

  for (const src of sources) {
    const existing = await db.collection('sources')
      .where('campaignId', '==', campaignId)
      .where('type', '==', src.type)
      .limit(1).get();

    if (existing.empty) {
      await db.collection('sources').doc(generateId()).set({
        ...src,
        campaignId,
        isActive: true,
        lastScraped: null,
        createdAt: now,
      });
    }
  }

  // Add alert rule
  const existingRule = await db.collection('alertRules')
    .where('campaignId', '==', campaignId)
    .limit(1).get();

  if (existingRule.empty) {
    await db.collection('alertRules').doc(generateId()).set({
      campaignId,
      name: 'Pico de menciones negativas',
      condition: JSON.stringify({ type: 'negative_surge', threshold: 10 }),
      channels: ['email'],
      recipients: ['demo@politicamonitor.com'],
      isActive: true,
      createdAt: now,
    });
  }

  // Add sample mentions
  const sampleMentions = [
    { source: 'NEWS', content: 'García Morales presenta propuesta de reforma fiscal que genera debate en el Congreso.', sentiment: 'NEUTRAL', reach: 45000 },
    { source: 'FACEBOOK', content: 'El candidato García Morales mostró propuestas concretas en el debate de anoche. Muy sólido.', sentiment: 'POSITIVE', reach: 12000 },
    { source: 'TWITTER', content: 'El debate presidencial estuvo vacío de propuestas reales. Ningún candidato explicó cómo financiarán sus proyectos.', sentiment: 'NEGATIVE', reach: 28000 },
    { source: 'INSTAGRAM', content: 'La campaña 2027 necesita propuestas más claras sobre economía y seguridad.', sentiment: 'NEUTRAL', reach: 8500 },
    { source: 'NEWS', content: 'Encuesta: candidato lidera con 34% de intención de voto tras debate presidencial.', sentiment: 'POSITIVE', reach: 150000 },
  ];

  const existingMentions = await db.collection('mentions')
    .where('campaignId', '==', campaignId)
    .limit(1).get();

  if (existingMentions.empty) {
    const batch = db.batch();
    for (const mention of sampleMentions) {
      const ref = db.collection('mentions').doc(generateId());
      batch.set(ref, {
        ...mention,
        campaignId,
        keywordId: null,
        sourceUrl: null,
        sourceName: mention.source,
        author: null,
        snippet: mention.content.slice(0, 200),
        sentimentScore: null,
        engagement: 0,
        isRead: false,
        publishedAt: new Date(Date.now() - Math.random() * 3600000),
        createdAt: now,
      });
    }
    await batch.commit();
    console.log(`${sampleMentions.length} sample mentions created`);
  }

  console.log('\nSeed complete!');
  console.log('Login: demo@politicamonitor.com');
  console.log('Password: demo1234');

  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
