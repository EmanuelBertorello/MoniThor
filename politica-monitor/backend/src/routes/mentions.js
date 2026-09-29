const express = require('express');
const { getDb } = require('../lib/firebase');
const { toDocs, serializeDates } = require('../lib/db');
const { authenticate } = require('../middleware/auth');
const { leerCampana } = require('../lib/cacheLecturas');
const { puedeAcceder } = require('../middleware/ownership');
const logger = require('../lib/logger');
const { toMentionView } = require('../lib/mentionView');

const router = express.Router();
router.use(authenticate);

// Tope de documentos que se traen de Firestore para una consulta. Antes se
// leía la colección entera de la campaña (2000+ docs por request); esto acota
// el costo y la latencia. La búsqueda por texto sigue siendo en memoria
// porque Firestore no hace substring, pero ahora sobre una ventana acotada.
const MAX_SCAN_DOCS = 1000;

// GET /api/mentions
router.get('/', async (req, res) => {
  try {
    const {
      campaignId, source, sentiment, keywordId,
      search, page = 1, limit = 30, from, to,
    } = req.query;

    if (!campaignId) return res.status(400).json({ error: 'campaignId requerido' });

    const db = getDb();
    const campana = await leerCampana(db, campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    // Los filtros de igualdad y el rango de fechas los resuelve Firestore.
    let query = db.collection('mentions').where('campaignId', '==', campaignId);
    if (source && source !== 'ALL') query = query.where('source', '==', source);
    if (sentiment && sentiment !== 'ALL') query = query.where('sentiment', '==', sentiment);
    if (keywordId) query = query.where('keywordId', '==', keywordId);
    if (from) query = query.where('publishedAt', '>=', new Date(from));
    if (to) query = query.where('publishedAt', '<=', new Date(to));

    // Filtros que se aplican en memoria cuando Firestore rechaza la consulta
    // por falta de índice compuesto. Se llenan en el catch de abajo.
    let memoryFilter = null;

    const pageNum = Math.max(parseInt(page) || 1, 1);
    const limitNum = Math.max(parseInt(limit) || 30, 1);
    const skip = (pageNum - 1) * limitNum;

    // Orden por fecha real de publicación del post/noticia, más nueva primero.
    const ordered = query.orderBy('publishedAt', 'desc');

    let paginated;
    let total;
    let capped = false;

    if (search) {
      // Firestore no hace substring: hay que traer una ventana y filtrar acá.
      // Se acota a MAX_SCAN_DOCS para no leer la colección entera, y se avisa
      // al front con `capped` cuando la búsqueda no cubrió todo el histórico.
      const snap = await ordered.limit(MAX_SCAN_DOCS).get();
      const scanned = toDocs(snap).map(serializeDates);
      capped = scanned.length >= MAX_SCAN_DOCS;
      const searchLower = search.toLowerCase();
      const matched = scanned.filter(m => (m.content || '').toLowerCase().includes(searchLower));
      total = matched.length;
      paginated = matched.slice(skip, skip + limitNum);
    } else {
      // Sin búsqueda pagina Firestore: el total sale de una agregación (no baja
      // documentos) y la página pedida se trae con offset/limit. Antes el total
      // era el tamaño del lote leído, así que una campaña grande mostraba el
      // tope en vez de su cantidad real de menciones.
      try {
        const [agg, snap] = await Promise.all([
          ordered.count().get(),
          ordered.offset(skip).limit(limitNum).get(),
        ]);
        total = agg.data().count;
        paginated = toDocs(snap).map(serializeDates);
      } catch (err) {
        if (err.code !== 9 && !/requires an index/i.test(err.message || '')) throw err;

        // Falta el índice compuesto para esta combinación de filtros (pasa con
        // keywordId, que necesita (campaignId, keywordId, publishedAt)). En vez
        // de devolver 500, se cae a una consulta que Firestore sí resuelve y el
        // filtro restante se aplica acá, sobre una ventana acotada.
        logger.warn(`GET /mentions: sin índice para los filtros pedidos — uso el camino lento`);
        memoryFilter = (m) => (!keywordId || m.keywordId === keywordId)
          && (!source || source === 'ALL' || m.source === source)
          && (!sentiment || sentiment === 'ALL' || m.sentiment === sentiment)
          && (!from || new Date(m.publishedAt) >= new Date(from))
          && (!to || new Date(m.publishedAt) <= new Date(to));

        const snap = await db.collection('mentions')
          .where('campaignId', '==', campaignId)
          .orderBy('publishedAt', 'desc')
          .limit(MAX_SCAN_DOCS).get();
        const scanned = toDocs(snap).map(serializeDates);
        capped = scanned.length >= MAX_SCAN_DOCS;
        const matched = scanned.filter(memoryFilter);
        total = matched.length;
        paginated = matched.slice(skip, skip + limitNum);
      }
    }

    // Enriquecer con la keyword: una sola lectura batch en vez de N lecturas.
    const keywordIds = [...new Set(paginated.filter(m => m.keywordId).map(m => m.keywordId))];
    const keywordMap = {};
    if (keywordIds.length > 0) {
      const refs = keywordIds.map(id => db.collection('keywords').doc(id));
      const kwDocs = await db.getAll(...refs);
      kwDocs.forEach(d => {
        if (d.exists) keywordMap[d.id] = { term: d.data().term, color: d.data().color };
      });
    }

    const mentions = paginated.map(m => ({
      ...toMentionView(m),
      keyword: m.keywordId && keywordMap[m.keywordId] ? keywordMap[m.keywordId] : null,
    }));

    // Marcar como leídas SOLO las que se devuelven. Antes marcaba hasta 500 de
    // toda la campaña, con lo que el contador de no leídas se vaciaba solo.
    const unreadIds = paginated.filter(m => !m.isRead).map(m => m.id);
    if (unreadIds.length > 0) {
      const batch = db.batch();
      unreadIds.forEach(id => batch.update(db.collection('mentions').doc(id), { isRead: true }));
      await batch.commit().catch(err => logger.warn(`No se pudo marcar como leídas: ${err.message}`));
    }

    res.json({
      mentions,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
        capped,
      },
    });
  } catch (err) {
    logger.error(`GET /mentions: ${err.message}`);
    res.status(500).json({ error: 'Error al obtener menciones' });
  }
});

// GET /api/mentions/unread-count
router.get('/unread-count', async (req, res) => {
  try {
    const { campaignId } = req.query;
    const db = getDb();

    const campana = await leerCampana(db, campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    // Agregacion del lado de Firestore: no baja documentos, solo el numero.
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const agg = await db.collection('mentions')
      .where('campaignId', '==', campaignId)
      .where('isRead', '==', false)
      .where('publishedAt', '>=', since)
      .count().get();

    res.json({ count: agg.data().count });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener conteo' });
  }
});

// DELETE /api/mentions/:id
router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const mentionDoc = await db.collection('mentions').doc(req.params.id).get();
    if (!mentionDoc.exists) return res.status(404).json({ error: 'Mención no encontrada' });

    const mention = mentionDoc.data();
    const campana = await leerCampana(db, mention.campaignId);
    if (!campana || !puedeAcceder(req.user, campana)) {
      return res.status(404).json({ error: 'Mención no encontrada' });
    }

    await db.collection('mentions').doc(req.params.id).delete();
    res.json({ message: 'Mención eliminada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar mención' });
  }
});

module.exports = router;
