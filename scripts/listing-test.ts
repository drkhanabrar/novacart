import { config } from "dotenv";
config({ path: ".env.local" });

import { generateListing } from "../src/lib/services/listing-generator";

async function main() {
  const workingTitle = process.argv.slice(2).join(" ");

  if (!workingTitle) {
    console.log('\nUsage: npm run listing -- "product working title"');
    console.log('Example: npm run listing -- "Wireless Bluetooth Earbuds"\n');
    process.exit(1);
  }

  console.log(`\nGenerating listing for: "${workingTitle}" ...\n`);

  try {
    const listing = await generateListing({
      productWorkingTitle: workingTitle,
      supplierProductName: workingTitle, // placeholder for this standalone test
      category: "Audio",
      trendDirection: "STEADY",
    });

    console.log("ENGLISH");
    console.log("-------");
    console.log(`Title: ${listing.titleEn}`);
    console.log(`Description: ${listing.descriptionEn}\n`);

    console.log("HINDI");
    console.log("-----");
    console.log(`Title: ${listing.titleHi}`);
    console.log(`Description: ${listing.descriptionHi}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Something went wrong:", message);
    process.exit(1);
  }
}

main();