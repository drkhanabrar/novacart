// FILE: src/lib/services/cj-supplier.ts

const CJ_BASE_URL =
  "https://developers.cjdropshipping.com/api2.0";

interface CjTokenResponse {
  result: boolean;
  message?: string;
  data?: {
    accessToken: string;
    accessTokenExpiryDate: string;
    refreshToken: string;
    refreshTokenExpiryDate: string;
  };
}

interface CjVariantResponseItem {
  vid?: string;
  pid?: string;
  variantName?: string;
  variantNameEn?: string;
  variantImage?: string;
  variantSku?: string;
  variantUnit?: string;
  variantProperty?: string;
  variantKey?: string;
  variantSellPrice?: number | string;
  variantSugSellPrice?: number | string;
}

export interface SupplierProduct {
  productId: string;
  productName: string;
  productImage: string;
  sellPrice: string;
  productUrl: string;

  // Variant-resolved pricing. When present, sellPrice is the selected
  // variantSellPrice rather than a product-level price range.
  variantId?: string;
  variantSku?: string;
  variantName?: string;
  variantKey?: string;
  variantUnit?: string;
  variantProperty?: string;
  priceSource?: "PRODUCT" | "VARIANT" | "PRODUCT_PROVISIONAL";
  variantResolved?: boolean;
  inventoryCountryVerified?: boolean;

  /*
   * Physical and category attributes.
   *
   * CJ returns these on every listV2 result and the mapper used to discard
   * them. They are what make a structural plausibility check possible: token
   * overlap alone matched "compost bin kitchen countertop" to a 132-gallon
   * garden bin, because the words genuinely do overlap. Weight does not: one
   * is under a kilo, the other is over twenty.
   */
  categoryName?: string;
  /// Product weight in grams, as CJ reports it.
  weightGrams?: number | null;
}

export interface SupplierMatch {
  product: SupplierProduct;
  confidence: number;
  matchedTokens: string[];
  missingTokens: string[];
  conflictingTokens: string[];
  exactCoreMatch: boolean;
  unitCompatible: boolean;
  packCompatible: boolean;
}

let cachedToken: {
  accessToken: string;
  expiresAt: number;
} | null = null;

const cachedSupplierDetails = new Map<
  string,
  {
    expiresAt: number;
    variants: CjVariantResponseItem[];
  }
>();

const CJ_CACHE_TTL_MS = 15 * 60 * 1000;

const STOP_WORDS = new Set([
  "and",
  "the",
  "with",
  "for",
  "from",
  "into",
  "onto",
  "this",
  "that",
  "set",
  "sets",
  "pack",
  "packs",
  "piece",
  "pieces",
  "pcs",
  "new",
  "best",
  "premium",
  "home",
  "household",
  "kitchen",
  "bathroom",
  "desk",
  "wall",
  "small",
  "large",
  "mini",
  "portable",
  "reusable",
]);

const SYNONYMS: Record<string, string> = {
  organizer: "organiser",
  organizers: "organisers",
  storage: "store",
  cleaner: "clean",
  cleaning: "clean",
  cleaners: "clean",
  brushes: "brush",
  tablets: "tablet",
  bags: "bag",
  boxes: "box",
  containers: "container",
  racks: "rack",
  shelves: "shelf",
  clips: "clip",
  holders: "holder",
  wipes: "wipe",
  cloths: "cloth",
  dividers: "divider",
  baskets: "basket",
  bottles: "bottle",
  jars: "jar",
};

const FORM_EQUIVALENTS: Record<string, string[]> = {
  tablet: ["tablet", "tab", "pod", "capsule"],
  bag: ["bag", "pouch", "sack"],
  brush: ["brush", "scrubber", "cleaning brush"],
  cloth: ["cloth", "wipe", "towel"],
  stick: ["stick", "bar", "pen"],
  rack: ["rack", "shelf", "organizer", "holder"],
};

const UNIT_PATTERNS: Array<{
  regex: RegExp;
  key: string;
}> = [
  { regex: /(\d+(?:\.\d+)?)\s*kg/i, key: "kg" },
  { regex: /(\d+(?:\.\d+)?)\s*g/i, key: "g" },
  { regex: /(\d+(?:\.\d+)?)\s*ml/i, key: "ml" },
  { regex: /(\d+(?:\.\d+)?)\s*l(?:itre|iter)?s?/i, key: "l" },
  { regex: /(\d+)\s*(?:pcs?|pieces?)/i, key: "pcs" },
  { regex: /(\d+)\s*(?:packs?|pk)/i, key: "pack" },
  { regex: /(\d+)\s*(?:sets?)/i, key: "set" },
  { regex: /(\d+)\s*(?:rolls?)/i, key: "roll" },
  { regex: /(\d+)\s*(?:tabs?|tablets?)/i, key: "tablet" },
  { regex: /(\d+)\s*(?:sheets?)/i, key: "sheet" },
  { regex: /(\d+)\s*(?:strips?)/i, key: "strip" },
];

const SEMANTIC_CONFLICTS: Array<[string, string]> = [
  ["toilet", "sink"],
  ["toilet", "dishwasher"],
  ["toilet", "washing"],
  ["dishwasher", "washing"],
  ["drawer", "cabinet"],
  ["fridge", "sink"],
  ["spice", "desk"],
  ["bamboo", "silicone"],
  ["glass", "plastic"],
  ["paper", "microfiber"],
  ["dishwasher", "washing"],
  ["laundry", "dishwasher"],
  ["kitchen", "bathroom"],
];

function canonicalToken(token: string): string {
  const normalized = SYNONYMS[token] ?? token;

  if (normalized.endsWith("ies") && normalized.length > 4) {
    return `${normalized.slice(0, -3)}y`;
  }

  if (normalized.endsWith("es") && normalized.length > 4) {
    return normalized.slice(0, -2);
  }

  if (normalized.endsWith("s") && normalized.length > 3) {
    return normalized.slice(0, -1);
  }

  return normalized;
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => canonicalToken(token.trim()))
        .filter(
          (token) =>
            token.length > 2 && !STOP_WORDS.has(token),
        ),
    ),
  );
}

function extractUnits(text: string): Map<string, number> {
  const units = new Map<string, number>();

  for (const { regex, key } of UNIT_PATTERNS) {
    const match = text.match(regex);
    if (!match) continue;

    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      units.set(key, value);
    }
  }

  return units;
}

function extractPackQuantity(text: string): number | null {
  const patterns = [
    /(\d+)\s*(?:pcs?|pieces?)/i,
    /(\d+)\s*(?:packs?|pk)/i,
    /(\d+)\s*(?:sets?)/i,
    /(\d+)\s*(?:rolls?)/i,
    /pack\s*of\s*(\d+)/i,
    /set\s*of\s*(\d+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = Number(match[1]);
      return Number.isFinite(value) ? value : null;
    }
  }

  return null;
}

function detectConflicts(
  requestedTitle: string,
  supplierTitle: string,
): string[] {
  const requested = new Set(tokenize(requestedTitle));
  const supplier = new Set(tokenize(supplierTitle));
  const conflicts: string[] = [];

  for (const [a, b] of SEMANTIC_CONFLICTS) {
    if (requested.has(a) && supplier.has(b) && !supplier.has(a)) {
      conflicts.push(`${a}->${b}`);
    }
    if (requested.has(b) && supplier.has(a) && !supplier.has(b)) {
      conflicts.push(`${b}->${a}`);
    }
  }

  return Array.from(new Set(conflicts));
}

function scoreSupplierMatch(
  productTitle: string,
  supplierName: string,
): SupplierMatch {
  const titleTokens = tokenize(productTitle);
  const supplierTokens = tokenize(supplierName);
  const supplierSet = new Set(supplierTokens);

  const matchedTokens = titleTokens.filter((token) =>
    supplierSet.has(token),
  );

  const missingTokens = titleTokens.filter(
    (token) => !supplierSet.has(token),
  );

  const coreTokens = titleTokens.filter(
    (token) =>
      ![
        "reusable",
        "portable",
        "wall",
        "small",
        "large",
        "premium",
      ].includes(token),
  );

  const coreMatched = coreTokens.filter((token) =>
    supplierSet.has(token),
  );

  const exactCoreMatch =
    coreTokens.length > 0 && coreMatched.length === coreTokens.length;

  const requestedUnits = extractUnits(productTitle);
  const supplierUnits = extractUnits(supplierName);

  let unitCompatible = true;

  for (const [key, requestedValue] of requestedUnits.entries()) {
    const supplierValue = supplierUnits.get(key);
    if (supplierValue === undefined) continue;

    if (
      Math.abs(requestedValue - supplierValue) >
      Math.max(0.01, requestedValue * 0.15)
    ) {
      unitCompatible = false;
    }
  }

  const requestedPack = extractPackQuantity(productTitle);
  const supplierPack = extractPackQuantity(supplierName);

  const packCompatible =
    requestedPack === null ||
    supplierPack === null ||
    requestedPack === supplierPack;

  const conflictingTokens = detectConflicts(
    productTitle,
    supplierName,
  );

  const coreCoverage =
    coreMatched.length / Math.max(1, coreTokens.length);
  const generalCoverage =
    matchedTokens.length / Math.max(1, titleTokens.length);

  let confidence = Math.round(
    coreCoverage * 60 +
      generalCoverage * 20 +
      (exactCoreMatch ? 8 : 0) +
      (unitCompatible ? 6 : -20) +
      (packCompatible ? 6 : -20),
  );

  if (requestedUnits.size > 0 && supplierUnits.size === 0) {
    confidence -= 6;
  }

  if (requestedPack !== null && supplierPack === null) {
    confidence -= 8;
  }

  confidence -= conflictingTokens.length * 25;
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    product: {
      productId: "",
      productName: supplierName,
      productImage: "",
      sellPrice: "0",
      productUrl: "",
    },
    confidence,
    matchedTokens,
    missingTokens,
    conflictingTokens,
    exactCoreMatch,
    unitCompatible,
    packCompatible,
  };
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing CJ_API_KEY. Add it to your .env.local file (see setup steps).",
    );
  }

  const res = await fetch(
    `${CJ_BASE_URL}/v1/authentication/getAccessToken`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ apiKey }),
    },
  );

  const data: CjTokenResponse = await res.json();

  if (!data.result || !data.data) {
    throw new Error(
      `CJ authentication failed: ${
        data.message ??
        "Unknown error. Check your CJ_API_KEY."
      }`,
    );
  }

  cachedToken = {
    accessToken: data.data.accessToken,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000,
  };

  return cachedToken.accessToken;
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  const range = text.match(
    /^\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*$/,
  );

  if (range) {
    const low = Number(range[1]);
    const high = Number(range[2]);

    if (Number.isFinite(low) && low > 0) return low;
    if (Number.isFinite(high) && high > 0) return high;
    return null;
  }

  const numeric = Number(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0
    ? numeric
    : null;
}

function parseScalarProductPrice(
  value: unknown,
): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  // Never collapse an explicit range into an exact cost.
  if (/\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?/.test(text)) {
    return null;
  }

  const numeric = Number(text.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function extractVariants(data: unknown): CjVariantResponseItem[] {
  if (!data || typeof data !== "object") return [];

  const root = data as {
    data?: unknown;
  };

  const payload = root.data;

  if (Array.isArray(payload)) {
    return payload as CjVariantResponseItem[];
  }

  if (payload && typeof payload === "object") {
    const objectPayload = payload as {
      content?: unknown;
      variants?: unknown;
      list?: unknown;
      records?: unknown;
    };

    if (Array.isArray(objectPayload.content)) {
      return objectPayload.content as CjVariantResponseItem[];
    }

    if (Array.isArray(objectPayload.variants)) {
      return objectPayload.variants as CjVariantResponseItem[];
    }

    if (Array.isArray(objectPayload.list)) {
      return objectPayload.list as CjVariantResponseItem[];
    }

    if (Array.isArray(objectPayload.records)) {
      return objectPayload.records as CjVariantResponseItem[];
    }
  }

  return [];
}

function scoreVariant(
  productTitle: string,
  supplierProductName: string,
  variant: CjVariantResponseItem,
): number {
  const requestedText = `${productTitle} ${supplierProductName}`;
  const variantText = [
    variant.variantNameEn,
    variant.variantName,
    variant.variantKey,
    variant.variantProperty,
    variant.variantUnit,
  ]
    .filter(Boolean)
    .join(" ");

  const requestedTokens = new Set(tokenize(requestedText));
  const variantTokens = new Set(tokenize(variantText));

  let score = 0;

  for (const token of requestedTokens) {
    if (variantTokens.has(token)) {
      score += 4;
    }
  }

  const requestedPack = extractPackQuantity(productTitle);
  const variantPack = extractPackQuantity(variantText);

  if (requestedPack !== null && variantPack !== null) {
    score += requestedPack === variantPack ? 16 : -30;
  }

  const requestedUnits = extractUnits(productTitle);
  const variantUnits = extractUnits(variantText);

  for (const [key, requestedValue] of requestedUnits.entries()) {
    const variantValue = variantUnits.get(key);
    if (variantValue === undefined) continue;

    score +=
      Math.abs(requestedValue - variantValue) <=
      Math.max(0.01, requestedValue * 0.15)
        ? 12
        : -25;
  }

  return score;
}

/**
 * Resolves the actual sellable CJ variant behind a product-level match.
 *
 * CJ documents that product list prices may be ranges, while the variant
 * endpoint exposes variantSellPrice as the actual USD variant price. This
 * function deliberately prefers a country-available, identity-compatible
 * variant and only falls back to the cheapest returned variant when the
 * variant metadata contains no contradictory identity information.
 */
function extractVariantsFromProductDetail(
  payload: any,
): CjVariantResponseItem[] {
  const data =
    payload?.data;

  const candidates =
    [
      data?.variantList,
      data?.variants,
      data?.content?.variants,
      data?.content,
      data?.list,
    ];

  for (
    const candidate of
      candidates
  ) {
    if (
      Array.isArray(
        candidate,
      )
    ) {
      return candidate;
    }
  }

  /*
   * CJ's current product-detail response also exposes lower-case field names
   * in some deployments. When a variant collection is embedded under an
   * object, walk one level to find an array containing variantSellPrice-like
   * records.
   */
  if (
    data &&
    typeof data ===
      "object"
  ) {
    for (
      const value of
        Object.values(
          data,
        )
    ) {
      if (
        Array.isArray(
          value,
        ) &&
        value.some(
          (item) =>
            item &&
            typeof item ===
              "object" &&
            (
              "variantSellPrice" in
                item ||
              "variantsellprice" in
                item
            ),
        )
      ) {
        return value as CjVariantResponseItem[];
      }
    }
  }

  return [];
}

function normalizeVariant(
  raw: any,
): CjVariantResponseItem {
  return {
    vid:
      raw?.vid ??
      raw?.VID,
    pid:
      raw?.pid ??
      raw?.PID,

    variantName:
      raw?.variantName ??
      raw?.variantname,

    variantNameEn:
      raw?.variantNameEn ??
      raw?.variantnameen,

    variantImage:
      raw?.variantImage ??
      raw?.variantimage,

    variantSku:
      raw?.variantSku ??
      raw?.variantsku,

    variantUnit:
      raw?.variantUnit ??
      raw?.variantunit,

    variantProperty:
      raw?.variantProperty ??
      raw?.variantproperty,

    variantKey:
      raw?.variantKey ??
      raw?.variantkey,

    variantSellPrice:
      raw?.variantSellPrice ??
      raw?.variantsellprice,

    variantSugSellPrice:
      raw?.variantSugSellPrice ??
      raw?.variantsugsellprice,
  };
}

function chooseCompatibleVariant(
  match: SupplierMatch,
  productTitle: string,
  rawVariants: CjVariantResponseItem[],
): SupplierMatch | null {
  const variants =
    rawVariants
      .map(
        normalizeVariant,
      )
      .map(
        (variant) => ({
          variant,
          price:
            parsePrice(
              variant.variantSellPrice,
            ),
        }),
      )
      .filter(
        (item) =>
          item.price !== null &&
          item.price > 0,
      );

  if (
    variants.length ===
    0
  ) {
    return null;
  }

  const ranked =
    variants
      .map(
        (item) => ({
          ...item,
          compatibilityScore:
            scoreVariant(
              productTitle,
              match.product
                .productName,
              item.variant,
            ),
        }),
      )
      .sort(
        (a, b) =>
          b.compatibilityScore -
          a.compatibilityScore ||
          Number(a.price) -
            Number(b.price),
      );

  const best =
    ranked.find(
      (item) => {
        const variantText =
          [
            item.variant
              .variantNameEn,
            item.variant
              .variantName,
            item.variant
              .variantKey,
            item.variant
              .variantProperty,
            item.variant
              .variantUnit,
          ]
            .filter(Boolean)
            .join(" ");

        const conflicts =
          detectConflicts(
            productTitle,
            `${match.product.productName} ${variantText}`,
          );

        /*
         * The parent CJ product has already cleared the identity gate.
         * CJ variants often contain only option metadata (for example
         * Color-Blue or Size-10pcs) and do not repeat the full product name.
         * Therefore token overlap on the variant itself must not be required.
         *
         * We only reject a variant when it introduces a material identity
         * conflict.
         */
        return conflicts.length === 0;
      },
    );

  if (
    !best ||
    best.price ===
      null
  ) {
    return null;
  }

  const selected =
    best.variant;

  return {
    ...match,
    product: {
      ...match.product,

      sellPrice:
        String(
          best.price,
        ),

      variantId:
        String(
          selected.vid ??
            "",
        ).trim(),

      variantSku:
        String(
          selected
            .variantSku ??
            "",
        ).trim(),

      variantName:
        String(
          selected
            .variantNameEn ??
            selected
              .variantName ??
              "",
        ).trim(),

      variantKey:
        String(
          selected
            .variantKey ??
            "",
        ).trim(),

      variantUnit:
        String(
          selected
            .variantUnit ??
            "",
        ).trim(),

      variantProperty:
        String(
          selected
            .variantProperty ??
            "",
        ).trim(),

      priceSource:
        "VARIANT",

      variantResolved:
        true,

      inventoryCountryVerified:
        false,
    },
  };
}


export async function resolveSupplierVariant(
  match: SupplierMatch,
  countryCode = process.env.NOVA_MARKET_REGION || "IN",
  productTitle = match.product.productName,
): Promise<SupplierMatch | null> {
  const pid = String(
    match.product.productId || "",
  ).trim();

  if (!pid) {
    return null;
  }

  /*
   * IMPORTANT:
   *
   * listV2 already returns a scalar sellPrice for many products.
   * Do not spend additional CJ points on detail/variant lookup when that
   * product-level price is unambiguous. Mark it provisional because the
   * precise variant has not been resolved.
   */
  const provisionalPrice =
    parseScalarProductPrice(
      match.product.sellPrice,
    );

  if (
    provisionalPrice !== null
  ) {
    return {
      ...match,
      product: {
        ...match.product,
        sellPrice:
          String(
            provisionalPrice,
          ),
        priceSource:
          "PRODUCT_PROVISIONAL",
        variantResolved:
          false,
        inventoryCountryVerified:
          false,
      },
    };
  }

  const cache =
    cachedSupplierDetails.get(
      pid,
    );

  if (
    cache &&
    cache.expiresAt >
      Date.now()
  ) {
    const variants =
      cache.variants;

    const resolved =
      chooseCompatibleVariant(
        match,
        productTitle,
        variants,
      );

    if (resolved) {
      return resolved;
    }
  }

  const token =
    await getAccessToken();

  /*
   * Product detail is the preferred exact-variant path.
   * It costs fewer round trips than calling variant/query separately.
   */
  const response =
    await fetch(
      `${CJ_BASE_URL}/v1/product/productDetail/query`,
      {
        method:
          "POST",
        headers: {
          "CJ-Access-Token":
            token,
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          id: pid,
        }),
      },
    );

  const text =
    await response.text();

  if (
    response.status ===
    429
  ) {
    /*
     * Quota exhaustion is not a product rejection.
     * If product-level price was a range/unknown, return null and let the
     * engine mark supplier economics UNKNOWN.
     */
    throw new Error(
      "CJ API rate limit / daily points exhausted (HTTP 429). Exact variant pricing unavailable.",
    );
  }

  if (!response.ok) {
    throw new Error(
      `CJ product detail query failed: HTTP ${response.status}`,
    );
  }

  let payload: any;

  try {
    payload =
      JSON.parse(
        text,
      );
  } catch {
    throw new Error(
      "CJ product detail query returned invalid JSON",
    );
  }

  if (
    !payload?.result
  ) {
    throw new Error(
      `CJ product detail query failed: ${
        payload?.message ??
        "Unknown error"
      }`,
    );
  }

  const variants =
    extractVariantsFromProductDetail(
      payload,
    );

  cachedSupplierDetails.set(
    pid,
    {
      expiresAt:
        Date.now() +
        CJ_CACHE_TTL_MS,
      variants,
    },
  );

  return chooseCompatibleVariant(
    match,
    productTitle,
    variants,
  );
}


/*
 * Determine whether a CJ result has enough product-identity overlap to be
 * worth treating as a supplier candidate.
 *
 * This is deliberately stricter than simple keyword overlap and deliberately
 * weaker than the final pickBestSupplierMatch gate. Its only job is deciding
 * whether a second search query is needed.
 */
function hasPotentialSupplierMatch(
  products: SupplierProduct[],
  productTitle: string,
): boolean {
  if (
    !products.length ||
    !productTitle.trim()
  ) {
    return false;
  }

  const requestedTokens =
    new Set(
      tokenize(productTitle),
    );

  /*
   * Product-family anchors are requirements, not optional hints.
   *
   * Example:
   *   "toilet bowl cleaning tablets"
   *
   * requires:
   *   location/family = toilet/bowl/bathroom
   *   form = tablet/tab/powder/...
   *
   * A toilet brush satisfies the first group but not the second, so it is
   * NOT considered a viable retrieval result and semantic recovery runs.
   */
  const requiredGroups: string[][] = [];

  if (
    ["toilet", "bowl", "bathroom"].some(
      (token) =>
        requestedTokens.has(token),
    )
  ) {
    requiredGroups.push([
      "toilet",
      "bowl",
      "bathroom",
    ]);
  }

  if (
    ["dishwasher", "dishwash", "dishwashing"].some(
      (token) =>
        requestedTokens.has(token),
    )
  ) {
    requiredGroups.push([
      "dishwasher",
      "dishwash",
      "dishwashing",
    ]);
  }

  if (
    ["laundry", "clothing", "fabric"].some(
      (token) => requestedTokens.has(token),
    ) &&
    ["stain", "bag"].some(
      (token) => requestedTokens.has(token),
    )
  ) {
    requiredGroups.push([
      "laundry",
      "clothing",
      "fabric",
    ]);
  }

  if (
    requestedTokens.has("washing") ||
    requestedTokens.has("machine")
  ) {
    requiredGroups.push([
      "washing",
      "machine",
    ]);
  }

  if (
    requestedTokens.has("bag") ||
    requestedTokens.has("pouch")
  ) {
    requiredGroups.push([
      "bag",
      "pouch",
    ]);
  }

  if (
    requestedTokens.has("cloth") ||
    requestedTokens.has("wipe")
  ) {
    requiredGroups.push([
      "cloth",
      "wipe",
    ]);
  }

  if (
    requestedTokens.has("tablet") ||
    requestedTokens.has("tab") ||
    requestedTokens.has("pod") ||
    requestedTokens.has("capsule")
  ) {
    requiredGroups.push(FORM_EQUIVALENTS.tablet);
  }

  if (requestedTokens.has("stick")) {
    requiredGroups.push(FORM_EQUIVALENTS.stick);
  }

  if (
    requestedTokens.has("powder")
  ) {
    requiredGroups.push([
      "powder",
    ]);
  }

  if (
    requestedTokens.has("brush")
  ) {
    requiredGroups.push([
      "brush",
    ]);
  }

  if (
    requestedTokens.has("container")
  ) {
    requiredGroups.push([
      "container",
    ]);
  }

  if (
    requestedTokens.has("bottle")
  ) {
    requiredGroups.push([
      "bottle",
    ]);
  }

  return products.some(
    (product) => {
      if (
        !product.productName.trim()
      ) {
        return false;
      }

      const scored =
        scoreSupplierMatch(
          productTitle,
          product.productName,
        );

      /*
       * Hard semantic conflicts are never viable retrieval evidence.
       */
      if (
        scored.conflictingTokens.length >
        0
      ) {
        return false;
      }

      const supplierTokens =
        new Set(
          tokenize(
            product.productName,
          ),
        );

      /*
       * Every requested product-family group must be represented.
       *
       * This is the key correction that prevents:
       *   toilet tablet → toilet brush
       *   vacuum bag → vacuum machine
       */
      const groupsSatisfied =
        requiredGroups.every(
          (group) =>
            group.some(
              (token) =>
                supplierTokens.has(
                  token,
                ),
            ),
        );

      if (
        !groupsSatisfied
      ) {
        return false;
      }

      const coreTokens =
        tokenize(
          productTitle,
        ).filter(
          (token) =>
            ![
              "reusable",
              "portable",
              "wall",
              "small",
              "large",
              "premium",
              "natural",
              "essential",
            ].includes(
              token,
            ),
        );

      const coreMatchedCount =
        coreTokens.filter(
          (token) =>
            supplierTokens.has(
              token,
            ),
        ).length;

      return (
        coreTokens.length > 0 &&
        coreMatchedCount /
          coreTokens.length >=
          0.5
      );
    },
  );
}


/*
 * Produce a small, bounded set of semantic CJ queries for common product
 * families. We do not use an LLM here because supplier retrieval must remain
 * deterministic, cheap and auditable.
 */
function buildSemanticSupplierQueries(
  keyword: string,
): string[] {
  const normalized = keyword
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const queries: string[] = [];

  const add = (...items: string[]) => {
    for (const item of items) {
      const cleaned = item
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

      if (!cleaned || cleaned === normalized) continue;
      if (!queries.includes(cleaned)) queries.push(cleaned);
    }
  };

  /*
   * Supplier catalogs often index a commercial product under a slightly
   * different noun phrase than consumer search engines. These rewrites are
   * intentionally deterministic and bounded so supplier search remains
   * cheap, auditable and resistant to query explosion.
   */
  if (
    /\bdishwasher\b/.test(normalized) &&
    /\b(tablet|tablets|tab|powder)\b/.test(normalized)
  ) {
    add(
      "dishwasher tablet",
      "dishwasher pod",
      "dishwasher capsule",
      "dishwasher detergent",
    );
  }

  if (
    /\b(toilet|bowl)\b/.test(normalized) &&
    /\b(tablet|tablets|tab|powder)\b/.test(normalized)
  ) {
    add(
      "toilet bowl cleaner tablet",
      "toilet cleaning tablet",
      "toilet tank cleaner tablet",
      "toilet bowl cleaning tablet",
    );
  }

  if (
    /\bwashing machine\b/.test(normalized) &&
    /\b(tablet|tablets|tab|powder)\b/.test(normalized)
  ) {
    add(
      "washing machine cleaner tablet",
      "washing machine cleaning tablet",
      "washing machine descaler tablet",
      "washing machine cleaner",
    );
  }

  if (
    /\bmicrofiber|microfibre\b/.test(normalized) &&
    /\b(cloth|cloths|wipe|wipes)\b/.test(normalized)
  ) {
    add(
      "microfiber cleaning cloth",
      "microfibre cleaning cloth",
      "microfiber cloth",
      "microfiber wipe",
    );
  }

  if (
    /\blaundry\b/.test(normalized) &&
    /\b(stain|remover|removal)\b/.test(normalized) &&
    /\bstick\b/.test(normalized)
  ) {
    add(
      "laundry stain remover stick",
      "clothing stain remover stick",
      "fabric stain remover stick",
      "clothing stain remover bar",
    );
  }

  if (
    /\bmicrofiber\b/.test(normalized) &&
    /\blaundry bag\b/.test(normalized)
  ) {
    add(
      "delicates laundry bag",
      "mesh wash bag",
      "delicate wash laundry bag",
      "washing machine laundry bag",
    );
  }

  if (
    /\bdrain\b/.test(normalized) &&
    /\bbrush|stick\b/.test(normalized)
  ) {
    add(
      "drain cleaning brush",
      "pipe cleaning brush",
      "sink drain brush",
      "flexible drain cleaning brush",
    );
  }

  if (
    /\bdish drying mat\b/.test(normalized) ||
    (/\bmat\b/.test(normalized) && /\bdish\b/.test(normalized))
  ) {
    add(
      "microfiber dish drying mat",
      "dish drying mat",
      "kitchen dish drying mat",
      "dish drying towel mat",
    );
  }

  if (
    /\bsponge\b/.test(normalized) &&
    /\bcaddy|holder\b/.test(normalized)
  ) {
    add(
      "suction cup sponge holder",
      "sink sponge holder suction cup",
      "sponge holder suction",
      "kitchen sponge holder",
    );
  }

  if (
    /\bover door|over-door\b/.test(normalized) &&
    /\borganizer|rack\b/.test(normalized)
  ) {
    add(
      "over the door organizer",
      "over door storage rack",
      "over door hanging organizer",
      "door hanging storage rack",
    );
  }

  if (
    /\bunder bed|under-bed\b/.test(normalized) &&
    /\bstorage\b/.test(normalized)
  ) {
    add(
      "under bed storage box",
      "underbed storage box",
      "under bed organizer box",
      "under bed storage container",
    );
  }

  if (
    /\bunder sink|under-sink\b/.test(normalized) &&
    /\borganizer|rack\b/.test(normalized)
  ) {
    add(
      "under sink organizer",
      "under sink storage rack",
      "under sink shelf organizer",
      "sink cabinet organizer rack",
    );
  }

  if (
    /\bcabinet organizer|organizer shelf\b/.test(normalized)
  ) {
    add(
      "kitchen cabinet shelf organizer",
      "cabinet shelf organizer",
      "kitchen cupboard organizer shelf",
      "cabinet storage rack",
    );
  }

  if (
    /\bspice rack\b/.test(normalized)
  ) {
    add(
      "wall mounted spice rack",
      "kitchen spice rack wall",
      "seasoning rack wall mounted",
      "spice storage rack",
    );
  }

  if (
    /\bvacuum\b/.test(normalized) &&
    /\bfood\b/.test(normalized) &&
    /\bbag|bags\b/.test(normalized)
  ) {
    add(
      "vacuum sealed food storage bag",
      "silicone vacuum food storage bag",
      "reusable vacuum food bag",
      "food vacuum storage bag",
    );
  }

  if (
    /\bglass shower door\b/.test(normalized) &&
    /\bcleaner|spray\b/.test(normalized)
  ) {
    add(
      "shower door cleaner spray",
      "bathroom glass cleaner spray",
      "shower glass cleaning spray",
      "shower door cleaning spray",
    );
  }

  if (
    /\btoilet brush\b/.test(normalized)
  ) {
    add(
      "toilet brush holder set",
      "bathroom toilet brush set",
      "silicone toilet brush holder",
      "wall mounted toilet brush",
    );
  }

  /*
   * Generic fallback: remove weak modifiers and normalize morphology. This
   * is deliberately after family-specific rewrites so a broad query cannot
   * consume all retry budget before the high-signal terms are tried.
   */
  const generic = normalized
    .replace(
      /\b(the|with|for|from|into|onto|home|household|premium|portable|small|large)\b/g,
      " ",
    )
    .replace(/\b(tablets?|tabs?)\b/g, "tablet")
    .replace(/\b(cleaning|cleaners?|cleanse)\b/g, "cleaner")
    .replace(/\b(organizers?|organisers?)\b/g, "organizer")
    .replace(/\b(racks?|shelves?)\b/g, "rack")
    .replace(/\b(sets?|packs?|pieces?|pcs)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (generic && generic !== normalized) {
    add(generic);
  }

  /*
   * Hard cap. One original search + four deterministic recovery searches is
   * enough to materially improve recall without allowing semantic expansion
   * to explode CJ API usage.
   */
  return queries.slice(0, 4);
}

export async function searchSupplierProducts(
  keyword: string,
  limit = 30,
): Promise<SupplierProduct[]> {
  const token = await getAccessToken();
  const size = Math.max(30, Math.min(100, limit));

  type SearchResult = {
    products: SupplierProduct[];
    relatedCategoryIds: string[];
  };

  async function searchProducts(
    searchKeyword: string,
    categoryId?: string,
  ): Promise<SearchResult> {
    const params = new URLSearchParams({
      page: "1",
      size: String(size),
      keyWord: searchKeyword,
      features: "enable_category",
    });

    if (categoryId) {
      params.set("categoryId", categoryId);
    }

    const url =
      `${CJ_BASE_URL}/v1/product/listV2?${params.toString()}`;

    const res = await fetch(url, {
      headers: {
        "CJ-Access-Token": token,
      },
    });

    const data = await res.json();

    if (!data.result) {
      throw new Error(
        `CJ product search failed: ${data.message ?? "Unknown error."}`,
      );
    }

    const content = data.data?.content?.[0] ?? data.data ?? {};
    const list =
      content?.productList ??
      data.data?.productList ??
      data.data?.list ??
      [];

    const relatedCategoryIds: string[] = Array.from(
      new Set<string>(
        (content?.relatedCategoryList ?? [])
          .map((item: any) =>
            String(
              item?.categoryId ??
              item?.id ??
              item?.categoryID ??
              "",
            ).trim(),
          )
          .filter((value: string) => Boolean(value)),
      ),
    );

    return {
      products: list.map(
      (item: {
        id?: string;
        pid?: string;
        productId?: string;
        nameEn?: string;
        productNameEn?: string;
        productName?: string;
        bigImage?: string;
        productImage?: string;
        sellPrice?: string;
        categoryName?: string;
        productWeight?: string | number;
        packWeight?: string | number;
      }): SupplierProduct => {
        const id =
          item.id ??
          item.pid ??
          item.productId ??
          "";

        return {
          productId: id,
          productName:
            item.nameEn ??
            item.productNameEn ??
            item.productName ??
            "",
          productImage:
            item.bigImage ??
            item.productImage ??
            "",
          sellPrice: item.sellPrice ?? "0",
          productUrl: `https://cjdropshipping.com/product/${id}.html`,
          priceSource: "PRODUCT",
          variantResolved: false,
          inventoryCountryVerified: false,
          categoryName: item.categoryName ?? undefined,
          weightGrams: parseWeightGrams(
            item.productWeight ?? item.packWeight,
          ),
        };
      },
      ),
      relatedCategoryIds,
    };
  }

  /*
   * First query is always the candidate's original keyword.
   */
  const primaryResult = await searchProducts(keyword);
  let products = primaryResult.products;
  const discoveredCategoryIds = primaryResult.relatedCategoryIds;

  console.log(
    `NOVA CJ: catalog query → ${keyword} | results=${products.length}`,
  );

  if (products.length > 0) {
    console.log(
      `NOVA CJ: top catalog results → ${products.slice(0, 5).map((product) => product.productName).join(" | ")}`,
    );
  }

  /*
   * A successful CJ response can still be semantically useless.
   * Example: "toilet bowl cleaning tablets" may return tablet computers,
   * washing-machine cleaners and toilet brushes.
   *
   * Only retry when no retrieved result has plausible product identity.
   * This keeps the API usage bounded and preserves the strict final gate.
   */
  if (!hasPotentialSupplierMatch(products, keyword)) {
    const fallbackQueries = buildSemanticSupplierQueries(keyword);

    for (const fallbackKeyword of fallbackQueries) {
      console.log(
        `NOVA CJ: semantic recovery query → ${fallbackKeyword}`,
      );

      const fallbackResult =
        await searchProducts(fallbackKeyword);
      const fallbackProducts = fallbackResult.products;

      for (const categoryId of fallbackResult.relatedCategoryIds) {
        if (discoveredCategoryIds.length >= 4) break;
        if (!discoveredCategoryIds.includes(categoryId)) {
          discoveredCategoryIds.push(categoryId);
        }
      }

      console.log(
        `NOVA CJ: catalog recovery results → ${fallbackKeyword} | results=${fallbackProducts.length}`,
      );

      if (fallbackProducts.length > 0) {
        console.log(
          `NOVA CJ: recovery matches → ${fallbackProducts.slice(0, 5).map((product) => product.productName).join(" | ")}`,
        );
        products = [
          ...products,
          ...fallbackProducts,
        ];
      }

      if (hasPotentialSupplierMatch(products, keyword)) {
        break;
      }
    }
  }

  /*
   * CJ listV2 exposes relatedCategoryList when category information is
   * requested. When keyword search remains semantically empty, use at most
   * one category-filtered search against the strongest discovered category.
   * This improves recall without turning every candidate into an expensive
   * category-search fan-out.
   */
  if (
    !hasPotentialSupplierMatch(products, keyword) &&
    discoveredCategoryIds.length > 0
  ) {
    const categoryId = discoveredCategoryIds[0];
    console.log(
      `NOVA CJ: category recovery → ${keyword} | categoryId=${categoryId}`,
    );

    const categoryResult = await searchProducts(
      keyword,
      categoryId,
    );
    const categoryProducts = categoryResult.products;

    console.log(
      `NOVA CJ: category recovery results → ${keyword} | categoryId=${categoryId} | results=${categoryProducts.length}`,
    );

    if (categoryProducts.length > 0) {
      products = [
        ...products,
        ...categoryProducts,
      ];
    }
  }

  /*
   * De-duplicate by supplier product ID/name so merged fallback results do
   * not distort later evidence counts or matching.
   */
  const seen = new Set<string>();
  const deduped: SupplierProduct[] = [];

  for (const product of products) {
    const key =
      product.productId.trim() ||
      product.productName.trim().toLowerCase();

    if (!key || seen.has(key)) continue;

    seen.add(key);
    deduped.push(product);
  }

  return deduped.slice(0, 100);
}


/*
 * Physical plausibility.
 *
 * The price filter in the market engine catches matches that cost more than the
 * product retails for, but that is an economic proxy for a physical problem: the
 * supplier is offering a completely different object. Weight measures the
 * problem directly, and it is not fooled by a cheap listing for a bulky item.
 *
 * Both signals are kept because each catches cases the other misses.
 */
function parseWeightGrams(
  value: unknown,
): number | null {
  if (value === null || value === undefined) return null;

  const numeric = Number(
    String(value).replace(/[^0-9.]/g, ""),
  );

  return Number.isFinite(numeric) && numeric > 0
    ? numeric
    : null;
}

/*
 * Words that only appear on genuinely bulky goods.
 *
 * If the SUPPLIER name contains one of these and the QUERY does not, the match
 * is a category error rather than a near miss — a wardrobe is not a variation on
 * a drawer organiser.
 */
const BULK_TERMS = [
  "cabinet",
  "wardrobe",
  "dresser",
  "bookcase",
  "bookshelf",
  "sofa",
  "couch",
  "vanity",
  "bed frame",
  "mattress",
  "kitchen island",
  "trolley cart",
  "patio",
  "gallon",
  "trailer",
  "chest of drawer",
  "tv stand",
  "shelving unit",
  "desk,",
  "workstation",
];

/// Above this, a product is not a small accessory. 4 kg is generous —
/// it still allows a heavy toolkit or a large cookware item.
const ACCESSORY_WEIGHT_LIMIT_G = 4000;

export function isPhysicallyPlausible(
  query: string,
  product: SupplierProduct,
): { ok: boolean; reason?: string } {
  const q = query.toLowerCase();
  const name = (product.productName || "").toLowerCase();

  const queryWantsBulk = BULK_TERMS.some(
    (term) => q.includes(term),
  );

  if (!queryWantsBulk) {
    const offending = BULK_TERMS.find(
      (term) => name.includes(term),
    );

    if (offending) {
      return {
        ok: false,
        reason: `supplier item is a "${offending}" but the search was not`,
      };
    }

    if (
      product.weightGrams !== null &&
      product.weightGrams !== undefined &&
      product.weightGrams >
        ACCESSORY_WEIGHT_LIMIT_G
    ) {
      return {
        ok: false,
        reason: `supplier item weighs ${(product.weightGrams / 1000).toFixed(1)}kg, too heavy for this product`,
      };
    }
  }

  return { ok: true };
}

export function pickBestSupplierMatch(
  products: SupplierProduct[],
  productTitle: string,
  minConfidence = 58,
): SupplierMatch | null {
  if (
    !productTitle.trim() ||
    products.length === 0
  ) {
    return null;
  }

  let best: SupplierMatch | null = null;

  for (const product of products) {
    if (!product.productName.trim()) continue;

    /*
     * Structural rejection before scoring.
     *
     * A match that is physically the wrong kind of object should never be
     * ranked at all, however many words it shares with the query.
     */
    const plausible = isPhysicallyPlausible(
      productTitle,
      product,
    );

    if (!plausible.ok) {
      console.log(
        `NOVA CJ: rejected implausible match → "${product.productName.slice(0, 60)}" (${plausible.reason})`,
      );
      continue;
    }

    const scored = scoreSupplierMatch(
      productTitle,
      product.productName,
    );

    const candidate: SupplierMatch = {
      ...scored,
      product,
    };

    if (
      candidate.confidence <
      minConfidence
    ) {
      continue;
    }

    if (
      candidate.conflictingTokens.length > 0
    ) {
      continue;
    }

    if (!candidate.unitCompatible) {
      continue;
    }

    if (!candidate.packCompatible) {
      continue;
    }

    if (
      !best ||
      candidate.confidence >
        best.confidence
    ) {
      best = candidate;
    }
  }

  return best;
}
