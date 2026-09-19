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
  getResult: unknown | ((input: AnyChoiceInput) => unknown),
  onInput?: (input: AnyChoiceInput) => void
): DecisionProvider => ({
  boolean: () => Promise.reject(new Error("unused")),
  choice: <S, const O extends readonly [string, ...string[]]>(
    input: ChoiceInput<S, O>
  ): Promise<ChoiceDecision<O[number]>> => {
    const generalInput = input as AnyChoiceInput;
    onInput?.(generalInput);
    const result =
      typeof getResult === "function" ? getResult(generalInput) : getResult;
    return Promise.resolve(result as ChoiceDecision<O[number]>);
  },
  score: () => Promise.reject(new Error("unused")),
});

const supportDecision = {
  confidence: 0.9,
  kind: "choice",
  probabilities: { billing: 0.1, support: 0.9 },
  value: "support",
} as const;

test("switch derives exact options and executes only the selected case", async () => {
  const calls: string[] = [];
  let received: AnyChoiceInput | undefined;
  const judge = createJudge({
    provider: createChoiceProvider(supportDecision, (input) => {
      received = input;
    }),
  });

  const result = await judge.switch({
    cases: {
      billing: () => {
        calls.push("billing");
        return "invoice" as const;
      },
      support: async ({ decision }) => {
        await Promise.resolve();
        calls.push("support");
        assert.equal(decision.value, "support");
        return "ticket" as const;
      },
    },
    context: { ticket: 1 },
    question: "  Route this  ",
  });

  assert.equal(result, "ticket");
  assert.deepEqual(calls, ["support"]);
  assert.equal(received?.question, "Route this");
  assert.deepEqual(received?.options, ["billing", "support"]);
});

for (const [name, cases] of [
  ["an empty case map", {}],
  ["an empty case key", { "": () => undefined }],
  ["an untrimmed case key", { " support": () => undefined }],
  ["a non-function case", { support: "invalid" }],
] as const) {
  test(`switch rejects ${name} before provider evaluation`, async () => {
    let calls = 0;
    const judge = createJudge({
      provider: createChoiceProvider(supportDecision, () => {
        calls += 1;
      }),
    });

    await assert.rejects(
      judge.switch({
        cases: cases as never,
        context: {},
        question: "Route",
      }),
      ConfigurationError
    );
    assert.equal(calls, 0);
  });
}

test("switch routes only below-threshold confidence to uncertain", async () => {
  const calls: string[] = [];
  const judge = createJudge({
    provider: createChoiceProvider({
      ...supportDecision,
      confidence: 0.79,
    }),
  });

  const result = await judge.switch({
    cases: {
      billing: () => {
        calls.push("billing");
        return "invoice" as const;
      },
      support: () => {
        calls.push("support");
        return "ticket" as const;
      },
    },
    confidence: {
      minimum: 0.8,
      uncertain: ({ decision }) => {
        calls.push("uncertain");
        assert.equal(decision.value, "support");
        return "review" as const;
      },
    },
    context: {},
    question: "Route",
  });

  assert.equal(result, "review");
  assert.deepEqual(calls, ["uncertain"]);
});

test("switch accepts confidence equal to the threshold", async () => {
  const judge = createJudge({
    provider: createChoiceProvider({ ...supportDecision, confidence: 0.8 }),
  });

  const result = await judge.switch({
    cases: {
      billing: () => "invoice" as const,
      support: () => "ticket" as const,
    },
    confidence: {
      minimum: 0.8,
      uncertain: () => "review" as const,
    },
    context: {},
    question: "Route",
  });

  assert.equal(result, "ticket");
});

test("switch validates confidence before provider evaluation", async () => {
  let calls = 0;
  const judge = createJudge({
    provider: createChoiceProvider(supportDecision, () => {
      calls += 1;
    }),
  });

  await assert.rejects(
    judge.switch({
      cases: { support: () => "ticket" },
      confidence: { minimum: Number.NaN, uncertain: () => "review" },
      context: {},
      question: "Route",
    }),
    ConfigurationError
  );
  assert.equal(calls, 0);
});

test("switch executes no callback for malformed provider output", async () => {
  let callbacks = 0;
  const judge = createJudge({
    provider: createChoiceProvider({
      ...supportDecision,
      probabilities: { billing: 0.5, support: 0.4 },
    }),
  });

  await assert.rejects(
    judge.switch({
      cases: {
        billing: () => {
          callbacks += 1;
        },
        support: () => {
          callbacks += 1;
        },
      },
      context: {},
      question: "Route",
    }),
    ProviderContractError
  );
  assert.equal(callbacks, 0);
});

test("switch rechecks cancellation after provider resolution", async () => {
  const controller = new AbortController();
  let callbacks = 0;
  const judge = createJudge({
    provider: createChoiceProvider(() => {
      controller.abort("too late");
      return supportDecision;
    }),
  });

  await assert.rejects(
    judge.switch({
      cases: {
        billing: () => {
          callbacks += 1;
        },
        support: () => {
          callbacks += 1;
        },
      },
      context: {},
      question: "Route",
      signal: controller.signal,
    }),
    AbortError
  );
  assert.equal(callbacks, 0);
});

test("switch preserves application callback errors", async () => {
  const expected = new Error("application failed");
  const judge = createJudge({
    provider: createChoiceProvider(supportDecision),
  });

  await assert.rejects(
    judge.switch({
      cases: {
        billing: () => undefined,
        support: () => {
          throw expected;
        },
      },
      context: {},
      question: "Route",
    }),
    (error) => error === expected
  );
});
