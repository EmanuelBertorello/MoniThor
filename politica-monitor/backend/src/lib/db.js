const { getDb } = require('./firebase');
const { v4: uuidv4 } = require('uuid');

function connectDB() {
  getDb();
  return Promise.resolve();
}

function generateId() {
  return uuidv4();
}

function toDoc(snapshot) {
  if (!snapshot.exists) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

function toDocs(querySnapshot) {
  const results = [];
  querySnapshot.forEach(doc => {
    results.push({ id: doc.id, ...doc.data() });
  });
  return results;
}

function toDate(val) {
  if (!val) return null;
  if (val.toDate) return val.toDate();
  if (val instanceof Date) return val;
  return new Date(val);
}

function serializeDates(doc) {
  if (!doc) return doc;
  const result = { ...doc };
  for (const [key, val] of Object.entries(result)) {
    if (val && typeof val === 'object' && typeof val.toDate === 'function') {
      result[key] = val.toDate();
    }
  }
  return result;
}

module.exports = { connectDB, generateId, toDoc, toDocs, toDate, serializeDates };
