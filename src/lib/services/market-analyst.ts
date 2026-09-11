// FILE: F:\projects\novacart\src\lib\services\market-analyst.ts

import {
  callNovaAI,
  type NovaAiResponse,
} from "./nova-ai-provider";

export type DemandArchetype =
  | "TREND_LED"
  | "UTILITY_LED"
  | "REPLENISHMENT_LED"
  | "HYBRID";

export type ProductType =
  | "CONSUMABLE"
  | "REPLACEMENT"
  | "DURABLE"
  | "UTILITY"
  | "HYBRID";

export interface AnalystAssessment {
  isProductCandidate:
    boolean;

  category:
    string;

  demandArchetype:
    DemandArchetype;

  productType:
    ProductType;

  repeatPurchaseScore:
    number;

  returnRiskScore:
    number;

  serviceRiskScore:
    number;

  operationalEaseScore:
    number;

  customerNeedScore:
    number;

  riskFlags:
    string[];

  rationale:
    string;

  confidence:
    number;

  /*
   * "RULES" means no provider answered and the deterministic assessment stands.
   * The rest mirror the free-first chain in nova-ai-provider.ts, so a report can
   * show which provider actually produced a given judgement.
   */
  aiProvider:
    | NovaAiResponse["provider"]
    | "RULES";
}

const clamp = (
  value: unknown,
) =>
  Math.max(
    0,
    Math.min(
      100,
      Number(value) ||
        0,
    ),
  );

/*
 * --------------------------------------------------------------------------
 * PRODUCT ONTOLOGY
 * --------------------------------------------------------------------------
 *
 * NOVA distinguishes:
 *
 *   1. TRUE CONSUMABLE
 *      Physically depleted/consumed and must be purchased again.
 *
 *   2. REPLACEMENT
 *      Durable system component that is periodically replaced.
 *
 *   3. REFILL CONSUMABLE
 *      A refill that restores a consumable component or reservoir.
 *
 *   4. REUSABLE DURABLE
 *      Product is repeatedly used but not consumed.
 *
 *   5. UTILITY DURABLE
 *      Product solves a recurring practical problem but is not itself
 *      recurrently purchased.
 *
 * This prevents phrases like:
 *
 *   "food storage bag"
 *
 * from automatically becoming CONSUMABLE when the actual product is:
 *
 *   "reusable silicone food storage bag".
 */

type SemanticClass =
  | "TRUE_CONSUMABLE"
  | "REPLACEMENT"
  | "REFILL_CONSUMABLE"
  | "REUSABLE_DURABLE"
  | "UTILITY_DURABLE"
  | "DURABLE";

interface SemanticProfile {
  semanticClass:
    SemanticClass;

  regulated:
    boolean;

  sizeSensitive:
    boolean;

  serviceHeavy:
    boolean;

  fragile:
    boolean;

  liquid:
    boolean;

  consumable:
    boolean;

  replacement:
    boolean;

  refill:
    boolean;

  reusable:
    boolean;

  utility:
    boolean;

  durable:
    boolean;

  disposable:
    boolean;

  explicitReplacement:
    boolean;

  explicitRefill:
    boolean;

  strongUtilityProblem:
    boolean;
}

function deriveSemanticProfile(
  keyword: string,
): SemanticProfile {
  const text =
    keyword
      .toLowerCase()
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  const regulated =
    /(medicine|supplement|vitamin|drug|medical|tobacco|alcohol|weapon|pesticide|dangerous chemical|prescription)/.test(
      text,
    );

  const sizeSensitive =
    /(shoe|shoes|shirt|dress|jeans|clothing|fashion|apparel|size|ring|footwear)/.test(
      text,
    );

  const serviceHeavy =
    /(smartwatch|smart watch|laptop|computer|camera|printer|appliance|robot|battery|earbuds|speaker|drone|monitor|projector|electronic|electronics|electric scrubber)/.test(
      text,
    );

  const fragile =
    /(glass|ceramic|mirror|furniture|large|bulky|heavy)/.test(
      text,
    );

  const liquid =
    /(spray|liquid|cleaning spray|glass cleaner|surface cleaner|enzyme-based|enzyme based|detergent liquid|oil|serum|concentrate|solution)/.test(
      text,
    );

  /*
   * "reusable" must be detected BEFORE generic "bag/container" patterns.
   */
  const reusable =
    /\breusable\b|\bre-useable\b|\bwashable\b|\brewashable\b|\bsilicone reusable\b/.test(
      text,
    );

  const disposable =
    /\bdisposable\b|\bsingle[- ]use\b|\bone[- ]time\b/.test(
      text,
    );

  const explicitReplacement =
    /\breplacement\b|\breplaceable\b|\bspare\b|\breplacement head\b|\breplacement pad\b|\breplacement brush\b|\breplacement part\b|\breplacement filter\b|\bspare head\b|\bspare brush\b/.test(
      text,
    );

  const explicitRefill =
    /\brefill\b|\brefills\b|\brefillable\b/.test(
      text,
    );

  /*
   * True consumables.
   *
   * Note that generic "food storage bag" is intentionally NOT included.
   * Reusable food-storage products are durable goods.
   */
  const trueConsumable =
    /(detergent|cleaning tablets?|dishwasher tablets?|dishwashing liquid|dish soap|trash bag|trash bags|garbage bag|garbage bags|bin liner|bin liners|tissue|paper towel|paper towels|wipe|wipes|sponge|sponges|gel pods?|air freshener refill|laundry detergent|stain remover|pet waste bag|pet waste bags|cleaning powder|cleaning concentrate|cleaning solution|shampoo|conditioner|toilet cleaner|toilet cleaning powder|toilet bowl stain remover|drain cleaner|dishwasher cleaner|washing machine cleaner|water filter cartridge|razor blade|razor blades)/.test(
      text,
    );

  const replacement =
    explicitReplacement ||
    /(filter replacement|mop pad|mop pads|mop refill|lint roller refill|brush refill|replacement pad|replacement brush|replacement part|replacement filter|microfiber mop refill|microfiber mop cloth refill|dryer lint filter replacement)/.test(
      text,
    );

  const refill =
    explicitRefill;

  const utility =
    /(hanger|hook|rack|organizer|organiser|storage|brush|bottle|container|bag|case|cover|holder|stand|dispenser|caddy|divider|tray|catcher|scraper|squeegee|shelf|shoe organizer|drawer organizer|cabinet organizer|storage bin|drying rack|shoe rack|spice rack|compost bin|storage box|storage basket|wall shelf|file organizer|cable organizer|desk organizer|soap dispenser)/.test(
      text,
    );

  const durable =
    /(organizer|organiser|rack|shelf|container|holder|stand|caddy|brush|squeegee|catcher|divider|tray|pouch|box|bin|basket|cabinet|storage|bottle|dispenser|drying rack|food storage|shoe rack|spice rack|file organizer|cable organizer|soap dispenser)/.test(
      text,
    );

  const strongUtilityProblem =
    /(drain hair catcher|grout cleaning|toilet cleaning|window cleaning|pet hair removal|under sink|fridge organizer|pantry organizer|cabinet organizer|laundry organizer|storage bags?|squeegee|lint remover|shower drain|drain cleaning|tile cleaning|toilet bowl cleaning|pet hair brush|door organizer|dust removal|cleaning brush)/.test(
      text,
    );

  let semanticClass:
    SemanticClass =
    "DURABLE";

  /*
   * Priority ordering matters.
   *
   * Explicit replacement/refill semantics must outrank generic utility
   * and storage words.
   */
  if (
    replacement
  ) {
    semanticClass =
      "REPLACEMENT";
  } else if (
    refill &&
    !reusable
  ) {
    semanticClass =
      "REFILL_CONSUMABLE";
  } else if (
    trueConsumable &&
    !reusable
  ) {
    semanticClass =
      disposable
        ? "TRUE_CONSUMABLE"
        : "TRUE_CONSUMABLE";
  } else if (
    reusable
  ) {
    semanticClass =
      "REUSABLE_DURABLE";
  } else if (
    utility
  ) {
    semanticClass =
      "UTILITY_DURABLE";
  } else if (
    durable
  ) {
    semanticClass =
      "DURABLE";
  }

  return {
    semanticClass,

    regulated,

    sizeSensitive,

    serviceHeavy,

    fragile,

    liquid,

    consumable:
      trueConsumable ||
      refill,

    replacement,

    refill,

    reusable,

    utility,

    durable,

    disposable,

    explicitReplacement,

    explicitRefill,

    strongUtilityProblem,
  };
}

/*
 * --------------------------------------------------------------------------
 * DETERMINISTIC BASE ASSESSMENT
 * --------------------------------------------------------------------------
 */

function buildDeterministicAssessment(
  keyword: string,
  confidence = 35,
): AnalystAssessment {
  const profile =
    deriveSemanticProfile(
      keyword,
    );

  const flags:
    string[] =
    [];

  if (
    profile.regulated
  ) {
    flags.push(
      "restricted_or_regulated",
    );
  }

  if (
    profile.sizeSensitive
  ) {
    flags.push(
      "size_or_preference_return_risk",
    );
  }

  if (
    profile.serviceHeavy
  ) {
    flags.push(
      "after_sales_or_compatibility_risk",
    );
  }

  if (
    profile.fragile
  ) {
    flags.push(
      "fragile_or_large_fulfillment",
    );
  }

  if (
    profile.liquid
  ) {
    flags.push(
      "liquid_or_leakage_risk",
    );
  }

  if (
    profile.reusable
  ) {
    flags.push(
      "reusable_product",
    );
  }

  if (
    profile.consumable
  ) {
    flags.push(
      "true_consumable",
    );
  }

  if (
    profile.replacement
  ) {
    flags.push(
      "replacement_cycle",
    );
  }

  if (
    profile.refill
  ) {
    flags.push(
      "explicit_refill_signal",
    );
  }

  if (
    profile.disposable
  ) {
    flags.push(
      "disposable_product",
    );
  }

  if (
    profile.utility
  ) {
    flags.push(
      "utility_purchase",
    );
  }

  let productType:
    ProductType;

  switch (
    profile.semanticClass
  ) {
    case "TRUE_CONSUMABLE":
      productType =
        "CONSUMABLE";
      break;

    case "REFILL_CONSUMABLE":
      productType =
        "CONSUMABLE";
      break;

    case "REPLACEMENT":
      productType =
        "REPLACEMENT";
      break;

    case "REUSABLE_DURABLE":
      productType =
        "DURABLE";
      break;

    case "UTILITY_DURABLE":
      productType =
        "DURABLE";
      break;

    case "DURABLE":
      productType =
        "DURABLE";
      break;
  }

  let demandArchetype:
    DemandArchetype;

  switch (
    profile.semanticClass
  ) {
    case "TRUE_CONSUMABLE":
      demandArchetype =
        "REPLENISHMENT_LED";
      break;

    case "REFILL_CONSUMABLE":
      demandArchetype =
        "REPLENISHMENT_LED";
      break;

    case "REPLACEMENT":
      demandArchetype =
        "REPLENISHMENT_LED";
      break;

    case "REUSABLE_DURABLE":
      demandArchetype =
        "UTILITY_LED";
      break;

    case "UTILITY_DURABLE":
      demandArchetype =
        "UTILITY_LED";
      break;

    case "DURABLE":
      demandArchetype =
        "UTILITY_LED";
      break;
  }

  if (
    profile.consumable &&
    profile.strongUtilityProblem &&
    !profile.reusable &&
    !profile.replacement
  ) {
    demandArchetype =
      "HYBRID";
  }

  /*
   * Genuine recurring economics.
   */
  let repeatPurchaseScore =
    25;

  switch (
    profile.semanticClass
  ) {
    case "TRUE_CONSUMABLE":
      repeatPurchaseScore =
        95;
      break;

    case "REFILL_CONSUMABLE":
      repeatPurchaseScore =
        92;
      break;

    case "REPLACEMENT":
      repeatPurchaseScore =
        78;
      break;

    case "REUSABLE_DURABLE":
      repeatPurchaseScore =
        25;
      break;

    case "UTILITY_DURABLE":
      repeatPurchaseScore =
        35;
      break;

    case "DURABLE":
      repeatPurchaseScore =
        25;
      break;
  }

  const customerNeedScore =
    profile.consumable
      ? 88
      : profile.strongUtilityProblem
        ? 88
        : profile.utility
          ? 72
          : 55;

  let returnRiskScore =
    25;

  if (
    profile.sizeSensitive
  ) {
    returnRiskScore =
      75;
  }

  if (
    profile.fragile
  ) {
    returnRiskScore =
      Math.max(
        returnRiskScore,
        55,
      );
  }

  if (
    profile.liquid
  ) {
    returnRiskScore =
      Math.max(
        returnRiskScore,
        45,
      );
  }

  /*
   * Reusable bags and containers have low intrinsic return risk compared
   * with size-sensitive products.
   */
  if (
    profile.reusable
  ) {
    returnRiskScore =
      Math.min(
        returnRiskScore,
        30,
      );
  }

  let serviceRiskScore =
    15;

  if (
    profile.serviceHeavy
  ) {
    serviceRiskScore =
      78;
  }

  if (
    profile.fragile
  ) {
    serviceRiskScore =
      Math.max(
        serviceRiskScore,
        35,
      );
  }

  let operationalEaseScore =
    85;

  if (
    profile.serviceHeavy
  ) {
    operationalEaseScore =
      38;
  } else if (
    profile.fragile
  ) {
    operationalEaseScore =
      48;
  } else if (
    profile.liquid
  ) {
    operationalEaseScore =
      60;
  }

  if (
    profile.regulated
  ) {
    operationalEaseScore =
      5;
  }

  return {
    isProductCandidate:
      !profile.regulated,

    category:
      profile.semanticClass ===
        "TRUE_CONSUMABLE" ||
      profile.semanticClass ===
        "REFILL_CONSUMABLE"
        ? "Household / Replenishment"
        : profile.utility
          ? "Home Utility"
          : "Consumer Goods",

    demandArchetype,

    productType,

    repeatPurchaseScore,

    returnRiskScore,

    serviceRiskScore,

    operationalEaseScore,

    customerNeedScore,

    riskFlags:
      flags,

    rationale:
      "Deterministic semantic assessment based on explicit product identity signals.",

    confidence:
      clamp(
        confidence,
      ),

    aiProvider:
      "RULES",
  };
}

/*
 * --------------------------------------------------------------------------
 * SEMANTIC GUARDRAILS
 * --------------------------------------------------------------------------
 *
 * AI remains useful for:
 *   - nuanced customer need
 *   - evidence interpretation
 *   - risk details
 *   - confidence
 *   - rationale
 *
 * Deterministic NOVA semantics remain authoritative for:
 *   - consumable vs reusable
 *   - replacement vs durable
 *   - refill vs reusable
 *   - obvious recurring-purchase mechanism
 */
function applySemanticGuardrails(
  keyword: string,
  assessment:
    AnalystAssessment,
): AnalystAssessment {
  const profile =
    deriveSemanticProfile(
      keyword,
    );

  const deterministic =
    buildDeterministicAssessment(
      keyword,
      assessment.confidence,
    );

  const flags =
    [
      ...assessment.riskFlags,
    ];

  let productType =
    assessment.productType;

  let demandArchetype =
    assessment.demandArchetype;

  let repeatPurchaseScore =
    clamp(
      assessment.repeatPurchaseScore,
    );

  let corrected =
    false;

  /*
   * ------------------------------------------------------------------------
   * TRUE CONSUMABLE
   * ------------------------------------------------------------------------
   */
  if (
    profile.semanticClass ===
    "TRUE_CONSUMABLE"
  ) {
    if (
      productType !==
      "CONSUMABLE"
    ) {
      productType =
        "CONSUMABLE";

      corrected =
        true;
    }

    const expected =
      profile.strongUtilityProblem
        ? "HYBRID"
        : "REPLENISHMENT_LED";

    if (
      demandArchetype !==
      expected
    ) {
      demandArchetype =
        expected;

      corrected =
        true;
    }

    if (
      repeatPurchaseScore <
      70
    ) {
      repeatPurchaseScore =
        deterministic.repeatPurchaseScore;

      corrected =
        true;
    }

    if (
      !flags.includes(
        "semantic_guardrail_consumable",
      )
    ) {
      flags.push(
        "semantic_guardrail_consumable",
      );
    }
  }

  /*
   * ------------------------------------------------------------------------
   * REFILL CONSUMABLE
   * ------------------------------------------------------------------------
   */
  if (
    profile.semanticClass ===
    "REFILL_CONSUMABLE"
  ) {
    if (
      productType !==
        "CONSUMABLE" &&
      productType !==
        "REPLACEMENT"
    ) {
      productType =
        "CONSUMABLE";

      corrected =
        true;
    }

    if (
      demandArchetype !==
      "REPLENISHMENT_LED"
    ) {
      demandArchetype =
        "REPLENISHMENT_LED";

      corrected =
        true;
    }

    if (
      repeatPurchaseScore <
      70
    ) {
      repeatPurchaseScore =
        deterministic.repeatPurchaseScore;

      corrected =
        true;
    }

    if (
      !flags.includes(
        "semantic_guardrail_refill",
      )
    ) {
      flags.push(
        "semantic_guardrail_refill",
      );
    }
  }

  /*
   * ------------------------------------------------------------------------
   * REPLACEMENT
   * ------------------------------------------------------------------------
   */
  if (
    profile.semanticClass ===
    "REPLACEMENT"
  ) {
    if (
      productType !==
      "REPLACEMENT"
    ) {
      productType =
        "REPLACEMENT";

      corrected =
        true;
    }

    if (
      demandArchetype !==
      "REPLENISHMENT_LED"
    ) {
      demandArchetype =
        "REPLENISHMENT_LED";

      corrected =
        true;
    }

    if (
      repeatPurchaseScore <
      55
    ) {
      repeatPurchaseScore =
        deterministic.repeatPurchaseScore;

      corrected =
        true;
    }

    if (
      !flags.includes(
        "semantic_guardrail_replacement",
      )
    ) {
      flags.push(
        "semantic_guardrail_replacement",
      );
    }
  }

  /*
   * ------------------------------------------------------------------------
   * REUSABLE DURABLE
   * ------------------------------------------------------------------------
   *
   * The explicit word "reusable" overrides generic "bag", "container",
   * "storage", "sponge", etc. associations.
   */
  if (
    profile.semanticClass ===
    "REUSABLE_DURABLE"
  ) {
    if (
      productType ===
        "CONSUMABLE" ||
      productType ===
        "REPLACEMENT" ||
      productType ===
        "HYBRID"
    ) {
      productType =
        "DURABLE";

      corrected =
        true;
    }

    if (
      demandArchetype ===
      "REPLENISHMENT_LED"
    ) {
      demandArchetype =
        "UTILITY_LED";

      corrected =
        true;
    }

    /*
     * Reusable != replenishment.
     */
    if (
      repeatPurchaseScore >
      60
    ) {
      repeatPurchaseScore =
        25;

      corrected =
        true;
    }

    if (
      !flags.includes(
        "semantic_guardrail_reusable",
      )
    ) {
      flags.push(
        "semantic_guardrail_reusable",
      );
    }
  }

  /*
   * ------------------------------------------------------------------------
   * UTILITY DURABLE
   * ------------------------------------------------------------------------
   */
  if (
    profile.semanticClass ===
      "UTILITY_DURABLE" ||
    profile.semanticClass ===
      "DURABLE"
  ) {
    if (
      productType ===
        "CONSUMABLE" ||
      productType ===
        "REPLACEMENT" ||
      productType ===
        "HYBRID"
    ) {
      productType =
        "DURABLE";

      corrected =
        true;
    }

    if (
      demandArchetype ===
      "REPLENISHMENT_LED"
    ) {
      demandArchetype =
        "UTILITY_LED";

      corrected =
        true;
    }

    /*
     * Frequency of use must not be mistaken for purchase recurrence.
     */
    if (
      repeatPurchaseScore >
      65
    ) {
      repeatPurchaseScore =
        deterministic.repeatPurchaseScore;

      corrected =
        true;
    }

    if (
      !flags.includes(
        "semantic_guardrail_usage_not_repurchase",
      )
    ) {
      flags.push(
        "semantic_guardrail_usage_not_repurchase",
      );
    }
  }

  /*
   * ------------------------------------------------------------------------
   * HIGH-CONFIDENCE PRODUCT PATTERNS
   * ------------------------------------------------------------------------
   */

  const text =
    keyword.toLowerCase();

  /*
   * Washing-machine cleaning tablets/powder/sachets/liquid.
   */
  if (
    /\bwashing machine\b/.test(
      text,
    ) &&
    /(clean|cleaner|cleaning)/.test(
      text,
    ) &&
    /(tablet|tablets|powder|liquid|sachet|sachets|sheet|sheets|capsule|capsules)/.test(
      text,
    )
  ) {
    if (
      productType !==
      "CONSUMABLE"
    ) {
      productType =
        "CONSUMABLE";

      corrected =
        true;
    }

    if (
      demandArchetype !==
      "REPLENISHMENT_LED"
    ) {
      demandArchetype =
        "REPLENISHMENT_LED";

      corrected =
        true;
    }

    if (
      repeatPurchaseScore <
      85
    ) {
      repeatPurchaseScore =
        95;

      corrected =
        true;
    }

    if (
      !flags.includes(
        "semantic_guardrail_cleaning_consumable",
      )
    ) {
      flags.push(
        "semantic_guardrail_cleaning_consumable",
      );
    }
  }

  /*
   * Garbage/trash bags.
   */
  if (
    /(trash bag|trash bags|garbage bag|garbage bags|bin liner|bin liners|compostable trash bag|biodegradable trash bag)/.test(
      text,
    )
  ) {
    if (
      productType !==
      "CONSUMABLE"
    ) {
      productType =
        "CONSUMABLE";

      corrected =
        true;
    }

    if (
      demandArchetype !==
      "REPLENISHMENT_LED"
    ) {
      demandArchetype =
        "REPLENISHMENT_LED";

      corrected =
        true;
    }

    if (
      repeatPurchaseScore <
      85
    ) {
      repeatPurchaseScore =
        95;

      corrected =
        true;
    }

    if (
      !flags.includes(
        "semantic_guardrail_bag_consumable",
      )
    ) {
      flags.push(
        "semantic_guardrail_bag_consumable",
      );
    }
  }

  /*
   * Paper/tissue consumables.
   *
   * Holders/dispenser/stands are explicitly excluded because those are
   * durable hardware.
   */
  if (
    /(toilet paper|tissue|paper towel|paper towels|kitchen towel|napkin|napkins)/.test(
      text,
    ) &&
    !/(holder|dispenser|stand)/.test(
      text,
    )
  ) {
    if (
      productType !==
      "CONSUMABLE"
    ) {
      productType =
        "CONSUMABLE";

      corrected =
        true;
    }

    if (
      demandArchetype !==
      "REPLENISHMENT_LED"
    ) {
      demandArchetype =
        "REPLENISHMENT_LED";

      corrected =
        true;
    }

    if (
      repeatPurchaseScore <
      80
    ) {
      repeatPurchaseScore =
        95;

      corrected =
        true;
    }
  }

  /*
   * Mop cloth refill/replacement pads:
   *
   * replacement mechanism > generic "cloth" or "cleaning" keyword.
   */
  if (
    /(mop|mopping)/.test(
      text,
    ) &&
    /(refill|replacement|replaceable|pad|pads|cloth)/.test(
      text,
    )
  ) {
    if (
      productType !==
      "REPLACEMENT"
    ) {
      productType =
        "REPLACEMENT";

      corrected =
        true;
    }

    if (
      demandArchetype !==
      "REPLENISHMENT_LED"
    ) {
      demandArchetype =
        "REPLENISHMENT_LED";

      corrected =
        true;
    }

    if (
      repeatPurchaseScore <
      60
    ) {
      repeatPurchaseScore =
        78;

      corrected =
        true;
    }

    if (
      !flags.includes(
        "semantic_guardrail_mop_replacement",
      )
    ) {
      flags.push(
        "semantic_guardrail_mop_replacement",
      );
    }
  }

  /*
   * Reusable silicone food-storage products.
   */
  if (
    /(reusable|washable|silicone)/.test(
      text,
    ) &&
    /(food storage|food bag|storage bag|storage pouch)/.test(
      text,
    )
  ) {
    if (
      productType !==
      "DURABLE"
    ) {
      productType =
        "DURABLE";

      corrected =
        true;
    }

    if (
      demandArchetype !==
      "UTILITY_LED"
    ) {
      demandArchetype =
        "UTILITY_LED";

      corrected =
        true;
    }

    if (
      repeatPurchaseScore >
      50
    ) {
      repeatPurchaseScore =
        25;

      corrected =
        true;
    }

    if (
      !flags.includes(
        "semantic_guardrail_reusable_storage",
      )
    ) {
      flags.push(
        "semantic_guardrail_reusable_storage",
      );
    }
  }

  /*
   * If the deterministic semantic engine changed the model's classification,
   * record the correction explicitly rather than silently hiding it.
   */
  if (
    corrected
  ) {
    if (
      !flags.includes(
        "semantic_guardrail_applied",
      )
    ) {
      flags.push(
        "semantic_guardrail_applied",
      );
    }
  }

  return {
    ...assessment,

    demandArchetype,

    productType,

    repeatPurchaseScore:
      clamp(
        repeatPurchaseScore,
      ),

    riskFlags:
      [
        ...new Set(
          flags,
        ),
      ],

    rationale:
      corrected
        ? `${assessment.rationale} NOVA deterministic semantic guardrails corrected product classification where the model output conflicted with explicit product-identity signals.`
        : assessment.rationale,
  };
}

/*
 * --------------------------------------------------------------------------
 * AI JSON PARSER
 * --------------------------------------------------------------------------
 */

function parseAnalystJson(
  text: string,
  provider:
    NovaAiResponse["provider"],
):
  AnalystAssessment | null {
  try {
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

    const firstBrace =
      cleaned.indexOf(
        "{",
      );

    const lastBrace =
      cleaned.lastIndexOf(
        "}",
      );

    if (
      firstBrace <
        0 ||
      lastBrace <=
        firstBrace
    ) {
      return null;
    }

    const parsed =
      JSON.parse(
        cleaned.slice(
          firstBrace,
          lastBrace +
            1,
        ),
      ) as Record<
        string,
        unknown
      >;

    const rawArchetype =
      String(
        parsed.demandArchetype ||
          "HYBRID",
      ).toUpperCase();

    const demandArchetype:
      DemandArchetype =
      rawArchetype ===
      "TREND_LED"
        ? "TREND_LED"
        : rawArchetype ===
            "UTILITY_LED"
          ? "UTILITY_LED"
          : rawArchetype ===
              "REPLENISHMENT_LED"
            ? "REPLENISHMENT_LED"
            : "HYBRID";

    const rawProductType =
      String(
        parsed.productType ||
          "UTILITY",
      ).toUpperCase();

    const productType:
      ProductType =
      rawProductType ===
      "CONSUMABLE"
        ? "CONSUMABLE"
        : rawProductType ===
            "REPLACEMENT"
          ? "REPLACEMENT"
          : rawProductType ===
              "DURABLE"
            ? "DURABLE"
            : rawProductType ===
                "HYBRID"
              ? "HYBRID"
              : "UTILITY";

    const flags =
      Array.isArray(
        parsed.riskFlags,
      )
        ? parsed.riskFlags
            .map(
              String,
            )
            .slice(
              0,
              12,
            )
        : [];

    return {
      isProductCandidate:
        parsed.isProductCandidate !==
        false,

      category:
        String(
          parsed.category ||
            "Consumer Goods",
        ),

      demandArchetype,

      productType,

      repeatPurchaseScore:
        clamp(
          parsed.repeatPurchaseScore,
        ),

      returnRiskScore:
        clamp(
          parsed.returnRiskScore,
        ),

      serviceRiskScore:
        clamp(
          parsed.serviceRiskScore,
        ),

      operationalEaseScore:
        clamp(
          parsed.operationalEaseScore,
        ),

      customerNeedScore:
        clamp(
          parsed.customerNeedScore,
        ),

      riskFlags:
        flags,

      rationale:
        String(
          parsed.rationale ||
            "Evidence-grounded analyst assessment.",
        ),

      confidence:
        clamp(
          parsed.confidence,
        ),

      aiProvider:
        provider,
    };
  } catch {
    return null;
  }
}

/*
 * --------------------------------------------------------------------------
 * AI ANALYST
 * --------------------------------------------------------------------------
 */

export async function assessCandidate(
  params: {
    keyword:
      string;

    marketEvidence:
      unknown;

    competitionEvidence:
      unknown;

    supplierEvidence:
      unknown;
  },
): Promise<
  AnalystAssessment
> {
  /*
   * Deterministic-only mode.
   *
   * Used for candidates outside the scarce AI budget.
   */
  if (
    (
      process.env
        .NOVA_AI_PROVIDER ||
      ""
    )
      .trim()
      .toLowerCase() ===
    "rules"
  ) {
    return buildDeterministicAssessment(
      params.keyword,
    );
  }

  const system = `
You are NOVA, NovaCart's evidence-driven ecommerce market analyst for India.

You are an analyst, NOT the final decision-maker.
The deterministic NOVA engine performs commercial sanity checks,
scoring, portfolio decisions and publishing gates.

Use ONLY supplied evidence.
Missing information is UNKNOWN.

Never invent:
- sales volume
- search volume
- market share
- supplier facts
- margins
- customer counts
- review counts
- return rates
- repeat-purchase intervals
- competition counts

============================================================
PRODUCT ONTOLOGY
============================================================

CONSUMABLE

The product itself is physically depleted, consumed, discarded or used up.

Examples:
- detergent
- cleaning tablets
- cleaning powder
- cleaning liquid
- stain remover
- garbage bags
- toilet cleaner
- wipes
- tissue
- paper towels
- disposable sponges
- refill consumables

REPLACEMENT

A component/product is purchased because an existing component wears out
and needs replacement.

Examples:
- replacement mop pad
- replacement brush head
- replacement filter
- replacement lint roller refill
- replacement cleaning head

DURABLE

The product is repeatedly used but is not itself normally consumed.

Examples:
- storage container
- storage organizer
- rack
- shelf
- holder
- brush
- squeegee
- caddy
- reusable silicone storage bag
- reusable food storage pouch
- reusable kitchen product

UTILITY

Use when a practical product is neither meaningfully consumable nor a
clear durable category in the supplied evidence.

HYBRID

Use only when two product mechanisms are genuinely material.

============================================================
CRITICAL RULES
============================================================

Repeated USE is NOT repeated PURCHASE.

A product being used every day does not make it a consumable.

Examples:

- Grout brush → usually DURABLE/UTILITY.
- Toilet brush → DURABLE/UTILITY.
- Cabinet organizer → DURABLE/UTILITY.
- Storage container → DURABLE.
- Reusable silicone food storage bag → DURABLE.
- Reusable food-storage pouch → DURABLE.
- Washing-machine cleaning tablets → CONSUMABLE.
- Garbage bags → CONSUMABLE.
- Cleaning wipes → CONSUMABLE.
- Mop replacement pad → REPLACEMENT.
- Replacement filter → REPLACEMENT.
- Refill cleaning liquid → CONSUMABLE.
- Refill cartridge → CONSUMABLE or REPLACEMENT depending on exactly what
  is replaced.

VERY IMPORTANT:

The words "bag", "container", "storage", "cleaning", "brush", "organizer",
"rack" and "refill" must NOT automatically determine the product type.

Consider the full product phrase.

"Reusable silicone food storage bag"
→ DURABLE

"Biodegradable trash bag roll"
→ CONSUMABLE

"Microfiber mop refill pad"
→ REPLACEMENT

"Air freshener refill gel"
→ CONSUMABLE

"Replacement air-purifier filter"
→ REPLACEMENT

============================================================
DEMAND ARCHETYPES
============================================================

TREND_LED
Current/rising momentum is the primary opportunity mechanism.

UTILITY_LED
Stable practical need is the primary opportunity mechanism.

REPLENISHMENT_LED
Genuine recurring consumption or predictable replacement is the primary
commercial mechanism.

HYBRID
Two material mechanisms genuinely coexist.

============================================================
BUSINESS PRIORITIES
============================================================

1. Strong customer need.
2. Genuine repeat/replenishment when economically real.
3. Healthy contribution economics.
4. Comparatively lower competition.
5. Low return/RTO risk.
6. Low after-sales/service burden.
7. Simple fulfilment.
8. Low breakage.
9. Low technical complexity.
10. Stable utility demand remains valuable without viral momentum.

============================================================
SCORING SEMANTICS
============================================================

returnRiskScore: HIGHER = WORSE
serviceRiskScore: HIGHER = WORSE
operationalEaseScore: HIGHER = BETTER
repeatPurchaseScore: HIGHER = BETTER
customerNeedScore: HIGHER = BETTER
confidence: HIGHER = stronger evidence

Do not promote a weak product merely because it sounds attractive.

Do not infer a repeat purchase cycle simply because something eventually
wears out.

============================================================
ECONOMIC DISCIPLINE
============================================================

Distinguish observed market prices from theoretical selling prices.

When supplier and market units appear mismatched, flag uncertainty.

Do not invent:
- pack sizes
- shipping costs
- taxes
- landed costs
- market demand
- return rates
- repeat intervals
- supplier facts

============================================================
OUTPUT
============================================================

Return ONLY valid JSON:

{
  "isProductCandidate": true,
  "category": "string",
  "demandArchetype": "TREND_LED|UTILITY_LED|REPLENISHMENT_LED|HYBRID",
  "productType": "CONSUMABLE|REPLACEMENT|DURABLE|UTILITY|HYBRID",
  "repeatPurchaseScore": 0,
  "returnRiskScore": 0,
  "serviceRiskScore": 0,
  "operationalEaseScore": 0,
  "customerNeedScore": 0,
  "riskFlags": [],
  "rationale": "brief evidence-grounded explanation",
  "confidence": 0
}
`;

  const user = `
CANDIDATE:
${params.keyword}

MARKET EVIDENCE:
${JSON.stringify(
  params.marketEvidence,
)}

COMPETITION EVIDENCE:
${JSON.stringify(
  params.competitionEvidence,
)}

SUPPLIER EVIDENCE:
${JSON.stringify(
  params.supplierEvidence,
)}
`;

  const ai =
    await callNovaAI(
      {
        system,

        user,

        temperature:
          0,

        maxTokens:
          1400,
      },
    );

  /*
   * No usable provider response:
   * deterministic assessment becomes authoritative.
   */
  if (!ai) {
    return buildDeterministicAssessment(
      params.keyword,
    );
  }

  const parsed =
    parseAnalystJson(
      ai.text,
      ai.provider,
    );

  if (!parsed) {
    return buildDeterministicAssessment(
      params.keyword,
    );
  }

  /*
   * AI supplies nuanced interpretation.
   *
   * NOVA semantic guardrails remain authoritative over obvious product
   * identity and genuine replenishment mechanics.
   */
  return applySemanticGuardrails(
    params.keyword,
    parsed,
  );
}