import { config } from "dotenv";
config({ path: ".env.local" });

import { getMarketSignals } from "../src/lib/services/market-signals";

async function main() {
  const keyword = process.argv.slice(2).join(" ");

  if (!keyword) {
    console.log('\nUsage: npm run research -- "product keyword"');
    console.log('Example: npm run research -- "magnetic phone mount"\n');
    process.exit(1);
  }

  console.log(`\nResearching: "${keyword}" ...\n`);

  try {
    const signal = await getMarketSignals(keyword);

    console.log("RESULTS");
    console.log("-------");
    console.log(`Google Trends score (0-100): ${signal.trendScore}`);
    console.log(`Trend direction:             ${signal.trendDirection}`);
    console.log(`YouTube videos found:        ${signal.youtubeVideoCount}`);
    console.log(
      `YouTube total views:         ${signal.youtubeTotalViews.toLocaleString()}`
    );
    console.log(
      `YouTube avg views/video:     ${signal.youtubeAvgViews.toLocaleString()}`
    );
    console.log("");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Something went wrong:", message);
    process.exit(1);
  }
}

main();