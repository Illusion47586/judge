import assert from "node:assert/strict";
import test from "node:test";

import { ConfigurationError } from "../../src/core/index.ts";
import {
  defineGateway,
  type GatewayCapabilities,
  type GatewayEvaluationRequest,
} from "../../src/gateway/custom.ts";

const capabilities: GatewayCapabilities = {
  batching: true,
  boolean: true,
  choice: true,
  customHeaders: true,
  jev: true,
  score: true,
};

test("defineGateway snapshots a valid custom transport", async () => {
  const request: GatewayEvaluationRequest = {
    model: "internal/jev",
    questions: {
      decision: { instructions: "Proceed?", type: "noul" },
    },
    state: { ticket: 1 },
  };
  const definition = {
    capabilities: { ...capabilities },
    evaluate: (input: GatewayEvaluationRequest) =>
      Promise.resolve({ body: input }),
    id: "internal",
    model: "internal/jev",
  };
  const plugin = defineGateway(definition);

  definition.capabilities.boolean = false;
  definition.id = "changed";
  definition.model = "changed";

  assert.equal(plugin.id, "internal");
  assert.equal(plugin.model, "internal/jev");
  assert.equal(plugin.capabilities.boolean, true);
  assert.equal((await plugin.evaluate(request)).body, request);
  assert.equal(Object.isFrozen(plugin), true);
  assert.equal(Object.isFrozen(plugin.capabilities), true);
});

for (const [name, definition] of [
  ["empty id", { id: "", model: "internal/jev" }],
  ["untrimmed id", { id: " internal", model: "internal/jev" }],
  ["empty model", { id: "internal", model: "" }],
  ["untrimmed model", { id: "internal", model: "internal/jev " }],
] as const) {
  test(`defineGateway rejects ${name}`, () => {
    assert.throws(
      () =>
        defineGateway({
          capabilities,
          evaluate: () => Promise.resolve({ body: {} }),
          ...definition,
        }),
      ConfigurationError
    );
  });
}

test("defineGateway rejects incomplete and non-boolean capabilities", () => {
  for (const invalid of [
    { ...capabilities, score: "yes" },
    { batching: true },
    null,
  ]) {
    assert.throws(
      () =>
        defineGateway({
          capabilities: invalid as never,
          evaluate: () => Promise.resolve({ body: {} }),
          id: "internal",
          model: "internal/jev",
        }),
      ConfigurationError
    );
  }
});

test("defineGateway rejects a non-function evaluator", () => {
  assert.throws(
    () =>
      defineGateway({
        capabilities,
        evaluate: "invalid" as never,
        id: "internal",
        model: "internal/jev",
      }),
    ConfigurationError
  );
});
