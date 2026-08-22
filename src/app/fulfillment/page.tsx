import { getFulfillments, markFulfillmentOrdered } from "@/actions/fulfillment";
import { ExternalLink, AlertTriangle } from "lucide-react";

type Fulfillment = Awaited<ReturnType<typeof getFulfillments>>[number];

export default async function FulfillmentPage() {
  const fulfillments = await getFulfillments();

  const pending = fulfillments.filter((f: Fulfillment) => f.status === "PENDING_REVIEW");
  const needsSourcing = fulfillments.filter((f: Fulfillment) => f.status === "NEEDS_MANUAL_SOURCING");
  const ordered = fulfillments.filter((f: Fulfillment) => f.status === "ORDERED");

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="font-display text-4xl font-semibold text-ink mb-2">Fulfillment</h1>
      <p className="text-ink-soft text-sm mb-10">
        Real paid orders that need a real supplier order placed. Nothing here spends money
        automatically — you place each order yourself, then mark it done.
      </p>

      {needsSourcing.length > 0 && (
        <section className="mb-10">
          <h2 className="text-alert font-semibold flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4" />
            Needs Manual Sourcing ({needsSourcing.length})
          </h2>
          <div className="flex flex-col gap-3">
            {needsSourcing.map((f: Fulfillment) => (
              <div key={f.id} className="bg-surface border border-alert/30 rounded-2xl p-4">
                <p className="text-ink font-medium">{f.orderItem.product.title}</p>
                <p className="text-sm text-ink-soft mt-1">
                  Qty: {f.orderItem.quantity} · Ordered by{" "}
                  {f.orderItem.order.user.name || f.orderItem.order.user.email}
                </p>
                <p className="text-xs text-alert mt-2">
                  No confident supplier match was found for this product — source it manually.
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <h2 className="text-nova font-semibold mb-4">Pending Review ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-ink-faint text-sm">Nothing waiting right now.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {pending.map((f: Fulfillment) => (
              <div
                key={f.id}
                className="bg-surface border border-border rounded-2xl p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <p className="text-ink font-medium">{f.orderItem.product.title}</p>
                  <p className="text-sm text-ink-soft mt-1">
                    Qty: {f.orderItem.quantity} · Ordered by{" "}
                    {f.orderItem.order.user.name || f.orderItem.order.user.email}
                  </p>
                  <p className="text-sm text-signal mt-1">
                    {f.supplierName}: ${f.supplierCostUsd?.toString()}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {f.supplierUrl && (
                    <a
                      href={f.supplierUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-nova flex items-center gap-1 hover:underline"
                    >
                      Open supplier page <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <form action={markFulfillmentOrdered}>
                    <input type="hidden" name="fulfillmentId" value={f.id} />
                    <button
                      type="submit"
                      className="text-xs px-3 py-1.5 bg-nova hover:bg-nova-dark text-[#14120f] rounded-lg font-semibold transition-colors"
                    >
                      Mark as Ordered
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-success font-semibold mb-4">Ordered ({ordered.length})</h2>
        {ordered.length === 0 ? (
          <p className="text-ink-faint text-sm">None yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {ordered.map((f: Fulfillment) => (
              <div key={f.id} className="bg-surface/50 border border-border rounded-2xl p-4 opacity-70">
                <p className="text-ink font-medium">{f.orderItem.product.title}</p>
                <p className="text-sm text-ink-soft mt-1">Qty: {f.orderItem.quantity}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}