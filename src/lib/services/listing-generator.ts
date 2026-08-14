const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001"; // cheapest current model — plenty for short listings

export interface GeneratedListing {
  titleEn: string;
  descriptionEn: string;
  titleHi: string;
  descriptionHi: string;
}

interface ClaudeResponse {
  content?: { type: string; text?: string }[];
  error?: { message: string };
}

/**
 * Writes a bilingual (English + Hindi) product listing using Claude,
 * grounded in the REAL supplier product name and REAL market signal data
 * we already gathered — not invented from nothing.
 */
export async function generateListing(params: {
  productWorkingTitle: string;
  supplierProductName: string;
  category: string;
  trendDirection: string;
}): Promise<GeneratedListing> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Add it to your .env.local file (see setup steps)."
    );
  }

  const prompt = `You are writing a product listing for an Indian e-commerce store.

Product category: ${params.category}
Working title: ${params.productWorkingTitle}
Real supplier listing name (for reference, do not copy verbatim): ${params.supplierProductName}
Current market trend: ${params.trendDirection}

Write ONLY a JSON object (no markdown, no code fences, no preamble) with exactly these keys:
{
  "titleEn": "a clean, appealing English product title, under 70 characters",
  "descriptionEn": "a 2-3 sentence English product description for shoppers, honest and specific, no exaggerated claims",
  "titleHi": "the same title translated naturally into Hindi (Devanagari script)",
  "descriptionHi": "the same description translated naturally into Hindi (Devanagari script)"
}`;

  const res = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data: ClaudeResponse = await res.json();

  if (data.error) {
    throw new Error(`Claude API error: ${data.error.message}`);
  }

  const textBlock = data.content?.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Claude API returned no text content.");
  }

  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();

  let parsed: GeneratedListing;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Could not parse Claude's response as JSON. Raw response: ${cleaned.slice(0, 200)}`
    );
  }

  return parsed;
}