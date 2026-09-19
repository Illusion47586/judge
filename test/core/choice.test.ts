import assert from "node:assert/strict";
import test from "node:test";

import {
  AbortError,
  type ChoiceDecision,
  type ChoiceInput,
  ConfigurationError,
  createJudge,
  type DecisionProvider,
  ProviderContractError,
} from "../../src/core/index.ts";

type AnyChoiceInput = ChoiceInput<unknown, readonly [string, ...string[]]>;

const createChoiceProvider = (
  result: unknown,
  onInput?: (input: AnyChoiceInput) => void
): DecisionProvider => ({
  boolean: () => Promise.reject(new Error("unused")),
  choice: <S, const O extends readonly [string, ...string[]]>(
    input: ChoiceInput<S, O>
  ): Promise<ChoiceDecision<O[number]>> => {
    onInput?.(input as AnyChoiceInput);
    return Promise.resolve(result as ChoiceDecision<O[number]>);
  },
  score: () => Promise.reject(new Error("unused")),
});

const validDecision = {
  confidence: 0.8,
  kind: "choice",
  probabilities: { billing: 0.2, support: 0.8 },
  value: "support",
} as const;

test("choice returns a validated decision and trims its question", async () => {
  let received: AnyChoiceInput | undefined;
  const judge = createJudge({
    provider: createChoiceProvider(validDecision, (input) => {
      received = input;
    }),
  });

  const actual = await judge.choice({
    context: { ticket: 1 },
    options: ["billing", "support"],
    question: "  Route this ticket  ",
  });

  assert.equal(actual, validDecision);
  assert.equal(received?.question, "Route this ticket");
  assert.deepEqual(received?.options, ["billing", "support"]);
});

for (const [name, question, options] of [
  ["empty question", "  ", ["billing"]],
  ["empty options", "Route", []],
  ["empty option", "Route", ["billing", "  "]],
  ["untrimmed option", "Route", [" billing"]],
  ["duplicate option", "Route", ["billing", "billing"]],
] as const) {
  test(`choice rejects ${name} before provider evaluation`, async () => {
    let calls = 0;
    const judge = createJudge({
      provider: createChoiceProvider(validDecision, () => {
        calls += 1;
      }),
    });

    await assert.rejects(
      judge.choice({
        context: {},
        options: options as unknown as readonly [string, ...string[]],
        question,
      }),
      ConfigurationError
    );
    assert.equal(calls, 0);
  });
}

for (const [name, decision] of [
  ["wrong kind", { ...validDecision, kind: "boolean" }],
  ["impossible selected value", { ...validDecision, value: "sales" }],
  ["non-object probabilities", { ...validDecision, probabilities: null }],
  ["missing probability", { ...validDecision, probabilities: { support: 1 } }],
  [
    "additional probability",
    {
      ...validDecision,
      probabilities: { billing: 0.1, sales: 0.1, support: 0.8 },
    },
  ],
  [
    "out-of-range probability",
    { ...validDecision, probabilities: { billing: -0.1, support: 1.1 } },
  ],
  [
    "non-finite probability",
    {
      ...validDecision,
      probabilities: { billing: Number.NaN, support: Number.NaN },
    },
  ],
  ["invalid confidence", { ...validDecision, confidence: 2 }],
  [
    "invalid distribution sum",
    { ...validDecision, probabilities: { billing: 0.1, support: 0.8 } },
  ],
] as const) {
  test(`choice rejects provider output with ${name}`, async () => {
    const judge = createJudge({ provider: createChoiceProvider(decision) });

    await assert.rejects(
      judge.choice({
        context: {},
        options: ["billing", "support"],
        question: "Route",
      }),
      ProviderContractError
    );
  });
}

test("choice accepts insignificant probability-sum drift", async () => {
  const judge = createJudge({
    provider: createChoiceProvider({
      ...validDecision,
      probabilities: { billing: 0.200_000_4, support: 0.8 },
    }),
  });

  const result = await judge.choice({
    context: {},
    options: ["billing", "support"],
    question: "Route",
  });

  assert.equal(result.value, "support");
});

test("choice rejects a pre-aborted request without calling the provider", async () => {
  const controller = new AbortController();
  controller.abort("cancelled");
  let calls = 0;
  const judge = createJudge({
    provider: createChoiceProvider(validDecision, () => {
      calls += 1;
    }),
  });

  await assert.rejects(
    judge.choice({
      context: {},
      options: ["billing", "support"],
      question: "Route",
      signal: controller.signal,
    }),
    AbortError
  );
  assert.equal(calls, 0);
});
