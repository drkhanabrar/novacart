# NOVA Intelligence Layer

This document covers the half of the NOVA loop that runs *after* a product is
published: watching it, predicting its decline, and learning from what actually
happened.

The research half — signal gathering, scoring, candidate selection, listing
generation — is documented in `NOVA_MARKET_ENGINE_V2.md` and is unchanged apart
from where it now reads its scoring weights from.

## Why this exists

Before this layer, NOVA scored products, published them, and never found out
whether it had been right. The only post-publication signal in the entire system
was `orderItems.length`, and the lifecycle rule was two-outcome: keep the
product, or set `isActive: false` after two low readings or fourteen days with no
sale.

That has three consequences worth stating plainly:

1. **Orders are a lagging, extremely sparse signal.** A new catalogue can run for
   weeks without one. Judging products on order count alone means judging them on
   near-silence.
2. **Nothing recorded what NOVA believed before it acted**, so "how accurate were
   its previous predictions?" was unanswerable and the weights could never
   improve.
3. **The scoring weights were hardcoded in two places that had already drifted.**
   `nova-core.ts` used demand 0.24 / competition 0.14; `nova-market-engine.ts`
   used 0.22 / 0.16. The same product scored differently depending on which entry
   point evaluated it.

## The loop, end to end

```
research → score → publish ─┬─→ lifecycle registered (TEST, 45% exposure)
                            └─→ prediction recorded with its signal vector
                                        ↓
                    storefront telemetry (impressions, views, add-to-cart)
                                        ↓
                    daily rollup → ProductDailyMetric
                                        ↓
              lifecycle pass: performance + decline forecast → state + exposure
                                        ↓
                    horizon elapses → prediction graded against reality
                                        ↓
              learning pass: signal correlations → candidate weight version
                                        ↓
                    promoted only if it ranks past outcomes better
```

## What each module does

| Module | Responsibility |
| --- | --- |
| `nova-contracts.ts` | Shared string unions and the sample-size floors everything else obeys |
| `nova-weights.ts` | Versioned, learnable weight registry; single source of scoring truth |
| `telemetry.ts` | Event ingestion, daily rollup, retention pruning |
| `purchase-telemetry.ts` | Server-only purchase and refund events |
| `performance-intelligence.ts` | Funnel rates, trend slopes, catalogue-relative benchmarks |
| `decline-forecast.ts` | Forward-looking decline probability with a readable driver list |
| `product-lifecycle.ts` | The eight-state machine and the exposure lever |
| `nova-decisions.ts` | Decision, prediction and outcome ledger |
| `learning-engine.ts` | Grades predictions, proposes and promotes weight versions |
| `nova-auth.ts` | Bearer-token check for the operational endpoints |

## The lifecycle states

```
CANDIDATE → TEST → LISTED → LEARNING → SCALING → MATURE → DECLINING → RETIRED
```

Exposure is a merchandising weight from 0 to 100 that the storefront sorts by:

| State | Exposure | Meaning |
| --- | --- | --- |
| `TEST` | 45 | Newly published, gathering evidence, deliberately not dominant |
| `LISTED` | 60 | Performing within normal range |
| `LEARNING` | 60 | Has traffic, no verdict yet |
| `SCALING` | 95 | Selling above the catalogue median — push it |
| `MATURE` | 75 | Steady, established |
| `DECLINING` | 25 | Deteriorating; exposure cut, still visible |
| `RETIRED` | 0 | Removed from the storefront |

**A declining product keeps a reduced presence rather than disappearing.** This
is deliberate. Cutting exposure to zero also cuts off the signal that would tell
NOVA whether its own forecast was correct, which is exactly the data the learning
pass needs.

**Retirement is proposed, not applied.** By default NOVA raises a pending action
visible at `/admin/nova` and waits. Set `NOVA_AUTONOMOUS_RETIRE=true` only once
you trust its accuracy numbers.

## Honesty rules built into the code

These are the constraints most likely to be mistaken for bugs, so they are worth
knowing about:

- **Funnel rates return `null` below 30 impressions.** A conversion rate computed
  from twelve impressions is not a fact. Returning `0.083` and letting a
  downstream engine treat it as one is how a system teaches itself nonsense.
- **The learning engine will not move a single weight below 40 graded outcomes.**
  It prints what it *would* have changed instead. Fitting twelve weights to a
  handful of early sales produces confident garbage that is very hard to detect
  later.
- **A new weight version is never trusted on theory.** It is scored against the
  same historical sample as the incumbent and promoted only if it ranks real
  outcomes better by a margin wide enough that noise cannot explain it.
- **No weight may move more than 0.02 per pass**, or leave `[0.01, 0.35]`. One
  bad quarter should not convince NOVA that margin does not matter.
- **Decline forecasts return `probability: null`** when neither behaviour nor
  market signals justify a claim. The lifecycle treats that as "keep observing",
  never as a reason to act.
- **Products are judged against the median of your own catalogue**, not against
  generic industry benchmarks. "A good conversion rate is 2%" says very little
  about a store with no traffic history and no brand recognition.

The practical consequence: **for roughly the first month NOVA will hold
everything in TEST and retire nothing.** That is correct behaviour, not a fault.

## Privacy and cost

`anonId` and `sessionId` are pseudonymous browser identifiers held in
`localStorage` and `sessionStorage`. Neither is linked to a user account, and
clearing browser storage genuinely resets them. If storage is blocked, events
still count — just anonymously.

Raw events are pruned after `NOVA_EVENT_RETENTION_DAYS` (default 45) once rolled
into daily metrics, so row count stays inside a free Postgres tier indefinitely.
Only the small daily rollup is kept long-term.

## Environment variables

All of the following are optional and have working defaults.

### Free AI chain

| Variable | Default | Purpose |
| --- | --- | --- |
| `NOVA_FREE_AI_ORDER` | `openrouter,gemini,huggingface` | Order the free providers are tried in |
| `NOVA_GEMINI_MODEL` | `gemini-2.0-flash` | Flash, not Pro — the free allowance is far larger |
| `NOVA_HF_MODEL` | `meta-llama/Llama-3.1-8B-Instruct` | Last free fallback |
| `NOVA_ALLOW_PAID_AI_FALLBACK` | `false` | Anthropic stays unused unless this is `true` |

`GEMINI_API_KEY` and `HF_API_KEY` were already in your `.env.local` but nothing
referenced them. They are now the second and third links in the chain.

### Lifecycle

| Variable | Default | Purpose |
| --- | --- | --- |
| `NOVA_GRACE_DAYS` | `14` | Days a new product is protected from negative action |
| `NOVA_DELIST_SCORE` | `42` | Composite score floor |
| `NOVA_DECLINE_THRESHOLD` | `0.6` | Decline probability that moves a product to DECLINING |
| `NOVA_DECLINE_READINGS` | `3` | Consecutive deteriorating reviews before retirement is proposed |
| `NOVA_DECLINE_HORIZON_DAYS` | `28` | Forecast horizon |
| `NOVA_SUCCESS_HORIZON_DAYS` | `28` | Horizon for the success prediction made at publish |
| `NOVA_AUTONOMOUS_RETIRE` | `false` | When `true`, NOVA retires without asking |

### Telemetry

| Variable | Default | Purpose |
| --- | --- | --- |
| `NOVA_EVENT_RETENTION_DAYS` | `45` | Raw events pruned after this many days |
| `NOVA_TRACK_RATE_LIMIT` | `60` | Max tracking requests per IP per minute |

`NOVA_RESEARCH_TOKEN` gates every operational endpoint and the admin page. **If
it is unset, access is denied rather than allowed** — failing open on a missing
variable is how a scheduled job quietly becomes a public endpoint.

## Setup

```bash
# 1. Migrate — review the generated SQL before applying it in production
npx prisma migrate dev --name nova-intelligence-layer

# 2. Seed the baseline weight version (also runs automatically on first pass)
npm run lifecycle

# 3. Confirm telemetry is arriving after some storefront traffic
npm run rollup
```

Admin view: `/admin/nova?key=<NOVA_RESEARCH_TOKEN>`

## Running it

```bash
npm run rollup              # aggregate events into daily metrics, prune old rows
npm run lifecycle           # roll up, then re-judge the live catalogue
npm run learn               # grade past predictions and report (dry run)
npm run learn:apply         # allow a weight promotion if the evidence supports it
```

Scheduled equivalents live in `.github/workflows/`. The learning workflow is
**report-only on a schedule**; promoting weights requires a manual dispatch with
`apply=true`, because it changes how every future product is scored.

## Reading the admin page

The page shows what NOVA acted on, including the predictions it got wrong. That
is intentional — a dashboard that hides bad calls would defeat the purpose of
recording them. The numbers worth watching:

- **Prediction accuracy by kind.** If `DEMAND_DECLINE` sits near 50% correct,
  the forecast is not yet earning its keep and `NOVA_AUTONOMOUS_RETIRE` should
  stay off.
- **Signal correlations** (printed by `npm run learn`). These show which of your
  research signals actually predicted sales *in your business*, which is the
  distinction that makes the loop worth building.
- **Catalogue baseline.** Until it shows real impressions, every judgement below
  it is running on external market signals alone.
