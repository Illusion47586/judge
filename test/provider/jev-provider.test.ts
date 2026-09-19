import assert from "node:assert/strict";
import test from "node:test";

import {
  AbortError,
  ConfigurationError,
  ProviderContractError,
  ProviderError,
  SerializationError,
} from "../../src/core/index.ts";
import { defineGateway } from "../../src/gateway/custom.ts";
import { createJevProvider } from "../../src/provider/jev/provider.ts";

const capabilities = {
  batching: false,
  boolean: true,
  choice: true,
  customHeaders: false,
  jev: true,
  score: true,
} as const;

const gatewayWith = (
  body: unknown,
  inspect?: (request: unknown, options: unknown) => void
) =>
  defineGateway({
    capabilities,
    evaluate: (request, options) => {
      inspect?.(request, options);
      return Promise.resolve({ body });
    },
    id: "test-gateway",
    model: "typesafe/jev",
  });

test("maps Boolean state and a noul answer exactly", async () => {
  const context = { createdAt: new Date("2026-09-19T00:00:00.000Z"), id: 7 };
  let captured: unknown;
  const provider = createJevProvider({
    gateway: gatewayWith(
      { answers: { decision: { noul: 0.8, type: "noul" } } },
      (request, options) => {
        captured = { options, request };
      }
    ),
    timeoutMs: 900,
  });

  const decision = await provider.boolean({
    condition: "Approve?",
    context,
  });
  context.id = 8;

  assert.deepEqual(captured, {
    options: { timeoutMs: 900 },
    request: {
      model: "typesafe/jev",
      questions: {
        decision: { instructions: "Approve?", type: "noul" },
      },
      state: { createdAt: "2026-09-19T00:00:00.000Z", id: 7 },
    },
  });
  assert.deepEqual(decision, {
    confidence: 0.8,
    kind: "boolean",
    probabilityTrue: 0.8,
    raw: { noul: 0.8, type: "noul" },
    value: true,
  });
});

test("maps Choice criteria and preserves exact request-directed keys", async () => {
  let captured: unknown;
  const provider = createJevProvider({
    gateway: gatewayWith(
      {
        answers: {
          decision: {
            choice: "billing",
            confidence: 0.75,
            probabilities: { billing: 0.75, support: 0.25 },
            type: "choice",
          },
        },
      },
      (request) => {
        captured = request;
      }
    ),
  });

  const decision = await provider.choice({
    context: { ticket: "refund" },
    options: ["billing", "support"] as const,
    question: "Route this",
  });

  assert.deepEqual(captured, {
    model: "typesafe/jev",
    questions: {
      decision: {
        criteria: { billing: "billing", support: "support" },
        instructions: "Route this",
        type: "choice",
      },
    },
    state: { ticket: "refund" },
  });
  assert.equal(decision.value, "billing");
  assert.deepEqual(decision.probabilities, { billing: 0.75, support: 0.25 });
});

test("maps Score legend and probabilities to the request's ordered levels", async () => {
  const provider = createJevProvider({
    gateway: gatewayWith({
      answers: {
        decision: {
          confidence: 0.7,
          legend: { 0: "low", 1: "medium", 2: "high" },
          probabilities: { 0: 0.1, 1: 0.2, 2: 0.7 },
          score: 1.6,
          type: "score",
        },
      },
    }),
  });

  const decision = await provider.score({
    context: null,
    levels: ["low", "medium", "high"] as const,
    question: "Risk?",
  });

  assert.deepEqual(decision, {
    confidence: 0.7,
    kind: "score",
    levels: ["low", "medium", "high"],
    probabilities: [0.1, 0.2, 0.7],
    raw: {
      confidence: 0.7,
      legend: { 0: "low", 1: "medium", 2: "high" },
      probabilities: { 0: 0.1, 1: 0.2, 2: 0.7 },
      score: 1.6,
      type: "score",
    },
    score: 1.6,
  });
});

test("serializes before transport and rejects non-JSON context", async () => {
  let calls = 0;
  const provider = createJevProvider({
    gateway: gatewayWith({}, () => {
      calls += 1;
    }),
  });
  const circular: { self?: unknown } = {};
  circular.self = circular;

  await assert.rejects(
    provider.boolean({ condition: "Proceed?", context: circular }),
    SerializationError
  );
  await assert.rejects(
    provider.boolean({ condition: "Proceed?", context: 1n }),
    SerializationError
  );
  assert.equal(calls, 0);
});

test("rejects unsupported capabilities before transport", async () => {
  let calls = 0;
  const gateway = defineGateway({
    capabilities: { ...capabilities, choice: false },
    evaluate: () => {
      calls += 1;
      return Promise.resolve({ body: {} });
    },
    id: "limited",
    model: "jev",
  });

  await assert.rejects(
    createJevProvider({ gateway }).choice({
      context: {},
      options: ["a"] as const,
      question: "Pick",
    }),
    ConfigurationError
  );
  assert.equal(calls, 0);
});

test("rejects missing, extra, and incorrectly typed answers", async () => {
  await Promise.all(
    [
      {},
      { answers: {} },
      {
        answers: {
          decision: { noul: 0.7, type: "noul" },
          extra: { noul: 0.2, type: "noul" },
        },
      },
      { answers: { decision: { choice: "yes", type: "choice" } } },
    ].map((body) =>
      assert.rejects(
        createJevProvider({ gateway: gatewayWith(body) }).boolean({
          condition: "Proceed?",
          context: {},
        }),
        ProviderContractError
      )
    )
  );
});

test("rejects impossible Choice outputs and invalid distributions", async () => {
  await Promise.all(
    [
      {
        choice: "other",
        confidence: 0.5,
        probabilities: { a: 0.5, b: 0.5 },
        type: "choice",
      },
      {
        choice: "a",
        confidence: 0.5,
        probabilities: { a: 0.5 },
        type: "choice",
      },
      {
        choice: "a",
        confidence: 0.5,
        probabilities: { a: 0.5, b: 0.5, extra: 0 },
        type: "choice",
      },
      {
        choice: "a",
        confidence: 0.5,
        probabilities: { a: 0.7, b: 0.7 },
        type: "choice",
      },
      {
        choice: "a",
        confidence: Number.NaN,
        probabilities: { a: 0.5, b: 0.5 },
        type: "choice",
      },
    ].map((answer) =>
      assert.rejects(
        createJevProvider({
          gateway: gatewayWith({ answers: { decision: answer } }),
        }).choice({ context: {}, options: ["a", "b"], question: "Pick" }),
        ProviderContractError
      )
    )
  );
});

test("rejects invalid Boolean probabilities", async () => {
  await Promise.all(
    [-0.1, 1.1, Number.NaN, "0.5"].map((noul) =>
      assert.rejects(
        createJevProvider({
          gateway: gatewayWith({
            answers: { decision: { noul, type: "noul" } },
          }),
        }).boolean({ condition: "Proceed?", context: {} }),
        ProviderContractError
      )
    )
  );
});

test("rejects mismatched Score legends and probability records", async () => {
  const base = {
    confidence: 0.8,
    legend: { 0: "low", 1: "high" },
    probabilities: { 0: 0.4, 1: 0.6 },
    score: 0.6,
    type: "score",
  };
  await Promise.all(
    [
      { ...base, legend: { 0: "high", 1: "low" } },
      { ...base, probabilities: { 0: 1 } },
      { ...base, probabilities: { 0: 0.8, 1: 0.8 } },
      { ...base, score: 2 },
    ].map((answer) =>
      assert.rejects(
        createJevProvider({
          gateway: gatewayWith({ answers: { decision: answer } }),
        }).score({ context: {}, levels: ["low", "high"], question: "Risk?" }),
        ProviderContractError
      )
    )
  );
});

test("normalizes validated provider metadata", async () => {
  const provider = createJevProvider({
    gateway: defineGateway({
      capabilities,
      evaluate: () =>
        Promise.resolve({
          body: { answers: { decision: { noul: 0.4, type: "noul" } } },
          metadata: {
            gateway: "edge",
            latencyMs: 12,
            model: "requested",
            raw: { region: "bom" },
            requestId: "req_1",
            resolvedModel: "jev-1.13",
            usage: { inputTokens: 10, outputTokens: 2 },
          },
        }),
      id: "edge",
      model: "requested",
    }),
  });

  const decision = await provider.boolean({
    condition: "Proceed?",
    context: {},
  });
  assert.deepEqual(decision.metadata, {
    gateway: "edge",
    latencyMs: 12,
    model: "requested",
    provider: "jev",
    raw: { region: "bom" },
    requestId: "req_1",
    resolvedModel: "jev-1.13",
    usage: { inputTokens: 10, outputTokens: 2 },
  });
});

test("rejects invalid gateway metadata", async () => {
  const gateway = gatewayWith({
    answers: { decision: { noul: 0.4, type: "noul" } },
  });
  const invalidGateway = {
    ...gateway,
    evaluate: () =>
      Promise.resolve({
        body: { answers: { decision: { noul: 0.4, type: "noul" } } },
        metadata: { gateway: "edge", model: "model", requestId: "" },
      }),
  };

  await assert.rejects(
    createJevProvider({ gateway: invalidGateway }).boolean({
      condition: "Proceed?",
      context: {},
    }),
    ProviderContractError
  );
});

test("passes Judge errors through and wraps unknown gateway failures", async () => {
  await Promise.all(
    [new ProviderError("no", { code: "rate_limit" }), new AbortError()].map(
      (error) => {
        const gateway = defineGateway({
          capabilities,
          evaluate: () => Promise.reject(error),
          id: "failing",
          model: "jev",
        });
        return assert.rejects(
          createJevProvider({ gateway }).boolean({
            condition: "Go?",
            context: {},
          }),
          (received) => received === error
        );
      }
    )
  );

  const cause = new Error("vendor detail");
  const gateway = defineGateway({
    capabilities,
    evaluate: () => Promise.reject(cause),
    id: "failing",
    model: "jev",
  });
  await assert.rejects(
    createJevProvider({ gateway }).boolean({ condition: "Go?", context: {} }),
    (received) =>
      received instanceof ProviderError &&
      received.code === "gateway_error" &&
      received.cause === cause
  );
});

test("does not call a gateway for an already-aborted request", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort("stop");
  const provider = createJevProvider({
    gateway: gatewayWith({}, () => {
      calls += 1;
    }),
  });

  await assert.rejects(
    provider.boolean({
      condition: "Go?",
      context: {},
      signal: controller.signal,
    }),
    AbortError
  );
  assert.equal(calls, 0);
});
