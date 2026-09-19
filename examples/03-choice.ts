import { judge, printResult } from "./_shared.ts";

const decision = await judge.choice({
  context: {
    subject: "Cannot update the card used for my subscription",
    text: "The billing page rejects my new company card.",
  },
  options: ["billing", "technical", "account", "general"],
  question: "Which team should handle this support request?",
});

printResult("Choice decision", decision);
