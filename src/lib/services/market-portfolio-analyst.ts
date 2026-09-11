// FILE: src/lib/services/market-portfolio-analyst.ts

import {
  callNovaAI,
} from "./nova-ai-provider";

export interface PortfolioRankingItem {
  keyword: string;
  priority: number;
  portfolioRole: string;
  whyNow: string;
  mainRisk: string;
}

export interface PortfolioSelection {
  selectedKeywords: string[];

  ranking:
    PortfolioRankingItem[];

  portfolioRationale:
    string;

  confidence:
    number;
}

interface CandidateLike {
  keyword?: unknown;
  decision?: unknown;
  commercialSanity?: unknown;
  confidence?: unknown;
  finalScore?: unknown;
  demandScore?: unknown;
  competitionScore?: unknown;
  expectedMarginPercent?: unknown;
  repeatPurchaseScore?: unknown;
  returnRiskScore?: unknown;
  serviceRiskScore?: unknown;
  operationalEaseScore?: unknown;
  supplierScore?: unknown;
  demandArchetype?: unknown;
  productType?: unknown;
  category?: unknown;
  reason?: unknown;
}

function clamp(
  value: unknown,
): number {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      number,
    ),
  );
}

function asCandidate(
  value: unknown,
): CandidateLike {
  return (
    value &&
    typeof value ===
      "object"
      ? value
      : {}
  ) as CandidateLike;
}

function normalizeKeyword(
  value: unknown,
): string {
  return String(
    value || "",
  )
    .trim()
    .toLowerCase();
}

function isQualifiedPortfolioCandidate(
  value: unknown,
): boolean {
  const candidate =
    asCandidate(value);

  const keyword =
    normalizeKeyword(
      candidate.keyword,
    );

  if (!keyword) {
    return false;
  }

  /*
   * Portfolio candidates may be:
   *   PUBLISH
   *   REVIEW
   *
   * But NEVER:
   *   REJECT
   *
   * The portfolio strategist must not resurrect a rejected candidate.
   */
  const decision =
    String(
      candidate.decision ||
        "",
    ).toUpperCase();

  if (
    decision ===
    "REJECT"
  ) {
    return false;
  }

  /*
   * Commercial FAIL is a hard exclusion.
   *
   * Commercial UNKNOWN is also excluded from the portfolio shortlist.
   * It may remain in the wider research results, but the portfolio layer
   * must not describe it as qualified.
   */
  const commercial =
    String(
      candidate.commercialSanity ||
        "",
    ).toUpperCase();

  if (
    commercial !==
    "PASS"
  ) {
    return false;
  }

  /*
   * A portfolio candidate needs actual supplier evidence.
   *
   * This prevents "supplier unknown" opportunities from being presented
   * as ready portfolio choices.
   */
  const supplierScore =
    clamp(
      candidate.supplierScore,
    );

  if (
    supplierScore <=
    0
  ) {
    return false;
  }

  /*
   * Likewise, a portfolio candidate should have a usable economics result.
   */
  const margin =
    Number(
      candidate.expectedMarginPercent,
    );

  if (
    !Number.isFinite(
      margin,
    )
  ) {
    return false;
  }

  /*
   * Competition must be known for a commercial portfolio selection.
   */
  const competition =
    Number(
      candidate.competitionScore,
    );

  if (
    !Number.isFinite(
      competition,
    )
  ) {
    return false;
  }

  /*
   * Confidence below this level is research-stage evidence, not portfolio
   * evidence.
   */
  const confidence =
    clamp(
      candidate.confidence,
    );

  if (
    confidence <
    55
  ) {
    return false;
  }

  return true;
}

function scoreForPortfolio(
  value: unknown,
): number {
  const candidate =
    asCandidate(value);

  const finalScore =
    clamp(
      candidate.finalScore,
    );

  const confidence =
    clamp(
      candidate.confidence,
    );

  const demand =
    clamp(
      candidate.demandScore,
    );

  const competition =
    clamp(
      candidate.competitionScore,
    );

  const margin =
    clamp(
      Number(
        candidate.expectedMarginPercent,
      ) * 2.5,
    );

  const repeat =
    clamp(
      candidate.repeatPurchaseScore,
    );

  const returnSafety =
    clamp(
      100 -
        clamp(
          candidate.returnRiskScore,
        ),
    );

  const serviceSafety =
    clamp(
      100 -
        clamp(
          candidate.serviceRiskScore,
        ),
    );

  const operational =
    clamp(
      candidate.operationalEaseScore,
    );

  return Math.round(
    finalScore *
      0.28 +
      confidence *
        0.15 +
      demand *
        0.08 +
      competition *
        0.10 +
      margin *
        0.12 +
      repeat *
        0.08 +
      returnSafety *
        0.07 +
      serviceSafety *
        0.05 +
      operational *
        0.07,
  );
}

function fallbackPortfolio(
  candidates: unknown[],
  max: number,
): PortfolioSelection | null {
  const qualified =
    candidates
      .filter(
        isQualifiedPortfolioCandidate,
      )
      .map(
        (value) => ({
          candidate:
            asCandidate(value),

          score:
            scoreForPortfolio(
              value,
            ),
        }),
      )
      .sort(
        (
          a,
          b,
        ) =>
          b.score -
          a.score,
      );

  if (
    qualified.length ===
    0
  ) {
    return null;
  }

  /*
   * Product-family/category concentration controls.
   *
   * We keep these intentionally conservative. The portfolio is allowed
   * to contain several products from the same broad category, but not
   * multiple near-identical product concepts.
   */
  const selected: Array<{
    keyword: string;
    score: number;
    candidate: CandidateLike;
  }> = [];

  const usedKeywords =
    new Set<string>();

  const usedCategories =
    new Map<
      string,
      number
    >();

  for (
    const item of
      qualified
  ) {
    const keyword =
      normalizeKeyword(
        item.candidate
          .keyword,
      );

    if (
      usedKeywords.has(
        keyword,
      )
    ) {
      continue;
    }

    const category =
      String(
        item.candidate
          .category ||
          "",
      )
        .trim()
        .toLowerCase();

    const categoryCount =
      usedCategories.get(
        category,
      ) || 0;

    /*
     * At most two portfolio entries from the same exact category.
     */
    if (
      category &&
      categoryCount >=
        2
    ) {
      continue;
    }

    selected.push(
      {
        keyword,
        score:
          item.score,
        candidate:
          item.candidate,
      },
    );

    usedKeywords.add(
      keyword,
    );

    if (
      category
    ) {
      usedCategories.set(
        category,
        categoryCount +
          1,
      );
    }

    if (
      selected.length >=
      max
    ) {
      break;
    }
  }

  if (
    selected.length ===
    0
  ) {
    return null;
  }

  const ranking =
    selected.map(
      (
        item,
        index,
      ) => {
        const candidate =
          item.candidate;

        const productType =
          String(
            candidate.productType ||
              "UNKNOWN",
          );

        const archetype =
          String(
            candidate.demandArchetype ||
              "UNKNOWN",
          );

        return {
          keyword:
            String(
              candidate.keyword ||
                "",
            ),

          priority:
            index + 1,

          portfolioRole:
            index === 0
              ? "Primary opportunity"
              : index === 1
                ? "Secondary opportunity"
                : "Diversified opportunity",

          whyNow:
            `Strongest available NOVA evidence combination with score ${item.score}/100. ` +
            `${productType} / ${archetype} opportunity with validated commercial sanity.`,

          mainRisk:
            String(
              candidate.reason ||
                "Requires live-market validation after launch.",
            ),
        };
      },
    );

  const averageConfidence =
    Math.round(
      selected.reduce(
        (
          sum,
          item,
        ) =>
          sum +
          clamp(
            item.candidate
              .confidence,
          ),
        0,
      ) /
        selected.length,
    );

  return {
    selectedKeywords:
      selected.map(
        (
          item,
        ) =>
          String(
            item.candidate
              .keyword ||
              "",
          ),
      ),

    ranking,

    portfolioRationale:
      "No AI portfolio synthesis was available. NOVA used deterministic portfolio controls, " +
      "excluding rejected candidates, commercial failures, unknown economics, unknown competition, " +
      "missing supplier evidence and low-confidence candidates.",

    confidence:
      averageConfidence,
  };
}

function extractJson(
  text: string,
): Record<
  string,
  unknown
> | null {
  const cleaned =
    text
      .replace(
        /```json/gi,
        "",
      )
      .replace(
        /```/g,
        "",
      )
      .trim();

  const first =
    cleaned.indexOf(
      "{",
    );

  const last =
    cleaned.lastIndexOf(
      "}",
    );

  if (
    first < 0 ||
    last <= first
  ) {
    return null;
  }

  try {
    return JSON.parse(
      cleaned.slice(
        first,
        last + 1,
      ),
    ) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function parsePortfolioResponse(
  text: string,
  qualified:
    CandidateLike[],
  max: number,
): PortfolioSelection | null {
  const parsed =
    extractJson(text);

  if (!parsed) {
    return null;
  }

  const allowed =
    new Set(
      qualified
        .map(
          (
            candidate,
          ) =>
            normalizeKeyword(
              candidate.keyword,
            ),
        )
        .filter(Boolean),
    );

  const rawSelected =
    Array.isArray(
      parsed.selectedKeywords,
    )
      ? parsed.selectedKeywords
          .map(String)
          .map(
            normalizeKeyword,
          )
          .filter(
            (
              value,
            ) =>
              allowed.has(
                value,
              ),
          )
      : [];

  /*
   * Deduplicate selection while respecting the portfolio size cap.
   */
  const selectedKeywords =
    [
      ...new Set(
        rawSelected,
      ),
    ].slice(
      0,
      max,
    );

  const rawRanking =
    Array.isArray(
      parsed.ranking,
    )
      ? parsed.ranking
      : [];

  const ranking =
    rawRanking
      .map(
        (item) =>
          item &&
          typeof item ===
            "object"
            ? item as Record<
                string,
                unknown
              >
            : null,
      )
      .filter(
        (
          item,
        ): item is Record<
          string,
          unknown
        > =>
          Boolean(item),
      )
      .map(
        (item) => ({
          keyword:
            String(
              item.keyword ||
                "",
            ),

          priority:
            Math.max(
              1,
              Number(
                item.priority,
              ) || 99,
            ),

          portfolioRole:
            String(
              item.portfolioRole ||
                "",
            ),

          whyNow:
            String(
              item.whyNow ||
                "",
            ),

          mainRisk:
            String(
              item.mainRisk ||
                "",
            ),
        }),
      )
      .filter(
        (
          item,
        ) =>
          allowed.has(
            normalizeKeyword(
              item.keyword,
            ),
          ),
      )
      .sort(
        (
          a,
          b,
        ) =>
          a.priority -
          b.priority,
      )
      .slice(
        0,
        10,
      );

  /*
   * NEVER permit the AI to claim a candidate that was not actually
   * allowed by deterministic NOVA gates.
   */
  const safeSelected =
    selectedKeywords.filter(
      (
        keyword,
      ) =>
        ranking.length ===
          0 ||
        ranking.some(
          (
            item,
          ) =>
            normalizeKeyword(
              item.keyword,
            ) ===
            keyword,
        ),
    );

  if (
    safeSelected.length ===
      0 &&
    ranking.length ===
      0
  ) {
    return null;
  }

  const confidence =
    clamp(
      parsed.confidence,
    );

  return {
    selectedKeywords:
      safeSelected.length
        ? safeSelected
        : ranking
            .slice(
              0,
              max,
            )
            .map(
              (
                item,
              ) =>
                normalizeKeyword(
                  item.keyword,
                ),
            ),

    ranking,

    portfolioRationale:
      String(
        parsed.portfolioRationale ||
          "",
      ),

    confidence,
  };
}

export async function synthesizePortfolio(
  candidates: unknown[],
): Promise<
  PortfolioSelection | null
> {
  const max =
    Math.max(
      1,
      Math.min(
        5,
        Number(
          process.env
            .NOVA_MAX_AUTOPUBLISH_PER_RUN ||
            3,
        ),
      ),
    );

  /*
   * First deterministic gate.
   *
   * The AI NEVER receives candidates that are already commercially
   * disqualified.
   */
  const qualified =
    candidates
      .filter(
        isQualifiedPortfolioCandidate,
      )
      .map(
        asCandidate,
      )
      .sort(
        (
          a,
          b,
        ) =>
          scoreForPortfolio(
            b,
          ) -
          scoreForPortfolio(
            a,
          ),
      );

  /*
   * This is intentionally allowed to return null.
   *
   * NOVA must be able to say:
   * "No sufficiently evidenced portfolio exists yet."
   *
   * It must never manufacture a portfolio from weak candidates.
   */
  if (
    qualified.length ===
    0
  ) {
    return null;
  }

  /*
   * If we only have one or two qualified opportunities, there is no
   * reason to spend AI quota on a portfolio synthesis.
   */
  if (
    qualified.length <=
    max
  ) {
    return fallbackPortfolio(
      qualified,
      max,
    );
  }

  const system = `
You are NOVA's portfolio strategist for NovaCart in India.

Your job is to choose a SMALL, evidence-qualified product portfolio.

You are NOT allowed to:
- invent market evidence
- invent supplier evidence
- invent margins
- invent competition
- select rejected candidates
- select commercial-failure candidates
- select candidates with unknown economics
- select candidates with unknown competition
- select candidates without supplier evidence
- select low-confidence candidates
- claim guaranteed success

Every candidate provided to you has already passed deterministic NOVA
portfolio gates.

The provided candidate evidence is authoritative.

PORTFOLIO OBJECTIVE:
Prefer a diversified combination of products with:
1. Strong demand or strong practical utility.
2. Genuine repeat/replenishment economics where applicable.
3. Healthy contribution economics.
4. Comparatively lower competition.
5. Low return/RTO risk.
6. Low service/support burden.
7. Easy fulfilment.
8. Strong supplier evidence.
9. Good evidence confidence.
10. Different but complementary demand mechanics.

IMPORTANT:
Repeated USE does not mean repeated PURCHASE.

A brush, organizer, holder or rack may be used repeatedly but can still
be a durable one-time purchase.

Portfolio diversification:
- Avoid multiple near-identical products.
- Avoid choosing several products for essentially the same customer problem.
- Prefer different product families when quality is comparable.
- Do not sacrifice strong evidence merely to force artificial category diversity.

VERY IMPORTANT:
You may select fewer than the maximum.
You may select ZERO if the evidence does not support a meaningful portfolio.

Never use the words:
"guaranteed",
"certain winner",
"assured success".

Return ONLY valid JSON:

{
  "selectedKeywords": ["exact candidate keyword"],
  "ranking": [
    {
      "keyword": "exact candidate keyword",
      "priority": 1,
      "portfolioRole": "short role",
      "whyNow": "evidence-grounded reason",
      "mainRisk": "main evidence-backed risk"
    }
  ],
  "portfolioRationale": "brief evidence-grounded portfolio explanation",
  "confidence": 0
}
`;

  const user =
    `QUALIFIED CANDIDATES:\n${JSON.stringify(
      qualified,
    ).slice(
      0,
      50000,
    )}`;

  const ai =
    await callNovaAI(
      {
        system,

        user,

        temperature:
          0,

        maxTokens:
          1800,
      },
    );

  if (!ai) {
    return fallbackPortfolio(
      qualified,
      max,
    );
  }

  const parsed =
    parsePortfolioResponse(
      ai.text,
      qualified,
      max,
    );

  if (!parsed) {
    return fallbackPortfolio(
      qualified,
      max,
    );
  }

  /*
   * Final deterministic validation of the AI output.
   */
  const safeSelected =
    parsed.selectedKeywords.filter(
      (
        keyword,
      ) => {
        const candidate =
          qualified.find(
            (
              item,
            ) =>
              normalizeKeyword(
                item.keyword,
              ) ===
              normalizeKeyword(
                keyword,
              ),
          );

        return Boolean(
          candidate,
        );
      },
    );

  const safeRanking =
    parsed.ranking.filter(
      (
        item,
      ) =>
        qualified.some(
          (
            candidate,
          ) =>
            normalizeKeyword(
              candidate.keyword,
            ) ===
            normalizeKeyword(
              item.keyword,
            ),
        ),
    );

  if (
    safeSelected.length ===
      0 &&
    safeRanking.length ===
      0
  ) {
    return fallbackPortfolio(
      qualified,
      max,
    );
  }

  return {
    selectedKeywords:
      safeSelected.length
        ? [
            ...new Set(
              safeSelected,
            ),
          ].slice(
            0,
            max,
          )
        : safeRanking
            .slice(
              0,
              max,
            )
            .map(
              (
                item,
              ) =>
                item.keyword,
            ),

    ranking:
      safeRanking
        .slice(
          0,
          10,
        )
        .map(
          (
            item,
            index,
          ) => ({
            ...item,

            priority:
              index + 1,
          }),
        ),

    portfolioRationale:
      parsed.portfolioRationale ||
      "Evidence-qualified portfolio synthesized by NOVA.",

    confidence:
      Math.min(
        parsed.confidence,
        Math.round(
          qualified.reduce(
            (
              sum,
              candidate,
            ) =>
              sum +
              clamp(
                candidate.confidence,
              ),
            0,
          ) /
            qualified.length,
        ),
      ),
  };
}