// FILE: F:\projects\novacart\src\lib\services\nova-ai-provider.ts

export interface NovaAiRequest {
  system: string;

  user: string;

  temperature?: number;

  maxTokens?: number;
}

export interface NovaAiResponse {
  text: string;

  model: string;

  provider:
    | "OPENROUTER"
    | "GEMINI"
    | "HUGGINGFACE"
    | "ANTHROPIC";
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };

    finishReason?: string;
  }>;

  error?: {
    message?: string;

    status?: string;
  };
}

type HuggingFaceResponse =
  | Array<{
      generated_text?: string;
    }>
  | {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;

      error?: string;
    };

interface OpenRouterMessage {
  content?: unknown;

  reasoning?: unknown;

  reasoning_details?: unknown;
}

interface OpenRouterChoice {
  message?: OpenRouterMessage;

  finish_reason?: string | null;
}

interface OpenRouterResponse {
  choices?: OpenRouterChoice[];

  model?: string;

  error?: {
    message?: string;

    code?: number | string;

    metadata?: unknown;
  };
}

interface AnthropicResponse {
  content?: Array<{
    type?: string;

    text?: string;
  }>;

  error?: {
    message?: string;

    type?: string;
  };
}

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const ANTHROPIC_URL =
  "https://api.anthropic.com/v1/messages";

const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

const HUGGINGFACE_URL =
  "https://router.huggingface.co/v1/chat/completions";

const DEFAULT_OPENROUTER_MODEL =
  "openrouter/free";

/*
 * Free-tier defaults.
 *
 * Flash rather than Pro: the free allowance is far larger and NOVA's prompts are
 * classification and synthesis over supplied evidence, not open-ended
 * reasoning, so the cheaper model is the right default until the store earns.
 */
const DEFAULT_GEMINI_MODEL =
  "gemini-2.0-flash";

const DEFAULT_HF_MODEL =
  "meta-llama/Llama-3.1-8B-Instruct";

/// Order of the zero-cost providers. Overridable with NOVA_FREE_AI_ORDER.
const DEFAULT_FREE_CHAIN = [
  "openrouter",
  "gemini",
  "huggingface",
];

const DEFAULT_TIMEOUT_MS =
  45000;

const DEFAULT_OPENROUTER_RETRIES =
  3;

/*
 * Once OpenRouter returns a hard 429/free-quota failure in this process,
 * stop making further requests to the free router.
 *
 * The deterministic NOVA rules layer remains responsible for the remaining
 * candidates.
 */
let openRouterRateLimitedUntil =
  0;

function getTimeoutMs(): number {
  const configured =
    Number(
      process.env
        .NOVA_AI_TIMEOUT_MS,
    );

  if (
    Number.isFinite(
      configured,
    ) &&
    configured >= 5000
  ) {
    return configured;
  }

  return DEFAULT_TIMEOUT_MS;
}

function getOpenRouterRetryCount(): number {
  const configured =
    Number(
      process.env
        .NOVA_OPENROUTER_RETRIES,
    );

  if (
    Number.isFinite(
      configured,
    ) &&
    configured >= 1
  ) {
    return Math.min(
      4,
      Math.floor(
        configured,
      ),
    );
  }

  return DEFAULT_OPENROUTER_RETRIES;
}

function getBaseMaxTokens(
  request: NovaAiRequest,
): number {
  const configured =
    Number(
      request.maxTokens,
    );

  if (
    Number.isFinite(
      configured,
    ) &&
    configured >= 800
  ) {
    return Math.min(
      4000,
      Math.floor(
        configured,
      ),
    );
  }

  return 1800;
}

/*
 * Convert arbitrary model output into a plain string.
 */
function extractText(
  value: unknown,
): string {
  if (
    typeof value ===
    "string"
  ) {
    return value.trim();
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value
      .map(
        (
          part,
        ) => {
          if (
            typeof part ===
            "string"
          ) {
            return part;
          }

          if (
            typeof part ===
              "object" &&
            part !== null &&
            "text" in part
          ) {
            const text =
              (
                part as {
                  text?: unknown;
                }
              ).text;

            return typeof text ===
              "string"
              ? text
              : "";
          }

          return "";
        },
      )
      .join("")
      .trim();
  }

  if (
    typeof value ===
      "object" &&
    value !== null &&
    "text" in value
  ) {
    const text =
      (
        value as {
          text?: unknown;
        }
      ).text;

    return typeof text ===
      "string"
      ? text.trim()
      : "";
  }

  return "";
}

/*
 * Find a complete JSON object inside arbitrary model text.
 *
 * This handles:
 *   {"foo":"bar"}
 *
 * as well as:
 *
 * ```json
 * {"foo":"bar"}
 * ```
 *
 * and:
 *
 * Here is the result:
 * {"foo":"bar"}
 *
 * The parser tracks quoted strings and escaped characters so braces inside
 * JSON strings do not terminate the object prematurely.
 */
function extractBalancedJsonObject(
  value: string,
): string {
  const text =
    value
      .trim()
      .replace(
        /^```(?:json)?\s*/i,
        "",
      )
      .replace(
        /\s*```$/i,
        "",
      )
      .trim();

  if (!text) {
    return "";
  }

  let start =
    -1;

  let depth =
    0;

  let inString =
    false;

  let escaped =
    false;

  for (
    let i = 0;
    i < text.length;
    i++
  ) {
    const char =
      text[i];

    if (
      inString
    ) {
      if (
        escaped
      ) {
        escaped =
          false;

        continue;
      }

      if (
        char ===
        "\\"
      ) {
        escaped =
          true;

        continue;
      }

      if (
        char ===
        '"'
      ) {
        inString =
          false;
      }

      continue;
    }

    if (
      char ===
      '"'
    ) {
      inString =
        true;

      continue;
    }

    if (
      char ===
      "{"
    ) {
      if (
        start ===
        -1
      ) {
        start =
          i;
      }

      depth +=
        1;

      continue;
    }

    if (
      char ===
      "}"
    ) {
      if (
        depth >
        0
      ) {
        depth -=
          1;
      }

      if (
        start !==
          -1 &&
        depth ===
          0
      ) {
        const candidate =
          text.slice(
            start,
            i + 1,
          );

        try {
          const parsed =
            JSON.parse(
              candidate,
            );

          if (
            typeof parsed ===
              "object" &&
            parsed !== null &&
            !Array.isArray(
              parsed,
            )
          ) {
            return candidate;
          }
        } catch {
          /*
           * There may be another JSON object later in the response.
           * Continue scanning.
           */
        }

        /*
         * Reset so a later object can be discovered even when the first
         * balanced object was malformed.
         */
        start =
          -1;

        depth =
          0;
      }
    }
  }

  return "";
}

/*
 * OpenRouter can expose text through content, reasoning, or reasoning_details
 * depending on the selected free model.
 *
 * Crucially, we return ONLY a syntactically complete JSON object.
 * This means a transport-level "success" that cannot actually be consumed
 * by NOVA's structured analyst is treated as a failed AI attempt and can
 * consume a retry instead.
 */
function extractAssistantText(
  message:
    | OpenRouterMessage
    | undefined,
): string {
  if (!message) {
    return "";
  }

  const sources = [
    extractText(
      message.content,
    ),

    extractText(
      message.reasoning,
    ),

    extractText(
      message.reasoning_details,
    ),
  ];

  for (
    const source of
      sources
  ) {
    const json =
      extractBalancedJsonObject(
        source,
      );

    if (json) {
      return json;
    }
  }

  return "";
}

function parseErrorMessage(
  raw: string,
): string {
  try {
    const parsed =
      JSON.parse(
        raw,
      ) as {
        error?: {
          message?: string;
        };
      };

    return String(
      parsed?.error
        ?.message ||
        raw,
    ).slice(
      0,
      1200,
    );
  } catch {
    return raw.slice(
      0,
      1200,
    );
  }
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      getTimeoutMs(),
    );

  try {
    const response =
      await fetch(
        url,
        {
          ...init,

          signal:
            controller.signal,

          cache:
            "no-store",
        },
      );

    const raw =
      await response.text();

    if (
      !response.ok
    ) {
      throw new Error(
        `AI provider ${response.status}: ${parseErrorMessage(
          raw,
        )}`,
      );
    }

    try {
      return JSON.parse(
        raw,
      ) as T;
    } catch {
      throw new Error(
        "AI provider returned invalid JSON",
      );
    }
  } catch (
    error
  ) {
    if (
      error instanceof
        DOMException &&
      error.name ===
        "AbortError"
    ) {
      throw new Error(
        "AI provider request timed out",
      );
    }

    if (
      error instanceof
      Error
    ) {
      throw error;
    }

    throw new Error(
      String(error),
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

function buildOpenRouterHeaders(
  key: string,
): Record<string, string> {
  return {
    "Content-Type":
      "application/json",

    Authorization:
      `Bearer ${key}`,

    "HTTP-Referer":
      process.env
        .NOVA_PUBLIC_SITE_URL ||
      "https://novacarts.vercel.app",

    "X-Title":
      "NovaCart NOVA Market Intelligence",
  };
}

/*
 * A failure is retryable when another free-model attempt has a reasonable
 * chance of succeeding.
 *
 * Hard 429/free-quota failures are NOT retryable.
 */
function isRetryableOpenRouterFailure(
  message: string,
): boolean {
  const normalized =
    message.toLowerCase();

  if (
    normalized.includes(
      "ai provider 429",
    ) ||
    normalized.includes(
      "rate limit exceeded",
    ) ||
    normalized.includes(
      "free-models-per-day",
    ) ||
    normalized.includes(
      "daily rate limit",
    )
  ) {
    return false;
  }

  if (
    normalized.includes(
      "returned no final text",
    )
  ) {
    return true;
  }

  if (
    normalized.includes(
      "finish_reason=length",
    )
  ) {
    return true;
  }

  if (
    normalized.includes(
      "request timed out",
    ) ||
    normalized.includes(
      "timeout",
    )
  ) {
    return true;
  }

  /*
   * Transient upstream failures.
   */
  if (
    normalized.includes(
      "ai provider 408",
    ) ||
    normalized.includes(
      "ai provider 409",
    ) ||
    normalized.includes(
      "ai provider 425",
    ) ||
    normalized.includes(
      "ai provider 500",
    ) ||
    normalized.includes(
      "ai provider 502",
    ) ||
    normalized.includes(
      "ai provider 503",
    ) ||
    normalized.includes(
      "ai provider 504",
    ) ||
    normalized.includes(
      "temporarily unavailable",
    ) ||
    normalized.includes(
      "bad gateway",
    ) ||
    normalized.includes(
      "service unavailable",
    )
  ) {
    return true;
  }

  return false;
}

/*
 * Increase output space after a failed attempt.
 *
 * Attempt 1:
 *   use the analyst's requested token budget.
 *
 * Attempt 2:
 *   give the next model materially more room.
 *
 * Attempt 3+:
 *   allow enough room for the complete structured answer even on slower/
 *   more verbose free models.
 */
function getAttemptMaxTokens(
  request: NovaAiRequest,
  attempt: number,
): number {
  const base =
    getBaseMaxTokens(
      request,
    );

  if (
    attempt <=
    1
  ) {
    return base;
  }

  if (
    attempt >=
    3
  ) {
    return Math.min(
      3200,
      Math.max(
        base,
        2800,
      ),
    );
  }

  return Math.min(
    2600,
    Math.max(
      base,
      2200,
    ),
  );
}

async function waitBeforeRetry(
  attempt: number,
): Promise<void> {
  const delay =
    Math.min(
      3500,
      700 *
        2 **
          Math.max(
            0,
            attempt - 1,
          ),
    );

  await new Promise<void>(
    (
      resolve,
    ) => {
      setTimeout(
        resolve,
        delay,
      );
    },
  );
}

/*
 * One concrete OpenRouter request.
 *
 * It returns only when the response contains a complete JSON object.
 * Therefore "AI success" below means the response is actually consumable by
 * NOVA's structured analyst, rather than merely receiving HTTP 200.
 */
async function callOpenRouterOnce(
  request: NovaAiRequest,
  attempt: number,
): Promise<NovaAiResponse> {
  const key =
    process.env
      .OPENROUTER_API_KEY?.trim();

  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured",
    );
  }

  const model =
    process.env
      .NOVA_OPENROUTER_MODEL?.trim() ||
    DEFAULT_OPENROUTER_MODEL;

  const maxTokens =
    getAttemptMaxTokens(
      request,
      attempt,
    );

  const body = {
    model,

    messages: [
      {
        role:
          "system",

        content:
          request.system,
      },

      {
        role:
          "user",

        content:
          request.user,
      },
    ],

    temperature:
      request.temperature ??
      0,

    max_tokens:
      maxTokens,

    /*
     * Keep the request provider-agnostic.
     *
     * The free router can choose different underlying models, so NOVA still
     * validates the actual returned content itself.
     */
    response_format: {
      type:
        "json_object",
    },
  };

  console.log(
    `NOVA OpenRouter request: model=${model}, attempt=${attempt}/${getOpenRouterRetryCount()}, max_tokens=${maxTokens}`,
  );

  const data =
    await requestJson<OpenRouterResponse>(
      OPENROUTER_URL,
      {
        method:
          "POST",

        headers:
          buildOpenRouterHeaders(
            key,
          ),

        body:
          JSON.stringify(
            body,
          ),
      },
    );

  const choice =
    data.choices?.[0];

  const text =
    extractAssistantText(
      choice?.message,
    );

  if (!text) {
    throw new Error(
      `OpenRouter returned no usable structured JSON (model=${String(
        data.model ||
          model,
      )}, finish_reason=${
        choice?.finish_reason ||
        "unknown"
      })`,
    );
  }

  /*
   * Parse once here to guarantee that the returned payload is valid JSON
   * before it is handed to market-analyst.ts.
   *
   * The analyst still validates the semantic schema.
   */
  try {
    const parsed =
      JSON.parse(
        text,
      );

    if (
      typeof parsed !==
        "object" ||
      parsed === null ||
      Array.isArray(
        parsed,
      )
    ) {
      throw new Error(
        "Structured AI response is not a JSON object",
      );
    }
  } catch (
    error
  ) {
    throw new Error(
      `OpenRouter returned unusable JSON: ${
        error instanceof
        Error
          ? error.message
          : String(error)
      }`,
    );
  }

  return {
    text,

    model:
      String(
        data.model ||
          model,
      ),

    provider:
      "OPENROUTER",
  };
}

/*
 * OpenRouter free-router retry strategy.
 *
 * The retry mechanism does NOT hardcode individual free model IDs.
 * openrouter/free dynamically selects from the available free pool, so a
 * subsequent request can be routed differently.
 */
async function callOpenRouter(
  request: NovaAiRequest,
): Promise<NovaAiResponse> {
  const key =
    process.env
      .OPENROUTER_API_KEY?.trim();

  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured",
    );
  }

  /*
   * Do not attempt another request after the free-model daily limit is hit.
   */
  if (
    Date.now() <
    openRouterRateLimitedUntil
  ) {
    throw new Error(
      "OpenRouter free-model rate limit is active for this research process",
    );
  }

  const maxAttempts =
    getOpenRouterRetryCount();

  let lastError:
    | Error
    | null =
    null;

  for (
    let attempt = 1;
    attempt <=
    maxAttempts;
    attempt++
  ) {
    try {
      const response =
        await callOpenRouterOnce(
          request,
          attempt,
        );

      return response;
    } catch (
      error
    ) {
      const message =
        error instanceof
        Error
          ? error.message
          : String(error);

      lastError =
        new Error(
          message,
        );

      /*
       * 429/free daily quota is terminal for this process.
       */
      if (
        message.includes(
          "AI provider 429",
        ) ||
        message
          .toLowerCase()
          .includes(
            "rate limit exceeded",
          ) ||
        message
          .toLowerCase()
          .includes(
            "free-models-per-day",
          ) ||
        message
          .toLowerCase()
          .includes(
            "daily rate limit",
          )
      ) {
        openRouterRateLimitedUntil =
          Date.now() +
          24 *
            60 *
            60 *
            1000;

        throw new Error(
          "OpenRouter free-model daily rate limit reached; AI analysis is disabled for the remainder of this process",
        );
      }

      const retryable =
        isRetryableOpenRouterFailure(
          message,
        );

      if (
        !retryable ||
        attempt >=
          maxAttempts
      ) {
        throw error;
      }

      console.warn(
        `NOVA OpenRouter attempt ${attempt}/${maxAttempts} failed; retrying free router: ${message}`,
      );

      await waitBeforeRetry(
        attempt,
      );
    }
  }

  throw (
    lastError ||
    new Error(
      "OpenRouter failed without a usable response",
    )
  );
}

async function callAnthropic(
  request: NovaAiRequest,
): Promise<NovaAiResponse> {
  const key =
    process.env
      .ANTHROPIC_API_KEY?.trim();

  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured",
    );
  }

  const model =
    process.env
      .NOVA_ANTHROPIC_MODEL?.trim() ||
    "claude-haiku-4-5-20251001";

  const data =
    await requestJson<AnthropicResponse>(
      ANTHROPIC_URL,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "x-api-key":
            key,

          "anthropic-version":
            "2023-06-01",
        },

        body:
          JSON.stringify(
            {
              model,

              max_tokens:
                Math.max(
                  1600,
                  request.maxTokens ??
                    1800,
                ),

              temperature:
                request.temperature ??
                0,

              system:
                request.system,

              messages: [
                {
                  role:
                    "user",

                  content:
                    request.user,
                },
              ],
            },
          ),
      },
    );

  const text =
    data.content
      ?.find(
        (
          item,
        ) =>
          item.type ===
          "text",
      )
      ?.text
      ?.trim();

  if (!text) {
    throw new Error(
      "Anthropic returned an empty completion",
    );
  }

  return {
    text,

    model,

    provider:
      "ANTHROPIC",
  };
}

/*
 * Google Gemini — free tier.
 *
 * GEMINI_API_KEY was already present in .env.local but nothing in the codebase
 * referenced it. The free allowance on Flash is by a wide margin the largest
 * genuinely free LLM budget available to this project, which makes it the right
 * second link in the chain when the OpenRouter free pool is exhausted or
 * rate-limited.
 *
 * The system prompt is sent through system_instruction rather than being
 * prepended to the user turn, so evidence-grounded prompts keep the same shape
 * they have on the other providers.
 */
async function callGemini(
  request: NovaAiRequest,
): Promise<NovaAiResponse> {
  const key =
    process.env
      .GEMINI_API_KEY?.trim();

  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not configured",
    );
  }

  const model =
    process.env
      .NOVA_GEMINI_MODEL?.trim() ||
    DEFAULT_GEMINI_MODEL;

  const data =
    await requestJson<GeminiResponse>(
      `${GEMINI_BASE_URL}/${encodeURIComponent(
        model,
      )}:generateContent`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          "x-goog-api-key":
            key,
        },

        body:
          JSON.stringify(
            {
              system_instruction:
                {
                  parts: [
                    {
                      text: request.system,
                    },
                  ],
                },

              contents: [
                {
                  role:
                    "user",

                  parts: [
                    {
                      text: request.user,
                    },
                  ],
                },
              ],

              generationConfig:
                {
                  temperature:
                    request.temperature ??
                    0,

                  maxOutputTokens:
                    Math.max(
                      1600,
                      request.maxTokens ??
                        1800,
                    ),
                },
            },
          ),
      },
    );

  if (data.error?.message) {
    throw new Error(
      `Gemini error: ${data.error.message}`,
    );
  }

  const text =
    data.candidates
      ?.map(
        (
          candidate,
        ) =>
          candidate.content?.parts
            ?.map(
              (
                part,
              ) =>
                part.text ??
                "",
            )
            .join(""),
      )
      .find(
        (
          value,
        ) =>
          Boolean(
            value &&
              value.trim(),
          ),
      )
      ?.trim();

  if (!text) {
    throw new Error(
      "Gemini returned an empty completion",
    );
  }

  return {
    text,

    model,

    provider:
      "GEMINI",
  };
}

/*
 * Hugging Face router — free tier.
 *
 * Last free link in the chain. The hosted free models are considerably weaker
 * than the others, so this exists to keep NOVA's synthesis alive during an
 * outage rather than as a preferred route. When it fails, the deterministic
 * rules layer takes over, which is a correct and safe outcome.
 */
async function callHuggingFace(
  request: NovaAiRequest,
): Promise<NovaAiResponse> {
  const key =
    process.env
      .HF_API_KEY?.trim();

  if (!key) {
    throw new Error(
      "HF_API_KEY is not configured",
    );
  }

  const model =
    process.env
      .NOVA_HF_MODEL?.trim() ||
    DEFAULT_HF_MODEL;

  const data =
    await requestJson<HuggingFaceResponse>(
      HUGGINGFACE_URL,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${key}`,
        },

        body:
          JSON.stringify(
            {
              model,

              messages: [
                {
                  role:
                    "system",

                  content:
                    request.system,
                },
                {
                  role:
                    "user",

                  content:
                    request.user,
                },
              ],

              temperature:
                request.temperature ??
                0,

              max_tokens:
                Math.max(
                  1200,
                  request.maxTokens ??
                    1500,
                ),
            },
          ),
      },
    );

  if (
    !Array.isArray(
      data,
    ) &&
    data.error
  ) {
    throw new Error(
      `Hugging Face error: ${data.error}`,
    );
  }

  const text =
    Array.isArray(data)
      ? data[0]
          ?.generated_text
          ?.trim()
      : data.choices?.[0]
          ?.message
          ?.content
          ?.trim();

  if (!text) {
    throw new Error(
      "Hugging Face returned an empty completion",
    );
  }

  return {
    text,

    model,

    provider:
      "HUGGINGFACE",
  };
}

/*
 * Ordered free provider chain.
 *
 * Each link is attempted only if its key is configured. A provider that fails
 * hands over to the next rather than aborting the run, because a single
 * exhausted free quota should never stop a research pass.
 */
async function tryFreeChain(
  request: NovaAiRequest,
  order: string[],
): Promise<
  NovaAiResponse | null
> {
  for (const name of order) {
    const configured =
      name ===
      "openrouter"
        ? process.env
            .OPENROUTER_API_KEY
        : name ===
            "gemini"
          ? process.env
              .GEMINI_API_KEY
          : name ===
              "huggingface"
            ? process.env
                .HF_API_KEY
            : null;

    if (!configured) {
      continue;
    }

    try {
      const response =
        name ===
        "openrouter"
          ? await callOpenRouter(
              request,
            )
          : name ===
              "gemini"
            ? await callGemini(
                request,
              )
            : await callHuggingFace(
                request,
              );

      console.log(
        `NOVA AI success: provider=${response.provider}, model=${response.model}`,
      );

      return response;
    } catch (
      error
    ) {
      console.warn(
        `NOVA ${name} provider failed: ${
          error instanceof
          Error
            ? error.message
            : String(
                error,
              )
        }`,
      );
    }
  }

  return null;
}

export async function callNovaAI(
  request: NovaAiRequest,
): Promise<
  NovaAiResponse | null
> {
  const selectedProvider =
    (
      process.env
        .NOVA_AI_PROVIDER ||
      "openrouter"
    )
      .trim()
      .toLowerCase();

  /*
   * Paid fallback is deliberately OFF by default.
   *
   * Anthropic can remain configured in .env.local without being consumed
   * merely because OpenRouter fails.
   */
  const allowPaidFallback =
    (
      process.env
        .NOVA_ALLOW_PAID_AI_FALLBACK ||
      "false"
    )
      .trim()
      .toLowerCase() ===
    "true";

  /*
   * Deterministic rules mode.
   *
   * market-engine.ts uses this for candidates outside the scarce AI budget.
   * No provider call happens here.
   */
  if (
    selectedProvider ===
    "rules"
  ) {
    return null;
  }

  /*
   * Explicit single-provider selection.
   *
   * Setting NOVA_AI_PROVIDER to a specific provider pins NOVA to it and skips
   * the chain entirely, which is what a diagnostic run wants.
   */
  if (
    selectedProvider ===
    "anthropic"
  ) {
    if (
      !process.env
        .ANTHROPIC_API_KEY
    ) {
      console.warn(
        "NOVA: Anthropic selected but ANTHROPIC_API_KEY is not configured.",
      );

      return null;
    }

    try {
      const response =
        await callAnthropic(
          request,
        );

      console.log(
        `NOVA AI success: provider=${response.provider}, model=${response.model}`,
      );

      return response;
    } catch (
      error
    ) {
      console.warn(
        `NOVA Anthropic provider failed: ${
          error instanceof
          Error
            ? error.message
            : String(
                error,
              )
        }`,
      );

      return null;
    }
  }

  /*
   * Free chain.
   *
   * The configured provider is tried first and the remaining free providers act
   * as fallbacks behind it. Previously a single OpenRouter failure ended the
   * attempt and every remaining candidate silently dropped to the deterministic
   * rules layer, even though two other free keys were sitting unused in the
   * environment.
   */
  const configuredOrder =
    (
      process.env
        .NOVA_FREE_AI_ORDER ||
      ""
    )
      .split(",")
      .map(
        (
          value,
        ) =>
          value
            .trim()
            .toLowerCase(),
      )
      .filter(
        Boolean,
      );

  const baseOrder =
    configuredOrder.length >
    0
      ? configuredOrder
      : DEFAULT_FREE_CHAIN;

  const order =
    baseOrder.includes(
      selectedProvider,
    )
      ? [
          selectedProvider,
          ...baseOrder.filter(
            (
              name,
            ) =>
              name !==
              selectedProvider,
          ),
        ]
      : baseOrder;

  const free =
    await tryFreeChain(
      request,
      order,
    );

  if (free) {
    return free;
  }

  /*
   * Paid fallback stays OFF by default.
   *
   * Anthropic can remain configured in .env.local without being consumed simply
   * because every free provider was unavailable.
   */
  if (
    allowPaidFallback &&
    process.env
      .ANTHROPIC_API_KEY
  ) {
    console.warn(
      "NOVA: every free provider failed and paid fallback is enabled; attempting Anthropic.",
    );

    try {
      const response =
        await callAnthropic(
          request,
        );

      console.log(
        `NOVA AI success: provider=${response.provider}, model=${response.model}`,
      );

      return response;
    } catch (
      fallbackError
    ) {
      console.warn(
        `NOVA Anthropic fallback failed: ${
          fallbackError instanceof
          Error
            ? fallbackError.message
            : String(
                fallbackError,
              )
        }`,
      );
    }
  }

  /*
   * Deterministic NOVA rules handle this candidate.
   */
  return null;
}
