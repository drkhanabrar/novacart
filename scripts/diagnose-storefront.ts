// Explains why products are or are not visible on the storefront, and cleans up
// the damage left by the duplicate-SKU bug.
//
// The storefront requires TWO things at once, and a product missing either one
// disappears silently with no error logged anywhere:
//
//   1. isActive: true
//   2. at least one variant with stock > 0
//
// Flags:
//   --fix        restock active products whose variants are all at zero
//   --clean      deactivate orphan products that have no variant at all
//   --clean-all  deactivate EVERY hidden active product (fresh-catalogue reset)
//
// Neither flag deletes anything. Deactivated products keep their intelligence,
// lifecycle and decision history, so the audit trail survives.

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  const fix = process.argv.includes("--fix");
  const cleanAll = process.argv.includes("--clean-all");
  const clean = cleanAll || process.argv.includes("--clean");

  const products = await prisma.product.findMany({
    include: {
      variants: true,
      lifecycle: true,
      intelligence: { select: { supplierProductId: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (products.length === 0) {
    console.log("\nNo products exist yet.\n");
    return;
  }

  console.log(`\n${products.length} product(s) in the database.\n`);

  const hidden: typeof products = [];
  const orphans: typeof products = [];
  const restockable: typeof products = [];

  for (const product of products) {
    const stock = product.variants.reduce((sum, v) => sum + v.stock, 0);
    const visible = product.isActive && stock > 0;

    if (!visible) {
      hidden.push(product);
      if (product.isActive && product.variants.length === 0) {
        orphans.push(product);
      } else if (product.isActive && stock === 0) {
        restockable.push(product);
      }
    }

    console.log(
      `${visible ? "VISIBLE" : "HIDDEN "}  ${product.title.slice(0, 50).padEnd(52)}` +
        `active=${String(product.isActive).padEnd(6)}` +
        `stock=${String(stock).padEnd(6)}` +
        `variants=${String(product.variants.length).padEnd(4)}` +
        `state=${product.lifecycle?.state ?? "none"}`,
    );
  }

  /*
   * Duplicate supplier items.
   *
   * Two products sourced from one CJ item are not two products. Before the
   * per-product SKU fix, the second one published would take over the first
   * one's variant, leaving the second invisible and the first priced wrongly.
   */
  const bySupplier = new Map<string, typeof products>();

  for (const product of products) {
    const supplierId = product.intelligence?.supplierProductId;
    if (!supplierId) continue;
    bySupplier.set(supplierId, [
      ...(bySupplier.get(supplierId) ?? []),
      product,
    ]);
  }

  const duplicates = [...bySupplier.entries()].filter(
    ([, group]) => group.length > 1,
  );

  if (duplicates.length > 0) {
    console.log(
      `\n${duplicates.length} supplier item(s) are listed more than once:\n`,
    );
    for (const [supplierId, group] of duplicates) {
      console.log(`   CJ ${supplierId}`);
      for (const product of group) {
        console.log(
          `      ${product.variants.length === 0 ? "(no variant) " : "(has variant)"} ${product.title}`,
        );
      }
    }
    console.log(
      "\n   The one WITH a variant may be priced from the other listing —\n" +
        "   check its price before trusting it.\n",
    );
  }

  console.log(
    `\n${hidden.length} hidden. ${restockable.length} restockable, ${orphans.length} orphaned (no variant).\n`,
  );

  if (!fix && !clean) {
    if (restockable.length > 0) {
      console.log("   npm run diagnose:storefront -- --fix      restock them");
    }
    if (orphans.length > 0) {
      console.log("   npm run diagnose:storefront -- --clean      deactivate orphans");
    }
    if (hidden.some((product) => product.isActive)) {
      console.log(
        "   npm run diagnose:storefront -- --clean-all  deactivate ALL hidden products",
      );
    }
    console.log("");
    return;
  }

  if (fix) {
    const stock = Number(process.env.NOVA_DROPSHIP_STOCK || 100);

    for (const product of restockable) {
      await prisma.productVariant.updateMany({
        where: { productId: product.id, stock: { lte: 0 } },
        data: { stock },
      });
      console.log(`   restocked  ${product.title}`);
    }

    console.log(`\n   ${restockable.length} product(s) restocked.`);
    console.log(
      "   Restocking does NOT correct a price that was overwritten by a\n" +
        "   duplicate listing. Check the prices of anything listed above.\n",
    );
  }

  if (clean) {
    /*
     * --clean-all also deactivates zero-stock products.
     *
     * They are already invisible to customers, but while isActive stays true
     * the weekly lifecycle pass keeps re-scoring them — spending CJ credits and
     * Gemini quota on products nobody can buy, and filling the decision ledger
     * with judgements about a catalogue that was withdrawn.
     */
    const targets = cleanAll
      ? hidden.filter((product) => product.isActive)
      : orphans;

    for (const product of targets) {
      await prisma.product.update({
        where: { id: product.id },
        data: { isActive: false },
      });
      console.log(`   deactivated  ${product.title}`);
    }

    console.log(
      `\n   ${targets.length} product(s) deactivated. Their history is kept.\n`,
    );
  }
}

main().catch((error) => {
  console.error("Diagnosis failed:", error);
  process.exit(1);
});
