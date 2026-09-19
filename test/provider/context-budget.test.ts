import assert from "node:assert/strict";
import test from "node:test";

import { ConfigurationError } from "../../src/core/index.ts";
import type { GatewayEvaluationRequest } from "../../src/gateway/types.ts";
import {
  estimateRequestTokens,
  normalizeContextBudget,
  warnForContextBudget,
} from "../../src/provider/jev/context-budget.ts";

const request: GatewayEvaluationRequest = {
  model: "typesafe-ai/jev",
  questions: {
    decision: { instructions: "Proceed?", type: "noul" },
  },
  state: { message: "hello" },
};

test("estimates the complete UTF-8 request", () => {
  const expected = Math.ceil(
    new TextEncoder().encode(JSON.stringify(request)).byteLength / 4
  );
  assert.equal(estimateRequestTokens(request), expected);
  assert.ok(
    estimateRequestTokens({ ...request, state: { message: "你好" } }) > 0
  );
});

test("warns once at the threshold and awaits the callback", async () => {
  const events: string[] = [];
  const estimatedTokens = estimateRequestTokens(request);
  const budget = normalizeContextBudget({
    maxTokens: estimatedTokens * 2,
    onWarning: async (warning) => {
      events.push("warning");
      await Promise.resolve();
      assert.deepEqual(warning, {
        code: "context_window_approaching",
        estimatedTokens,
        maxTokens: estimatedTokens * 2,
        model: request.model,
        ratio: 0.5,
        warnAt: 0.5,
      });
      events.push("complete");
    },
    warnAt: 0.5,
  });
  await warnForContextBudget(request, budget);
  events.push("returned");
  assert.deepEqual(events, ["warning", "complete", "returned"]);
});

test("does not warn below the default threshold or without a policy", async () => {
  let calls = 0;
  const budget = normalizeContextBudget({
    maxTokens: estimateRequestTokens(request) * 2,
    onWarning: () => {
      calls += 1;
    },
  });
  await warnForContextBudget(request, budget);
  await warnForContextBudget(request, undefined);
  assert.equal(calls, 0);
});

test("validates policy construction", () => {
  const onWarning = () => undefined;
  for (const value of [
    { maxTokens: 0, onWarning },
    { maxTokens: 1.5, onWarning },
    { maxTokens: 100, onWarning, warnAt: 0 },
    { maxTokens: 100, onWarning, warnAt: 1.1 },
    { maxTokens: 100, onWarning: "log" },
  ]) {
    assert.throws(
      () => normalizeContextBudget(value as never),
      ConfigurationError
    );
  }
});
