import { judge, printResult } from "./_shared.ts";

const routing = await judge.switch({
  cases: {
    account: ({ decision }) => ({
      confidence: decision.confidence,
      queue: "account" as const,
    }),
    billing: ({ decision }) => ({
      confidence: decision.confidence,
      queue: "billing" as const,
    }),
    general: ({ decision }) => ({
      confidence: decision.confidence,
      queue: "general" as const,
    }),
    technical: ({ decision }) => ({
      confidence: decision.confidence,
      queue: "technical" as const,
    }),
  },
  confidence: {
    minimum: 0.75,
    uncertain: ({ decision }) => ({
      confidence: decision.confidence,
      queue: "human-review" as const,
    }),
  },
  context: {
    customerTier: "business",
    message: "Our SSO users are redirected back to the login screen.",
    subject: "Team cannot sign in",
  },
  question: "Which support queue should own this ticket?",
});

printResult("Support triage", routing);
