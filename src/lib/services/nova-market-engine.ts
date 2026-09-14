// FILE: src/lib/services/nova-market-engine.ts

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

import {
  getMarketSignals,
  calculateDemandScore,
} from "./market-signals";

import {
  getCompetitionSignal,
} from "./competition-signals";

import {
  getOpenMarketWebSignal,
} from "./open-market-sources";

import {
  searchSupplierProducts,
  pickBestSupplierMatch,
  resolveSupplierVariant,
} from "./cj-supplier";

import {
  assessCandidate,
} from "./market-analyst";

import {
  synthesizePortfolio,
} from "./market-portfolio-analyst";

import {
  getUsdToInrRate,
} from "./fx-rate";

import {
  generateListing,
} from "./listing-generator";

import {
  expandProductIdeas,
  isConcreteProduct,
  type ProductIdea,
} from "./product-expander";

import {
  startLifecycle,
} from "./product-lifecycle";

import {
  resolveStoreCategory,
} from "./store-categories";

import {
  recordPrediction,
  recordDecision,
} from "./nova-decisions";

import {
  getActiveWeights,
  computeNovaScore,
} from "./nova-weights";

const REGION =
  process.env.NOVA_MARKET_REGION ||
  "IN";

const MIN_DEMAND =
  Number(
    process.env.NOVA_MIN_DEMAND_SCORE ||
      55,
  );

const MIN_MARGIN =
  Number(
    process.env.NOVA_MIN_MARGIN_PERCENT ||
      22,
  );

/*
 * Nominal stock for a dropshipped variant.
 *
 * CJ holds the inventory, so this is an availability flag rather than a count.
 * It must be greater than zero or the storefront's stock filter hides the
 * product entirely.
 */
const DROPSHIP_STOCK =
  Number(
    process.env.NOVA_DROPSHIP_STOCK ||
      100,
  );

/*
 * CJ price strings.
 *
 * sellPrice is a string that may be a scalar ("12.99") or a range
 * ("5.24 -- 8.87", "27.41 – 470.83"). Separators vary: single hyphen, double
 * hyphen, en dash.
 */
function isPriceRange(
  value: unknown,
): boolean {
  return /\d(?:\.\d+)?\s*[-–—]{1,3}\s*\d/.test(
    String(value ?? ""),
  );
}

/// Upper bound of a range, or the scalar value. Null when unparseable.
function resolveSupplierCostUsd(
  value: unknown,
): number | null {
  if (
    typeof value ===
    "number"
  ) {
    return Number.isFinite(
      value,
    ) && value > 0
      ? value
      : null;
  }

  const text = String(
    value ?? "",
  ).trim();

  if (!text) return null;

  const numbers = (
    text.match(
      /\d+(?:\.\d+)?/g,
    ) ?? []
  )
    .map(Number)
    .filter(
      (
        candidate,
      ) =>
        Number.isFinite(
          candidate,
        ) && candidate > 0,
    );

  if (
    numbers.length === 0
  ) {
    return null;
  }

  const low = Math.min(
    ...numbers,
  );

  const high = Math.max(
    ...numbers,
  );

  /*
   * Reject implausibly wide ranges.
   *
   * A CJ range of "27.41 -- 470.83" is a 17x spread. That is not one product
   * with variants, it is a listing covering wildly different items, and taking
   * the upper bound produces a nonsense cost (a Bluetooth speaker at 44,000
   * INR). Where the spread is that wide the product identity itself is
   * unreliable, so the honest answer is that cost is unknown.
   */
  if (
    low > 0 &&
    high / low > 4
  ) {
    return null;
  }

  // Worst-case cost within a plausible range.
  return high;
}

const MIN_SCORE =
  Number(
    process.env.NOVA_AUTO_PUBLISH_MIN_SCORE ||
      78,
  );

const MIN_CONF =
  Number(
    process.env.NOVA_AUTO_PUBLISH_MIN_CONFIDENCE ||
      80,
  );

const SHIPPING =
  Number(
    process.env.NOVA_SHIPPING_BUFFER_INR ||
      120,
  );

const FEE =
  Number(
    process.env.NOVA_PAYMENT_FEE_PERCENT ||
      2,
  );

/*
 * Scarce AI budget.
 *
 * This is deliberately separate from --limit:
 *
 * --limit=20
 *     => at most 20 candidates receive deep market/CJ evidence analysis.
 *
 * NOVA_MAX_AI_ANALYSES=6
 *     => only the strongest 6 of those candidates may call the LLM.
 */
const MAX_AI_ANALYSES =
  Math.max(
    1,
    Math.min(
      /*
       * The hard cap used to be 12, which silently overrode any larger value in
       * the environment. A ceiling that quietly contradicts a setting is worse
       * than no setting at all, so the env var is now the real control and this
       * only guards against a typo costing a whole day's quota.
       *
       * The practical limit is the provider, not this number. Free-tier Gemini
       * quotas are per-model and per-project: the newest Flash models can be as
       * low as 20 requests/day, while Flash-Lite variants allow far more and are
       * better suited to classification work like NOVA's anyway. Check the real
       * ceiling for your key in AI Studio before raising this.
       */
      60,
      Number(
        process.env.NOVA_MAX_AI_ANALYSES ||
          12,
      ),
    ),
  );

const CJ_MIN_MATCH_CONFIDENCE =
  Math.max(
    50,
    Math.min(
      95,
      Number(
        process.env.NOVA_CJ_MIN_MATCH_CONFIDENCE ||
          58,
      ),
    ),
  );

const DISCOVERY_TIMEOUT_MS =
  Math.max(
    5000,
    Number(
      process.env.NOVA_DISCOVERY_TIMEOUT_MS ||
        20000,
    ),
  );

const PORTFOLIO_MIN_SCORE =
  Number(
    process.env.NOVA_PORTFOLIO_MIN_SCORE ||
      65,
  );

const PORTFOLIO_MIN_CONFIDENCE =
  Number(
    process.env
      .NOVA_PORTFOLIO_MIN_CONFIDENCE ||
      70,
  );

function slugify(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-",
    )
    .replace(
      /(^-|-$)/g,
      "");
}

function normalize(
  value: string,
) {
  return value
    .toLowerCase()
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function asInputJson(
  value: unknown,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value),
  ) as Prisma.InputJsonValue;
}

async function withTimeout<T>(
  promise: Promise<T>,
  label: string,
  timeoutMs =
    DISCOVERY_TIMEOUT_MS,
): Promise<T> {
  let timer:
    | ReturnType<
        typeof setTimeout
      >
    | undefined;

  const timeout =
    new Promise<never>(
      (
        _resolve,
        reject,
      ) => {
        timer =
          setTimeout(
            () => {
              reject(
                new Error(
                  `${label} timed out after ${timeoutMs}ms`,
                ),
              );
            },
            timeoutMs,
          );
      },
    );

  try {
    return await Promise.race(
      [
        promise,
        timeout,
      ],
    );
  } finally {
    if (timer) {
      clearTimeout(
        timer,
      );
    }
  }
}

/*
 * --------------------------------------------------------------------------
 * PRODUCT FAMILY NORMALIZATION
 * --------------------------------------------------------------------------
 */

function productFamilyKey(
  keyword: string,
) {
  let value =
    normalize(
      keyword,
    );

  const replacements:
    Array<
      [
        RegExp,
        string,
      ]
    > = [
      [
        /\bdrum\b/g,
        "",
      ],
      [
        /\btub\b/g,
        "",
      ],
      [
        /\btablets?\b/g,
        "",
      ],
      [
        /\bpowder\b/g,
        "",
      ],
      [
        /\bsheets?\b/g,
        "",
      ],
      [
        /\bstrips?\b/g,
        "",
      ],
      [
        /\bpacks?\b/g,
        "",
      ],
      [
        /\bsets?\b/g,
        "",
      ],
      [
        /\bwith\b/g,
        " ",
      ],
      [
        /\bkit\b/g,
        "",
      ],
    ];

  for (
    const [
      pattern,
      replacement,
    ] of replacements
  ) {
    value =
      value.replace(
        pattern,
        replacement,
      );
  }

  if (
    /\bwashing machine\b/.test(
      value,
    ) &&
    /(clean|cleaner|cleaning)/.test(
      value,
    )
  ) {
    return "washing machine cleaner";
  }

  if (
    /\btoilet\b/.test(
      value,
    ) &&
    /(clean|cleaner|cleaning|stain|bowl)/.test(
      value,
    ) &&
    !/(brush|holder|stand)/.test(
      value,
    )
  ) {
    return "toilet cleaner";
  }

  if (
    /\bdishwash|dish washer\b/.test(
      value,
    ) &&
    /(clean|cleaner|cleaning)/.test(
      value,
    )
  ) {
    return "dishwasher cleaner";
  }

  if (
    /\bmicrofiber\b/.test(
      value,
    ) &&
    /(cloth|wipe|clean)/.test(
      value,
    )
  ) {
    return "microfiber cleaning cloth";
  }

  if (
    /\btrash|garbage\b/.test(
      value,
    ) &&
    /\bbag/.test(
      value,
    )
  ) {
    return "household garbage bags";
  }

  if (
    /\bpet waste\b/.test(
      value,
    ) &&
    /\bbag/.test(
      value,
    )
  ) {
    return "pet waste bags";
  }

  if (
    /\bair freshener\b/.test(
      value,
    ) &&
    /\brefill/.test(
      value,
    )
  ) {
    return "air freshener refill";
  }

  return value
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

/*
 * --------------------------------------------------------------------------
 * DISCOVERY
 * --------------------------------------------------------------------------
 */

async function fetchGoogleTrendsText(
  url: string,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(DISCOVERY_TIMEOUT_MS, 15000),
  );

  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
        Accept:
          "application/rss+xml,application/json,text/plain,text/html;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-IN,en;q=0.9",
      },
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `Google Trends ${response.status} ${response.statusText}`,
      );
    }

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function stripGoogleXssiPrefix(
  value: string,
): string {
  const text = value.trim();
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");

  const start =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
        ? objectStart
        : Math.min(objectStart, arrayStart);

  if (start < 0) {
    throw new Error(
      "Google Trends returned non-JSON content",
    );
  }

  return text.slice(start);
}

function decodeXmlText(
  value: string,
): string {
  return value
    .replace(
      /<!\[CDATA\[([\s\S]*?)\]\]>/g,
      "$1",
    )
    .replace(
      /&amp;/g,
      "&",
    )
    .replace(
      /&quot;/g,
      '"',
    )
    .replace(
      /&#39;/g,
      "'",
    )
    .replace(
      /&lt;/g,
      "<",
    )
    .replace(
      /&gt;/g,
      ">",
    )
    .replace(/\s+/g, " ")
    .trim();
}

async function getDailyTrends(): Promise<
  string[]
> {
  try {
    console.log(
      "NOVA DISCOVERY: fetching Google Trending Now RSS...",
    );

    const raw = await withTimeout(
      fetchGoogleTrendsText(
        `https://trends.google.com/trending/rss?geo=${encodeURIComponent(REGION)}`,
      ),
      "Google Trending Now RSS",
    );

    const itemBlocks =
      raw.match(
        /<item>[\s\S]*?<\/item>/gi,
      ) || [];

    const queries: string[] = [];

    for (
      const block of itemBlocks.slice(
        0,
        100,
      )
    ) {
      const title =
        block.match(
          /<title>([\s\S]*?)<\/title>/i,
        )?.[1];

      const query = decodeXmlText(
        String(title || ""),
      );

      if (query) {
        queries.push(query);
      }
    }

    console.log(
      `NOVA DISCOVERY: Google Trending Now RSS returned ${queries.length} trends`,
    );

    return [
      ...new Set(queries),
    ];
  } catch (
    error
  ) {
    console.warn(
      "NOVA DISCOVERY: Google Trending Now RSS unavailable:",
      error instanceof Error
        ? error.message
        : String(error),
    );

    return [];
  }
}

async function getGoogleAutocomplete(
  seed: string,
): Promise<string[]> {
  const url =
    `https://trends.google.com/trends/api/autocomplete/${encodeURIComponent(seed)}` +
    `?hl=en-IN&tz=-330`;

  const raw = await withTimeout(
    fetchGoogleTrendsText(url),
    `Google autocomplete for ${seed}`,
  );

  const parsed = JSON.parse(
    stripGoogleXssiPrefix(raw),
  ) as {
    default?: {
      topics?: Array<{
        title?: string;
      }>;
      queries?: Array<{
        title?: string;
      }>;
    };
  };

  const suggestions = [
    ...(parsed.default?.topics || []).map(
      (item) =>
        String(item?.title || "").trim(),
    ),
    ...(parsed.default?.queries || []).map(
      (item) =>
        String(item?.title || "").trim(),
    ),
  ].filter(Boolean);

  return [
    ...new Set(suggestions),
  ];
}

async function getRelatedQueries(
  seeds: string[],
): Promise<
  string[]
> {
  const queries: string[] = [];

  /*
   * Seed sampling.
   *
   * This was seeds.slice(0, 15) - the FIRST fifteen, every single run. With a
   * 108-seed file that meant 93 seeds were never read, and because the list
   * happened to open with kitchen and storage domains, every research run
   * returned household products and nothing else. Broadening the seed file had
   * no effect at all while this line stood.
   *
   * The window now rotates by ISO week, so consecutive weekly runs explore
   * different parts of the list and the whole file is covered over a cycle.
   * Rotation rather than random selection keeps a run reproducible: the same
   * week always explores the same seeds, which matters when you are trying to
   * work out why a candidate appeared.
   */
  const perRun = Number(
    process.env
      .NOVA_SEEDS_PER_RUN || 18,
  );

  const week = Math.floor(
    Date.now() /
      (7 * 24 * 60 * 60 * 1000),
  );

  /*
   * NOVA_SEED_OFFSET forces a specific window.
   *
   * Rotation is right for the scheduled weekly job, but it makes exploring a
   * category on demand impossible - you would have to wait for its turn. Set
   * this to the index you want to start from when you want to research a
   * particular part of the catalogue now. Leave it unset for normal rotation.
   */
  const forcedOffset = Number(
    process.env.NOVA_SEED_OFFSET,
  );

  const offset =
    seeds.length === 0
      ? 0
      : Number.isFinite(
            forcedOffset,
          ) && forcedOffset >= 0
        ? forcedOffset %
          seeds.length
        : (week * perRun) %
          seeds.length;

  console.log(
    `NOVA DISCOVERY: seed window ${offset}-${offset + perRun - 1} of ${seeds.length}${
      Number.isFinite(forcedOffset)
        ? " (forced via NOVA_SEED_OFFSET)"
        : " (weekly rotation)"
    }`,
  );

  const seedList =
    seeds.length <= perRun
      ? seeds
      : [
          ...seeds,
          ...seeds,
        ].slice(
          offset,
          offset + perRun,
        );

  console.log(
    `NOVA DISCOVERY: fetching Google Trends autocomplete suggestions for ${seedList.length} seeds...`,
  );

  for (
    const seed of seedList
  ) {
    try {
      console.log(
        `NOVA DISCOVERY: related trends → ${seed}`,
      );

      const suggestions =
        await getGoogleAutocomplete(
          seed,
        );

      queries.push(
        ...suggestions,
      );
    } catch (
      error
    ) {
      console.warn(
        `NOVA DISCOVERY: Google autocomplete failed for ${seed}:`,
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }

  console.log(
    `NOVA DISCOVERY: Google Trends autocomplete queries collected: ${queries.length}`,
  );

  return [
    ...new Set(queries),
  ];
}

async function buildProductCandidates(
  seeds: string[],
  requestedLimit: number,
) {
  console.log(
    "NOVA DISCOVERY: starting live trend discovery...",
  );

  const [
    daily,
    related,
  ] =
    await Promise.all(
      [
        getDailyTrends(),
        getRelatedQueries(
          seeds,
        ),
      ],
    );

  console.log(
    `NOVA DISCOVERY: trends ready — daily=${daily.length}, related=${related.length}`,
  );

  const freshQueries =
    [
      ...daily,
      ...related,
    ];

  const expandedLimit =
    Math.min(
      Math.max(
        requestedLimit *
          5,
        60,
      ),
      Number(
        process.env
          .NOVA_MAX_EXPANDED_CANDIDATES ||
          120,
      ),
    );

  console.log(
    `NOVA DISCOVERY: expanding product ideas (limit=${expandedLimit})...`,
  );

  const expansion =
    await withTimeout(
      expandProductIdeas(
        seeds,
        freshQueries,
        expandedLimit,
      ),
      "NOVA product expansion",
      Number(
        process.env
          .NOVA_EXPANSION_TIMEOUT_MS ||
          60000,
      ),
    );

  console.log(
    `NOVA DISCOVERY: product expansion returned ${expansion.ideas.length} ideas`,
  );

  const seen =
    new Set<string>();

  const ideas:
    ProductIdea[] =
    [];

  for (
    const item of
      expansion.ideas
  ) {
    const key =
      normalize(
        item.keyword,
      );

    if (
      !key ||
      seen.has(
        key,
      ) ||
      !isConcreteProduct(
        key,
      )
    ) {
      continue;
    }

    seen.add(
      key,
    );

    ideas.push(
      {
        ...item,
        keyword:
          key,
      },
    );
  }

  /*
   * Deterministic product-family deduplication.
   *
   * We retain the strongest representative of each family during discovery
   * but do NOT claim that discovery ranking itself is final opportunity rank.
   */
  const familyMap =
    new Map<
      string,
      ProductIdea
    >();

  const familyPriority =
    (
      idea: ProductIdea,
    ) => {
      let score =
        0;

      if (
        idea.demandType ===
        "REPLENISHMENT"
      ) {
        score +=
          40;
      } else if (
        idea.demandType ===
        "HYBRID"
      ) {
        score +=
          25;
      } else if (
        idea.demandType ===
        "TREND"
      ) {
        score +=
          20;
      } else {
        score +=
          10;
      }

      if (
        idea.likelyRepeat
      ) {
        score +=
          15;
      }

      return score;
    };

  for (
    const idea of
      ideas
  ) {
    const family =
      productFamilyKey(
        idea.keyword,
      );

    const existing =
      familyMap.get(
        family,
      );

    if (
      !existing ||
      familyPriority(
        idea,
      ) >
        familyPriority(
          existing,
        )
    ) {
      familyMap.set(
        family,
        idea,
      );
    }
  }

  const finalIdeas =
    Array.from(
      familyMap.values(),
    );

  console.log(
    `NOVA DISCOVERY: ${finalIdeas.length} normalized product families ready`,
  );

  return {
    ideas:
      finalIdeas,

    dailyTrendCount:
      daily.length,

    relatedQueryCount:
      related.length,

    usedAnthropic:
      expansion.usedAnthropic,
  };
}

/*
 * --------------------------------------------------------------------------
 * MARKET EVIDENCE
 * --------------------------------------------------------------------------
 */

interface PrefetchedCandidateEvidence {
  openWeb: Awaited<
    ReturnType<
      typeof getOpenMarketWebSignal
    >
  >;

  market: Awaited<
    ReturnType<
      typeof getMarketSignals
    >
  >;

  competition: Awaited<
    ReturnType<
      typeof getCompetitionSignal
    >
  >;

  suppliers: Awaited<
    ReturnType<
      typeof searchSupplierProducts
    >
  >;
}

async function collectCandidateEvidence(
  keyword: string,
): Promise<
  PrefetchedCandidateEvidence
> {
  const openWeb =
    await getOpenMarketWebSignal(
      keyword,
    );

  const [
    market,
    competition,
    suppliers,
  ] =
    await Promise.all(
      [
        getMarketSignals(
          keyword,
          {
            geo:
              REGION,

            useShoppingSignal:
              true,

            openWebSignal:
              openWeb,
          },
        ),

        getCompetitionSignal(
          keyword,
          openWeb,
        ),

        searchSupplierProducts(
          keyword,
          16,
        ).catch(
          () => [],
        ),
      ],
    );

  return {
    openWeb,
    market,
    competition,
    suppliers,
  };
}

/*
 * Cheap deterministic pre-AI ranking.
 *
 * This is NOT the final NOVA opportunity score.
 * Its sole purpose is deciding which candidates deserve scarce LLM analysis.
 */
function preliminaryAiRank(
  idea: ProductIdea,
  evidence:
    PrefetchedCandidateEvidence,
) {
  const demand =
    calculateDemandScore(
      evidence.market,
    );

  const supplier =
    pickBestSupplierMatch(
      evidence.suppliers,
      idea.keyword,
      CJ_MIN_MATCH_CONFIDENCE,
    );

  const supplierScore =
    supplier
      ?.confidence ??
    0;

  const competitionScore =
    evidence.competition
      .competitionScore ??
    0;

  const freshness =
    Math.min(
      100,
      Math.round(
        Math.min(
          40,
          evidence.market
            .recentNewsCount *
            5,
        ) +
          Math.min(
            30,
            evidence.market
              .youtubeVideoCount *
              2,
          ) +
          Math.min(
            30,
            evidence.market
              .redditPostCount *
              2,
          ),
      ),
    );

  let archetypePrior =
    5;

  if (
    idea.demandType ===
    "REPLENISHMENT"
  ) {
    archetypePrior =
      18;
  } else if (
    idea.demandType ===
    "HYBRID"
  ) {
    archetypePrior =
      14;
  } else if (
    idea.demandType ===
    "TREND"
  ) {
    archetypePrior =
      15;
  } else if (
    idea.demandType ===
    "UTILITY"
  ) {
    archetypePrior =
      12;
  }

  if (
    idea.likelyRepeat
  ) {
    archetypePrior +=
      8;
  }

  return Math.round(
    demand.overallScore *
      0.28 +
      demand.shoppingDemand *
        0.14 +
      demand.trendDemand *
        0.10 +
      competitionScore *
        0.14 +
      supplierScore *
        0.25 +
      freshness *
        0.04 +
      Math.min(
        20,
        archetypePrior,
      ),
  );
}

/*
 * --------------------------------------------------------------------------
 * COMMERCIAL LOGIC
 * --------------------------------------------------------------------------
 */

type CommercialSanityStatus =
  | "PASS"
  | "FAIL"
  | "UNKNOWN";

interface CommercialSanity {
  status:
    CommercialSanityStatus;

  reason:
    string;

  marketPriceInr:
    number | null;

  supplierCostInr:
    number | null;

  ratio:
    number | null;

  confidence:
    number;

  flags:
    string[];
}

function assessCommercialSanity(
  params: {
    keyword: string;

    productType:
      string;

    supplierCostInr:
      number | null;

    marketPriceInr:
      number | null;

    marketPriceSource:
      "AMAZON" | "NONE";

    supplierKnown:
      boolean;
  },
): CommercialSanity {
  const {
    supplierCostInr,
    marketPriceInr,
    marketPriceSource,
    supplierKnown,
    productType,
  } =
    params;

  const flags:
    string[] =
    [];

  /*
   * Missing supplier economics are not a pass.
   */
  if (
    !supplierKnown ||
    supplierCostInr ===
      null ||
    !Number.isFinite(
      supplierCostInr,
    ) ||
    supplierCostInr <=
      0
  ) {
    return {
      status:
        "UNKNOWN",

      reason:
        "Supplier cost could not be independently validated.",

      marketPriceInr,

      supplierCostInr,

      ratio:
        null,

      confidence:
        20,

      flags: [
        "supplier_cost_unknown",
      ],
    };
  }

  /*
   * Missing observed market price is not a pass.
   */
  if (
    marketPriceInr ===
      null ||
    !Number.isFinite(
      marketPriceInr,
    ) ||
    marketPriceInr <=
      0
  ) {
    return {
      status:
        "UNKNOWN",

      reason:
        "Observed market price is unavailable, so supplier-market economics cannot be sanity-checked.",

      marketPriceInr,

      supplierCostInr,

      ratio:
        null,

      confidence:
        25,

      flags: [
        "market_price_unknown",
      ],
    };
  }

  const ratio =
    marketPriceInr /
    supplierCostInr;

  /*
   * Absolute impossibility.
   */
  if (
    supplierCostInr >
    marketPriceInr
  ) {
    flags.push(
      "supplier_cost_above_market_price",
    );

    return {
      status:
        "FAIL",

      reason:
        `Supplier cost ₹${Math.round(
          supplierCostInr,
        )} exceeds observed market price ₹${Math.round(
          marketPriceInr,
        )}.`,

      marketPriceInr,

      supplierCostInr,

      ratio,

      confidence:
        marketPriceSource ===
        "AMAZON"
          ? 92
          : 75,

      flags,
    };
  }

  /*
   * Commercial headroom threshold.
   */
  const minHealthyRatio =
    productType ===
    "CONSUMABLE"
      ? 1.45
      : productType ===
          "REPLACEMENT"
        ? 1.40
        : 1.50;

  if (
    ratio <
    minHealthyRatio
  ) {
    flags.push(
      "thin_supplier_to_market_price_spread",
    );

    return {
      status:
        "FAIL",

      reason:
        `Observed market price is only ${ratio.toFixed(
          2,
        )}x supplier cost; insufficient commercial headroom before shipping, fees, acquisition and returns.`,

      marketPriceInr,

      supplierCostInr,

      ratio,

      confidence:
        marketPriceSource ===
        "AMAZON"
          ? 88
          : 70,

      flags,
    };
  }

  /*
   * Excessively large spread may indicate a pack/unit/variant mismatch.
   * Keep it uncertain rather than pretending it is a huge margin.
   */
  if (
    ratio >
    12
  ) {
    flags.push(
      "possible_supplier_unit_or_pack_mismatch",
    );

    return {
      status:
        "UNKNOWN",

      reason:
        `Supplier-to-market price ratio ${ratio.toFixed(
          2,
        )}x is unusually high and may indicate pack-size, unit or variant mismatch.`,

      marketPriceInr,

      supplierCostInr,

      ratio,

      confidence:
        55,

      flags,
    };
  }

  return {
    status:
      "PASS",

    reason:
      `Observed market price provides ${ratio.toFixed(
        2,
      )}x supplier-cost headroom before additional fulfilment and selling costs.`,

    marketPriceInr,

    supplierCostInr,

    ratio,

    confidence:
      marketPriceSource ===
      "AMAZON"
        ? 85
        : 68,

    flags,
  };
}

/*
 * --------------------------------------------------------------------------
 * CANDIDATE RESULT
 * --------------------------------------------------------------------------
 */

export interface ResearchCandidate {
  keyword:
    string;

  category:
    string;

  /*
   * Restored public candidate contract.
   *
   * scripts/research-market.ts reads these three fields directly.
   */
  demandArchetype:
    import("./market-analyst")
      .DemandArchetype;

  productType:
    import("./market-analyst")
      .ProductType;

  commercialSanity:
    CommercialSanityStatus;

  demandScore:
    number;

  trendScore:
    number;

  trendVelocity:
    number;

  shoppingScore:
    number;

  socialScore:
    number;

  /*
   * Demand evidence breakdown.
   * Kept separate from the overall demand score so NOVA can explain its view.
   */
  trendIntensity:
    number;

  trendMomentum:
    number;

  shoppingIntent:
    number;

  socialInterest:
    number;

  contentInterest:
    number;

  sourceCoverageScore:
    number;

  marketValidationScore:
    number;

  demandEvidenceConfidence:
    number;

  demandEvidenceStatus:
    "INCOMPLETE" | "PARTIAL" | "SUFFICIENT";

  competitionScore:
    number | null;

  /// MEASURED when anchored to an observed market price, ASSUMED when the
  /// price is only a markup on supplier cost. Publishing requires MEASURED.
  marginBasis:
    | "MEASURED"
    | "ASSUMED";

  /// How the supplier cost was obtained. RANGE_UPPER is the conservative
  /// worst-case reading of a CJ price range.
  costBasis:
    | "EXACT"
    | "PROVISIONAL"
    | "RANGE_UPPER"
    | "UNKNOWN";

  expectedMarginPercent:
    number | null;

  repeatPurchaseScore:
    number;

  returnRiskScore:
    number;

  serviceRiskScore:
    number;

  operationalEaseScore:
    number;

  supplierScore:
    number;

  finalScore:
    number;

  confidence:
    number;

  decision:
    | "PUBLISH"
    | "REVIEW"
    | "REJECT";

  reason:
    string;

  evidence:
    Prisma.JsonObject;
}

/*
 * --------------------------------------------------------------------------
 * FULL CANDIDATE EVALUATION
 * --------------------------------------------------------------------------
 */

async function evaluateCandidate(
  idea: ProductIdea,
  fx: number,
  useAI: boolean,
  prefetched:
    PrefetchedCandidateEvidence,
): Promise<
  ResearchCandidate
> {
  const keyword =
    idea.keyword;

  const {
    openWeb,
    market,
    competition,
    suppliers,
  } =
    prefetched;

  const demand =
    calculateDemandScore(
      market,
    );

  const {
    overallScore,
    demandEvidenceConfidence,
    evidenceStatus: demandEvidenceStatus,
    trendDemand,
    shoppingDemand,
    socialDemand,
    trendIntensity,
    trendMomentum,
    shoppingIntent,
    socialInterest,
    contentInterest,
    sourceCoverageScore,
    marketValidationScore,
  } = demand;

  console.log(
    `NOVA DEMAND EVIDENCE: ${keyword} | ` +
      `score=${overallScore} | ` +
      `trend=${trendIntensity} | ` +
      `momentum=${trendMomentum} | ` +
      `shopping=${shoppingIntent} | ` +
      `social=${socialInterest} | ` +
      `content=${contentInterest} | ` +
      `coverage=${sourceCoverageScore} | ` +
      `marketValidation=${marketValidationScore} | ` +
      `confidence=${demandEvidenceConfidence}% | ` +
      `status=${demandEvidenceStatus}`,
  );

  /*
   * This is a strict CJ identity gate.
   */
  /*
   * Price-plausible matching.
   *
   * Token overlap alone matched "compost bin kitchen countertop" to a
   * 132-gallon garden bin at 7,264 INR against an observed market price of 689,
   * and "shoe storage box clear plastic" to a 75-gallon patio box. The identity
   * gate saw enough shared words; nothing checked whether the thing found could
   * possibly be the thing searched for.
   *
   * Where an observed market price exists it is a strong plausibility bound: a
   * dropshipped item has to cost meaningfully LESS than it retails for. Filter
   * the catalogue to items that could actually be sold at a profit before
   * ranking them.
   *
   * If the filter empties the list the unfiltered set is used, so the candidate
   * still reports a match and is rejected downstream with a readable reason
   * rather than silently reporting no supplier at all.
   */
  const observedMarketPriceInr =
    competition.amazonMedianPriceInr;

  const plausibleSuppliers =
    observedMarketPriceInr &&
    observedMarketPriceInr > 0
      ? suppliers.filter(
          (
            supplier,
          ) => {
            const costUsd =
              resolveSupplierCostUsd(
                supplier.sellPrice,
              );

            if (
              costUsd === null
            ) {
              // Unknown cost is not evidence of implausibility.
              return true;
            }

            // Needs room for shipping, fees and a real margin.
            return (
              costUsd * fx <=
              observedMarketPriceInr *
                0.7
            );
          },
        )
      : suppliers;

  const supplierPool =
    plausibleSuppliers.length > 0
      ? plausibleSuppliers
      : suppliers;

  if (
    observedMarketPriceInr &&
    plausibleSuppliers.length <
      suppliers.length
  ) {
    console.log(
      `NOVA CJ: price filter → ${keyword} | ${suppliers.length - plausibleSuppliers.length} of ${suppliers.length} supplier results priced above ${Math.round(observedMarketPriceInr * 0.7)} INR were excluded`,
    );
  }

  let match =
    pickBestSupplierMatch(
      supplierPool,
      keyword,
      CJ_MIN_MATCH_CONFIDENCE,
    );

  /*
   * CJ product-level sellPrice can be a range. Resolve the actual
   * country-available variant before using supplier price for economics.
   */
  if (match) {
    try {
      const resolved =
        await resolveSupplierVariant(
          match,
          REGION,
          keyword,
        );

      if (resolved) {
        match = resolved;
      } else {
        /*
         * A product-level scalar sellPrice is usable as provisional supplier
         * cost. Do not erase it merely because exact variant resolution was
         * unavailable.
         */
        const provisional =
          Number(
            String(
              match.product
                .sellPrice,
            ).replace(
              /[^0-9.]/g,
              "",
            ),
          );

        match = {
          ...match,
          product: {
            ...match.product,
            sellPrice:
              Number.isFinite(
                provisional,
              ) &&
              provisional > 0
                ? String(
                    provisional,
                  )
                : "0",
            priceSource:
              Number.isFinite(
                provisional,
              ) &&
              provisional > 0
                ? "PRODUCT_PROVISIONAL"
                : "PRODUCT",
            variantResolved:
              false,
          },
        };
      }
    } catch (error) {
      console.warn(
        `NOVA CJ variant resolution unavailable for ${keyword}; supplier economics will remain unknown: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );

      const provisional =
        Number(
          String(
            match.product
              .sellPrice,
          ).replace(
            /[^0-9.]/g,
            "",
          ),
        );

      match = {
        ...match,
        product: {
          ...match.product,
          sellPrice:
            Number.isFinite(
              provisional,
            ) &&
            provisional > 0
              ? String(
                  provisional,
                )
              : "0",
          priceSource:
            Number.isFinite(
              provisional,
            ) &&
            provisional > 0
              ? "PRODUCT_PROVISIONAL"
              : "PRODUCT",
          variantResolved:
            false,
        },
      };
    }
  }

  const supplierEvidence =
    {
      known:
        Boolean(match),

      score:
        match?.confidence ??
        0,

      match:
        match
          ? {
              id:
                match.product
                  .productId,

              name:
                match.product
                  .productName,

              costUsd:
                Number(
                  match.product
                    .sellPrice,
                ),

              priceSource:
                match.product
                  .priceSource ??
                "PRODUCT",

              variantId:
                match.product
                  .variantId ??
                null,

              variantSku:
                match.product
                  .variantSku ??
                null,

              variantName:
                match.product
                  .variantName ??
                null,

              variantKey:
                match.product
                  .variantKey ??
                null,

              variantUnit:
                match.product
                  .variantUnit ??
                null,

              variantProperty:
                match.product
                  .variantProperty ??
                null,

              url:
                match.product
                  .productUrl,

              image:
                match.product
                  .productImage,
            }
          : null,

      matchDiagnostics:
        match
          ? {
              matchedTokens:
                match.matchedTokens,

              missingTokens:
                match.missingTokens,

              conflictingTokens:
                match.conflictingTokens,

              exactCoreMatch:
                match.exactCoreMatch,

              unitCompatible:
                match.unitCompatible,

              packCompatible:
                match.packCompatible,
            }
          : null,
    };

  /*
   * IMPORTANT:
   * AI is used only when explicitly allocated by the two-stage pipeline.
   *
   * AI:NO -> deterministic rules only.
   * No provider call.
   */
  let analyst;
  let aiAnalysisRequested =
    useAI;

  const analystInput = {
    keyword,

    marketEvidence:
      market,

    competitionEvidence:
      competition,

    supplierEvidence,
  };

  const runRulesAnalyst = async () => {
    const previousProvider =
      process.env
        .NOVA_AI_PROVIDER;

    process.env
      .NOVA_AI_PROVIDER =
      "rules";

    try {
      return await assessCandidate(
        analystInput,
      );
    } finally {
      if (
        previousProvider ===
        undefined
      ) {
        delete process.env
          .NOVA_AI_PROVIDER;
      } else {
        process.env
          .NOVA_AI_PROVIDER =
          previousProvider;
      }
    }
  };

  if (
    useAI
  ) {
    try {
      analyst =
        await assessCandidate(
          analystInput,
        );
    } catch (error) {
      /*
       * AI is an enrichment layer, never a hard dependency.
       * A timeout, quota exhaustion, malformed response or provider failure
       * must not discard an otherwise evaluable candidate. Fall back to the
       * deterministic analyst and mark the decision evidence accordingly.
       */
      aiAnalysisRequested =
        true;

      console.warn(
        `NOVA AI unavailable for ${keyword}; falling back to deterministic rules: ${
          error instanceof
          Error
            ? error.message
            : String(error)
        }`,
      );

      analyst =
        await runRulesAnalyst();
    }
  } else {
    analyst =
      await runRulesAnalyst();
  }

  /*
   * Supplier cost.
   *
   * This previously accepted ONLY an exact variant price. CJ returns a
   * product-level range for most items ("5.24 -- 8.87"), so cost came back null
   * for nearly everything, margin was null, commercial sanity was UNKNOWN, and
   * no candidate could ever reach PUBLISH. The strictness was well intentioned
   * but it made the entire pipeline unable to ship a product.
   *
   * A range is now resolved to its UPPER bound. That is the conservative
   * reading: if the economics work at the worst possible cost they work at the
   * real one, so the resulting margin is a lower bound rather than a flattering
   * guess. Taking the lower bound, or the midpoint, would overstate margin on
   * every ranged product - which is most of them.
   *
   * costBasis records which it was, so a decision made on a provisional figure
   * is never mistaken for one made on a confirmed variant price.
   */
  const supplierCostUsd =
    match
      ? resolveSupplierCostUsd(
          match.product
            .sellPrice,
        )
      : null;

  const costBasis:
    | "EXACT"
    | "PROVISIONAL"
    | "RANGE_UPPER"
    | "UNKNOWN" =
    !match ||
    supplierCostUsd ===
      null
      ? "UNKNOWN"
      : match.product
            .priceSource ===
          "VARIANT"
        ? "EXACT"
        : isPriceRange(
              match.product
                .sellPrice,
            )
          ? "RANGE_UPPER"
          : "PROVISIONAL";

  const supplierCostInr =
    supplierCostUsd ===
    null
      ? null
      : supplierCostUsd * fx;

  const marketPrice =
    competition
      .amazonMedianPriceInr;

  const productType =
    analyst.productType;

  /*
   * Economic sanity uses observed market price only as an anchor.
   * If the market price is unavailable, margin remains UNKNOWN.
   */
  let commercialSanity =
    assessCommercialSanity(
      {
        keyword,

        productType,

        supplierCostInr,

        marketPriceInr:
          marketPrice,

        marketPriceSource:
          marketPrice !==
          null
            ? "AMAZON"
            : "NONE",

        supplierKnown:
          Boolean(match),
      },
    );

  /*
   * Proposed price.
   *
   * We still allow a theoretical price to be calculated when the supplier
   * is known, but it cannot convert UNKNOWN economics into PASS.
   */
  const proposedSellPrice =
    supplierCostInr !==
    null
      ? Math.max(
          supplierCostInr *
            2.35,

          marketPrice &&
          marketPrice >
            supplierCostInr *
              1.5
            ? Math.min(
                marketPrice,
                supplierCostInr *
                  3.25,
              )
            : supplierCostInr *
                2.7,
        )
      : null;

  const netProfit =
    proposedSellPrice !==
      null &&
    supplierCostInr !==
      null
      ? proposedSellPrice -
        supplierCostInr -
        SHIPPING -
        (proposedSellPrice *
          FEE) /
          100
      : null;

  /*
   * Margin basis.
   *
   * MEASURED  - the selling price is anchored to a real observed Indian market
   *             price, so the margin is an estimate about the actual market.
   * ASSUMED   - no observed price existed, so the price is a fixed multiple of
   *             supplier cost and the "margin" is just that markup restated.
   *
   * This distinction matters more than it looks. With a fixed 2.7x markup the
   * cost term largely cancels, and the margin converges to roughly 61% for
   * every product regardless of what it is. Reported as a number it looks like
   * research; it is arithmetic on an assumption. Publishing on the strength of
   * it means selling products whose economics nobody ever verified.
   */
  const marginBasis:
    | "MEASURED"
    | "ASSUMED" =
    marketPrice !==
      null &&
    supplierCostInr !==
      null &&
    marketPrice >
      supplierCostInr *
        1.5
      ? "MEASURED"
      : "ASSUMED";

  const margin =
    proposedSellPrice !==
      null &&
    netProfit !==
      null &&
    proposedSellPrice >
      0
      ? (netProfit /
          proposedSellPrice) *
        100
      : null;

  /*
   * PASS is only legitimate when margin can actually be calculated.
   */
  if (
    commercialSanity.status ===
      "PASS" &&
    (
      margin ===
        null ||
      !Number.isFinite(
        margin,
      )
    )
  ) {
    commercialSanity =
      {
        ...commercialSanity,

        status:
          "UNKNOWN",

        confidence:
          Math.min(
            commercialSanity.confidence,
            45,
          ),

        reason:
          "Supplier and market prices are present, but a valid net-margin calculation could not be completed.",

        flags: [
          ...commercialSanity.flags,

          "margin_calculation_unknown",
        ],
      };
  }

  /*
   * Repeat purchase:
   *
   * True replenishment is preferred, but repeated usage is not enough.
   */
  const repeatPrior =
    idea.demandType ===
    "REPLENISHMENT"
      ? 8
      : idea.demandType ===
          "HYBRID"
        ? 4
        : 0;

  const repeatScore =
    Math.max(
      0,
      Math.min(
        100,
        analyst.repeatPurchaseScore +
          repeatPrior,
      ),
    );

  const trendFreshness =
    Math.min(
      100,
      Math.round(
        Math.min(
          40,
          market.recentNewsCount *
            5,
        ) +
          Math.min(
            30,
            market.youtubeVideoCount *
              2,
          ) +
          Math.min(
            30,
            market.redditPostCount *
              2,
          ),
      ),
    );


function deterministicFulfillmentAssessment(
  keyword: string,
  supplierTitle: string,
  analystOperationalEase: number,
): {
  effectiveScore: number;
  hardFulfillment: boolean;
  hardReason: string | null;
  basis: string;
} {
  /*
   * IMPORTANT:
   * Fulfilment sanity must classify the product being sold, not every noun
   * appearing in the query or in an arbitrary top-N CJ catalogue result.
   *
   * Example failures in the previous version:
   *   - "desk pen holder organizer" + a CJ result mentioning "ceramic"
   *   - "under-bed storage box" + a CJ result mentioning "bed"
   *   - "glass shower door cleaner spray" where "glass" describes the
   *     surface being cleaned rather than the product material.
   *
   * The deterministic gate therefore uses the candidate keyword as the
   * primary product-identity signal. The supplier title is only used for
   * positive lightweight/consumable confirmation when it is semantically
   * consistent, and is never allowed to introduce a hard constraint by
   * itself.
   */
  const productText = keyword.toLowerCase().replace(/\s+/g, " ").trim();
  const supplierText = supplierTitle.toLowerCase().replace(/\s+/g, " ").trim();

  const hardPatterns: Array<{ pattern: RegExp; reason: string }> = [
    {
      pattern:
        /\b(?:medicine|drug|prescription|pesticide|insecticide|poison|toxin|weapon|ammunition|nicotine|tobacco)\b/,
      reason: "regulated_or_hazardous_product",
    },
    {
      pattern:
        /\b(?:battery|lithium|li-ion|smartwatch|smart\s*watch|laptop|computer|camera|printer|drone|projector|electronics?|electronic|robot|motorized|electric)\b/,
      reason: "technical_or_battery_product",
    },
    {
      // Only classify the sold object as bulky/heavy. Do not infer this from
      // context words such as "under-bed" or "cabinet organizer".
      pattern:
        /\b(?:furniture|sofa|mattress|wardrobe|bed\s*frame|platform\s*bed|dining\s*table|office\s*desk|bookshelf|bookcase|large\s*furniture|oversized\s*furniture)\b/,
      reason: "bulky_or_heavy_fulfillment",
    },
    {
      // Require material + an actual fragile product noun. This prevents
      // "glass shower door cleaner" and "glass cleaning cloth" from being
      // mistaken for products made of glass.
      pattern:
        /\b(?:glass|ceramic)(?:\s+[a-z-]+){0,2}\s+(?:bottle|jar|container|canister|mug|cup|vase|plate|dish|decanter|ornament|figurine|mirror|tabletop|shelf)\b|\bmirror\b(?!\s+(?:cleaner|cleaning|wipe|wipes|cloth|spray|squeegee|polish))/,
      reason: "fragile_fulfillment",
    },
    {
      // A standalone storage cabinet/closet can be bulky, but an organizer
      // that sits inside/under a cabinet is not the same product.
      pattern:
        /\b(?:storage\s+cabinet|bathroom\s+cabinet|kitchen\s+cabinet|freestanding\s+cabinet|wardrobe\s+cabinet|display\s+cabinet)\b/,
      reason: "bulky_or_heavy_fulfillment",
    },
  ];

  for (const item of hardPatterns) {
    if (item.pattern.test(productText)) {
      return {
        effectiveScore: Math.min(40, Math.max(5, analystOperationalEase)),
        hardFulfillment: true,
        hardReason: item.reason,
        basis: "deterministic_hard_constraint_product_identity",
      };
    }
  }

  const simpleConsumable =
    /\b(?:tablets?|tabs?|powders?|wipes?|cloths?|cloth|sponges?|sponge|refills?|replacement\s+(?:heads?|pads?)|trash\s+bags?|garbage\s+bags?|laundry\s+detergent|dishwasher\s+detergent|cleaning\s+(?:solution|liquid)|stain\s+remover\s+sticks?|cleaning\s+sticks?|bars?)\b/.test(
      productText,
    );

  if (simpleConsumable) {
    return {
      effectiveScore: Math.max(75, Math.min(95, analystOperationalEase || 0)),
      hardFulfillment: false,
      hardReason: null,
      basis: "simple_lightweight_consumable_product_identity",
    };
  }

  // Supplier evidence can confirm a lightweight form, but an unrelated or
  // noisy catalogue title cannot create a hard-freight/fragility decision.
  const supplierConfirmsLightweight =
    supplierText.length > 0 &&
    /\b(?:tablets?|tabs?|powders?|wipes?|cloths?|cloth|sponges?|sponge|refill|replacement\s+(?:head|pad)|brush|brushes|rack|organizer|divider|holder|sticking\s+hook|hooks?)\b/.test(
      supplierText,
    ) &&
    /\b(?:cleaning|cleaner|storage|organizer|holder|rack|brush|cloth|sponge|divider|hook)\b/.test(
      productText,
    );

  if (supplierConfirmsLightweight) {
    return {
      effectiveScore: Math.max(65, Math.min(90, analystOperationalEase || 0)),
      hardFulfillment: false,
      hardReason: null,
      basis: "supplier_confirmed_lightweight_form",
    };
  }

  // AI may flag an unusual fulfilment concern, but an unsupported low score
  // should not become an automatic rejection. Keep a conservative floor and
  // let the broader risk gates decide whether the candidate remains REVIEW.
  return {
    effectiveScore: Math.max(45, Math.min(100, analystOperationalEase || 0)),
    hardFulfillment: false,
    hardReason: null,
    basis: "deterministic_sanity_floor_product_identity",
  };
}

  const fulfillment =
    deterministicFulfillmentAssessment(
      keyword,
      match?.product.productName ?? "",
      analyst.operationalEaseScore,
    );

  /*
   * Business score.
   *
   * Higher competitionScore is treated as a better opportunity because
   * competition-signals normalizes it that way in the existing engine.
   */
  /*
   * Scoring now goes through the versioned weight registry.
   *
   * These weights used to be literal numbers here and a second, already
   * divergent set of literals in nova-core.ts. A system whose entire purpose is
   * to learn which signals predict success cannot keep its beliefs in two
   * hardcoded places that quietly disagree.
   */
  const { weights: activeWeights } =
    await getActiveWeights();

  const score =
    computeNovaScore(
      {
        demand:
          overallScore,

        trendVelocity:
          market.trendVelocity,

        shoppingIntent:
          market.shoppingScore,

        contentInterest:
          market.youtubeScore,

        newsInterest:
          market.newsScore,

        socialInterest:
          market.redditScore,

        competition:
          competition
            .competitionScore,

        marginPercent:
          margin,

        repeatPurchase:
          repeatScore,

        returnRisk:
          analyst.returnRiskScore,

        serviceRisk:
          analyst.serviceRiskScore,

        operationalEase:
          fulfillment
            .effectiveScore,
      },
      activeWeights,
    );

  const confidence =
    Math.round(
      Math.min(
        100,

        analyst.confidence *
          0.35 +

        (
          competition.known
            ? 15
            : 0
        ) +

        (
          match
            ? 15
            : 0
        ) +

        (
          margin !==
          null
            ? 10
            : 0
        ) +

        Math.min(
          10,
          market.sourceCount,
        ) +

        Math.min(
          5,
          Math.round(
            trendFreshness /
              20,
          ),
        ) +

        (
          openWeb
            .warnings
            .length ===
          0
            ? 5
            : 0
        ),
      ),
    );

  const reasons:
    string[] =
    [];

  if (
    !analyst.isProductCandidate
  ) {
    reasons.push(
      "unsuitable/restricted",
    );
  }

  if (
    overallScore <
    MIN_DEMAND
  ) {
    reasons.push(
      `demand<${MIN_DEMAND} (evidence=${demandEvidenceStatus})`,
    );
  }

  if (
    !match
  ) {
    reasons.push(
      "no supplier match",
    );
  }

  if (
    !competition.known
  ) {
    reasons.push(
      "competition unknown",
    );
  }

  if (
    margin !==
      null &&
    margin <
      MIN_MARGIN
  ) {
    reasons.push(
      `margin<${MIN_MARGIN}%`,
    );
  }

  if (
    commercialSanity.status ===
    "FAIL"
  ) {
    reasons.push(
      commercialSanity.reason,
    );
  }

  if (
    analyst.returnRiskScore >=
    70
  ) {
    reasons.push(
      "high return risk",
    );
  }

  if (
    analyst.serviceRiskScore >=
    70
  ) {
    reasons.push(
      "high service risk",
    );
  }

  if (
    fulfillment.hardFulfillment
  ) {
    reasons.push(
      "hard fulfillment",
    );
  }

  if (
    repeatScore <
    35
  ) {
    reasons.push(
      "weak repeat-purchase potential",
    );
  }

  /*
   * PUBLISH requires all material gates.
   *
   * In particular:
   *   - actual CJ match
   *   - actual market competition evidence
   *   - actual calculated margin
   *   - commercial PASS
   *   - final score
   *   - confidence
   */
  const publish =
    reasons.length ===
      0 &&
    competition.known &&
    Boolean(match) &&
    margin !==
      null &&
    Number.isFinite(
      margin,
    ) &&
    commercialSanity.status ===
      "PASS" &&
    score >=
      MIN_SCORE &&
    confidence >=
      MIN_CONF;

  /*
   * Commercial UNKNOWN cannot publish.
   * It may remain REVIEW for future validation.
   */
  /*
   * Demand below the minimum is only a hard rejection when the evidence
   * base is sufficiently complete to support the conclusion.
   *
   * PARTIAL / INCOMPLETE demand evidence means:
   *   "NOVA does not know enough yet"
   * rather than:
   *   "NOVA knows demand is bad."
   *
   * Those candidates remain REVIEW so a future research run can re-check
   * them when more data sources are available.
   */
  const demandHardFail =
    overallScore <
      MIN_DEMAND &&
    demandEvidenceStatus ===
      "SUFFICIENT";

  /*
   * Decision semantics:
   *
   * REJECT only when the available evidence supports a negative conclusion
   * or a hard operational/safety constraint.
   *
   * Missing supplier, missing competition, or incomplete economics are
   * validation gaps, not negative evidence. They remain REVIEW.
   */
  const hardReject =
    commercialSanity.status ===
      "FAIL" ||
    reasons.some(
      (
        reason,
      ) =>
        reason ===
          "unsuitable/restricted" ||
        reason ===
          "high return risk" ||
        reason ===
          "high service risk" ||
        reason ===
          "hard fulfillment" ||
        reason.startsWith(
          "margin<",
        ),
    ) ||
    demandHardFail;

  const decision =
    hardReject
      ? "REJECT"
      : publish
        ? "PUBLISH"
        : "REVIEW";

  const aiAnalysisStatus =
    analyst.aiProvider !==
    "RULES"
      ? "AI_ANALYZED"
      : aiAnalysisRequested
        ? "AI_UNAVAILABLE"
        : "RULES_ONLY";

  const evidence =
    asInputJson({
      region:
        REGION,

      discovery: {
        source:
          "AI product expansion + current trend/query discovery",

        marketDomain:
          idea.category,

        demandType:
          idea.demandType,

        productForm:
          idea.productForm,

        likelyRepeat:
          idea.likelyRepeat,

        whyNow:
          idea.whyNow,

        productFamily:
          productFamilyKey(
            keyword,
          ),
      },

      openWeb,

      market,

      demandEvidence: {
        demandScore:
          overallScore,

        demandLevel:
          demand.demandLevel,

        trendIntensity,

        trendMomentum,

        shoppingIntent,

        socialInterest,

        contentInterest,

        sourceCoverageScore,

        marketValidationScore,

        confidence:
          demandEvidenceConfidence,

        status:
          demandEvidenceStatus,

        rawSignalAvailability: {
          trend:
            Boolean(
              (market as any)
                .trendAvailable,
            ),

          shopping:
            Boolean(
              (market as any)
                .shoppingAvailable,
            ),

          youtube:
            market.youtubeVideoCount >
            0,

          news:
            market.newsScore >
            0,

          reddit:
            market.redditPostCount >
            0,

          web:
            market.sourceCount >
            0,
        },
      },

      competition,

      supplier:
        supplierEvidence,

      analyst,

      fulfillment: {
        effectiveOperationalEaseScore:
          fulfillment.effectiveScore,
        aiOperationalEaseScore:
          analyst.operationalEaseScore,
        hardFulfillment:
          fulfillment.hardFulfillment,
        hardReason:
          fulfillment.hardReason,
        basis:
          fulfillment.basis,
      },

      economics: {
        usdInr:
          fx,

        supplierCostInr,

        proposedSellPrice,

        shippingBufferInr:
          SHIPPING,

        paymentFeePercent:
          FEE,

        netProfit,

        marginPercent:
          margin,

        commercialSanity,
      },

      decisionModel: {
        score,

        confidence,

        demandScore:
          overallScore,

        demandEvidenceConfidence,

        demandEvidenceStatus,

        demandHardFail,

        validationGaps: [
          ...(
            match
              ? []
              : ["supplier_unvalidated"]
          ),
          ...(
            competition.known
              ? []
              : ["competition_unvalidated"]
          ),
          ...(
            commercialSanity.status ===
            "UNKNOWN"
              ? ["commercial_economics_unvalidated"]
              : []
          ),
        ],

        trendDemand,

        shoppingDemand,

        socialDemand,

        trendIntensity,

        trendMomentum,

        shoppingIntent,

        socialInterest,

        contentInterest,

        sourceCoverageScore,

        marketValidationScore,

        aiAllocated:
          useAI,

        aiAnalysis:
          analyst.aiProvider,

        aiAnalysisStatus,

        commercialSanity:
          commercialSanity.status,

        publishEligible:
          publish,

        fulfillmentModel: {
          effectiveOperationalEaseScore:
            fulfillment.effectiveScore,
          aiOperationalEaseScore:
            analyst.operationalEaseScore,
          hardFulfillment:
            fulfillment.hardFulfillment,
          hardReason:
            fulfillment.hardReason,
          basis:
            fulfillment.basis,
        },
      },
    }) as Prisma.JsonObject;

  return {
    keyword,

    category:
      analyst.category ||
      idea.category,

    demandArchetype:
      analyst.demandArchetype,

    productType:
      analyst.productType,

    commercialSanity:
      commercialSanity.status,

    demandScore:
      overallScore,

    demandEvidenceConfidence,

    demandEvidenceStatus,

    trendScore:
      market.trendScore,

    trendVelocity:
      market.trendVelocity,

    shoppingScore:
      market.shoppingScore,

    socialScore:
      Math.round(
        market.youtubeScore *
          0.65 +
          market.redditScore *
            0.35,
      ),

    trendIntensity,

    trendMomentum,

    shoppingIntent,

    socialInterest,

    contentInterest,

    sourceCoverageScore,

    marketValidationScore,


    competitionScore:
      competition.competitionScore,

    marginBasis,

    costBasis,

    expectedMarginPercent:
      margin ===
      null
        ? null
        : Number(
            margin.toFixed(
              2,
            ),
          ),

    repeatPurchaseScore:
      repeatScore,

    returnRiskScore:
      analyst.returnRiskScore,

    serviceRiskScore:
      analyst.serviceRiskScore,

    operationalEaseScore:
      fulfillment.effectiveScore,

    supplierScore:
      supplierEvidence.score,

    finalScore:
      score,

    confidence,

    decision,

    reason:
      reasons.length >
      0
        ? (
            hardReject
              ? `Rejected: ${[
                  ...new Set(
                    reasons.filter(
                      (reason) =>
                        reason !== "no supplier match" &&
                        reason !== "competition unknown" &&
                        !reason.startsWith("demand<"),
                    ),
                  ),
                  ...(demandHardFail
                    ? [`demand<${MIN_DEMAND} (evidence=SUFFICIENT)`]
                    : []),
                ].filter(Boolean).join(
                  ", ",
                )}${
                  !demandHardFail &&
                  reasons.some((reason) => reason === "no supplier match" || reason === "competition unknown")
                    ? ` Validation gaps: ${reasons.filter((reason) => reason === "no supplier match" || reason === "competition unknown").join(", ")}.`
                    : ""
                }`
              : `Review required: ${[
                  ...new Set(
                    reasons,
                  ),
                ].join(
                  ", ",
                )}.`
          )
        : `Concrete product opportunity ${score}/100 with ${confidence}% confidence. ${analyst.rationale}`,

    evidence,
  };
}

/*
 * --------------------------------------------------------------------------
 * RESEARCH RUN
 * --------------------------------------------------------------------------
 */

export async function runMarketResearch(
  opts: {
    seeds:
      string[];

    limit?:
      number;
  },
) {
  const requestedLimit =
    Math.max(
      1,
      Math.floor(
        Number(
          opts.limit ??
            20,
        ),
      ),
    );

  const run =
    await prisma.marketResearchRun.create(
      {
        data: {
          region:
            REGION,

          status:
            "RUNNING",

          sourceSummary:
            asInputJson({
              requestedLimit,

              discovery:
                "AI product expansion + current market evidence + CJ sourcing",
            }),
        },
      },
    );

  try {
    const fx =
      await getUsdToInrRate();

    const discovery =
      await buildProductCandidates(
        opts.seeds,
        requestedLimit,
      );

    /*
     * IMPORTANT:
     *
     * --limit is now the hard deep-evaluation cap.
     *
     * This fixes the previous behavior where --limit=20 could cause
     * requestedLimit * 4 / minimum 40 candidates to be deeply evaluated.
     */
    const evaluationIdeas =
      discovery.ideas.slice(
        0,
        Math.min(
          requestedLimit,
          discovery.ideas.length,
        ),
      );

    console.log(
      `NOVA DEEP EVALUATION: ${evaluationIdeas.length}/${discovery.ideas.length} candidates`,
    );

    /*
     * ----------------------------------------------------------------------
     * STAGE 1
     *
     * Gather current market/CJ evidence for the allowed deep-evaluation
     * candidates. No LLM calls happen here.
     * ----------------------------------------------------------------------
     */

    const evidenceRows:
      Array<{
        idea:
          ProductIdea;

        evidence:
          PrefetchedCandidateEvidence;

        preAiRank:
          number;
      }> =
      [];

    for (
      const idea of
        evaluationIdeas
    ) {
      try {
        const evidence =
          await collectCandidateEvidence(
            idea.keyword,
          );

        evidenceRows.push(
          {
            idea,

            evidence,

            preAiRank:
              preliminaryAiRank(
                idea,
                evidence,
              ),
          },
        );
      } catch (
        error
      ) {
        console.warn(
          `candidate evidence ${idea.keyword} failed`,
          error instanceof
            Error
            ? error.message
            : String(
                error,
              ),
        );
      }

      /*
       * Keep the external-source loop gentle.
       */
      await new Promise<void>(
        (
          resolve,
        ) => {
          setTimeout(
            resolve,
            250,
          );
        },
      );
    }

    /*
     * Sort by deterministic evidence strength before spending scarce AI calls.
     */
    evidenceRows.sort(
      (
        a,
        b,
      ) =>
        b.preAiRank -
        a.preAiRank,
    );

    /*
     * ----------------------------------------------------------------------
     * STAGE 2
     *
     * Allocate the scarce free-model calls only to the strongest candidates.
     * ----------------------------------------------------------------------
     */

    const aiKeywords =
      new Set(
        evidenceRows
          .slice(
            0,
            Math.min(
              MAX_AI_ANALYSES,
              evidenceRows.length,
            ),
          )
          .map(
            (
              row,
            ) =>
              row.idea.keyword,
          ),
      );

    console.log(
      `NOVA AI BUDGET: ${aiKeywords.size}/${evidenceRows.length} candidates`,
    );

    const results:
      ResearchCandidate[] =
      [];

    for (
      const row of
        evidenceRows
    ) {
      const useAI =
        aiKeywords.has(
          row.idea.keyword,
        );

      try {
        const result =
          await evaluateCandidate(
            row.idea,
            fx,
            useAI,
            row.evidence,
          );

        results.push(
          result,
        );

        const model =
          result.evidence
            .decisionModel as
            | Prisma.JsonObject
            | undefined;

        const aiStatus =
          String(
            model
              ?.aiAnalysisStatus ||
              "RULES_ONLY",
          );

        console.log(
          `${result.decision.padEnd(
            7,
          )} ${String(
            result.finalScore,
          ).padStart(
            3,
          )}/100 ${result.keyword} AI:${
            aiStatus ===
            "AI_ANALYZED"
              ? "YES"
              : "NO"
          }`,
        );
      } catch (
        error
      ) {
        console.warn(
          `candidate ${row.idea.keyword} failed`,
          error instanceof
            Error
            ? error.message
            : String(
                error,
              ),
        );
      }

      await new Promise<void>(
        (
          resolve,
        ) => {
          setTimeout(
            resolve,
            500,
          );
        },
      );
    }

    results.sort(
      (
        a,
        b,
      ) =>
        b.finalScore -
        a.finalScore,
    );

    /*
     * Portfolio synthesis receives only the non-rejected candidates.
     *
     * synthesizePortfolio is still the final portfolio gate and is allowed
     * to return no portfolio when evidence is insufficient.
     */
    const nonRejected =
      results
        .filter(
          (
            item,
          ) =>
            item.decision !==
            "REJECT",
        )
        .slice(
          0,
          Math.min(
            20,
            results.length,
          ),
        );

    const portfolio =
      await synthesizePortfolio(
        nonRejected,
      );

    await prisma.marketCandidate.createMany(
      {
        data:
          results.map(
            (
              candidate,
            ) => ({
              runId:
                run.id,

              keyword:
                candidate.keyword,

              normalizedName:
                productFamilyKey(
                  candidate.keyword,
                ),

              category:
                candidate.category,

              demandScore:
                candidate.demandScore,

              trendScore:
                candidate.trendScore,

              trendVelocity:
                candidate.trendVelocity,

              shoppingScore:
                candidate.shoppingScore,

              socialScore:
                candidate.socialScore,

              competitionScore:
                candidate.competitionScore,

              expectedMarginPercent:
                candidate.expectedMarginPercent,

              repeatPurchaseScore:
                candidate.repeatPurchaseScore,

              returnRiskScore:
                candidate.returnRiskScore,

              serviceRiskScore:
                candidate.serviceRiskScore,

              operationalEaseScore:
                candidate.operationalEaseScore,

              supplierScore:
                candidate.supplierScore,

              finalScore:
                candidate.finalScore,

              confidence:
                candidate.confidence,

              decision:
                candidate.decision,

              reason:
                candidate.reason,

              evidence:
                candidate.evidence,

              /*
               * Store the candidate exactly as scored.
               *
               * Approval happens later, from the admin console, and must be
               * able to publish the decision that was actually reviewed. Without
               * this snapshot the supplier match, resolved pricing and every
               * sub-score would have to be re-derived from live APIs, which
               * would silently publish a different product from the one the
               * admin looked at.
               */
              candidateSnapshot:
                JSON.parse(
                  JSON.stringify(
                    candidate,
                  ),
                ) as Prisma.InputJsonValue,

              /*
               * Only candidates NOVA would stand behind enter the queue as
               * PENDING. Anything it rejected is filed as REJECTED so the
               * reasoning stays auditable without cluttering the review list.
               */
              reviewStatus:
                candidate.decision ===
                "REJECT"
                  ? "REJECTED"
                  : "PENDING",
            }),
          ),
      },
    );

    const aiAnalyzedCandidates =
      results.filter(
        (
          candidate,
        ) => {
          const model =
            candidate.evidence
              .decisionModel as
              | Prisma.JsonObject
              | undefined;

          return (
            String(
              model
                ?.aiAnalysisStatus ||
                "RULES_ONLY",
            ) ===
            "AI_ANALYZED"
          );
        },
      ).length;

    const aiUnavailableCandidates =
      results.filter(
        (
          candidate,
        ) => {
          const model =
            candidate.evidence
              .decisionModel as
              | Prisma.JsonObject
              | undefined;

          return (
            String(
              model
                ?.aiAnalysisStatus ||
                "RULES_ONLY",
            ) ===
            "AI_UNAVAILABLE"
          );
        },
      ).length;

    const rulesOnlyCandidates =
      results.filter(
        (
          candidate,
        ) => {
          const model =
            candidate.evidence
              .decisionModel as
              | Prisma.JsonObject
              | undefined;

          return (
            String(
              model
                ?.aiAnalysisStatus ||
                "RULES_ONLY",
            ) ===
            "RULES_ONLY"
          );
        },
      ).length;

    /*
     * Retire candidates still pending from earlier runs.
     *
     * A candidate is a snapshot of demand, competition and supplier price at
     * one moment. Leaving old ones in the queue mixes weeks-old evidence with
     * today's, and approving a stale entry publishes a product on the strength
     * of a trend that may since have collapsed. If the opportunity is still
     * real, this run has just scored it again with current data.
     */
    const superseded = (
      await prisma.marketCandidate.updateMany(
        {
          where: {
            reviewStatus:
              "PENDING",

            runId: {
              not: run.id,
            },
          },

          data: {
            reviewStatus:
              "EXPIRED",

            reviewNote:
              "Superseded by a newer research run. Its market evidence is no longer current.",
          },
        },
      )
    ).count;

    if (superseded > 0) {
      console.log(
        `NOVA: expired ${superseded} candidate(s) left pending from earlier runs`,
      );
    }

    await prisma.marketResearchRun.update(
      {
        where: {
          id:
            run.id,
        },

        data: {
          status:
            "COMPLETED",

          completedAt:
            new Date(),

          sourceSummary:
            asInputJson({
              region:
                REGION,

              requestedLimit,

              expandedCandidates:
                discovery
                  .ideas
                  .length,

              evaluatedCandidates:
                results.length,

              aiBudget:
                MAX_AI_ANALYSES,

              aiAnalyzedCandidates,

              aiUnavailableCandidates,

              rulesOnlyCandidates,

              dailyTrendCount:
                discovery
                  .dailyTrendCount,

              relatedQueryCount:
                discovery
                  .relatedQueryCount,

              usedAnthropicExpansion:
                discovery
                  .usedAnthropic,

              publish:
                results.filter(
                  (
                    item,
                  ) =>
                    item.decision ===
                    "PUBLISH",
                ).length,

              review:
                results.filter(
                  (
                    item,
                  ) =>
                    item.decision ===
                    "REVIEW",
                ).length,

              reject:
                results.filter(
                  (
                    item,
                  ) =>
                    item.decision ===
                    "REJECT",
                ).length,

              portfolio,

              googleTrends:
                true,

              publicYouTube:
                process.env
                  .NOVA_ENABLE_PUBLIC_YOUTUBE !==
                "false",

              publicAmazonSnapshot:
                process.env
                  .NOVA_ENABLE_AMAZON_SNAPSHOT !==
                "false",

              serpApi:
                Boolean(
                  process.env
                    .SERPAPI_API_KEY,
                ),

              tavily:
                Boolean(
                  process.env
                    .TAVILY_API_KEY,
                ),

              cj:
                Boolean(
                  process.env
                    .CJ_API_KEY,
                ),

              openrouter:
                Boolean(
                  process.env
                    .OPENROUTER_API_KEY,
                ),

              anthropic:
                Boolean(
                  process.env
                    .ANTHROPIC_API_KEY,
                ),

              usdInr:
                fx,
            }),
        },
      },
    );

    return {
      runId:
        run.id,

      candidates:
        results.slice(
          0,
          Math.max(
            requestedLimit,
            15,
          ),
        ),

      portfolio,
    };
  } catch (
    error
  ) {
    await prisma.marketResearchRun.update(
      {
        where: {
          id:
            run.id,
        },

        data: {
          status:
            "FAILED",

          completedAt:
            new Date(),

          notes:
            error instanceof
              Error
              ? error.message
              : String(error),
        },
      },
    );

    throw error;
  }
}

/*
 * --------------------------------------------------------------------------
 * PUBLISHING
 * --------------------------------------------------------------------------
 */

export async function publishQualifiedCandidate(
  candidate:
    ResearchCandidate,

  options: {
    /*
     * Set when a human approved this from the admin console.
     *
     * NOVA's own decision has three bands, and they mean different things:
     *
     *   PUBLISH - confident enough to list without being asked
     *   REVIEW  - a real opportunity it is not confident enough to auto-list;
     *             it wants a human to look
     *   REJECT  - it found a disqualifying problem
     *
     * Requiring decision === "PUBLISH" here made the admin console pointless:
     * REVIEW is precisely the band a human is supposed to rule on, and refusing
     * it meant the only candidates a person could approve were the ones NOVA
     * would have published by itself.
     *
     * Human approval therefore satisfies the REVIEW band. It does NOT override
     * REJECT, and it does not override the evidence gates below - a person can
     * supply judgement NOVA lacks, but not evidence it never had.
     */
    approvedByHuman?: boolean;
  } = {},
) {
  if (
    candidate.decision ===
    "REJECT"
  ) {
    return {
      created:
        false,

      reason:
        `NOVA rejected this candidate and human approval does not override a rejection. Its reason was: ${candidate.reason || "not recorded"}`,
    };
  }

  if (
    candidate.decision !==
      "PUBLISH" &&
    !options.approvedByHuman
  ) {
    return {
      created:
        false,

      reason:
        "Candidate did not clear the automatic publish gates and has not been approved by a human.",
    };
  }

  if (
    candidate.competitionScore ===
      null ||
    candidate.expectedMarginPercent ===
      null
  ) {
    return {
      created:
        false,

      reason:
        `Missing evidence at publish time — ${
          candidate.competitionScore === null
            ? "competition could not be measured"
            : ""
        }${
          candidate.competitionScore === null &&
          candidate.expectedMarginPercent === null
            ? " and "
            : ""
        }${
          candidate.expectedMarginPercent === null
            ? "margin could not be calculated (usually no usable supplier cost — CJ returned a price range too wide to trust, or no supplier matched)"
            : ""
        }.`,
    };
  }

  /*
   * Refuse to publish an unverified margin.
   *
   * When no observed Indian market price was found, the selling price is a
   * fixed multiple of supplier cost and the resulting margin is the markup
   * assumption restated - it converges to about 61% for every product and says
   * nothing about whether this one can actually be sold profitably.
   *
   * A store that cannot confirm it makes money on a product should not be
   * selling it, so this is a hard stop rather than a warning.
   */
  if (
    candidate.marginBasis !==
    "MEASURED"
  ) {
    return {
      created:
        false,

      reason:
        "Margin could not be verified against an observed market price. The figure would only restate the assumed markup, so NOVA will not publish this product. Re-run research once competitor pricing is visible for this keyword.",
    };
  }

  const evidence =
    candidate.evidence;

  const decisionModel =
    evidence
      .decisionModel as
      | Prisma.JsonObject
      | undefined;

  if (
    String(
      decisionModel
        ?.commercialSanity ||
        "UNKNOWN",
    ) !==
    "PASS"
  ) {
    return {
      created:
        false,

      reason:
        `Commercial sanity check failed: ${
          candidate.commercialSanity || "status unknown"
        }. This usually means the supplier cost is not credible against the observed market price.`,
    };
  }

  const supplier =
    evidence.supplier as
      | Prisma.JsonObject
      | undefined;

  const match =
    supplier?.match as
      | Prisma.JsonObject
      | undefined;

  if (!match) {
    return {
      created:
        false,

      reason:
        "No supplier match was recorded for this candidate, so there is nothing to source it from. Re-run research — CJ may not stock this product at a workable price.",
    };
  }

  const supplierId =
    String(
      match.id ||
        "",
    ).trim();

  if (!supplierId) {
    return {
      created:
        false,

      reason:
        "CJ supplier product ID missing at publish time.",
    };
  }

  const economics =
    (
      evidence.economics ||
      {}
    ) as Prisma.JsonObject;

  const proposedSellPrice =
    Number(
      economics.proposedSellPrice ||
        0,
    );

  if (
    !Number.isFinite(
      proposedSellPrice,
    ) ||
    proposedSellPrice <=
      0
  ) {
    return {
      created:
        false,

      reason:
        "No valid selling price could be produced, which happens when supplier cost is unknown or the economics leave no room above cost, shipping and fees.",
    };
  }

  const listing =
    await generateListing(
      {
        productWorkingTitle:
          candidate.keyword,

        supplierProductName:
          String(
            match.name ||
              candidate.keyword,
          ),

        category:
          candidate.category,

        trendDirection:
          String(
            (
              evidence.market as
                | Prisma.JsonObject
                | undefined
            )?.trendDirection ||
              "STEADY",
          ),
      },
    );

  /*
   * Refuse to list the same supplier item twice.
   *
   * NOVA expands seeds into many keyword variations, and several of them
   * regularly resolve to one CJ product - "Colorful Gaming Mouse Pad" and "RGB
   * Gaming Mouse Pad" were the same item. Publishing both creates two listings
   * competing with each other for one piece of inventory, splits their
   * performance data so neither accumulates enough evidence to be judged, and
   * makes the lifecycle engine reason about a product it thinks is two.
   */
  const existingSupplierListing =
    await prisma.productIntelligence.findFirst(
      {
        where: {
          supplierProductId:
            supplierId,
        },

        select: {
          product: {
            select: {
              id: true,
              title: true,
              isActive: true,
            },
          },
        },
      },
    );

  if (
    existingSupplierListing?.product
      ?.isActive
  ) {
    return {
      created:
        false,

      reason:
        `The store already lists this exact supplier item as "${existingSupplierListing.product.title}". Publishing it again would split demand and inventory across two listings of one product.`,
    };
  }

  /*
   * Category comes from the controlled store taxonomy, not from the analyst.
   *
   * This used to upsert whatever string the AI returned for this candidate, so
   * every new phrasing created a permanent category: "gaming accessories",
   * "Consumer Goods", "Home Utility" and occasionally the product name itself.
   * The storefront ended up with a navigation full of near-duplicates and
   * single-product categories no shopper would click.
   *
   * The analyst's answer is still used as a signal - it is just no longer
   * allowed to define the navigation.
   */
  const storeCategory =
    resolveStoreCategory(
      candidate.keyword,
      candidate.category,
    );

  const category =
    await prisma.category.upsert(
      {
        where: {
          slug:
            storeCategory.slug,
        },

        update:
          {},

        create: {
          name:
            storeCategory.name,

          slug:
            storeCategory.slug,
        },
      },
    );

  const brand =
    await prisma.brand.upsert(
      {
        where: {
          slug:
            "novalabs",
        },

        update:
          {},

        create: {
          name:
            "NovaLabs",

          slug:
            "novalabs",
        },
      },
    );

  const product =
    await prisma.product.upsert(
      {
        where: {
          slug:
            slugify(
              listing.titleEn,
            ),
        },

        update: {
          basePrice:
            Math.round(
              proposedSellPrice,
            ),

          description:
            listing.descriptionEn,

          isActive:
            true,

          categoryId:
            category.id,

          brandId:
            brand.id,
        },

        create: {
          title:
            listing.titleEn,

          slug:
            slugify(
              listing.titleEn,
            ),

          description:
            listing.descriptionEn,

          basePrice:
            Math.round(
              proposedSellPrice,
            ),

          categoryId:
            category.id,

          brandId:
            brand.id,

          isActive:
            true,
        },
      },
    );

  const costUsd =
    Number(
      match.costUsd ||
        0,
    );

  const supplierUrl =
    String(
      match.url ||
        "",
    );

  const supplierImage =
    match.image
      ? String(
          match.image,
        )
      : null;

  /*
   * SKU must be unique per PRODUCT, not per supplier item.
   *
   * This was `CJ-${supplierId}` and ProductVariant.sku is globally @unique.
   * When two different researched keywords matched the same CJ product - which
   * happened for seven pairs in the first catalogue - the second publish
   * upserted on that shared sku, found the FIRST product's variant, and updated
   * it. The result was the second product left with no variant at all (and so
   * invisible), and the first product's price and image silently overwritten
   * with the second's.
   *
   * The supplier id is still recorded in `attributes` and in
   * ProductIntelligence.supplierProductId for fulfilment.
   */
  const sku =
    `CJ-${supplierId}-${product.id.slice(0, 8)}`;

  const attributes =
    asInputJson({
      hindiTitle:
        listing.titleHi,

      hindiDescription:
        listing.descriptionHi,

      supplierCostUsd:
        costUsd,

      supplierUrl,

      cjSupplierProductId:
        supplierId,

      cjSupplierProductName:
        String(
          match.name ||
            "",
        ),

      novaScore:
        candidate.finalScore,

      novaConfidence:
        candidate.confidence,

      commercialSanity:
        candidate.evidence
          .economics,

      marketEvidence:
        candidate.evidence,
    });

  await prisma.productVariant.upsert(
    {
      where: {
        sku,
      },

      update: {
        price:
          product.basePrice,

        attributes,

        imageUrl:
          supplierImage,

        /*
         * Restock on re-publish.
         *
         * A product that was retired and later re-approved must become
         * purchasable again, otherwise it returns to the catalogue invisible.
         */
        stock:
          DROPSHIP_STOCK,
      },

      create: {
        productId:
          product.id,

        sku,

        name:
          "Standard",

        price:
          product.basePrice,

        imageUrl:
          supplierImage,

        attributes,

        /*
         * Stock MUST be set here.
         *
         * ProductVariant.stock defaults to 0 in the schema, and the storefront
         * filters on `variants: { some: { stock: { gt: 0 } } }`. Every product
         * published before this line existed was created correctly, marked
         * active, given a lifecycle row and a prediction — and then hidden from
         * every listing page, because it had no stock.
         *
         * This is dropshipping: CJ holds the inventory, so there is no real
         * local count to track. A nominal figure represents "available to
         * order". If NovaCart ever holds its own stock this must become a real
         * number synced from the supplier.
         */
        stock:
          DROPSHIP_STOCK,
      },
    },
  );

  /*
   * Close the front half of the loop.
   *
   * Publishing used to be the end of the story: a product appeared and nothing
   * recorded what NOVA had believed about it. Two things are registered here so
   * the outcome can be graded later.
   *
   * 1. The lifecycle, which starts at TEST with reduced exposure rather than
   *    full weight, so an unproven product cannot dominate the storefront.
   *
   * 2. A falsifiable success prediction carrying the exact signal vector the
   *    decision was made from. Without this vector the learning engine has
   *    nothing to correlate against realised sales, and the weights can never
   *    improve.
   *
   * Neither is allowed to fail the publish: a product that is live but
   * unregistered is recoverable, a crash mid-publish is not.
   */
  try {
    await startLifecycle(
      product.id,
      `Published by NOVA at score ${candidate.finalScore}/100 with ${candidate.confidence}% confidence. ${candidate.reason}`,
    );

    const { version: modelVersion } =
      await getActiveWeights();

    /*
     * Expected units over the horizon.
     *
     * This is a deliberately crude prior — score and confidence scaled into a
     * small unit count — because there is no sales history to calibrate
     * against yet. Its purpose is not to be accurate on day one; it is to be
     * written down and graded, so the error term exists to learn from.
     */
    const horizonDays =
      Number(
        process.env
          .NOVA_SUCCESS_HORIZON_DAYS ||
          28,
      );

    const expectedUnits =
      Math.max(
        0,
        Math.round(
          (candidate.finalScore / 100) *
            (candidate.confidence / 100) *
            6,
        ),
      );

    await recordPrediction({
      productId: product.id,

      kind: "PRODUCT_SUCCESS",

      metric: `units_${horizonDays}d`,

      predictedValue: expectedUnits,

      confidence: candidate.confidence,

      horizonDays,

      modelVersion,

      features: {
        signals: {
          demand: candidate.demandScore,
          trendVelocity: candidate.trendVelocity,
          shoppingIntent: candidate.shoppingScore,
          contentInterest: candidate.contentInterest,
          newsInterest: candidate.marketValidationScore,
          socialInterest: candidate.socialScore,
          competition: candidate.competitionScore,
          marginPercent: candidate.expectedMarginPercent,
          repeatPurchase: candidate.repeatPurchaseScore,
          returnRisk: candidate.returnRiskScore,
          serviceRisk: candidate.serviceRiskScore,
          operationalEase: candidate.operationalEaseScore,
        },
        finalScore: candidate.finalScore,
        keyword: candidate.keyword,
        category: candidate.category,
        productType: candidate.productType,
        demandArchetype: candidate.demandArchetype,
      },

      rationale: candidate.reason,
    });

    await recordDecision({
      kind: "PUBLISH",

      subjectType: "PRODUCT",

      subjectId: product.id,

      productId: product.id,

      status: "AUTO_APPLIED",

      summary: `Published "${product.title}" from candidate "${candidate.keyword}"`,

      rationale: candidate.reason,

      inputs: {
        finalScore: candidate.finalScore,
        confidence: candidate.confidence,
        demandScore: candidate.demandScore,
        competitionScore: candidate.competitionScore,
        expectedMarginPercent:
          candidate.expectedMarginPercent,
        supplierScore: candidate.supplierScore,
        commercialSanity:
          candidate.commercialSanity,
      },

      modelVersion,

      confidence: candidate.confidence,
    });
  } catch (registrationError) {
    console.error(
      "[nova] Product published but lifecycle/prediction registration failed:",
      registrationError,
    );
  }

  return {
    created:
      true,

    productId:
      product.id,

    productTitle:
      product.title,
  };
}
