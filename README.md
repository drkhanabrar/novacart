# NovaCart

An autonomous e-commerce intelligence and merchandising system.

- **NovaCart** is the store — the execution surface customers see.
- **NOVA AI** is the backend intelligence layer behind it.
- The data layer is its memory, the feedback loop its learning mechanism, the
  decision engine its judgement, and the market itself the ultimate evaluator.

## The loop

| Stage | Where it lives |
| --- | --- |
| 1. Research external signals | `market-signals`, `open-market-sources`, `competition-signals`, `cj-supplier` |
| 2. Understand — trend or noise | `market-analyst`, `product-expander` |
| 3. Score candidates | `nova-market-engine` + `nova-weights` |
| 4. Select the product range | `market-portfolio-analyst` |
| 5. Create the listing | `listing-generator` |
| 6. Watch the product | `telemetry`, `performance-intelligence`, `product-lifecycle` |
| 7. Predict decline before it happens | `decline-forecast` |
| 8. Learn from outcomes | `learning-engine`, `nova-decisions` |

Stages 1–5 are documented in [`NOVA_MARKET_ENGINE_V2.md`](./NOVA_MARKET_ENGINE_V2.md).
Stages 6–8 are documented in [`NOVA_INTELLIGENCE.md`](./NOVA_INTELLIGENCE.md).

NOVA is deliberately not one large agent. It is a set of narrow engines writing
to a shared, auditable data layer, so every decision can be traced back to the
evidence that produced it. If you cannot answer *why did NOVA select this
product, and was it right*, the system is not doing its job.

## Getting started

```bash
npm install
cp .env.example .env.local        # fill in DATABASE_URL and NOVA_RESEARCH_TOKEN
npx prisma migrate dev
npm run dev
```

`.env.example` documents every variable with its default and why it exists.

## Running NOVA

```bash
npm run research:market           # discover and score candidates (dry run)
npm run research:market -- --publish   # publish those that clear every gate

npm run rollup                    # aggregate storefront events into daily metrics
npm run lifecycle                 # re-judge the live catalogue on current evidence
npm run learn                     # grade past predictions and report
npm run learn:apply               # allow a weight promotion if evidence supports it
```

Scheduled equivalents live in `.github/workflows/`. Publishing and weight
promotion are both manual-dispatch only; the scheduled runs report and never
commit you to anything irreversible.

Admin view: `/admin/nova?key=<NOVA_RESEARCH_TOKEN>`

## Cost posture

The system runs on free tiers by default and is meant to stay that way until the
store earns.

- AI calls go through a free chain — OpenRouter, then Gemini, then Hugging Face.
  Anthropic is never called unless `NOVA_ALLOW_PAID_AI_FALLBACK=true`.
- Market evidence comes from public sources: Google Trends, Google News RSS,
  Reddit's public JSON, DuckDuckGo HTML, and an Amazon India search snapshot.
  `SERPAPI_API_KEY` and `TAVILY_API_KEY` are optional enrichments, not
  requirements.
- Raw telemetry is pruned after 45 days once rolled into daily metrics, so the
  database stays inside a free Postgres tier indefinitely.

## What NOVA will not do

This is a decision system, not a guarantee engine. Several behaviours look like
faults but are deliberate:

- It reports funnel rates as unknown below 30 impressions rather than computing
  a number from noise.
- It will not change its scoring weights until 40 predictions have been graded
  against reality.
- It proposes retirements and waits for you, unless `NOVA_AUTONOMOUS_RETIRE` is
  explicitly turned on.

For roughly the first month of a new catalogue it will therefore hold everything
in TEST and retire nothing. That is the system working correctly.
