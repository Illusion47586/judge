import assert from "node:assert/strict";
import test from "node:test";

import { defineGateway } from "../src/gateway/custom.ts";
import { createJudge } from "../src/index.ts";

test("the Judge TypeScript entry point loads in Node", async () => {
  const judge = await import("../src/index.ts");

  assert.equal(typeof judge.createJudge, "function");
  assert.equal(typeof judge.ConfigurationError, "function");
});

test("root Judge forwards context budgets", async () => {
  const events: string[] = [];
  const gateway = defineGateway({
    capabilities: {
      batching: false,
      boolean: true,
      choice: true,
      customHeaders: false,
      jev: true,
      score: true,
    },
    evaluate: () => {
      events.push("transport");
      return Promise.resolve({
        body: { answers: { decision: { noul: 0.9, type: "noul" } } },
      });
    },
    id: "test",
    model: "typesafe-ai/jev",
  });
  const judge = createJudge({
    contextBudget: {
      maxTokens: 1,
      onWarning: () => {
        events.push("warning");
      },
    },
    gateway,
  });

  await judge.boolean({ condition: "Proceed?", context: {} });
  assert.deepEqual(events, ["warning", "transport"]);
});
