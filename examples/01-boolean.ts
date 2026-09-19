import { judge, printResult } from "./_shared.ts";

const decision = await judge.boolean({
  condition: "Does this refund request require manual review?",
  context: {
    accountAgeDays: 12,
    amountUsd: 480,
    priorRefunds: 3,
    reason: "Item arrived damaged",
  },
});

printResult("Boolean decision", decision);
