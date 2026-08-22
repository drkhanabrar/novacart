import Link from "next/link";

export default function ShippingPage() {
  return <PolicyPage kicker="Shipping" title="Delivery, without the guesswork." sections={[
    ["Delivery window", "NovaCart currently targets tracked delivery in approximately 3–6 business days after an order is confirmed. Actual delivery times can vary by destination, carrier and product availability."],
    ["Delivery fee", "Orders of ₹999 or more qualify for free delivery. Orders below that threshold currently use the standard ₹79 delivery charge shown at checkout."],
    ["Tracking", "Where carrier tracking is available, tracking details are added to the order once the shipment is handed over."],
    ["Address changes", "Contact NovaCart as soon as possible if you need to correct an address. An address cannot be guaranteed to change after fulfilment has begun."],
  ]} />;
}

function PolicyPage({ kicker, title, sections }: { kicker: string; title: string; sections: [string,string][] }) {
  return <main className="mx-auto max-w-4xl px-5 py-12 sm:px-6 sm:py-16"><Link href="/" className="text-sm font-semibold text-ink-soft hover:text-poppy">← Back to NovaCart</Link><div className="mt-8"><span className="section-kicker">{kicker}</span><h1 className="mt-2 font-display text-4xl italic text-ink sm:text-5xl">{title}</h1><div className="mt-10 space-y-5">{sections.map(([h,p])=><section key={h} className="rounded-[2rem] border border-ink/10 bg-card p-6 shadow-sm sm:p-7"><h2 className="text-lg font-bold text-ink">{h}</h2><p className="mt-2 text-sm leading-7 text-ink-soft">{p}</p></section>)}</div></div></main>;
}
