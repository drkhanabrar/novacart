import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding baseline architecture data (Idempotent)...');

  // 1. Upsert Core Category
  const audioCategory = await prisma.category.upsert({
    where: { slug: 'audio' },
    update: {},
    create: { name: 'Audio', slug: 'audio' },
  });

  // 2. Upsert Core Brand
  const novaBrand = await prisma.brand.upsert({
    where: { slug: 'novalabs' },
    update: {},
    create: { name: 'NovaLabs', slug: 'novalabs' },
  });

  // 3. Upsert Product
  // NOTE: title is used as the search keyword for the NOVA AI Engine
  // (Google Trends + YouTube), so it should describe the product the way
  // a real shopper would search for it, not a made-up brand name.
  const product = await prisma.product.upsert({
    where: { slug: 'wireless-bluetooth-earbuds' },
    update: {},
    create: {
      title: 'Wireless Bluetooth Earbuds',
      slug: 'wireless-bluetooth-earbuds',
      description: 'Compact true-wireless earbuds with active noise cancellation, touch controls, and a compact charging case. Built for everyday use, workouts, and commuting.',
      basePrice: 1499.00,
      categoryId: audioCategory.id,
      brandId: novaBrand.id,
    },
  });

  // 4. Upsert Variant
  await prisma.productVariant.upsert({
    where: { sku: 'NOVA-EARBUDS-BLK' },
    update: {},
    create: {
      productId: product.id,
      sku: 'NOVA-EARBUDS-BLK',
      price: 1499.00,
      name: "Base Edition",
      attributes: { color: 'Black' },
      imageUrl: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=1200&q=80',
    }
  });

  // 5. Upsert Intelligence
  await prisma.productIntelligence.upsert({
    where: { productId: product.id },
    update: {},
    create: {
      productId: product.id,
      aiScore: 94.5,
      demandLevel: 'HIGH',
      profitabilityIndex: 139.60,
    }
  });

  console.log(`✅ Seeded Product: ${product.title} successfully.`);
  console.log('✅ Database initialization complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });