import { judge, printResult } from "./_shared.ts";

const result = await judge.if({
  condition: "Should this customer request be escalated immediately?",
  confidence: {
    minimum: 0.8,
    uncertain: ({ decision }) => ({
      action: "manual-review" as const,
      confidence: decision.confidence,
    }),
  },
  context: {
    customerTier: "enterprise",
    message: "Production checkout has been unavailable for twenty minutes.",
    openIncidents: 1,
  },
  else: ({ decision }) => ({
    action: "standard-queue" as const,
    confidence: decision.confidence,
  }),
  then: ({ decision }) => ({
    action: "page-on-call" as const,
    confidence: decision.confidence,
  }),
});

printResult("If result", result);
