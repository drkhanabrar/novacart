import { config } from "dotenv";
config({ path: ".env.local" });

import { searchSupplierProducts } from "../src/lib/services/cj-supplier";

async function main() {
  const keyword = process.argv.slice(2).join(" ");

  if (!keyword) {
    console.log('\nUsage: npm run supplier -- "product keyword"');
    console.log('Example: npm run supplier -- "wireless earbuds"\n');
    process.exit(1);
  }

  console.log(`\nSearching CJ Dropshipping for: "${keyword}" ...\n`);

  try {
    const products = await searchSupplierProducts(keyword, 5);

    if (products.length === 0) {
      console.log("No supplier products found for that keyword.\n");
      return;
    }

    console.log(`Found ${products.length} product(s):\n`);
    products.forEach((p, i) => {
      console.log(`${i + 1}. ${p.productName}`);
      console.log(`   CJ price: $${p.sellPrice}`);
      console.log(`   Product ID: ${p.productId}`);
      console.log(`   URL: ${p.productUrl}`);
      console.log("");
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Something went wrong:", message);
    process.exit(1);
  }
}

main();