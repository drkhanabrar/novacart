const CJ_BASE_URL = "https://developers.cjdropshipping.com/api2.0";

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

export interface SupplierProduct {
  productId: string;
  productName: string;
  productImage: string;
  sellPrice: string; // CJ's suggested/current price, as a string like "12.50"
  productUrl: string;
}

// Simple in-memory cache so we don't request a new token on every call.
// CJ caches the same token for 24h on their side anyway (see docs).
let cachedToken: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing CJ_API_KEY. Add it to your .env.local file (see setup steps)."
    );
  }

  const res = await fetch(`${CJ_BASE_URL}/v1/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });

  const data: CjTokenResponse = await res.json();

  if (!data.result || !data.data) {
    throw new Error(
      `CJ authentication failed: ${data.message ?? "Unknown error. Check your CJ_API_KEY."}`
    );
  }

  // Cache for 23 hours (token is valid ~24h) to be safe.
  cachedToken = {
    accessToken: data.data.accessToken,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000,
  };

  return cachedToken.accessToken;
}

export interface SupplierMatch {
  product: SupplierProduct;
  confidence: number; // 0-100, based on shared meaningful words
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2); // drop tiny/noise words like "to", "of"
}

/**
 * Picks the supplier result whose name best overlaps with our product
 * title. CJ's keyword search often returns loosely-related junk (e.g.
 * searching "wireless earbuds" can return a wireless mouse or a WiFi
 * antenna) — we score every result and refuse to pick one at all if
 * nothing clears the confidence bar, rather than silently attaching a
 * wrong cost to a real product.
 */
export function pickBestSupplierMatch(
  products: SupplierProduct[],
  productTitle: string,
  minConfidence = 50
): SupplierMatch | null {
  const titleWords = new Set(tokenize(productTitle));
  if (titleWords.size === 0) return null;

  let best: SupplierMatch | null = null;

  for (const product of products) {
    const nameWords = new Set(tokenize(product.productName));
    let overlap = 0;
    for (const w of titleWords) {
      if (nameWords.has(w)) overlap++;
    }
    const confidence = Math.round((overlap / titleWords.size) * 100);

    if (!best || confidence > best.confidence) {
      best = { product, confidence };
    }
  }

  if (!best || best.confidence < minConfidence) return null;
  return best;
}

/**
 * Searches CJ Dropshipping's live catalog for a keyword and returns
 * real, currently-orderable products with real supplier pricing.
 */
export async function searchSupplierProducts(
  keyword: string,
  limit = 10
): Promise<SupplierProduct[]> {
  const token = await getAccessToken();

  const url =
    `${CJ_BASE_URL}/v1/product/listV2` +
    `?page=1&size=${limit}&keyWord=${encodeURIComponent(keyword)}`;

  const res = await fetch(url, {
    headers: { "CJ-Access-Token": token },
  });

  const data = await res.json();

  if (!data.result) {
    throw new Error(`CJ product search failed: ${data.message ?? "Unknown error."}`);
  }

  // CJ's listV2 endpoint nests results as: data.content[0].productList[]
  // (data.content is an array containing one wrapper object per keyword group).
  const list =
    data.data?.content?.[0]?.productList ??
    data.data?.productList ??
    data.data?.list ??
    [];

  return list.map(
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
    }): SupplierProduct => ({
      productId: item.id ?? item.pid ?? item.productId ?? "",
      productName: item.nameEn ?? item.productNameEn ?? item.productName ?? "",
      productImage: item.bigImage ?? item.productImage ?? "",
      sellPrice: item.sellPrice ?? "0",
      productUrl: `https://cjdropshipping.com/product/${
        item.id ?? item.pid ?? item.productId ?? ""
      }.html`,
    })
  );
}