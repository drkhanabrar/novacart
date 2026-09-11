// Grants or revokes the ADMIN role for an existing account.
//
// Deliberately a CLI script rather than a page. There must be no route through
// which the internet can grant itself admin, so the only way in is a command run
// by someone who already has the database credentials.
//
//   npm run make-admin -- you@example.com
//   npm run make-admin -- you@example.com --revoke

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const email = process.argv.find((arg) => arg.includes("@"))?.toLowerCase();
  const revoke = process.argv.includes("--revoke");

  if (!email) {
    console.error(
      "\nUsage: npm run make-admin -- you@example.com [--revoke]\n",
    );
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.error(
      `\nNo account exists for ${email}. Sign up on the storefront first, then run this again.\n`,
    );
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { email },
    data: { role: revoke ? "USER" : "ADMIN" },
  });

  console.log(
    revoke
      ? `\n${updated.email} is no longer an administrator.\n`
      : `\n${updated.email} is now an administrator. Sign out and back in, then open /admin\n`,
  );
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
