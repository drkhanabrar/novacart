// FILE: src/lib/services/open-market-sources.ts

/*
 * NOVA Open Market Evidence Layer
 *
 * Purpose:
 *   Collect broad, current, low-cost market evidence for concrete product
 *   candidates.
 *
 * Sources:
 *   - Google News RSS
 *   - Reddit public search
 *   - YouTube public search
 *   - DuckDuckGo public web search
 *   - Amazon India public snapshot
 *   - Tavily Search (keyless by default, API-key capable later)
 *
 * Important:
 *   These are evidence sources, not ground-truth sales databases.
 *   Competition values are opportunity proxies rather than complete
 *   marketplace censuses.
 *
 * Tavily:
 *   When TAVILY_API_KEY is not configured, NOVA uses Tavily keyless mode.
 *   Set NOVA_TAVILY_ENABLED=false to disable it.
 */

export interface OpenMarketWebSignal {
  newsCount: number;
  recentNewsCount: number;
  newsScore: number;

  redditPostCount: number;
  redditEngagement: number;
  redditScore: number;

  youtubeVideoCount: number;
  youtubeViews: number;
  youtubeAvgViews: number;
  youtubeScore: number;

  webResultCount: number;
  retailDomainCount: number;
  webCompetitionScore: number;

  amazonResultCount: number;
  amazonHighReviewCount: number;
  amazonMedianPriceInr: number | null;
  amazonCompetitionScore: number | null;

  tavilyResultCount: number;
  tavilyRetailDomainCount: number;
  tavilyCompetitionScore: number | null;
  tavilySearchScore: number;

  tavilyEvidence: Array<{
    title: string;
    url: string;
    content: string;
    relevance: number | null;
    domain: string;
  }>;

  sources: string[];
  sourceUrls: string[];
  warnings: string[];
  fetchedAt: string;
}

const UA =
  process.env.NOVA_RESEARCH_USER_AGENT ||
  "NovaCart-NOVA/2.2-market-research";

const TIMEOUT = Number(
  process.env.NOVA_RESEARCH_TIMEOUT_MS || 12000,
);

const TAVILY_TIMEOUT = Number(
  process.env.NOVA_TAVILY_TIMEOUT_MS || 15000,
);

const RETAIL = new Set([
  "amazon.in",
  "flipkart.com",
  "meesho.com",
  "myntra.com",
  "ajio.com",
  "nykaa.com",
  "croma.com",
  "reliancedigital.in",
  "tatacliq.com",
  "jiomart.com",
  "pepperfry.com",
  "firstcry.com",
]);

const RETAIL_NAME_HINTS = [
  "amazon",
  "flipkart",
  "meesho",
  "myntra",
  "ajio",
  "nykaa",
  "croma",
  "reliance",
  "tatacliq",
  "jiomart",
  "pepperfry",
  "firstcry",
  "indiamart",
  "moglix",
  "snapdeal",
];

async function fetchText(
  url: string,
  headers: Record<string, string> = {},
) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    TIMEOUT,
  );

  try {
    const response = await fetch(
      url,
      {
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,

        headers: {
          "User-Agent": UA,
          "Accept-Language":
            "en-IN,en;q=0.9",
          ...headers,
        },
      },
    );

    const text =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `${response.status} ${response.statusText}`,
      );
    }

    return text;
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

function parseJson<T>(
  text: string,
  source: string,
): T {
  const trimmed =
    text.trim();

  if (
    !trimmed.startsWith("{") &&
    !trimmed.startsWith("[")
  ) {
    throw new Error(
      `${source} returned non-JSON content`,
    );
  }

  try {
    return JSON.parse(
      trimmed,
    ) as T;
  } catch (error) {
    throw new Error(
      `${source} returned invalid JSON: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }
}

function html(
  value: string,
) {
  return value
    .replace(
      /<script[\s\S]*?<\/script>/gi,
      " ",
    )
    .replace(
      /<style[\s\S]*?<\/style>/gi,
      " ",
    )
    .replace(
      /<[^>]+>/g,
      " ",
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
      /&nbsp;/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function domain(
  url: string,
) {
  try {
    return new URL(
      url,
    )
      .hostname
      .replace(
        /^www\./,
        "",
      )
      .trim()
      .toLowerCase();
  } catch {
    return "";
  }
}

function median(
  values: number[],
) {
  if (!values.length) {
    return null;
  }

  const sorted =
    [...values].sort(
      (
        a,
        b,
      ) => a - b,
    );

  const middle =
    Math.floor(
      sorted.length / 2,
    );

  return sorted.length % 2
    ? sorted[middle]
    : (
        sorted[
          middle - 1
        ] +
        sorted[middle]
      ) / 2;
}

function days(
  iso: string | null,
) {
  if (!iso) {
    return 999;
  }

  const time =
    Date.parse(iso);

  return Number.isFinite(
    time,
  )
    ? Math.max(
        0,
        (Date.now() -
          time) /
          86400000,
      )
    : 999;
}

function views(
  value: string,
) {
  const match =
    String(value || "")
      .replace(
        /views?/gi,
        "",
      )
      .replace(
        /,/g,
        "",
      )
      .match(
        /([\d.]+)\s*([KMB])?/i,
      );

  if (!match) {
    return 0;
  }

  const number =
    Number(match[1]);

  if (!Number.isFinite(
    number,
  )) {
    return 0;
  }

  const suffix =
    String(
      match[2] || "",
    ).toUpperCase();

  const multiplier =
    suffix === "K"
      ? 1e3
      : suffix === "M"
        ? 1e6
        : suffix === "B"
          ? 1e9
          : 1;

  return Math.round(
    number * multiplier,
  );
}

function normalizeText(
  value: string,
) {
  return value
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function uniqueStrings(
  values: string[],
) {
  return [
    ...new Set(
      values.filter(
        Boolean,
      ),
    ),
  ];
}

function isRetailDomain(
  value: string,
) {
  const normalized =
    value
      .replace(
        /^www\./,
        "",
      )
      .toLowerCase();

  if (
    RETAIL.has(
      normalized,
    )
  ) {
    return true;
  }

  return RETAIL_NAME_HINTS.some(
    (hint) =>
      normalized.includes(
        hint,
      ),
  );
}

/*
 * -----------------------------
 * Google News
 * -----------------------------
 */

async function news(
  keyword: string,
) {
  const url =
    `https://news.google.com/rss/search?${new URLSearchParams(
      {
        q: `${keyword} India`,
        hl: "en-IN",
        gl: "IN",
        ceid: "IN:en",
      },
    )}`;

  const xml =
    await fetchText(
      url,
      {
        Accept:
          "application/rss+xml,application/xml,text/xml;q=0.9",
      },
    );

  const items =
    xml.match(
      /<item>[\s\S]*?<\/item>/gi,
    ) || [];

  let recent = 0;

  for (
    const block of
      items.slice(
        0,
        40,
      )
  ) {
    const publishedDate =
      html(
        block.match(
          /<pubDate>([\s\S]*?)<\/pubDate>/i,
        )?.[1] ||
          "",
      );

    if (
      publishedDate
    ) {
      try {
        if (
          days(
            new Date(
              publishedDate,
            ).toISOString(),
          ) <= 7
        ) {
          recent++;
        }
      } catch {
        // Ignore malformed date.
      }
    }
  }

  return {
    count:
      items.length,

    recent,

    score:
      Math.min(
        100,
        Math.round(
          Math.min(
            60,
            recent * 8,
          ) +
            Math.min(
              40,
              items.length * 2,
            ),
        ),
      ),

    url,
  };
}

/*
 * -----------------------------
 * Reddit
 * -----------------------------
 */

async function reddit(
  keyword: string,
) {
  const url =
    `https://www.reddit.com/search.json?${new URLSearchParams(
      {
        q: keyword,
        sort: "top",
        t: "month",
        limit: "25",
        raw_json: "1",
      },
    )}`;

  const data =
    parseJson<{
      data?: {
        children?: Array<{
          data?: {
            score?: number;
            num_comments?: number;
          };
        }>;
      };
    }>(
      await fetchText(
        url,
        {
          Accept:
            "application/json,text/plain;q=0.9",
        },
      ),
      "Reddit public search",
    );

  const rows =
    Array.isArray(
      data?.data?.children,
    )
      ? data.data
          .children
      : [];

  let engagement = 0;

  for (
    const row of
      rows
  ) {
    const item =
      row?.data;

    if (!item) {
      continue;
    }

    engagement +=
      Number(
        item.score || 0,
      ) +
      Number(
        item.num_comments ||
          0,
      ) *
        3;
  }

  return {
    count:
      rows.length,

    engagement,

    score:
      Math.min(
        100,
        Math.round(
          Math.min(
            45,
            rows.length * 4,
          ) +
            Math.min(
              55,
              Math.log10(
                engagement + 1,
              ) * 18,
            ),
        ),
      ),

    url,
  };
}

/*
 * -----------------------------
 * YouTube
 * -----------------------------
 */

function youtubeRows(
  text: string,
) {
  const output: Array<{
    id: string;
    views: number;
  }> = [];

  const seen =
    new Set<string>();

  const regex =
    /"videoRenderer":\{([\s\S]*?)\}\s*,\s*"trackingParams"/g;

  let match:
    RegExpExecArray | null;

  while (
    (match =
      regex.exec(text)) &&
    output.length < 30
  ) {
    const block =
      match[1];

    const id =
      block.match(
        /"videoId":"([^"]+)"/,
      )?.[1];

    if (
      !id ||
      seen.has(id)
    ) {
      continue;
    }

    const viewText =
      block.match(
        /"viewCountText":\{"simpleText":"([^"]+)"/,
      )?.[1] ||
      block.match(
        /"shortViewCountText":\{"simpleText":"([^"]+)"/,
      )?.[1] ||
      "";

    seen.add(
      id,
    );

    output.push({
      id,

      views:
        views(
          viewText,
        ),
    });
  }

  return output;
}

async function youtube(
  keyword: string,
) {
  const url =
    `https://www.youtube.com/results?${new URLSearchParams(
      {
        search_query:
          keyword,
      },
    )}`;

  const text =
    await fetchText(
      url,
      {
        Accept:
          "text/html,application/xhtml+xml;q=0.9",
      },
    );

  const rows =
    youtubeRows(
      text,
    );

  const values =
    rows
      .map(
        (item) =>
          item.views,
      )
      .filter(
        Boolean,
      );

  const total =
    values.reduce(
      (
        sum,
        value,
      ) =>
        sum + value,
      0,
    );

  const average =
    values.length
      ? Math.round(
          total /
            values.length,
        )
      : 0;

  return {
    count:
      rows.length,

    total,

    avg:
      average,

    score:
      Math.min(
        100,
        Math.round(
          Math.min(
            65,
            Math.log10(
              average + 1,
            ) * 12,
          ) +
            Math.min(
              35,
              rows.length * 3,
            ),
        ),
      ),

    url,
  };
}

/*
 * -----------------------------
 * DuckDuckGo public web search
 * -----------------------------
 */

async function ddg(
  keyword: string,
) {
  const url =
    `https://html.duckduckgo.com/html/?${new URLSearchParams(
      {
        q:
          `${keyword} India`,
        kl: "in-en",
      },
    )}`;

  const text =
    await fetchText(url);

  const regex =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"/gi;

  const urls: string[] =
    [];

  const domains =
    new Set<string>();

  let match:
    RegExpExecArray | null;

  while (
    (match =
      regex.exec(text)) &&
    urls.length < 40
  ) {
    const urlValue =
      match[1].replace(
        /&amp;/g,
        "&",
      );

    if (
      !urlValue.startsWith(
        "http",
      )
    ) {
      continue;
    }

    urls.push(
      urlValue,
    );

    const currentDomain =
      domain(
        urlValue,
      );

    if (
      currentDomain
    ) {
      domains.add(
        currentDomain,
      );
    }
  }

  const retail =
    [
      ...domains,
    ].filter(
      (item) =>
        isRetailDomain(
          item,
        ),
    ).length;

  const score =
    Math.max(
      0,
      Math.min(
        100,
        100 -
          Math.min(
            40,
            urls.length * 4,
          ) -
          Math.min(
            45,
            retail * 9,
          ) -
          Math.min(
            15,
            domains.size *
              1.5,
          ),
      ),
    );

  return {
    count:
      urls.length,

    retail,

    score,

    url,
  };
}

/*
 * -----------------------------
 * Amazon public snapshot
 * -----------------------------
 */

async function amazon(
  keyword: string,
) {
  const url =
    `https://www.amazon.in/s?${new URLSearchParams(
      {
        k:
          keyword,
      },
    )}`;

  const text =
    await fetchText(
      url,
    );

  const starts: number[] =
    [];

  const regex =
    /data-component-type="s-search-result"/gi;

  let match:
    RegExpExecArray | null;

  while (
    (match =
      regex.exec(text)) &&
    starts.length < 40
  ) {
    starts.push(
      match.index,
    );
  }

  const blocks =
    starts.map(
      (
        start,
        index,
      ) =>
        text.slice(
          start,
          starts[
            index + 1
          ] ||
            Math.min(
              text.length,
              start +
                120000,
            ),
        ),
    );

  const prices: number[] =
    [];

  let high = 0;

  for (
    const block of
      blocks.slice(
        0,
        30,
      )
  ) {
    const whole =
      block.match(
        /a-price-whole[^>]*>([\d,]+)/i,
      )?.[1];

    const fraction =
      block.match(
        /a-price-fraction[^>]*>(\d+)/i,
      )?.[1] ||
      "0";

    if (
      whole
    ) {
      const price =
        Number(
          `${whole.replace(
            /,/g,
            "",
          )}.${fraction}`,
        );

      if (
        Number.isFinite(
          price,
        ) &&
        price > 0
      ) {
        prices.push(
          price,
        );
      }
    }

    const ratings =
      block.match(
        /([\d,]+)\s+ratings?/i,
      )?.[1];

    if (
      ratings &&
      Number(
        ratings.replace(
          /,/g,
          "",
        ),
      ) >= 1000
    ) {
      high++;
    }
  }

  const score =
    Math.max(
      0,
      Math.min(
        100,
        100 -
          Math.min(
            60,
            blocks.length *
              3,
          ) -
          Math.min(
            30,
            high * 6,
          ) -
          (prices.length
            ? 10
            : 0),
      ),
    );

  return {
    count:
      blocks.length,

    high,

    median:
      median(
        prices,
      ),

    score,

    url,
  };
}

/*
 * -----------------------------
 * Tavily Search
 * -----------------------------
 *
 * Tavily is used as an evidence enrichment layer.
 *
 * Keyless mode:
 *   X-Tavily-Access-Mode: keyless
 *
 * API-key mode:
 *   Authorization: Bearer <TAVILY_API_KEY>
 *
 * One targeted search is used per candidate to control cost and rate usage.
 * Deep Tavily Research is intentionally NOT invoked here.
 */

async function tavilySearch(
  keyword: string,
) {
  if (
    process.env
      .NOVA_TAVILY_ENABLED ===
    "false"
  ) {
    return null;
  }

  const apiKey =
    process.env.TAVILY_API_KEY?.trim();

  const url =
    "https://api.tavily.com/search";

  const query =
    [
      `"${keyword}"`,
      "India",
      "buy",
      "price",
      "reviews",
      "complaints",
      "competitors",
      "alternatives",
      "demand",
    ].join(" ");

  const headers:
    Record<string, string> = {
    "Content-Type":
      "application/json",
    Accept:
      "application/json",
  };

  if (
    apiKey
  ) {
    headers.Authorization =
      `Bearer ${apiKey}`;
  } else {
    headers[
      "X-Tavily-Access-Mode"
    ] = "keyless";
  }

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      TAVILY_TIMEOUT,
    );

  try {
    const response =
      await fetch(
        url,
        {
          method:
            "POST",

          cache:
            "no-store",

          redirect:
            "follow",

          signal:
            controller.signal,

          headers,

          body:
            JSON.stringify(
              {
                query,

                search_depth:
                  "advanced",

                topic:
                  "general",

                max_results:
                  8,

                include_answer:
                  false,

                include_raw_content:
                  false,

                include_images:
                  false,
              },
            ),
        },
      );

    const text =
      await response.text();

    if (
      !response.ok
    ) {
      throw new Error(
        `Tavily ${response.status} ${response.statusText}`,
      );
    }

    const data =
      parseJson<{
        results?: Array<{
          title?: string;
          url?: string;
          content?: string;
          score?: number;
        }>;
      }>(
        text,
        "Tavily Search",
      );

    const evidence =
      Array.isArray(
        data.results,
      )
        ? data.results
            .map(
              (
                item,
              ) => {
                const itemUrl =
                  String(
                    item.url ||
                      "",
                  ).trim();

                const itemContent =
                  normalizeText(
                    String(
                      item.content ||
                        "",
                    ),
                  );

                const score =
                  Number(
                    item.score,
                  );

                return {
                  title:
                    normalizeText(
                      String(
                        item.title ||
                          "",
                      ),
                    ),

                  url:
                    itemUrl,

                  content:
                    itemContent.slice(
                      0,
                      1500,
                    ),

                  relevance:
                    Number.isFinite(
                      score,
                    )
                      ? score
                      : null,

                  domain:
                    domain(
                      itemUrl,
                    ),
                };
              },
            )
            .filter(
              (
                item,
              ) =>
                Boolean(
                  item.url,
                ),
            )
            .slice(
              0,
              8,
            )
        : [];

    const retailDomains =
      new Set<string>();

    for (
      const item of
        evidence
    ) {
      if (
        isRetailDomain(
          item.domain,
        )
      ) {
        retailDomains.add(
          item.domain,
        );
      }
    }

    const relevanceValues =
      evidence
        .map(
          (
            item,
          ) =>
            item.relevance,
        )
        .filter(
          (
            value,
          ): value is number =>
            value !== null &&
            Number.isFinite(
              value,
            ),
        );

    const avgRelevance =
      relevanceValues.length
        ? relevanceValues.reduce(
            (
              sum,
              value,
            ) =>
              sum + value,
            0,
          ) /
          relevanceValues.length
        : 0;

    /*
     * This is intentionally conservative.
     *
     * Tavily result counts are not equivalent to a complete marketplace
     * seller count. We therefore use them as one competition proxy alongside
     * the existing public-web and Amazon proxies.
     */
    const pressure =
      Math.min(
        45,
        evidence.length * 4,
      ) +
      Math.min(
        40,
        retailDomains.size * 8,
      ) +
      Math.min(
        15,
        Math.round(
          avgRelevance * 15,
        ),
      );

    const competitionScore =
      Math.max(
        0,
        Math.min(
          100,
          Math.round(
            100 - pressure,
          ),
        ),
      );

    return {
      resultCount:
        evidence.length,

      retailDomainCount:
        retailDomains.size,

      competitionScore,

      searchScore:
        Math.round(
          avgRelevance * 100,
        ),

      evidence,

      url,

      keyed:
        Boolean(
          apiKey,
        ),
    };
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

/*
 * -----------------------------
 * Main evidence collector
 * -----------------------------
 */

export async function getOpenMarketWebSignal(
  keyword: string,
): Promise<OpenMarketWebSignal> {
  const result:
    OpenMarketWebSignal = {
    newsCount: 0,

    recentNewsCount:
      0,

    newsScore:
      0,

    redditPostCount:
      0,

    redditEngagement:
      0,

    redditScore:
      0,

    youtubeVideoCount:
      0,

    youtubeViews:
      0,

    youtubeAvgViews:
      0,

    youtubeScore:
      0,

    webResultCount:
      0,

    retailDomainCount:
      0,

    webCompetitionScore:
      0,

    amazonResultCount:
      0,

    amazonHighReviewCount:
      0,

    amazonMedianPriceInr:
      null,

    amazonCompetitionScore:
      null,

    tavilyResultCount:
      0,

    tavilyRetailDomainCount:
      0,

    tavilyCompetitionScore:
      null,

    tavilySearchScore:
      0,

    tavilyEvidence:
      [],

    sources:
      [],

    sourceUrls:
      [],

    warnings:
      [],

    fetchedAt:
      new Date().toISOString(),
  };

  const tasks:
    Promise<void>[] =
    [];

  /*
   * Google News
   */

  tasks.push(
    news(keyword)
      .then(
        (
          value,
        ) => {
          result.newsCount =
            value.count;

          result.recentNewsCount =
            value.recent;

          result.newsScore =
            value.score;

          result.sources.push(
            "Google News RSS",
          );

          result.sourceUrls.push(
            value.url,
          );
        },
      )
      .catch(
        (
          error,
        ) => {
          result.warnings.push(
            `Google News failed: ${String(
              error,
            )}`,
          );
        },
      ),
  );

  /*
   * Reddit
   */

  tasks.push(
    reddit(keyword)
      .then(
        (
          value,
        ) => {
          result.redditPostCount =
            value.count;

          result.redditEngagement =
            value.engagement;

          result.redditScore =
            value.score;

          result.sources.push(
            "Reddit public search",
          );

          result.sourceUrls.push(
            value.url,
          );
        },
      )
      .catch(
        (
          error,
        ) => {
          result.warnings.push(
            `Reddit failed: ${String(
              error,
            )}`,
          );
        },
      ),
  );

  /*
   * DuckDuckGo
   */

  tasks.push(
    ddg(keyword)
      .then(
        (
          value,
        ) => {
          result.webResultCount =
            value.count;

          result.retailDomainCount =
            value.retail;

          result.webCompetitionScore =
            value.score;

          result.sources.push(
            "DuckDuckGo public web search",
          );

          result.sourceUrls.push(
            value.url,
          );
        },
      )
      .catch(
        (
          error,
        ) => {
          result.warnings.push(
            `Open web search failed: ${String(
              error,
            )}`,
          );
        },
      ),
  );

  /*
   * YouTube
   */

  if (
    process.env
      .NOVA_ENABLE_PUBLIC_YOUTUBE !==
    "false"
  ) {
    tasks.push(
      youtube(keyword)
        .then(
          (
            value,
          ) => {
            result.youtubeVideoCount =
              value.count;

            result.youtubeViews =
              value.total;

            result.youtubeAvgViews =
              value.avg;

            result.youtubeScore =
              value.score;

            result.sources.push(
              "YouTube public search",
            );

            result.sourceUrls.push(
              value.url,
            );
          },
        )
        .catch(
          (
            error,
          ) => {
            result.warnings.push(
              `YouTube public search failed: ${String(
                error,
              )}`,
            );
          },
        ),
    );
  }

  /*
   * Amazon
   */

  if (
    process.env
      .NOVA_ENABLE_AMAZON_SNAPSHOT !==
    "false"
  ) {
    tasks.push(
      amazon(keyword)
        .then(
          (
            value,
          ) => {
            result.amazonResultCount =
              value.count;

            result.amazonHighReviewCount =
              value.high;

            result.amazonMedianPriceInr =
              value.median;

            result.amazonCompetitionScore =
              value.score;

            result.sources.push(
              "Amazon India public snapshot",
            );

            result.sourceUrls.push(
              value.url,
            );
          },
        )
        .catch(
          (
            error,
          ) => {
            result.warnings.push(
              `Amazon snapshot failed: ${String(
                error,
              )}`,
            );
          },
        ),
    );
  }

  /*
   * Tavily
   *
   * One targeted Search per candidate.
   * It is intentionally isolated so a Tavily outage or keyless
   * rate limit cannot kill a candidate.
   */

  tasks.push(
    tavilySearch(
      keyword,
    )
      .then(
        (
          value,
        ) => {
          if (
            !value
          ) {
            return;
          }

          result.tavilyResultCount =
            value.resultCount;

          result.tavilyRetailDomainCount =
            value.retailDomainCount;

          result.tavilyCompetitionScore =
            value.competitionScore;

          result.tavilySearchScore =
            value.searchScore;

          result.tavilyEvidence =
            value.evidence;

          result.sources.push(
            value.keyed
              ? "Tavily Search (API key)"
              : "Tavily Search (keyless)",
          );

          result.sourceUrls.push(
            value.url,
            ...value.evidence.map(
              (
                item,
              ) =>
                item.url,
            ),
          );
        },
      )
      .catch(
        (
          error,
        ) => {
          result.warnings.push(
            `Tavily Search failed: ${String(
              error,
            )}`,
          );
        },
      ),
  );

  await Promise.all(
    tasks,
  );

  /*
   * Blend competition proxies.
   *
   * Tavily receives slightly higher weight because its results are
   * specifically optimized for agent consumption, but it is still treated
   * as a proxy rather than absolute truth.
   */

  const competitionScores:
    Array<{
      value: number;
      weight: number;
    }> = [];

  if (
    Number.isFinite(
      result.webCompetitionScore,
    ) &&
    result.webResultCount >
      0
  ) {
    competitionScores.push({
      value:
        result.webCompetitionScore,

      weight:
        0.85,
    });
  }

  if (
    result.amazonCompetitionScore !==
      null &&
    Number.isFinite(
      result.amazonCompetitionScore,
    ) &&
    result.amazonResultCount >
      0
  ) {
    competitionScores.push({
      value:
        result.amazonCompetitionScore,

      weight:
        1.0,
    });
  }

  if (
    result.tavilyCompetitionScore !==
      null &&
    Number.isFinite(
      result.tavilyCompetitionScore,
    ) &&
    result.tavilyResultCount >
      0
  ) {
    competitionScores.push({
      value:
        result.tavilyCompetitionScore,

      weight:
        1.35,
    });
  }

  if (
    competitionScores.length >
    0
  ) {
    const numerator =
      competitionScores.reduce(
        (
          sum,
          item,
        ) =>
          sum +
          item.value *
            item.weight,
        0,
      );

    const denominator =
      competitionScores.reduce(
        (
          sum,
          item,
        ) =>
          sum +
          item.weight,
        0,
      );

    result.webCompetitionScore =
      Math.round(
        numerator /
          denominator,
      );
  }

  /*
   * Add Tavily-derived retail domains to the broad retail count.
   *
   * We do not simply add them because the same domain can occur in both
   * data sources. Reconstructing a true union is not possible without
   * exposing all DDG domains, so we use a bounded adjustment.
   */

  if (
    result.tavilyRetailDomainCount >
    result.retailDomainCount
  ) {
    result.retailDomainCount =
      Math.max(
        result.retailDomainCount,
        result.tavilyRetailDomainCount,
      );
  }

  /*
   * Source hygiene
   */

  result.sources =
    uniqueStrings(
      result.sources,
    );

  result.sourceUrls =
    uniqueStrings(
      result.sourceUrls,
    ).slice(
      0,
      40,
    );

  result.tavilyEvidence =
    result.tavilyEvidence
      .slice(
        0,
        8,
      );

  result.fetchedAt =
    new Date().toISOString();

  return result;
}