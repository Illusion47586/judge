import assert from "node:assert/strict";
import test from "node:test";
import { ConfigurationError } from "../src/core/index.ts";
import { defineGateway } from "../src/gateway/custom.ts";
import { createJudge } from "../src/index.ts";

test("root createJudge accepts direct API-key configuration", () => {
  const judge = createJudge({ apiKey: "secret" });
  assert.equal(typeof judge.if, "function");
  assert.equal(typeof judge.switch, "function");
  assert.equal(typeof judge.score, "function");
});

test("root createJudge uses an explicit gateway and preserves exact types", async () => {
  const gateway = defineGateway({
    capabilities: {
      batching: false,
      boolean: true,
      choice: true,
      customHeaders: false,
      jev: true,
      score: true,
    },
    evaluate: () =>
      Promise.resolve({
        body: {
          answers: {
            decision: {
              choice: "billing",
              confidence: 1,
              probabilities: { billing: 1, support: 0 },
              type: "choice",
            },
          },
        },
      }),
    id: "custom",
    model: "jev",
  });
  const decision = await createJudge({ gateway }).choice({
    context: {},
    options: ["billing", "support"] as const,
    question: "Route?",
  });
  const exact: "billing" | "support" = decision.value;
  assert.equal(exact, "billing");
});

test("root createJudge rejects both or neither transport", () => {
  const gateway = defineGateway({
    capabilities: {
      batching: false,
      boolean: true,
      choice: true,
      customHeaders: false,
      jev: true,
      score: true,
    },
    evaluate: () => Promise.resolve({ body: {} }),
    id: "custom",
    model: "jev",
  });
  assert.throws(() => createJudge({} as never), ConfigurationError);
  assert.throws(
    () => createJudge({ apiKey: "secret", gateway } as never),
    ConfigurationError
  );
  assert.throws(
    () => createJudge({ apiKey: 42, gateway } as never),
    ConfigurationError
  );
});
