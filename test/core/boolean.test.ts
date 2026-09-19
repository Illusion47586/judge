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

const unusedProviderMethods: Pick<DecisionProvider, "choice" | "score"> = {
  choice: () => Promise.reject(new Error("unused")),
  score: () => Promise.reject(new Error("unused")),
};

const createBooleanProvider = (
  evaluate: DecisionProvider["boolean"]
): DecisionProvider => ({
  boolean: evaluate,
  ...unusedProviderMethods,
});

test("boolean returns a validated provider decision", async () => {
  let receivedCondition: string | undefined;
  const expected: BooleanDecision = {
    confidence: 0.91,
    kind: "boolean",
    probabilityTrue: 0.91,
    value: true,
  };
  const judge = createJudge({
    provider: createBooleanProvider((input) => {
      receivedCondition = input.condition;
      return Promise.resolve(expected);
    }),
  });

  const actual = await judge.boolean({
    condition: "  Is this urgent?  ",
    context: { ticket: "urgent" },
  });

  assert.equal(receivedCondition, "Is this urgent?");
  assert.equal(actual, expected);
});

test("boolean rejects an empty condition before provider evaluation", async () => {
  let calls = 0;
  const judge = createJudge({
    provider: createBooleanProvider(() => {
      calls += 1;
      return Promise.reject(new Error("must not run"));
    }),
  });

  await assert.rejects(
    judge.boolean({ condition: "  ", context: {} }),
    ConfigurationError
  );
  assert.equal(calls, 0);
});

for (const [name, decision] of [
  [
    "wrong kind",
    { confidence: 0.9, kind: "choice", probabilityTrue: 0.9, value: true },
  ],
  [
    "non-boolean value",
    { confidence: 0.9, kind: "boolean", probabilityTrue: 0.9, value: "yes" },
  ],
  [
    "invalid probability",
    { confidence: 0.9, kind: "boolean", probabilityTrue: 1.1, value: true },
  ],
  [
    "invalid confidence",
    {
      confidence: Number.NaN,
      kind: "boolean",
      probabilityTrue: 0.9,
      value: true,
    },
  ],
] as const) {
  test(`boolean rejects provider output with ${name}`, async () => {
    const judge = createJudge({
      provider: createBooleanProvider(() => Promise.resolve(decision as never)),
    });

    await assert.rejects(
      judge.boolean({ condition: "Is this valid?", context: {} }),
      ProviderContractError
    );
  });
}

test("boolean rejects a pre-aborted evaluation without calling the provider", async () => {
  const controller = new AbortController();
  controller.abort("cancelled");
  let calls = 0;
  const judge = createJudge({
    provider: createBooleanProvider(() => {
      calls += 1;
      return Promise.reject(new Error("must not run"));
    }),
  });

  await assert.rejects(
    judge.boolean({
      condition: "Is this cancelled?",
      context: {},
      signal: controller.signal,
    }),
    AbortError
  );
  assert.equal(calls, 0);
});
