import type {
  ChoiceDecision,
  JudgeClient,
  ScoreDecision,
} from "@brkn-labs/judge";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

declare const judge: JudgeClient;

const choice = judge.choice({
  context: {},
  options: ["billing", "support"],
  question: "Route",
});
export type ChoiceContract = Expect<
  Equal<typeof choice, Promise<ChoiceDecision<"billing" | "support">>>
>;
choice.then((decision) => {
  const valid: number = decision.probabilities.billing;
  // @ts-expect-error "sales" was not declared by this request.
  const invalid: number = decision.probabilities.sales;
  // @ts-expect-error an undeclared choice cannot be returned.
  const impossible: "sales" = decision.value;
  return [valid, invalid, impossible];
});

const conditional = judge.if({
  condition: "Proceed?",
  confidence: {
    minimum: 0.8,
    uncertain: () => ({ review: true }) as const,
  },
  context: {},
  else: ({ decision }) => {
    const exact: false = decision.value;
    // @ts-expect-error the else branch is narrowed to false.
    const _impossible: true = decision.value;
    return { stopped: exact } as const;
  },
  then: ({ decision }) => {
    const exact: true = decision.value;
    // @ts-expect-error the then branch is narrowed to true.
    const _impossible: false = decision.value;
    return Promise.resolve({ started: exact } as const);
  },
});
export type IfContract = Expect<
  Equal<
    typeof conditional,
    Promise<
      | { readonly review: true }
      | { readonly started: true }
      | { readonly stopped: false }
    >
  >
>;
conditional.then((result) => {
  // @ts-expect-error the result can be either branch or the uncertain branch.
  const impossible: { readonly started: true } = result;
  return impossible;
});

const switched = judge.switch({
  cases: {
    billing: ({ decision }) => {
      const exact: "billing" = decision.value;
      // @ts-expect-error switch probabilities contain only case keys.
      const _impossible = decision.probabilities.sales;
      return { invoice: exact } as const;
    },
    support: ({ decision }) => {
      const exact: "support" = decision.value;
      return Promise.resolve({ ticket: exact } as const);
    },
  },
  confidence: {
    minimum: 0.8,
    uncertain: () => ({ review: true }) as const,
  },
  context: {},
  question: "Route",
});
export type SwitchContract = Expect<
  Equal<
    Awaited<typeof switched>,
    | { readonly invoice: "billing" }
    | { readonly review: true }
    | { readonly ticket: "support" }
  >
>;
switched.then((result) => {
  // @ts-expect-error the result can be any case or the uncertain branch.
  const impossible: { readonly invoice: "billing" } = result;
  return impossible;
});

const score = judge.score({
  context: {},
  levels: ["low", "medium", "high"],
  question: "Risk",
});
export type ScoreContract = Expect<
  Equal<typeof score, Promise<ScoreDecision<"high" | "low" | "medium">>>
>;

// @ts-expect-error choice requires at least one option.
judge.choice({ context: {}, options: [], question: "Empty" });
// @ts-expect-error score requires at least two levels.
judge.score({ context: {}, levels: ["only"], question: "Too short" });
