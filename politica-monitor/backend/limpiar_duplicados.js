// limpiar_duplicados.js — Ejecutar para eliminar duplicados de la DB
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

function normalize(text) {
  if (!text) return '';
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function limpiar() {
  var campaigns = await p.campaign.findMany({ select: { id: true, name: true } });

  for (var c of campaigns) {
    console.log('\nCampaña:', c.name);
    var before = await p.mention.count({ where: { campaignId: c.id } });
    console.log('  Menciones antes:', before);

    var all = await p.mention.findMany({
      where: { campaignId: c.id },
      select: { id: true, sourceUrl: true, content: true },
      orderBy: { createdAt: 'asc' }
    });

    var seenUrls = {};
    var seenContent = {};
    var toDelete = [];

    all.forEach(function(m) {
      // Deduplicar por URL
      var cleanUrl = (m.sourceUrl || '').split('?')[0].replace(/\/$/, '').toLowerCase();
      if (cleanUrl.length > 10) {
        if (seenUrls[cleanUrl]) { toDelete.push(m.id); return; }
        seenUrls[cleanUrl] = true;
      }

      // Deduplicar por contenido (primeras 15 palabras)
      var contentKey = normalize(m.content || '').split(' ').slice(0, 15).join(' ');
      if (contentKey.length > 20) {
        if (seenContent[contentKey]) { toDelete.push(m.id); return; }
        seenContent[contentKey] = true;
      }
    });

    console.log('  Duplicados encontrados:', toDelete.length);

    // Eliminar en lotes
    for (var i = 0; i < toDelete.length; i += 50) {
      var batch = toDelete.slice(i, i + 50);
      await p.mention.deleteMany({ where: { id: { in: batch } } });
    }

    var after = await p.mention.count({ where: { campaignId: c.id } });
    console.log('  Menciones después:', after);
    console.log('  Eliminados:', before - after);
  }

  await p.$disconnect();
  console.log('\n✅ Limpieza completada');
}

limpiar().catch(function(e) { console.error(e.message); p.$disconnect(); });
