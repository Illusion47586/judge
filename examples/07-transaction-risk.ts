import { judge, printResult } from "./_shared.ts";

const risk = await judge.score({
  context: {
    accountAgeDays: 4,
    amountUsd: 1250,
    billingCountry: "US",
    deviceCountry: "DE",
    failedAttemptsLastHour: 3,
  },
  levels: ["low", "guarded", "high", "critical"],
  question: "What is the fraud risk of this transaction?",
});

const actionForScore = (score: number): "allow" | "block" | "manual-review" => {
  if (score >= 2.5) {
    return "block";
  }
  if (score >= 1.5) {
    return "manual-review";
  }
  return "allow";
};

printResult("Transaction risk", { action: actionForScore(risk.score), risk });
