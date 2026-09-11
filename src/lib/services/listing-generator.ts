// FILE: src/lib/services/listing-generator.ts
//
// Writes a bilingual (English + Hindi) product listing, grounded in the REAL
// supplier product name and the REAL market signals already gathered — not
// invented from nothing.
//
// This module used to call the Anthropic API directly and throw if
// ANTHROPIC_API_KEY was absent. That made it the one part of the pipeline that
// could not run for free: every other engine goes through callNovaAI and its
// OpenRouter/Gemini/Hugging Face chain. Publishing a product therefore either
// failed outright or quietly cost money, which defeats the free-tier posture of
// the rest of the system.
//
// It now uses the same free chain as everything else, and — importantly — falls
// back to a deterministic listing rather than throwing. A publish must never be
// lost because a free model was rate-limited; a plain, honest listing that the
// admin can edit is far better than no product.

import { callNovaAI } from "./nova-ai-provider";

export interface GeneratedListing {
  titleEn: string;
  descriptionEn: string;
  titleHi: string;
  descriptionHi: string;
  /// AI when a model wrote it, TEMPLATE when the deterministic fallback did.
  /// Surfaced in the admin console so a human knows what needs a second look.
  source: "AI" | "TEMPLATE";
}

export interface ListingParams {
  productWorkingTitle: string;
  supplierProductName: string;
  category: string;
  trendDirection: string;
}

const SYSTEM_PROMPT = `You write product listings for an Indian e-commerce store.

Rules you must follow:
- Be specific and honest. Describe what the product actually is.
- No exaggerated claims, no invented specifications, no fake scarcity.
- Do not claim a brand, certification, warranty or material that is not in the supplier name.
- Hindi must be natural Devanagari, not transliterated English.

Respond with ONLY a JSON object. No markdown, no code fences, no preamble.`;

function buildPrompt(params: ListingParams): string {
  return `Product category: ${params.category}
Working title: ${params.productWorkingTitle}
Real supplier listing name (reference only, do not copy verbatim): ${params.supplierProductName}
Current market trend: ${params.trendDirection}

Return exactly these keys:
{
  "titleEn": "a clean, appealing English product title, under 70 characters",
  "descriptionEn": "a 2-3 sentence English product description for shoppers, honest and specific",
  "titleHi": "the same title translated naturally into Hindi (Devanagari script)",
  "descriptionHi": "the same description translated naturally into Hindi (Devanagari script)"
}`;
}

/*
 * Supplier names are written for search engines, not shoppers:
 * "Large Mouse Pad, Gaming Gaming, Colorful Seaming, Waterproof Cloth".
 * This strips the worst of it so the fallback title is at least presentable.
 */
function tidyTitle(raw: string): string {
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/[|/]+/g, " ")
    .replace(/\b(\w+)( \1\b)+/gi, "$1") // collapse "Gaming Gaming"
    .replace(/\s*,\s*/g, ", ")
    .trim();

  if (cleaned.length <= 68) return cleaned;

  // Cut at a comma or word boundary rather than mid-word.
  const cut = cleaned.slice(0, 68);
  const lastBreak = Math.max(cut.lastIndexOf(","), cut.lastIndexOf(" "));
  return (lastBreak > 30 ? cut.slice(0, lastBreak) : cut).trim();
}

/*
 * Deterministic fallback.
 *
 * Deliberately plain. It states what the product is and nothing more, because
 * the alternative — a template that invents selling points — would put claims
 * on the storefront that nobody verified.
 */
function buildTemplateListing(params: ListingParams): GeneratedListing {
  const title = tidyTitle(
    params.productWorkingTitle || params.supplierProductName,
  );

  return {
    titleEn: title,
    descriptionEn: `${title}. Category: ${params.category}. Shipped to you from our supplier network. Full specifications are listed below — please check them before ordering.`,
    titleHi: title,
    descriptionHi: `${title}। श्रेणी: ${params.category}। हमारे सप्लायर नेटवर्क से आप तक भेजा जाता है। ऑर्डर करने से पहले कृपया नीचे दी गई पूरी जानकारी अवश्य देखें।`,
    source: "TEMPLATE",
  };
}

function parseListing(text: string): Omit<GeneratedListing, "source"> | null {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

  // Models sometimes wrap the object in a sentence; take the outermost braces.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<
      string,
      unknown
    >;

    const str = (key: string): string =>
      typeof parsed[key] === "string" ? (parsed[key] as string).trim() : "";

    const titleEn = str("titleEn");
    const descriptionEn = str("descriptionEn");

    // A listing without an English title and description is not usable.
    if (!titleEn || !descriptionEn) return null;

    return {
      titleEn: titleEn.slice(0, 120),
      descriptionEn: descriptionEn.slice(0, 2000),
      titleHi: str("titleHi").slice(0, 120) || titleEn,
      descriptionHi: str("descriptionHi").slice(0, 2000) || descriptionEn,
    };
  } catch {
    return null;
  }
}

export async function generateListing(
  params: ListingParams,
): Promise<GeneratedListing> {
  try {
    const response = await callNovaAI({
      system: SYSTEM_PROMPT,
      user: buildPrompt(params),
      temperature: 0.4,
      maxTokens: 1200,
    });

    if (response) {
      const parsed = parseListing(response.text);
      if (parsed) return { ...parsed, source: "AI" };

      console.warn(
        `[listing-generator] ${response.provider} returned unusable JSON; using the template listing instead.`,
      );
    }
  } catch (error) {
    console.warn(
      "[listing-generator] AI listing failed:",
      error instanceof Error ? error.message : String(error),
    );
  }

  return buildTemplateListing(params);
}
