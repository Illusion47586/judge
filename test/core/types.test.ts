import type {
  ChoiceDecision,
  JudgeClient,
  ScoreDecision,
} from "../../src/core/index.ts";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

const expectType = <T extends true>(value: T): T => value;

export const verifyRequestDirectedTypes = (judge: JudgeClient) => {
  const choice = judge.choice({
    context: {},
    options: ["billing", "support"],
    question: "Route",
  });
  type ChoiceResult = Expect<
    Equal<typeof choice, Promise<ChoiceDecision<"billing" | "support">>>
  >;

  const branch = judge.if({
    condition: "Proceed?",
    context: {},
    else: ({ decision }) => {
      type FalseValue = Expect<Equal<typeof decision.value, false>>;
      expectType<FalseValue>(true);
      return "stopped" as const;
    },
    then: ({ decision }) => {
      type TrueValue = Expect<Equal<typeof decision.value, true>>;
      expectType<TrueValue>(true);
      return Promise.resolve("started" as const);
    },
  });
  type IfResult = Expect<Equal<typeof branch, Promise<"started" | "stopped">>>;

  const switched = judge.switch({
    cases: {
      billing: ({ decision }) => {
        type Selected = Expect<Equal<typeof decision.value, "billing">>;
        type ProbabilityKeys = Expect<
          Equal<keyof typeof decision.probabilities, "billing" | "support">
        >;
        expectType<Selected>(true);
        expectType<ProbabilityKeys>(true);
        return { invoice: true } as const;
      },
      support: async ({ decision }) => {
        await Promise.resolve();
        type Selected = Expect<Equal<typeof decision.value, "support">>;
        expectType<Selected>(true);
        return Promise.resolve({ ticket: true } as const);
      },
    },
    confidence: {
      minimum: 0.8,
      uncertain: () => ({ review: true }) as const,
    },
    context: {},
    question: "Route",
  });
  type SwitchResult = Expect<
    Equal<
      typeof switched,
      Promise<
        | { readonly invoice: true }
        | { readonly ticket: true }
        | { readonly review: true }
      >
    >
  >;

  const scored = judge.score({
    context: {},
    levels: ["low", "medium", "high"],
    question: "Severity",
  });
  type ScoreResult = Expect<
    Equal<typeof scored, Promise<ScoreDecision<"low" | "medium" | "high">>>
  >;

  return [
    expectType<ChoiceResult>(true),
    expectType<IfResult>(true),
    expectType<SwitchResult>(true),
    expectType<ScoreResult>(true),
  ] as const;
};
