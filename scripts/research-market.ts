// FILE: F:\projects\novacart\scripts\research-market.ts

import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

/*
 * Load project environment BEFORE dynamically importing NOVA.
 */
const projectRoot =
  process.cwd();

const envLocalPath =
  path.join(
    projectRoot,
    ".env.local",
  );

const envPath =
  path.join(
    projectRoot,
    ".env",
  );

dotenv.config({
  path: envLocalPath,
});

dotenv.config({
  path: envPath,
});

console.log(
  "NOVA SCRIPT: environment loaded",
);

console.log(
  `NOVA SCRIPT: provider=${
    process.env.NOVA_AI_PROVIDER ||
    "openrouter"
  }`,
);

console.log(
  `NOVA SCRIPT: openrouter=${
    Boolean(
      process.env.OPENROUTER_API_KEY,
    )
  }`,
);

console.log(
  `NOVA SCRIPT: tavily=${
    Boolean(
      process.env.TAVILY_API_KEY,
    )
  }`,
);

console.log(
  `NOVA SCRIPT: cj=${
    Boolean(
      process.env.CJ_API_KEY,
    )
  }`,
);

async function main() {
  console.log(
    "NOVA SCRIPT: starting main()",
  );

  /*
   * Import ONLY after dotenv has loaded.
   */
  console.log(
    "NOVA SCRIPT: importing nova-market-engine...",
  );

  const {
    runMarketResearch,
    publishQualifiedCandidate,
  } =
    await import(
      "../src/lib/services/nova-market-engine"
    );

  console.log(
    "NOVA SCRIPT: nova-market-engine imported",
  );

  const seedsPath =
    path.join(
      projectRoot,
      "data",
      "research-seeds.json",
    );

  console.log(
    `NOVA SCRIPT: reading seeds from ${seedsPath}`,
  );

  if (
    !fs.existsSync(
      seedsPath,
    )
  ) {
    throw new Error(
      `Research seed file not found: ${seedsPath}`,
    );
  }

  const rawSeeds =
    fs.readFileSync(
      seedsPath,
      "utf8",
    );

  const parsed =
    JSON.parse(
      rawSeeds,
    ) as {
      seeds?: unknown;
    };

  const seeds =
    Array.isArray(
      parsed.seeds,
    )
      ? parsed.seeds
          .map(
            String,
          )
          .map(
            (value) =>
              value.trim(),
          )
          .filter(
            Boolean,
          )
      : [];

  if (
    seeds.length ===
    0
  ) {
    throw new Error(
      "No research seeds found in data/research-seeds.json",
    );
  }

  const limitArgument =
    process.argv.find(
      (
        argument,
      ) =>
        argument.startsWith(
          "--limit=",
        ),
    );

  const parsedLimit =
    limitArgument
      ? Number(
          limitArgument
            .split(
              "=",
            )[1],
        )
      : Number(
          process.env
            .NOVA_MAX_CANDIDATES ||
            20,
        );

  const limit =
    Number.isFinite(
      parsedLimit,
    )
      ? Math.max(
          1,
          Math.floor(
            parsedLimit,
          ),
        )
      : 20;

  const publish =
    process.argv.includes(
      "--publish",
    );

  console.log(
    `\nNOVA MARKET RESEARCH — ${
      process.env
        .NOVA_MARKET_REGION ||
      "IN"
    } — ${limit} candidates — ${
      publish
        ? "PUBLISH"
        : "DRY RUN"
    }`,
  );

  console.log(
    `NOVA SCRIPT: calling runMarketResearch(limit=${limit})`,
  );

  const result =
    await runMarketResearch({
      seeds,
      limit,
    });

  console.log(
    "NOVA SCRIPT: runMarketResearch() completed",
  );

  console.log(
    "\nTOP OPPORTUNITIES\n-----------------",
  );

  for (
    const [
      index,
      candidate,
    ] of result.candidates
      .slice(
        0,
        15,
      )
      .entries()
  ) {
    console.log(
      `${
        index + 1
      }. ${candidate.keyword} | ${
        candidate.decision
      } | ${
        candidate.finalScore
      }/100 | confidence ${
        candidate.confidence
      }% | demand ${
        candidate.demandScore
      } | competition ${
        candidate.competitionScore ??
        "UNKNOWN"
      } | margin ${
        candidate.expectedMarginPercent ??
        "UNKNOWN"
      }% | repeat ${
        candidate.repeatPurchaseScore
      } | return risk ${
        candidate.returnRiskScore
      } | ${
        candidate.demandArchetype
      } | ${
        candidate.productType
      } | commercial ${
        candidate.commercialSanity
      }`,
    );

    console.log(
      `   ${candidate.reason}`,
    );
  }

  if (
    result.portfolio
  ) {
    console.log(
      "\nNOVA PORTFOLIO\n--------------",
    );

    console.log(
      `Confidence: ${result.portfolio.confidence}%`,
    );

    console.log(
      `Selected: ${
        result.portfolio
          .selectedKeywords
          .join(
            " | ",
          ) || "NONE"
      }`,
    );

    for (
      const item of
        result.portfolio
          .ranking
    ) {
      console.log(
        `${item.priority}. ${item.keyword} — ${item.portfolioRole}`,
      );

      console.log(
        `   Why: ${item.whyNow}`,
      );

      console.log(
        `   Risk: ${item.mainRisk}`,
      );
    }

    console.log(
      result.portfolio
        .portfolioRationale,
    );
  } else {
    console.log(
      "\nNOVA PORTFOLIO\n--------------",
    );

    console.log(
      "NO QUALIFIED PORTFOLIO",
    );

    console.log(
      "NOVA did not find enough commercially validated evidence to recommend a portfolio.",
    );
  }

  if (
    publish
  ) {
    console.log(
      "\nPUBLISH PHASE\n-------------",
    );

    const publishLimit =
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

    const publishable =
      result.candidates
        .filter(
          (
            candidate,
          ) =>
            candidate.decision ===
            "PUBLISH",
        )
        .sort(
          (
            a,
            b,
          ) =>
            b.finalScore -
            a.finalScore,
        )
        .slice(
          0,
          publishLimit,
        );

    if (
      publishable.length ===
      0
    ) {
      console.log(
        "No candidates passed the final publish gate.",
      );
    }

    for (
      const candidate of
        publishable
    ) {
      try {
        const publishResult =
          await publishQualifiedCandidate(
            candidate,
          );

        if (
          publishResult.created
        ) {
          console.log(
            `✅ Published: ${publishResult.productTitle}`,
          );
        } else {
          console.log(
            `⏭️ Not published: ${candidate.keyword} — ${publishResult.reason}`,
          );
        }
      } catch (
        error
      ) {
        console.error(
          `❌ Publish failed for ${candidate.keyword}: ${
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
  }

  console.log(
    `\nRun ${result.runId} saved.`,
  );
}

main().catch(
  (
    error,
  ) => {
    console.error(
      "\nNOVA SCRIPT: FATAL ERROR",
    );

    console.error(
      error instanceof
      Error
        ? error.stack ||
            error.message
        : String(error),
    );

    process.exit(
      1,
    );
  },
);