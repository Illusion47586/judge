import { judge, printResult } from "./_shared.ts";

const result = await judge.switch({
  cases: {
    approve: ({ decision }) => ({
      action: "approve" as const,
      confidence: decision.confidence,
    }),
    deny: ({ decision }) => ({
      action: "deny" as const,
      confidence: decision.confidence,
    }),
    review: ({ decision }) => ({
      action: "review" as const,
      confidence: decision.confidence,
    }),
  },
  context: {
    amountUsd: 850,
    countryMismatch: true,
    customerHistory: "Two years with no disputes",
  },
  question: "What action should be taken on this transaction?",
});

printResult("Switch result", result);
