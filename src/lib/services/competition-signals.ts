// FILE: src/lib/services/competition-signals.ts

import { getOpenMarketWebSignal } from "./open-market-sources";

export interface CompetitionSignal {
  known: boolean;
  provider: "OPEN_WEB" | "SERPAPI" | "NONE";
  competitionScore: number | null;
  competitionLevel: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | "UNKNOWN";
  evidenceConfidence: number;
  googleOrganicResults: number;
  googleShoppingResults: number;
  googleAdsResults: number;
  amazonOrganicResults: number;
  amazonTotalResults: number;
  amazonHighReviewProducts: number;
  amazonMedianPriceInr: number | null;
  retailDomainCount: number;
  webResultCount: number;
  tavilyResultCount: number;
  tavilyRetailDomainCount: number;
  sourceUrls: string[];
  notes: string[];
  fetchedAt: string;
}

const base = (): CompetitionSignal => ({
  known: false,
  provider: "NONE",
  competitionScore: null,
  competitionLevel: "UNKNOWN",
  evidenceConfidence: 0,
  googleOrganicResults: 0,
  googleShoppingResults: 0,
  googleAdsResults: 0,
  amazonOrganicResults: 0,
  amazonTotalResults: 0,
  amazonHighReviewProducts: 0,
  amazonMedianPriceInr: null,
  retailDomainCount: 0,
  webResultCount: 0,
  tavilyResultCount: 0,
  tavilyRetailDomainCount: 0,
  sourceUrls: [],
  notes: [],
  fetchedAt: new Date().toISOString(),
});

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function levelFor(score: number | null): CompetitionSignal["competitionLevel"] {
  if (score === null || !Number.isFinite(score)) return "UNKNOWN";
  if (score >= 75) return "LOW";
  if (score >= 50) return "MODERATE";
  if (score >= 25) return "HIGH";
  return "VERY_HIGH";
}

function scoreOpenWebCompetition(
  source: Awaited<ReturnType<typeof getOpenMarketWebSignal>>,
): {
  score: number | null;
  confidence: number;
  notes: string[];
} {
  const components: Array<{ pressure: number; weight: number }> = [];
  const notes: string[] = [];

  if (source.webResultCount > 0) {
    components.push({
      pressure: clamp(source.webResultCount * 3, 0, 36),
      weight: 0.9,
    });
  }

  if (source.retailDomainCount > 0) {
    components.push({
      pressure: clamp(source.retailDomainCount * 8, 0, 32),
      weight: 1.15,
    });
  }

  if (source.amazonResultCount > 0) {
    components.push({
      pressure: clamp(Math.log10(source.amazonResultCount + 1) * 8, 0, 20),
      weight: 1.0,
    });
  }

  if (source.amazonHighReviewCount > 0) {
    components.push({
      pressure: clamp(source.amazonHighReviewCount * 7, 0, 24),
      weight: 1.2,
    });
  }

  if (source.tavilyResultCount > 0) {
    components.push({
      pressure: clamp(source.tavilyResultCount * 4, 0, 28),
      weight: 1.0,
    });
  }

  if (source.tavilyRetailDomainCount > 0) {
    components.push({
      pressure: clamp(source.tavilyRetailDomainCount * 7, 0, 28),
      weight: 1.15,
    });
  }

  if (!components.length) {
    return {
      score: null,
      confidence: 0,
      notes: [
        "No usable public-web competition counts were returned.",
      ],
    };
  }

  const weightedPressure =
    components.reduce((sum, item) => sum + item.pressure * item.weight, 0) /
    components.reduce((sum, item) => sum + item.weight, 0);

  const score = Math.round(clamp(100 - weightedPressure));

  const coverage = components.length / 6;
  const warningPenalty = Math.min(35, source.warnings.length * 5);
  const confidence = Math.round(
    clamp(45 + coverage * 45 - warningPenalty),
  );

  notes.push(
    "Competition score is an opportunity proxy: higher means less observed market saturation.",
  );

  if (source.webCompetitionScore !== score) {
    notes.push(
      `Recalculated competition from raw evidence counts instead of relying on the blended proxy (${source.webCompetitionScore}).`,
    );
  }

  return {
    score,
    confidence,
    notes,
  };
}

async function paid(keyword: string): Promise<CompetitionSignal> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) throw new Error("SERPAPI_API_KEY not configured");

  const search = async (params: Record<string, string>) => {
    const query = new URLSearchParams({ ...params, api_key: key });
    const response = await fetch(
      `https://serpapi.com/search.json?${query.toString()}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok || data?.error) {
      throw new Error(data?.error || `SerpApi ${response.status}`);
    }
    return data;
  };

  const [google, amazon] = await Promise.all([
    search({
      engine: "google",
      q: keyword,
      gl: "in",
      hl: "en",
      location: "India",
      num: "10",
    }),
    search({
      engine: "amazon",
      k: keyword,
      amazon_domain: "amazon.in",
      language: "en_IN",
      shipping_location: "India",
    }),
  ]);

  const organic = Array.isArray(google?.organic_results)
    ? google.organic_results
    : [];
  const shopping = Array.isArray(google?.shopping_results)
    ? google.shopping_results
    : Array.isArray(google?.inline_shopping_results)
      ? google.inline_shopping_results
      : [];
  const ads = Array.isArray(google?.top_ads)
    ? google.top_ads
    : Array.isArray(google?.ads_results)
      ? google.ads_results
      : [];
  const amazonResults = Array.isArray(amazon?.organic_results)
    ? amazon.organic_results
    : [];

  const prices = amazonResults
    .map((item: any) => Number(item?.extracted_price ?? item?.price))
    .filter((value: number) => Number.isFinite(value) && value > 0);

  const highReview = amazonResults.filter(
    (item: any) => Number(item?.reviews ?? 0) >= 1000,
  ).length;

  const total = Number(amazon?.search_information?.total_results) || 0;

  const pressure =
    Math.min(25, organic.length * 2.5) +
    Math.min(18, shopping.length * 3) +
    Math.min(12, ads.length * 3) +
    Math.min(20, Math.log10(total + 1) * 6) +
    Math.min(25, highReview * 5);

  const score = Math.round(clamp(100 - pressure));

  return {
    ...base(),
    known: true,
    provider: "SERPAPI",
    competitionScore: score,
    competitionLevel: levelFor(score),
    evidenceConfidence: 95,
    googleOrganicResults: organic.length,
    googleShoppingResults: shopping.length,
    googleAdsResults: ads.length,
    amazonOrganicResults: amazonResults.length,
    amazonTotalResults: total,
    amazonHighReviewProducts: highReview,
    amazonMedianPriceInr: prices.length
      ? [...prices].sort((a, b) => a - b)[Math.floor(prices.length / 2)]
      : null,
    notes: [
      "SerpApi competition snapshot enabled.",
      "Higher competitionScore means lower observed market saturation.",
    ],
    fetchedAt: new Date().toISOString(),
  };
}

export async function getCompetitionSignal(
  keyword: string,
  openWebSignal?: Awaited<ReturnType<typeof getOpenMarketWebSignal>>,
): Promise<CompetitionSignal> {
  if (process.env.SERPAPI_API_KEY) {
    try {
      return await paid(keyword);
    } catch (error) {
      // Fall through to the free public-web evidence layer.
      const fallback = await getCompetitionSignalFromOpenWeb(
        keyword,
        openWebSignal,
      );
      fallback.notes.push(
        `SerpApi unavailable; used public-web fallback: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return fallback;
    }
  }

  return getCompetitionSignalFromOpenWeb(
    keyword,
    openWebSignal,
  );
}

async function getCompetitionSignalFromOpenWeb(
  keyword: string,
  openWebSignal?: Awaited<ReturnType<typeof getOpenMarketWebSignal>>,
): Promise<CompetitionSignal> {
  const web =
    openWebSignal ||
    (await getOpenMarketWebSignal(keyword));

  const result = base();
  const scored = scoreOpenWebCompetition(web);

  result.provider = "OPEN_WEB";
  result.known = scored.score !== null;
  result.competitionScore = scored.score;
  result.competitionLevel = levelFor(scored.score);
  result.evidenceConfidence = scored.confidence;
  result.amazonOrganicResults = web.amazonResultCount;
  result.amazonHighReviewProducts = web.amazonHighReviewCount;
  result.amazonMedianPriceInr = web.amazonMedianPriceInr;
  result.retailDomainCount = web.retailDomainCount;
  result.webResultCount = web.webResultCount;
  result.tavilyResultCount = web.tavilyResultCount;
  result.tavilyRetailDomainCount = web.tavilyRetailDomainCount;
  result.sourceUrls = web.sourceUrls;

  result.notes.push(
    ...scored.notes,
    "Public-web competition proxy is not a complete marketplace census.",
  );
  result.notes.push(...web.warnings.slice(0, 8));
  result.fetchedAt = web.fetchedAt;

  return result;
}
