// limpiar_db.js — Ejecutar UNA VEZ para limpiar datos falsos de la DB
// Correr con: node limpiar_db.js
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function limpiar() {
  console.log('=== LIMPIEZA DE BASE DE DATOS ===\n');

  // 1. Contar menciones actuales
  var total = await p.mention.count();
  console.log('Menciones totales antes:', total);

  // 2. Eliminar menciones con fechas muy viejas (más de 90 días)
  var cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  var r1 = await p.mention.deleteMany({ where: { publishedAt: { lt: cutoff90 } } });
  console.log('Eliminadas por fecha vieja (>90 días):', r1.count);

  // 3. Corregir reach inventado (valores absurdamente altos)
  var r2 = await p.mention.updateMany({ where: { reach: { gt: 50000 } }, data: { reach: 0 } });
  console.log('Menciones con reach falso corregidas:', r2.count);

  // 4. Eliminar menciones sin URL (datos incompletos)
  var r3 = await p.mention.deleteMany({ where: { OR: [{ sourceUrl: '' }, { sourceUrl: null }] } });
  console.log('Eliminadas sin URL:', r3.count);

  // 5. Eliminar duplicados por URL (misma URL en misma campaña)
  var allMentions = await p.mention.findMany({
    select: { id: true, campaignId: true, sourceUrl: true, content: true },
    orderBy: { createdAt: 'asc' }
  });

  var seen = {};
  var toDelete = [];
  allMentions.forEach(function(m) {
    var cleanUrl = (m.sourceUrl || '').split('?')[0].replace(/\/$/, '');
    var key = m.campaignId + '|' + (cleanUrl || m.content.slice(0, 80));
    if (seen[key]) {
      toDelete.push(m.id);
    } else {
      seen[key] = true;
    }
  });

  if (toDelete.length > 0) {
    // Eliminar en lotes de 100
    for (var i = 0; i < toDelete.length; i += 100) {
      var batch = toDelete.slice(i, i + 100);
      await p.mention.deleteMany({ where: { id: { in: batch } } });
    }
    console.log('Duplicados eliminados:', toDelete.length);
  } else {
    console.log('Sin duplicados encontrados');
  }

  // 6. Resultado final
  var totalFinal = await p.mention.count();
  console.log('\n=== RESULTADO ===');
  console.log('Menciones antes:', total);
  console.log('Menciones después:', totalFinal);
  console.log('Total eliminadas:', total - totalFinal);

  // 7. Ver por campaña
  var campaigns = await p.campaign.findMany({ select: { id: true, name: true } });
  for (var c of campaigns) {
    var count = await p.mention.count({ where: { campaignId: c.id } });
    console.log('\nCampaña "' + c.name + '":', count, 'menciones');

    var bySrc = await p.mention.groupBy({ by: ['source'], where: { campaignId: c.id }, _count: true });
    bySrc.forEach(function(s) { console.log('  -', s.source, ':', s._count); });
  }

  await p.$disconnect();
  console.log('\n✅ Limpieza completada');
}

limpiar().catch(function(e) {
  console.error('Error:', e.message);
  p.$disconnect();
});
