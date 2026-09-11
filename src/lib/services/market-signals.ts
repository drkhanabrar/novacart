// FILE: F:\projects\novacart\src\lib\services\market-signals.ts

import googleTrends from "google-trends-api";

import {
  getOpenMarketWebSignal,
} from "./open-market-sources";

export interface MarketSignal {
  keyword:
    string;

  trendScore:
    number;

  trendDirection:
    | "RISING"
    | "STEADY"
    | "FALLING";

  trendVelocity:
    number;

  shoppingScore:
    number;

  youtubeVideoCount:
    number;

  youtubeTotalViews:
    number;

  youtubeAvgViews:
    number;

  youtubeScore:
    number;

  newsScore:
    number;

  recentNewsCount:
    number;

  redditScore:
    number;

  redditPostCount:
    number;

  redditEngagement:
    number;

  sourceCount:
    number;

  geo:
    string;

  sourceUrls:
    string[];

  warnings:
    string[];

  fetchedAt:
    string;

  /*
   * Explicit source availability is kept separate from the numeric score.
   * Optional fields preserve compatibility with older persisted signals.
   */
  trendAvailable?:
    boolean;

  shoppingAvailable?:
    boolean;

  shoppingSignalDisabled?:
    boolean;

  trendSignalUsable?:
    boolean;

  shoppingSignalUsable?:
    boolean;

  /*
   * Auditable demand evidence components.
   * These are derived from the raw source scores; they do not replace them.
   */
  demandEvidenceConfidence?:
    number;

  demandEvidenceStatus?:
    "INCOMPLETE" | "PARTIAL" | "SUFFICIENT";

  trendIntensity?:
    number;

  trendMomentum?:
    number;

  shoppingIntent?:
    number;

  socialInterest?:
    number;

  contentInterest?:
    number;

  sourceCoverageScore?:
    number;

  marketValidationScore?:
    number;
}

/*
 * --------------------------------------------------------------------------
 * TIME / RETRY HELPERS
 * --------------------------------------------------------------------------
 */

function threeMonthsAgo() {
  const d =
    new Date();

  d.setMonth(
    d.getMonth() - 3,
  );

  return d;
}

async function retry<T>(
  fn:
    () => Promise<T>,
  retries =
    3,
) {
  let lastError:
    | unknown;

  for (
    let attempt = 1;
    attempt <=
    retries;
    attempt++
  ) {
    try {
      return await fn();
    } catch (
      error
    ) {
      lastError =
        error;

      if (
        attempt <
        retries
      ) {
        await new Promise<void>(
          (
            resolve,
          ) =>
            setTimeout(
              resolve,
              1000 *
                2 **
                  (
                    attempt -
                    1
                  ),
            ),
        );
      }
    }
  }

  throw lastError;
}

/*
 * --------------------------------------------------------------------------
 * GOOGLE TRENDS PARSING
 * --------------------------------------------------------------------------
 */

function parseTrendJson(
  raw:
    string,
  source:
    string,
): any {
  const text =
    raw.trim();

  if (
    !text.startsWith(
      "{",
    ) &&
    !text.startsWith(
      "[",
    )
  ) {
    throw new Error(
      `${source} returned non-JSON content`,
    );
  }

  return JSON.parse(
    text,
  );
}

/*
 * --------------------------------------------------------------------------
 * TREND SUMMARIZATION
 * --------------------------------------------------------------------------
 */

function summarize(
  values:
    number[],
) {
  const clean =
    values.filter(
      (
        value,
      ) =>
        Number.isFinite(
          value,
        ),
    );

  if (
    !clean.length
  ) {
    return {
      score:
        0,

      direction:
        "STEADY" as const,

      velocity:
        0,
    };
  }

  const avg =
    clean.reduce(
      (
        a,
        b,
      ) =>
        a + b,
      0,
    ) /
    clean.length;

  const middle =
    Math.floor(
      clean.length /
        2,
    );

  const first =
    clean.slice(
      0,
      middle,
    );

  const second =
    clean.slice(
      middle,
    );

  const firstAverage =
    first.reduce(
      (
        x,
        y,
      ) =>
        x + y,
      0,
    ) /
    (
      first.length ||
      1
    );

  const secondAverage =
    second.reduce(
      (
        x,
        y,
      ) =>
        x + y,
      0,
    ) /
    (
      second.length ||
      1
    );

  const velocity =
    firstAverage >
    0
      ? Math.max(
          -100,
          Math.min(
            100,
            Math.round(
              (
                (
                  secondAverage -
                  firstAverage
                ) /
                firstAverage
              ) *
                100,
            ),
          ),
        )
      : secondAverage >
          0
        ? 100
        : 0;

  return {
    score:
      Math.round(
        Math.max(
          0,
          Math.min(
            100,
            avg,
          ),
        ),
      ),

    direction:
      secondAverage >
      firstAverage *
        1.15
        ? (
            "RISING" as const
          )
        : secondAverage <
            firstAverage *
              0.85
          ? (
              "FALLING" as const
            )
          : (
              "STEADY" as const
            ),

    velocity,
  };
}

/*
 * --------------------------------------------------------------------------
 * GOOGLE TRENDS SIGNALS
 * --------------------------------------------------------------------------
 */

async function trends(
  keyword:
    string,
  geo:
    string,
) {
  return retry(
    async () => {
      const raw =
        await googleTrends.interestOverTime(
          {
            keyword,

            geo,

            startTime:
              threeMonthsAgo(),

            endTime:
              new Date(),
          },
        );

      const parsed =
        parseTrendJson(
          raw,
          "Google Trends",
        );

      /*
       * Annotated because the parsed Trends payload is untyped.
       *
       * Without this, timelineData is `any`, so .map() returns `any`, and the
       * .some() callback below has nothing to infer its parameter from - which
       * fails a production build under noImplicitAny even though it compiles
       * fine in dev.
       */
      const values: number[] =
        (
          parsed
            ?.default
            ?.timelineData ??
          []
        ).map(
          (
            item: {
              value?: unknown[];
            },
          ) =>
            Number(
              item?.value?.[0] ??
                0,
            ),
        );

      const summary =
        summarize(
          values,
        );

      return {
        ...summary,
        usable:
          values.some(
            (value) =>
              Number.isFinite(value) &&
              value > 0,
          ),
      };
    },
  );
}

async function shopping(
  keyword:
    string,
  geo:
    string,
) {
  return retry(
    async () => {
      const raw =
        await googleTrends.interestOverTime(
          {
            keyword,

            geo,

            property:
              "froogle",

            startTime:
              threeMonthsAgo(),

            endTime:
              new Date(),
          },
        );

      const parsed =
        parseTrendJson(
          raw,
          "Google Shopping Trends",
        );

      const values: number[] =
        (
          parsed
            ?.default
            ?.timelineData ??
          []
        ).map(
          (
            item: {
              value?: unknown[];
            },
          ) =>
            Number(
              item?.value?.[0] ??
                0,
            ),
        );

      const score =
        values.length
          ? Math.round(
              values.reduce(
                (
                  a:
                    number,
                  b:
                    number,
                ) =>
                  a + b,
                0,
              ) /
                values.length,
            )
          : 0;

      return {
        score,
        usable:
          values.some(
            (value) =>
              Number.isFinite(value) &&
              value > 0,
          ),
      };
    },
    2,
  );
}

/*
 * --------------------------------------------------------------------------
 * MARKET SIGNAL COLLECTION
 * --------------------------------------------------------------------------
 */

export async function getMarketSignals(
  keyword:
    string,
  options: {
    geo?:
      string;

    useShoppingSignal?:
      boolean;

    openWebSignal?:
      Awaited<
        ReturnType<
          typeof getOpenMarketWebSignal
        >
      >;
  } = {},
): Promise<
  MarketSignal
> {
  const geo =
    options.geo ||
    process.env
      .NOVA_MARKET_REGION ||
    "IN";

  const warnings:
    string[] =
    [];

  /*
   * Each source is isolated. A failure becomes an evidence warning rather
   * than a fatal error for the candidate.
   */
  const trendPromise =
    trends(
      keyword,
      geo,
    )
      .then(
        (
          value,
        ) => ({
          available:
            true,
          value,
        }),
      )
      .catch(
        (
          error,
        ) => {
          warnings.push(
            `Google Trends failed: ${String(
              error,
            )}`,
          );

          return {
            available:
              false,
            value: {
              score:
                0,
              direction:
                "STEADY" as const,
              velocity:
                0,
              usable:
                false,
            },
          };
        },
      );

  const shoppingPromise =
    options.useShoppingSignal ===
    false
      ? Promise.resolve({
          available:
            false,
          disabled:
            true,
          value:
            {
              score:
                0,
              usable:
                false,
            },
        })
      : shopping(
          keyword,
          geo,
        )
          .then(
            (
              value,
            ) => ({
              available:
                true,
              disabled:
                false,
              value,
            }),
          )
          .catch(
            (
              error,
            ) => {
              warnings.push(
                `Google Shopping Trends failed: ${String(
                  error,
                )}`,
              );

              return {
                available:
                  false,
                disabled:
                  false,
                value:
                  {
                    score:
                      0,
                    usable:
                      false,
                  },
              };
            },
          );

  const webPromise =
    options.openWebSignal
      ? Promise.resolve(
          options.openWebSignal,
        )
      : getOpenMarketWebSignal(
          keyword,
        );

  const [
    trendResult,
    shoppingResult,
    webResult,
  ] =
    await Promise.all([
      trendPromise,
      shoppingPromise,
      webPromise,
    ]);

  warnings.push(
    ...webResult.warnings,
  );

  /*
   * Count only genuinely observed evidence families. A configured provider
   * that returned an error does not count as evidence.
   */
  const sourceCount =
    (
      trendResult.available &&
      trendResult.value.usable
        ? 1
        : 0
    ) +
    (
      shoppingResult.available &&
      shoppingResult.value.usable
        ? 1
        : 0
    ) +
    (
      webResult.youtubeVideoCount >
        0
        ? 1
        : 0
    ) +
    (
      webResult.newsCount >
        0
        ? 1
        : 0
    ) +
    (
      webResult.redditPostCount >
        0
        ? 1
        : 0
    ) +
    (
      webResult.webResultCount >
        0
        ? 1
        : 0
    ) +
    (
      webResult.amazonResultCount >
        0
        ? 1
        : 0
    ) +
    (
      webResult.tavilyResultCount >
        0
        ? 1
        : 0
    );

  /*
   * Preserve the availability facts for downstream intelligence without
   * breaking existing consumers.
   */
  return {
    keyword,

    trendScore:
      trendResult.value
        .score,

    trendDirection:
      trendResult.value
        .direction,

    trendVelocity:
      trendResult.value
        .velocity,

    shoppingScore:
      shoppingResult.value.score,

    youtubeVideoCount:
      webResult.youtubeVideoCount,

    youtubeTotalViews:
      webResult.youtubeViews,

    youtubeAvgViews:
      webResult.youtubeAvgViews,

    youtubeScore:
      webResult.youtubeScore,

    newsScore:
      webResult.newsScore,

    recentNewsCount:
      webResult.recentNewsCount,

    redditScore:
      webResult.redditScore,

    redditPostCount:
      webResult.redditPostCount,

    redditEngagement:
      webResult.redditEngagement,

    sourceCount,

    geo,

    sourceUrls:
      webResult.sourceUrls,

    warnings: [
      ...new Set(
        warnings,
      ),
    ],

    fetchedAt:
      new Date().toISOString(),

    trendAvailable:
      trendResult.available,

    shoppingAvailable:
      shoppingResult.available,

    shoppingSignalDisabled:
      shoppingResult.disabled,

    trendSignalUsable:
      trendResult.available &&
      trendResult.value.usable,

    shoppingSignalUsable:
      shoppingResult.available &&
      shoppingResult.value.usable,
  } as MarketSignal & {
    trendAvailable:
      boolean;

    shoppingAvailable:
      boolean;

    shoppingSignalDisabled:
      boolean;

    trendSignalUsable:
      boolean;

    shoppingSignalUsable:
      boolean;
  };
}

/*
 * --------------------------------------------------------------------------
 * DEMAND EVIDENCE CONFIDENCE
 * --------------------------------------------------------------------------
 *
 * This is intentionally separate from demand score.
 *
 * Examples:
 *
 *   demand 30 / confidence 90
 *       = reliable evidence of weak demand
 *
 *   demand 30 / confidence 25
 *       = mostly missing data
 *
 * The engine should not treat those as equivalent.
 */
function calculateDemandEvidenceConfidence(
  signal:
    MarketSignal,
) {
  const googleTrendAvailable =
    signal.trendAvailable ??
    !signal.warnings.some(
      (
        warning,
      ) =>
        warning
          .toLowerCase()
          .includes(
            "google trends failed",
          ),
    );

  const googleShoppingAvailable =
    signal.shoppingAvailable ??
    !signal.warnings.some(
      (
        warning,
      ) =>
        warning
          .toLowerCase()
          .includes(
            "google shopping trends failed",
          ),
    );

  let confidence =
    0;

  /*
   * Primary search evidence is valuable, but it must not dominate the whole
   * confidence calculation when public endpoints are unavailable.
   */
  if (
    googleTrendAvailable
  ) {
    confidence +=
      25;
  }

  if (
    googleShoppingAvailable &&
    signal.shoppingScore >
      0
  ) {
    confidence +=
      15;
  }

  /*
   * Independent public-market signals.
   */
  if (
    signal.youtubeVideoCount >
    0
  ) {
    confidence +=
      15;
  }

  if (
    signal.newsScore >
      0 ||
    signal.recentNewsCount >
      0
  ) {
    confidence +=
      10;
  }

  if (
    signal.redditPostCount >
      0 ||
    signal.redditScore >
      0
  ) {
    confidence +=
      10;
  }

  /*
   * Breadth of independent sources.
   */
  if (
    signal.sourceCount >=
    6
  ) {
    confidence +=
      15;
  } else if (
    signal.sourceCount >=
    4
  ) {
    confidence +=
      12;
  } else if (
    signal.sourceCount >=
    3
  ) {
    confidence +=
      9;
  } else if (
    signal.sourceCount >=
    2
  ) {
    confidence +=
      5;
  }

  /*
   * Missing Google endpoints reduce confidence, not demand.
   *
   * A blocked source is a coverage problem. It is not evidence that demand is
   * weak.
   */
  const primaryFailures =
    [
      googleTrendAvailable
        ? false
        : true,
      googleShoppingAvailable
        ? false
        : true,
    ].filter(
      Boolean,
    ).length;

  confidence -=
    Math.min(
      20,
      primaryFailures *
        6,
    );

  /*
   * Additional warnings matter, but do not destroy confidence simply because
   * one public source is noisy.
   */
  const nonPrimaryWarnings =
    signal.warnings.filter(
      (
        warning,
      ) => {
        const lower =
          warning.toLowerCase();

        return (
          !lower.includes(
            "google trends failed",
          ) &&
          !lower.includes(
            "google shopping trends failed",
          )
        );
      },
    ).length;

  confidence -=
    Math.min(
      15,
      nonPrimaryWarnings *
        3,
    );

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        confidence,
      ),
    ),
  );
}

/*
 * --------------------------------------------------------------------------
 * DEMAND SCORE/*
 * --------------------------------------------------------------------------
 * DEMAND SCORE
 * --------------------------------------------------------------------------
 *
 * IMPORTANT:
 *
 * A missing Google Trends response is NOT equivalent to demand = zero.
 *
 * This function produces:
 *
 *   overallScore
 *   demandLevel
 *   demandEvidenceConfidence
 *   evidenceStatus
 *
 * The existing market-engine can continue consuming overallScore while
 * later stages can use confidence/status to determine whether a rejection
 * is actually supported by sufficiently complete evidence.
 */
export function calculateDemandScore(
  signal:
    MarketSignal,
) {
  const trendAvailable =
    signal.trendAvailable ??
    !signal.warnings.some(
      (
        warning,
      ) =>
        warning
          .toLowerCase()
          .includes(
            "google trends failed",
          ),
    );

  const shoppingAvailable =
    signal.shoppingAvailable ??
    !signal.warnings.some(
      (
        warning,
      ) =>
        warning
          .toLowerCase()
          .includes(
            "google shopping trends failed",
          ),
    );

  /*
   * Endpoint availability is not the same as usable demand evidence.
   * A successful Google request can return an all-zero series when the
   * keyword has insufficient observable volume. That is inconclusive, not a
   * verified zero-demand observation, so its weight is redistributed.
   */
  const trendSignalUsable =
    signal.trendSignalUsable ??
    (trendAvailable &&
      signal.trendScore > 0);

  const shoppingSignalUsable =
    signal.shoppingSignalUsable ??
    (shoppingAvailable &&
      signal.shoppingScore > 0);

  const evidenceConfidence =
    calculateDemandEvidenceConfidence(
      signal,
    );

  const breadth =
    Math.min(
      100,
      signal.sourceCount * 12.5,
    );

  /*
   * A velocity spike from a near-zero trend baseline is unreliable. Momentum
   * is therefore neutralized until there is at least a modest trend level.
   */
  const momentumScore =
    trendSignalUsable &&
    signal.trendScore >= 15
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              (Number(
                signal.trendVelocity,
              ) + 100) / 2,
            ),
          ),
        )
      : 50;

  /*
   * Base weights:
   *   trend 27% + momentum 7% + shopping 18% + YouTube 15% + news 10%
   *   + Reddit 8% + source breadth 15% = 100%.
   *
   * Only usable evidence is admitted. The active weights are then normalized,
   * so a missing/inconclusive source does not masquerade as negative demand.
   */
  const weightedParts: Array<{
    value: number;
    weight: number;
    active: boolean;
  }> = [
    {
      value:
        Math.max(
          0,
          Math.min(
            100,
            signal.trendScore,
          ),
        ),
      weight:
        0.27,
      active:
        trendSignalUsable,
    },
    {
      value:
        momentumScore,
      weight:
        0.07,
      active:
        trendSignalUsable &&
        signal.trendScore >= 15,
    },
    {
      value:
        Math.max(
          0,
          Math.min(
            100,
            signal.shoppingScore,
          ),
        ),
      weight:
        0.18,
      active:
        shoppingSignalUsable,
    },
    {
      value:
        Math.max(
          0,
          Math.min(
            100,
            signal.youtubeScore,
          ),
        ),
      weight:
        0.15,
      active:
        signal.youtubeVideoCount >
          0 ||
        signal.youtubeScore >
          0,
    },
    {
      value:
        Math.max(
          0,
          Math.min(
            100,
            signal.newsScore,
          ),
        ),
      weight:
        0.10,
      active:
        signal.newsScore >
          0 ||
        signal.recentNewsCount >
          0,
    },
    {
      value:
        Math.max(
          0,
          Math.min(
            100,
            signal.redditScore,
          ),
        ),
      weight:
        0.08,
      active:
        signal.redditScore >
          0 ||
        signal.redditPostCount >
          0,
    },
    {
      value:
        breadth,
      weight:
        0.15,
      active:
        signal.sourceCount >
          0,
    },
  ];

  const activeParts =
    weightedParts.filter(
      (part) => part.active,
    );

  const activeWeight =
    activeParts.reduce(
      (sum, part) =>
        sum + part.weight,
      0,
    );

  let score =
    activeWeight > 0
      ? activeParts.reduce(
          (sum, part) =>
            sum +
            part.value *
              part.weight,
          0,
        ) / activeWeight
      : 0;

  /* Small momentum adjustment; momentum cannot dominate the decision. */
  if (
    trendSignalUsable &&
    signal.trendDirection ===
      "RISING"
  ) {
    score +=
      6;
  }

  if (
    trendSignalUsable &&
    signal.trendDirection ===
      "FALLING"
  ) {
    score -=
      6;
  }

  score =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(score),
      ),
    );

  const trendDemand =
    trendSignalUsable
      ? Math.round(
          signal.trendScore *
            0.70 +
          momentumScore *
            0.30,
        )
      : 0;

  const shoppingDemand =
    shoppingSignalUsable
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              signal.shoppingScore,
            ),
          ),
        )
      : 0;

  const socialDemand =
    Math.round(
      weightedProxy(
        [
          [signal.youtubeScore, 0.65],
          [signal.redditScore, 0.35],
        ],
      ),
    );

  /*
   * Annotated deliberately.
   *
   * Without this the ternary widens to `string`, and the assignment into
   * ResearchCandidate.demandEvidenceStatus in nova-market-engine.ts fails to
   * typecheck. This was already broken before the intelligence layer landed.
   */
  const evidenceStatus:
    | "INCOMPLETE"
    | "PARTIAL"
    | "SUFFICIENT" =
    evidenceConfidence <
      45
      ? "INCOMPLETE"
      : evidenceConfidence <
          65
        ? "PARTIAL"
        : "SUFFICIENT";

  const demandLevel =
    evidenceStatus ===
      "INCOMPLETE"
      ? "UNKNOWN"
      : score >=
          75
        ? "HIGH"
        : score >=
            50
          ? "MEDIUM"
          : "LOW";

  const trendIntensity =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          signal.trendScore,
        ),
      ),
    );

  const trendMomentum =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          momentumScore,
        ),
      ),
    );

  const shoppingIntent =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          shoppingDemand,
        ),
      ),
    );

  const socialInterest =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          socialDemand,
        ),
      ),
    );

  const contentInterest =
    Math.round(
      signal.youtubeScore *
        0.60 +
      signal.newsScore *
        0.40,
    );

  const sourceCoverageScore =
    Math.min(
      100,
      Math.round(
        signal.sourceCount *
          12.5,
      ),
    );

  const marketValidationScore =
    Math.max(
      0,
      Math.min(
        100,
        Math.round(
          weightedProxy(
            [
              [
                shoppingSignalUsable
                  ? signal.shoppingScore
                  : 0,
                0.35,
              ],
              [signal.youtubeScore, 0.20],
              [signal.newsScore, 0.15],
              [signal.redditScore, 0.10],
              [sourceCoverageScore, 0.20],
            ],
          ),
        ),
      ),
    );

  return {
    overallScore:
      score,

    demandLevel,

    demandEvidenceConfidence:
      evidenceConfidence,

    evidenceStatus,

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
  };
}

/*
 * Normalize only the evidence that actually exists. This helper is used for
 * derived components, not for the primary demand score.
 */
function weightedProxy(
  parts: Array<[number, number]>,
) {
  const active =
    parts.filter(
      ([value]) =>
        Number.isFinite(value) &&
        value > 0,
    );

  if (!active.length) {
    return 0;
  }

  const weight =
    active.reduce(
      (sum, [, itemWeight]) =>
        sum + itemWeight,
      0,
    );

  return Math.round(
    active.reduce(
      (sum, [value, itemWeight]) =>
        sum + value * itemWeight,
      0,
    ) / weight,
  );
}
