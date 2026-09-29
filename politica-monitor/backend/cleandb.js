require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

prisma.campaign.findMany({ take:1, select:{ id:true, name:true } }).then(async function(campaigns) {
  var id = campaigns[0].id;
  var deleted = await prisma.mention.deleteMany({ where:{ campaignId:id } });
  console.log('Eliminadas:', deleted.count, 'menciones');
  console.log('Base de datos limpia. El próximo scraping traerá solo resultados válidos.');
  await prisma.$disconnect();
}).catch(console.error);
