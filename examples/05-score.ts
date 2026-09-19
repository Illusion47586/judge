import { judge, printResult } from "./_shared.ts";

const decision = await judge.score({
  context: {
    affectedCustomers: 2400,
    durationMinutes: 18,
    symptoms: ["Elevated API latency", "Intermittent checkout failures"],
  },
  levels: ["low", "moderate", "high", "critical"],
  question: "How severe is this production incident?",
});

printResult("Score decision", decision);
