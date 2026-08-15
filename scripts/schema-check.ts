import { config } from "dotenv";
config({ path: ".env.local" });
import { createRequire } from "module";
async function main() {
  const { Prisma } = await import("@prisma/client");
  const require = createRequire(import.meta.url);
  const clientPath = require.resolve("@prisma/client");
  console.log("@prisma/client resolved from:\n  ", clientPath, "\n");
  const model = Prisma.dmmf.datamodel.models.find(
    (m: { name: string }) => m.name === "ProductIntelligence"
  );
  if (!model) {
    console.log("❌ ProductIntelligence model not found in this process's loaded client at all!");
    return;
  }
  console.log("Fields THIS PROCESS's loaded Prisma Client knows about for ProductIntelligence:");
  for (const f of model.fields as unknown as { name: string }[]) {
    console.log("  -", f.name);
  }
  const hasSupplierName = (model.fields as unknown as { name: string }[]).some(
    (f) => f.name === "supplierName"
  );
  console.log(
    `\n${hasSupplierName ? "✅" : "❌"} supplierName is ${hasSupplierName ? "" : "NOT "}present in this process's client.`
  );
}
main();