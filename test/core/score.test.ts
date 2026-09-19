import assert from "node:assert/strict";
import test from "node:test";

import {
  AbortError,
  ConfigurationError,
  createJudge,
  type DecisionProvider,
  ProviderContractError,
  type ScoreDecision,
  type ScoreInput,
} from "../../src/core/index.ts";

type AnyScoreInput = ScoreInput<
  unknown,
  readonly [string, string, ...string[]]
>;

const createScoreProvider = (
  result: unknown,
  onInput?: (input: AnyScoreInput) => void
): DecisionProvider => ({
  boolean: () => Promise.reject(new Error("unused")),
  choice: () => Promise.reject(new Error("unused")),
  score: <S, const L extends readonly [string, string, ...string[]]>(
    input: ScoreInput<S, L>
  ): Promise<ScoreDecision<L[number]>> => {
    onInput?.(input as AnyScoreInput);
    return Promise.resolve(result as ScoreDecision<L[number]>);
  },
});

const validDecision = {
  confidence: 0.84,
  kind: "score",
  levels: ["low", "medium", "high"],
  probabilities: [0.05, 0.1, 0.85],
  score: 1.8,
} as const;

test("score returns a validated decision and trims its question", async () => {
  let received: AnyScoreInput | undefined;
  const judge = createJudge({
    provider: createScoreProvider(validDecision, (input) => {
      received = input;
    }),
  });

  const actual = await judge.score({
    context: { incident: "database latency" },
    levels: ["low", "medium", "high"],
    question: "  How severe is this?  ",
  });

  assert.equal(actual, validDecision);
  assert.equal(received?.question, "How severe is this?");
  assert.deepEqual(received?.levels, ["low", "medium", "high"]);
});

for (const [name, levels] of [
  ["too few levels", ["low"]],
  ["an empty level", ["low", ""]],
  ["an untrimmed level", ["low", " high"]],
  ["duplicate levels", ["low", "low"]],
] as const) {
  test(`score rejects ${name} before provider evaluation`, async () => {
    let calls = 0;
    const judge = createJudge({
      provider: createScoreProvider(validDecision, () => {
        calls += 1;
      }),
    });

    await assert.rejects(
      judge.score({
        context: {},
        levels: levels as unknown as readonly [string, string, ...string[]],
        question: "Severity",
      }),
      ConfigurationError
    );
    assert.equal(calls, 0);
  });
}

for (const [name, decision] of [
  ["wrong kind", { ...validDecision, kind: "choice" }],
  ["changed level", { ...validDecision, levels: ["low", "mid", "high"] }],
  ["missing level", { ...validDecision, levels: ["low", "medium"] }],
  ["misaligned probabilities", { ...validDecision, probabilities: [0.2, 0.8] }],
  [
    "out-of-range probability",
    { ...validDecision, probabilities: [-0.1, 0.1, 1] },
  ],
  [
    "non-finite probability",
    { ...validDecision, probabilities: [Number.NaN, 0.1, 0.9] },
  ],
  [
    "invalid distribution",
    { ...validDecision, probabilities: [0.1, 0.1, 0.7] },
  ],
  ["invalid confidence", { ...validDecision, confidence: 1.1 }],
  ["negative score", { ...validDecision, score: -0.1 }],
  ["score above range", { ...validDecision, score: 2.1 }],
  ["non-finite score", { ...validDecision, score: Number.NaN }],
  ["inconsistent weighted score", { ...validDecision, score: 1.7 }],
] as const) {
  test(`score rejects provider output with ${name}`, async () => {
    const judge = createJudge({ provider: createScoreProvider(decision) });

    await assert.rejects(
      judge.score({
        context: {},
        levels: ["low", "medium", "high"],
        question: "Severity",
      }),
      ProviderContractError
    );
  });
}

test("score observes pre-provider cancellation", async () => {
  const controller = new AbortController();
  controller.abort("cancelled");
  let calls = 0;
  const judge = createJudge({
    provider: createScoreProvider(validDecision, () => {
      calls += 1;
    }),
  });

  await assert.rejects(
    judge.score({
      context: {},
      levels: ["low", "medium", "high"],
      question: "Severity",
      signal: controller.signal,
    }),
    AbortError
  );
  assert.equal(calls, 0);
});
