import { judge, printResult } from "./_shared.ts";

const routing = await judge.switch({
  cases: {
    browser: ({ decision }) => ({
      confidence: decision.confidence,
      tool: "browser" as const,
    }),
    code: ({ decision }) => ({
      confidence: decision.confidence,
      tool: "code" as const,
    }),
    human_review: ({ decision }) => ({
      confidence: decision.confidence,
      tool: "human-review" as const,
    }),
    research: ({ decision }) => ({
      confidence: decision.confidence,
      tool: "research" as const,
    }),
  },
  confidence: {
    minimum: 0.8,
    uncertain: ({ decision }) => ({
      confidence: decision.confidence,
      tool: "human-review" as const,
    }),
  },
  context: {
    request:
      "Compare the current pricing and limits of three hosted databases.",
    requiresCurrentInformation: true,
    requiresRepositoryChanges: false,
  },
  question: "Which application-declared tool should handle this request?",
});

printResult("Agent tool routing", routing);
