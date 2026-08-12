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
  const product = await prisma.product.upsert({
    where: { slug: 'nova-precision-headphones' },
    update: {}, 
    create: {
      title: 'Nova Precision Headphones',
      slug: 'nova-precision-headphones',
      description: 'Engineered with aerospace-grade aluminium and adaptive noise cancellation. These headphones dynamically adjust to your environment using edge-AI processing to deliver flawless acoustic clarity.',
      basePrice: 349.00,
      categoryId: audioCategory.id,
      brandId: novaBrand.id,
    },
  });

  // 4. Upsert Variant
  await prisma.variant.upsert({
    where: { sku: 'NOVA-HP-BLK' },
    update: {},
    create: {
      productId: product.id,
      sku: 'NOVA-HP-BLK',
      price: 349.00,
      attributes: { color: 'Black' },
      imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200&q=80',
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