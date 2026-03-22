import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { writeFileSync } from 'fs';

const p = new PrismaClient();
const skus = await p.part.findMany({ select: { sku: true }, take: 5000, orderBy: { sku: 'asc' } });
let csv = 'SKU\n';
skus.forEach(r => { csv += r.sku + '\n'; });
writeFileSync('/Users/nikushamenteshashvili/Desktop/Parts_5000_SKUs.csv', csv);
console.log('Exported ' + skus.length + ' SKUs');
await p.$disconnect();
