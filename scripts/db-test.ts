import { config } from "dotenv";
config({ path: ".env.local" });

import { Pool } from "pg";

function redact(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:***@${u.hostname}:${u.port}${u.pathname}`;
  } catch {
    return "Could not parse DATABASE_URL as a valid URL — check its formatting (no quotes, no extra spaces).";
  }
}

async function main() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.log("❌ DATABASE_URL is NOT set. Check .env.local has a line like:");
    console.log("   DATABASE_URL=postgresql://...\n");
    process.exit(1);
  }

  console.log("Using connection:", redact(url));
  console.log("Attempting to connect (8 second timeout)...\n");

  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 8000 });

  try {
    const client = await pool.connect();
    console.log("✅ CONNECTED SUCCESSFULLY!");
    const res = await client.query("select now()");
    console.log("Database server time:", res.rows[0].now);
    client.release();
  } catch (err) {
    console.error("❌ CONNECTION FAILED\n");
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();