// FILE: src/lib/services/product-expander.ts

export interface ProductIdea {
  keyword: string;
  category: string;
  whyNow: string;
  demandType:
    | "TREND"
    | "UTILITY"
    | "REPLENISHMENT"
    | "HYBRID";
  productForm: string;
  likelyRepeat: boolean;
}

interface ClaudeResponse {
  content?: Array<{
    type: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
}

const MAX_OUTPUT_PER_CALL = 45;

const CATEGORY_WORDS = new Set([
  "products",
  "supplies",
  "solutions",
  "accessories",
  "items",
  "goods",
  "equipment",
  "essentials",
  "organization",
  "organizers",
  "organiser",
  "organisers",
  "storage",
  "cleaning",
  "care",
  "utility",
  "household",
  "home",
  "kitchen",
  "bathroom",
  "office",
  "maintenance",
  "management",
  "hygiene",
]);

const HARD_BLOCKS = [
  "weather",
  "match",
  "score",
  "cricket",
  "football",
  "movie",
  "actor",
  "celebrity",
  "song",
  "lyrics",
  "news",
  "election",
  "politics",
  "war",
  "stock market",
  "share price",
  "cryptocurrency",
  "crypto",
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBroadCategory(value: string) {
  const words = normalize(value).split(" ");

  if (words.length < 2) {
    return true;
  }

  const categoryMatches = words.filter(
    (word) => CATEGORY_WORDS.has(word),
  ).length;

  return (
    categoryMatches >=
      Math.max(1, words.length - 1) ||
    CATEGORY_WORDS.has(
      words[words.length - 1],
    )
  );
}

function isCommercialCandidate(
  value: string,
) {
  const normalized = normalize(value);

  if (
    normalized.length < 5 ||
    normalized.length > 90
  ) {
    return false;
  }

  if (
    HARD_BLOCKS.some((term) =>
      normalized.includes(term),
    )
  ) {
    return false;
  }

  if (isBroadCategory(normalized)) {
    return false;
  }

  const words = normalized.split(" ");

  /*
   * The phrase should look like an actual
   * product concept rather than a market category.
   */
  const objectWords = [
    "cleaner",
    "detergent",
    "spray",
    "brush",
    "scrubber",
    "sponge",
    "refill",
    "filter",
    "organizer",
    "organiser",
    "holder",
    "rack",
    "tray",
    "bin",
    "box",
    "bag",
    "cover",
    "case",
    "stand",
    "hook",
    "dispenser",
    "mop",
    "wiper",
    "squeegee",
    "lint",
    "remover",
    "catcher",
    "protector",
    "container",
    "bottle",
    "drawer",
    "divider",
    "clip",
    "hanger",
    "wipes",
    "tissue",
    "freshener",
    "deodorizer",
    "scraper",
    "caddy",
    "mat",
    "seal",
    "strip",
    "stopper",
    "pouch",
    "pockets",
    "tablet",
    "tablets",
    "roller",
    "mitt",
    "cloth",
    "cloths",
    "bag",
    "bags",
    "caps",
    "cap",
  ];

  return (
    words.length >= 2 &&
    objectWords.some((word) =>
      words.includes(word),
    )
  );
}

function deterministicExpansion(
  seeds: string[],
): ProductIdea[] {
  const rules: Record<
    string,
    Array<{
      keyword: string;
      demandType: ProductIdea["demandType"];
      likelyRepeat: boolean;
    }>
  > = {
    "household cleaning": [
      {
        keyword: "multi surface cleaning spray",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
      {
        keyword: "drain hair catcher",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "electric cleaning scrubber",
        demandType: "HYBRID",
        likelyRepeat: false,
      },
      {
        keyword: "window cleaning squeegee",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "grout cleaning brush",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "microfiber glass cleaning cloth",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
    ],

    "laundry care": [
      {
        keyword: "washing machine cleaner tablets",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
      {
        keyword: "laundry lint remover",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "laundry detergent dispenser",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "reusable lint roller",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
    ],

    "dishwashing supplies": [
      {
        keyword: "dishwashing scrub brush dispenser",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "silicone dishwashing sponge",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
      {
        keyword: "sink caddy sponge holder",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
    ],

    "bathroom cleaning": [
      {
        keyword: "bathroom grout cleaning brush",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "shower drain hair catcher",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "toilet cleaning gel",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
    ],

    "toilet cleaning": [
      {
        keyword: "toilet cleaning gel",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
      {
        keyword: "silicone toilet cleaning brush",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "toilet rim cleaning brush",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
    ],

    "kitchen organization": [
      {
        keyword: "under sink organizer rack",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "kitchen drawer divider",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "pantry storage organizer bin",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "sink caddy organizer",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
    ],

    "food storage": [
      {
        keyword: "airtight pantry storage containers",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "fridge organizer bins",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "silicone food storage bags",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
    ],

    "home storage": [
      {
        keyword: "under bed storage bags",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "foldable storage boxes",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "closet hanging organizer",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
    ],

    "small space organization": [
      {
        keyword: "vertical under sink organizer",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "over door storage organizer",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "sliding cabinet organizer",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
    ],

    "desk organization": [
      {
        keyword: "under desk cable organizer",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "desk drawer organizer",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "monitor stand organizer",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
    ],

    "microfiber cleaning": [
      {
        keyword: "microfiber cleaning cloth pack",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
      {
        keyword: "microfiber glass cleaning cloth",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
      {
        keyword: "microfiber dusting mitt",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
    ],

    "air freshener household": [
      {
        keyword: "car air freshener refill",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
      {
        keyword: "home fragrance diffuser refill",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
    ],

    "personal hygiene accessories": [
      {
        keyword: "travel toiletry organizer pouch",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "soap dispenser wall mount",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
    ],

    "pet care supplies": [
      {
        keyword: "pet hair remover roller",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "pet waste bag dispenser",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
    ],

    "trash and garbage supplies": [
      {
        keyword: "bin liner bag dispenser",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
      {
        keyword: "reusable garbage bag holder",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
    ],

    "paper and tissue household": [
      {
        keyword: "reusable kitchen cleaning wipes",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
      {
        keyword: "microfiber cleaning cloth pack",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
    ],

    "car cleaning accessories": [
      {
        keyword: "car interior detailing brush",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "car windshield cleaning tool",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "car cleaning microfiber cloth",
        demandType: "REPLENISHMENT",
        likelyRepeat: true,
      },
    ],

    "cable management": [
      {
        keyword: "magnetic cable organizer clips",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
      {
        keyword: "under desk cable management tray",
        demandType: "UTILITY",
        likelyRepeat: false,
      },
    ],
  };

  const result: ProductIdea[] = [];

  for (const seed of seeds) {
    const normalizedSeed =
      normalize(seed);

    const mapped =
      rules[normalizedSeed] || [];

    for (const item of mapped) {
      result.push({
        keyword: item.keyword,
        category: seed,
        whyNow:
          "Fallback product expansion for a broad market domain.",
        demandType:
          item.demandType,
        productForm:
          item.keyword,
        likelyRepeat:
          item.likelyRepeat,
      });
    }
  }

  return result;
}

function parseClaudeText(
  text: string,
): ProductIdea[] {
  const cleaned = text
    .replace(
      /```json/gi,
      "",
    )
    .replace(
      /```/g,
      "",
    )
    .trim();

  let parsed: unknown;

  try {
    parsed = JSON.parse(
      cleaned,
    );
  } catch {
    return [];
  }

  const root =
    parsed as
      | Record<string, unknown>
      | unknown[];

  const rows =
    Array.isArray(root)
      ? root
      : Array.isArray(
            root?.products,
          )
        ? root.products
        : [];

  return rows
    .map(
      (item: unknown) => {
        const row =
          item as Record<
            string,
            unknown
          >;

        const keyword =
          String(
            row.keyword || "",
          )
            .trim()
            .replace(
              /\s+/g,
              " ",
            );

        const category =
          String(
            row.category || "",
          ).trim();

        const rawDemandType =
          String(
            row.demandType ||
              "HYBRID",
          ).toUpperCase();

        const demandType =
          rawDemandType === "TREND" ||
          rawDemandType ===
            "UTILITY" ||
          rawDemandType ===
            "REPLENISHMENT"
            ? rawDemandType
            : "HYBRID";

        return {
          keyword,
          category:
            category ||
            "Consumer Goods",
          whyNow: String(
            row.whyNow || "",
          ),
          demandType:
            demandType as ProductIdea["demandType"],
          productForm: String(
            row.productForm ||
              keyword,
          ),
          likelyRepeat:
            row.likelyRepeat ===
            true,
        };
      },
    )
    .filter(
      (item: ProductIdea) =>
        isCommercialCandidate(
          item.keyword,
        ),
    );
}

async function anthropicExpand(
  seeds: string[],
  freshQueries: string[],
): Promise<ProductIdea[]> {
  const key =
    process.env.ANTHROPIC_API_KEY;

  if (!key) {
    return [];
  }

  const model =
    process.env.NOVA_ANTHROPIC_MODEL ||
    "claude-haiku-4-5-20251001";

  const prompt = `
You are NOVA, an ecommerce product discovery engine for India.

Your job at this stage is NOT to score products and NOT to recommend brands.
Your job is to convert broad market themes and fresh trend/search queries into
CONCRETE, SELLABLE PRODUCT CONCEPTS that can be researched individually.

Business objective:
Find product concepts with the potential combination of:
- current or rising demand
- commercial shopping intent
- comparatively lower competition
- healthy contribution margin
- low return probability
- low after-sales/service burden
- easy fulfilment
- low breakage
- low technical complexity
- repeat or replenishment demand when possible

Rules:
1. A category is NOT a product.
2. Never return broad phrases like:
   "household cleaning",
   "laundry care",
   "home storage",
   "kitchen organization",
   "phone accessories".
3. Return specific concepts such as:
   "washing machine cleaner tablets",
   "under sink organizer rack",
   "microfiber glass cleaning cloth".
4. Prefer generic products that can be sourced from ordinary ecommerce suppliers.
5. Avoid medicine, supplements, weapons, tobacco, alcohol, dangerous chemicals,
   highly regulated products, counterfeit/IP-dependent products and products
   requiring professional installation or complex repair.
6. Avoid size/fit-sensitive products unless the opportunity is unusually strong.
7. Prefer replenishment products when evidence suggests recurring usage.
8. Never invent numerical demand, sales or competition figures.
9. Generate hypotheses only. The next stage will independently measure them.
10. Generate diverse concepts rather than multiple trivial variants.

Return ONLY valid JSON:

{
  "products": [
    {
      "keyword": "specific product concept",
      "category": "market domain",
      "whyNow": "brief reason based only on supplied signals",
      "demandType": "TREND|UTILITY|REPLENISHMENT|HYBRID",
      "productForm": "physical product form",
      "likelyRepeat": true
    }
  ]
}

Generate concrete concepts for the supplied domains.
Keep the total below ${MAX_OUTPUT_PER_CALL}.

MARKET DOMAINS:
${JSON.stringify(seeds.slice(0, 20))}

FRESH SEARCH / TREND QUERIES:
${JSON.stringify(freshQueries.slice(0, 100))}
`;

  try {
    const response =
      await fetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
            "x-api-key":
              key,
            "anthropic-version":
              "2023-06-01",
          },

          body: JSON.stringify({
            model,
            max_tokens: 5000,
            temperature: 0,

            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        },
      );

    const data =
      (await response.json()) as ClaudeResponse;

    if (
      !response.ok ||
      data.error
    ) {
      return [];
    }

    const text =
      data.content?.find(
        (item) =>
          item.type === "text",
      )?.text;

    if (!text) {
      return [];
    }

    return parseClaudeText(
      text,
    );
  } catch {
    return [];
  }
}

export async function expandProductIdeas(
  seeds: string[],
  freshQueries: string[],
  limit: number,
): Promise<{
  ideas: ProductIdea[];
  usedAnthropic: boolean;
}> {
  const aiIdeas =
    await anthropicExpand(
      seeds,
      freshQueries,
    );

  const fallback =
    deterministicExpansion(
      seeds,
    );

  const combined = [
    ...aiIdeas,
    ...fallback,
  ];

  const seen =
    new Set<string>();

  const ideas: ProductIdea[] =
    [];

  for (const item of combined) {
    const key =
      normalize(
        item.keyword,
      );

    if (
      !key ||
      seen.has(key) ||
      !isCommercialCandidate(
        key,
      )
    ) {
      continue;
    }

    seen.add(key);

    ideas.push({
      ...item,
      keyword: key,
    });

    if (
      ideas.length >=
      Math.max(1, limit)
    ) {
      break;
    }
  }

  return {
    ideas,
    usedAnthropic:
      aiIdeas.length > 0,
  };
}

export function isConcreteProduct(
  keyword: string,
) {
  return isCommercialCandidate(
    keyword,
  );
}