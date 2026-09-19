import { judge, printResult } from "./_shared.ts";

const escalation = await judge.if({
  condition: "Does this incident require immediate on-call escalation?",
  confidence: {
    minimum: 0.85,
    uncertain: ({ decision }) => ({
      action: "incident-commander-review" as const,
      confidence: decision.confidence,
    }),
  },
  context: {
    affectedRegions: ["iad", "fra"],
    customerImpact: "Checkout requests fail intermittently",
    errorRatePercent: 18,
    startedMinutesAgo: 11,
  },
  else: ({ decision }) => ({
    action: "continue-investigation" as const,
    confidence: decision.confidence,
  }),
  then: ({ decision }) => ({
    action: "page-on-call" as const,
    confidence: decision.confidence,
  }),
});

printResult("Incident escalation", escalation);
