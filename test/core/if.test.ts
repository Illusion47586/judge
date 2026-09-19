import assert from "node:assert/strict";
import test from "node:test";

import {
  AbortError,
  type BooleanDecision,
  ConfigurationError,
  createJudge,
  type DecisionProvider,
  ProviderContractError,
} from "../../src/core/index.ts";

const createProvider = (
  evaluate: DecisionProvider["boolean"]
): DecisionProvider => ({
  boolean: evaluate,
  choice: () => Promise.reject(new Error("unused")),
  score: () => Promise.reject(new Error("unused")),
});

const decision = (
  overrides: Partial<BooleanDecision> = {}
): BooleanDecision => ({
  confidence: 0.9,
  kind: "boolean",
  probabilityTrue: 0.9,
  value: true,
  ...overrides,
});

test("if executes only the true branch and returns its awaited value", async () => {
  const calls: string[] = [];
  const judge = createJudge({
    provider: createProvider(() => Promise.resolve(decision())),
  });

  const result = await judge.if({
    condition: "Is it true?",
    context: {},
    else: () => {
      calls.push("else");
      return "rejected" as const;
    },
    then: async ({ decision: selected }) => {
      await Promise.resolve();
      calls.push("then");
      assert.equal(selected.value, true);
      return "accepted" as const;
    },
  });
  const typed: "accepted" | "rejected" = result;

  assert.equal(typed, "accepted");
  assert.deepEqual(calls, ["then"]);
});

test("if executes only the false branch", async () => {
  const calls: string[] = [];
  const judge = createJudge({
    provider: createProvider(() =>
      Promise.resolve(decision({ probabilityTrue: 0.1, value: false }))
    ),
  });

  const result = await judge.if({
    condition: "Is it true?",
    context: {},
    else: ({ decision: selected }) => {
      calls.push("else");
      assert.equal(selected.value, false);
      return "rejected" as const;
    },
    then: () => {
      calls.push("then");
      return "accepted" as const;
    },
  });

  assert.equal(result, "rejected");
  assert.deepEqual(calls, ["else"]);
});

test("if routes below-threshold decisions only to uncertain", async () => {
  const calls: string[] = [];
  const judge = createJudge({
    provider: createProvider(() =>
      Promise.resolve(decision({ confidence: 0.79 }))
    ),
  });

  const result = await judge.if({
    condition: "Is it clear?",
    confidence: {
      minimum: 0.8,
      uncertain: ({ minimum }) => {
        calls.push("uncertain");
        assert.equal(minimum, 0.8);
        return "review" as const;
      },
    },
    context: {},
    else: () => {
      calls.push("else");
      return "rejected" as const;
    },
    then: () => {
      calls.push("then");
      return "accepted" as const;
    },
  });
  const typed: "accepted" | "rejected" | "review" = result;

  assert.equal(typed, "review");
  assert.deepEqual(calls, ["uncertain"]);
});

test("if accepts confidence equal to the threshold", async () => {
  const judge = createJudge({
    provider: createProvider(() =>
      Promise.resolve(decision({ confidence: 0.8 }))
    ),
  });

  const result = await judge.if({
    condition: "Is it clear?",
    confidence: {
      minimum: 0.8,
      uncertain: () => "review" as const,
    },
    context: {},
    else: () => "rejected" as const,
    then: () => "accepted" as const,
  });

  assert.equal(result, "accepted");
});

test("if validates confidence before provider evaluation", async () => {
  let calls = 0;
  const judge = createJudge({
    provider: createProvider(() => {
      calls += 1;
      return Promise.resolve(decision());
    }),
  });

  await assert.rejects(
    judge.if({
      condition: "Is it clear?",
      confidence: {
        minimum: Number.NaN,
        uncertain: () => "review",
      },
      context: {},
      else: () => "rejected",
      then: () => "accepted",
    }),
    ConfigurationError
  );
  assert.equal(calls, 0);
});

test("if executes no callback for malformed provider output", async () => {
  let callbacks = 0;
  const judge = createJudge({
    provider: createProvider(() =>
      Promise.resolve({
        confidence: 0.9,
        kind: "boolean",
        probabilityTrue: 4,
        value: true,
      })
    ),
  });

  await assert.rejects(
    judge.if({
      condition: "Is it valid?",
      context: {},
      else: () => {
        callbacks += 1;
      },
      then: () => {
        callbacks += 1;
      },
    }),
    ProviderContractError
  );
  assert.equal(callbacks, 0);
});

test("if rechecks cancellation after provider resolution", async () => {
  const controller = new AbortController();
  let callbacks = 0;
  const judge = createJudge({
    provider: createProvider(() => {
      controller.abort("too late");
      return Promise.resolve(decision());
    }),
  });

  await assert.rejects(
    judge.if({
      condition: "Should this run?",
      context: {},
      else: () => {
        callbacks += 1;
      },
      signal: controller.signal,
      then: () => {
        callbacks += 1;
      },
    }),
    AbortError
  );
  assert.equal(callbacks, 0);
});

test("if preserves application callback errors", async () => {
  const expected = new Error("application failed");
  const judge = createJudge({
    provider: createProvider(() => Promise.resolve(decision())),
  });

  await assert.rejects(
    judge.if({
      condition: "Should this run?",
      context: {},
      else: () => undefined,
      then: () => {
        throw expected;
      },
    }),
    (error) => error === expected
  );
});
