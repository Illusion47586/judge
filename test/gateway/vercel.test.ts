import assert from "node:assert/strict";
import test from "node:test";

import { ConfigurationError, ProviderError } from "../../src/core/index.ts";
import { vercelGateway } from "../../src/gateway/vercel.ts";

test("Vercel maps native AI SDK evaluation without chat emulation", async () => {
  let captured: unknown;
  const gateway = vercelGateway({
    apiKey: "secret",
    evaluate: (input: unknown) => {
      captured = input;
      return Promise.resolve({
        answers: {
          approve: { probability: 0.8, type: "boolean" },
          route: {
            choice: "billing",
            probabilities: { billing: 0.7, support: 0.3 },
            type: "choice",
          },
        },
        providerMetadata: { gateway: { routing: "primary" } },
        response: { id: "req_1", modelId: "typesafe-ai/jev-1.13" },
        usage: { inputTokens: 10, outputTokens: 2 },
      });
    },
    modelFactory: (model: string) => `model:${model}`,
  } as never);

  const result = await gateway.evaluate({
    model: "typesafe-ai/jev",
    questions: {
      approve: { instructions: "Approve?", type: "noul" },
      route: {
        criteria: { billing: "billing", support: "support" },
        instructions: "Route?",
        type: "choice",
      },
    },
    state: { id: 1 },
  });

  assert.deepEqual(captured, {
    maxRetries: 0,
    model: "model:typesafe-ai/jev",
    questions: {
      approve: { instructions: "Approve?", type: "boolean" },
      route: {
        criteria: { billing: "billing", support: "support" },
        instructions: "Route?",
        type: "choice",
      },
    },
    state: { id: 1 },
  });
  assert.deepEqual(result.body, {
    answers: {
      approve: { noul: 0.8, type: "noul" },
      route: {
        choice: "billing",
        confidence: 0.7,
        probabilities: { billing: 0.7, support: 0.3 },
        type: "choice",
      },
    },
  });
  assert.equal(result.metadata?.requestId, "req_1");
});

test("Vercel validates configuration and normalizes SDK failures", async () => {
  assert.throws(() => vercelGateway({ apiKey: "" }), ConfigurationError);
  const gateway = vercelGateway({
    apiKey: "secret",
    evaluate: () => Promise.reject({ statusCode: 429 }),
    modelFactory: () => ({}),
  } as never);
  await assert.rejects(
    gateway.evaluate({ model: "m", questions: {}, state: {} }),
    (error) => error instanceof ProviderError && error.code === "rate_limit"
  );
});
