# NovaCart NOVA Market Engine v2.1 — Zero-Cost Research Mode

NOVA's pre-revenue research mode deliberately avoids paid search APIs. It uses public/free market evidence first and Claude (Anthropic) for evidence-grounded synthesis.

## Evidence stack

- Google Trends: current India interest, direction, velocity and Shopping/Froogle interest. Google Trends exposes current Trending Now data for India.
- Google News RSS: fresh news volume/recency around the candidate.
- Reddit public search JSON: community discussion and engagement proxy.
- YouTube public search: keyless, unofficial demand/view proxy. The parser can break or be rate-limited, so failures reduce confidence rather than creating fake data.
- DuckDuckGo public HTML results: open-web competition proxy and retail-domain diversity.
- Amazon India public search snapshot: visible product-card count, high-review-product count and visible median price. This is an unofficial snapshot, not a complete marketplace census.
- CJ supplier catalog: live supplier match and supplier pricing when the account/API is available.
- NovaCart first-party order/refund data: becomes progressively more important after the store has real customers.
- Claude: multi-source classification and portfolio-level synthesis.

Paid `SERPAPI_API_KEY` and `YOUTUBE_API_KEY` remain optional future enrichments; they are not required for baseline research.

## Why this is honest

No system can guarantee a successful product line. NOVA therefore separates evidence from inference, keeps UNKNOWN values explicit, and uses PUBLISH / REVIEW / REJECT rather than pretending certainty. Competition is a snapshot/proxy, return risk is initially a category/market proxy, and actual NovaCart refund behavior is used only once enough first-party data exists.

## Publication policy

The scheduled GitHub Actions job is **dry-run only**. Publication is an explicit manual workflow dispatch. When publication is enabled, NOVA publishes at most `NOVA_MAX_AUTOPUBLISH_PER_RUN` candidates selected from the qualified pool, with Claude's portfolio shortlist used when available.

Default: `NOVA_MAX_AUTOPUBLISH_PER_RUN=3`.

## Required pre-revenue secrets

```text
DATABASE_URL
CJ_API_KEY
ANTHROPIC_API_KEY
NOVA_RESEARCH_TOKEN
```

Optional later:

```text
SERPAPI_API_KEY
YOUTUBE_API_KEY
USD_TO_INR_RATE
```

## Run locally

```powershell
npm run research:market -- --limit=30
```

Manual publication after reviewing the run:

```powershell
npm run research:market -- --limit=30 --publish
```

## Current operating objective

NOVA should favor products that combine:

1. Current or rising demand
2. Shopping intent
3. Lower competitive pressure than obvious saturated products
4. Healthy contribution margin after shipping/payment buffers
5. Low return risk
6. Low service/support burden
7. Easy fulfilment
8. Repeat/replenishment potential where supported by evidence
9. Supplier availability

This is a decision system, not a guarantee engine.
