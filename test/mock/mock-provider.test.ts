import assert from "node:assert/strict";
import test from "node:test";

import {
  AbortError,
  ConfigurationError,
  createJudge,
} from "../../src/core/index.ts";
import { mockProvider } from "../../src/mock/index.ts";

test("mock provider consumes immutable Boolean fixtures in FIFO order", async () => {
  const fixtures = [
    { probabilityTrue: 0.9, value: true },
    { confidence: 0.7, probabilityTrue: 0.2, value: false },
  ] as const;
  const snapshot = structuredClone(fixtures);
  const provider = mockProvider({ boolean: fixtures });

  const first = await provider.boolean({ condition: "First?", context: {} });
  const second = await provider.boolean({ condition: "Second?", context: {} });

  assert.deepEqual(first, {
    confidence: 0.9,
    kind: "boolean",
    probabilityTrue: 0.9,
    value: true,
  });
  assert.deepEqual(second, {
    confidence: 0.7,
    kind: "boolean",
    probabilityTrue: 0.2,
    value: false,
  });
  assert.deepEqual(fixtures, snapshot);
});

test("mock provider derives false confidence from the selected outcome", async () => {
  const provider = mockProvider({
    boolean: [{ probabilityTrue: 0.2, value: false }],
  });

  const result = await provider.boolean({ condition: "False?", context: {} });

  assert.equal(result.confidence, 0.8);
});

test("mock provider reports an exhausted Boolean queue", async () => {
  const provider = mockProvider({ boolean: [] });

  await assert.rejects(
    provider.boolean({ condition: "Anything?", context: {} }),
    ConfigurationError
  );
});

test("mock provider observes cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  const provider = mockProvider({
    boolean: [{ probabilityTrue: 0.9, value: true }],
  });

  await assert.rejects(
    provider.boolean({
      condition: "Cancelled?",
      context: {},
      signal: controller.signal,
    }),
    AbortError
  );
});

test("mock provider integrates with judge.if", async () => {
  const judge = createJudge({
    provider: mockProvider({
      boolean: [{ probabilityTrue: 0.95, value: true }],
    }),
  });

  const result = await judge.if({
    condition: "Is this urgent?",
    context: { ticket: "urgent" },
    else: () => "queue" as const,
    then: () => "escalate" as const,
  });

  assert.equal(result, "escalate");
});

test("mock provider consumes immutable Choice fixtures in FIFO order", async () => {
  const raw = { requestId: "choice-1" };
  const fixtures = [
    {
      probabilities: { billing: 0.1, support: 0.9 },
      raw,
      value: "support",
    },
    {
      confidence: 0.7,
      probabilities: { billing: 0.7, support: 0.3 },
      value: "billing",
    },
  ] as const;
  const snapshot = structuredClone(fixtures);
  const provider = mockProvider({ choice: fixtures });

  const request = {
    context: {},
    options: ["billing", "support"] as const,
    question: "Route",
  };
  const first = await provider.choice(request);
  const second = await provider.choice(request);

  assert.deepEqual(first, {
    confidence: 0.9,
    kind: "choice",
    probabilities: { billing: 0.1, support: 0.9 },
    raw,
    value: "support",
  });
  assert.deepEqual(second, {
    confidence: 0.7,
    kind: "choice",
    probabilities: { billing: 0.7, support: 0.3 },
    value: "billing",
  });
  assert.deepEqual(fixtures, snapshot);
});

test("mock Choice cancellation does not consume a fixture", async () => {
  const controller = new AbortController();
  controller.abort();
  const provider = mockProvider({
    choice: [
      {
        probabilities: { billing: 0.1, support: 0.9 },
        value: "support",
      },
    ],
  });
  const request = {
    context: {},
    options: ["billing", "support"] as const,
    question: "Route",
  };

  await assert.rejects(
    provider.choice({ ...request, signal: controller.signal }),
    AbortError
  );
  assert.equal((await provider.choice(request)).value, "support");
});

test("mock provider integrates with judge.switch", async () => {
  const judge = createJudge({
    provider: mockProvider({
      choice: [
        {
          probabilities: { billing: 0.1, support: 0.9 },
          value: "support",
        },
      ],
    }),
  });

  const result = await judge.switch({
    cases: {
      billing: () => "invoice" as const,
      support: () => "ticket" as const,
    },
    context: {},
    question: "Route",
  });

  assert.equal(result, "ticket");
});

test("exhausted mock Choice and unconfigured Score operations fail clearly", async () => {
  const provider = mockProvider({ boolean: [] });

  await assert.rejects(
    provider.choice({ context: {}, options: ["a"], question: "Where?" }),
    ConfigurationError
  );
  await assert.rejects(
    provider.score({ context: {}, levels: ["a", "b"], question: "How much?" }),
    ConfigurationError
  );
});
