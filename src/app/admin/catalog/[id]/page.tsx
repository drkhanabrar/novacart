// FILE: src/app/admin/catalog/[id]/page.tsx
//
// Full product editor. Handles both editing an existing product and creating a
// new one, since the two forms are otherwise identical.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import {
  AdminForm,
  ActionButton,
  fieldClass,
  labelClass,
} from "@/components/admin/AdminForm";
import {
  updateProductAction,
  createProductAction,
  deleteProductAction,
} from "@/actions/admin-commerce";

export const dynamic = "force-dynamic";

export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const isNew = id === "new";

  const [product, categories, brands] = await Promise.all([
    isNew
      ? null
      : prisma.product.findUnique({
          where: { id },
          include: {
            variants: true,
            intelligence: true,
            lifecycle: true,
            orderItems: { select: { id: true } },
          },
        }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!isNew && !product) notFound();

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/admin/catalog" className="text-sm text-poppy">
        ← Catalog
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-ink">
        {isNew ? "Add a product" : product!.title}
      </h1>

      <div className="mt-6 rounded-2xl border border-ink/10 bg-card p-6">
        <AdminForm
          action={isNew ? createProductAction : updateProductAction}
          hidden={isNew ? {} : { productId: product!.id }}
          submitLabel={isNew ? "Create product" : "Save changes"}
        >
          <div className="grid gap-4">
            <div>
              <label className={labelClass} htmlFor="title">
                Title
              </label>
              <input
                id="title"
                name="title"
                required
                defaultValue={product?.title ?? ""}
                className={`mt-1 ${fieldClass}`}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={5}
                defaultValue={product?.description ?? ""}
                className={`mt-1 ${fieldClass}`}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="basePrice">
                  Price (INR)
                </label>
                <input
                  id="basePrice"
                  name="basePrice"
                  type="number"
                  min={1}
                  step="1"
                  required
                  defaultValue={
                    product ? Number(product.basePrice) : undefined
                  }
                  className={`mt-1 ${fieldClass}`}
                />
                {!isNew && (
                  <p className="mt-1 text-[11px] text-ink-soft">
                    Changing this also updates every variant price, so the cart
                    charges what the listing shows.
                  </p>
                )}
              </div>

              {isNew && (
                <div>
                  <label className={labelClass} htmlFor="stock">
                    Opening stock
                  </label>
                  <input
                    id="stock"
                    name="stock"
                    type="number"
                    min={0}
                    defaultValue={100}
                    className={`mt-1 ${fieldClass}`}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="categoryId">
                  Category
                </label>
                <select
                  id="categoryId"
                  name="categoryId"
                  defaultValue={product?.categoryId ?? ""}
                  className={`mt-1 ${fieldClass}`}
                >
                  <option value="">None</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass} htmlFor="brandId">
                  Brand
                </label>
                <select
                  id="brandId"
                  name="brandId"
                  defaultValue={product?.brandId ?? ""}
                  className={`mt-1 ${fieldClass}`}
                >
                  <option value="">None</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!isNew && (
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={product!.isActive}
                  className="h-4 w-4"
                />
                Visible on the storefront
              </label>
            )}
          </div>
        </AdminForm>
      </div>

      {!isNew && (
        <>
          <section className="mt-8">
            <h2 className="text-lg font-semibold text-ink">Variants</h2>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-ink/10 bg-card">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink/10 text-ink-soft">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">SKU</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                    <th className="px-4 py-3 font-medium">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {product!.variants.map((variant) => (
                    <tr key={variant.id} className="border-b border-ink/5">
                      <td className="px-4 py-3 text-ink">{variant.name}</td>
                      <td className="px-4 py-3 font-tag text-[11px] text-ink-soft">
                        {variant.sku}
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {formatCurrency(Number(variant.price))}
                      </td>
                      <td className="px-4 py-3 text-ink-soft">
                        {variant.stock}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {product!.intelligence && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-ink">
                What NOVA knows
              </h2>
              <p className="mt-2 rounded-2xl border border-ink/10 bg-card p-5 text-sm leading-relaxed text-ink-soft">
                {product!.intelligence.insights ?? "No notes recorded."}
              </p>
            </section>
          )}

          <section className="mt-8 pb-16">
            <h2 className="text-lg font-semibold text-ink">Danger zone</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {product!.orderItems.length > 0
                ? `This product appears in ${product!.orderItems.length} order line(s). It cannot be deleted without breaking that order history — hide it instead.`
                : "This product has never been ordered, so it can be deleted permanently."}
            </p>
            {product!.orderItems.length === 0 && (
              <div className="mt-3">
                <ActionButton
                  action={deleteProductAction}
                  values={{ productId: product!.id }}
                  label="Delete permanently"
                  tone="danger"
                  confirm
                />
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
