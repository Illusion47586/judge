# Choice and Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add validated lower-level Choice decisions, typed `judge.switch()` control flow, and deterministic FIFO Choice fixtures.

**Architecture:** Extend the existing core types and validation boundary with a shared Choice evaluation pipeline. `switch()` snapshots a validated case map, derives provider options from its keys, applies the existing confidence policy, and invokes exactly one callback. The mock remains a separate entry point and supplies unvalidated deterministic fixtures so core validation is exercised through the public API.

**Tech Stack:** Node.js 22.18+, TypeScript 7, npm, Node `node:test`, Ultracite/Biome.

## Global Constraints

- Root package remains `@brkn-labs/judge`, ESM-only, and `"sideEffects": false`.
- `/core` has no dependency on `/mock`, Jev, TypeSafe, or gateways.
- The root entry remains behavior-free until the default Jev adapter is implemented.
- No runtime dependency is added.
- Choice options and switch case keys are non-empty, unique, and already trimmed.
- Choice probability keys exactly equal the requested options and sum to `1` within absolute tolerance `1e-6`.
- Invalid configuration and provider results execute no application callback.
- Cancellation is checked before provider invocation, after provider resolution, and immediately before callback execution.
- Callback exceptions pass through unchanged.
- Public responses are inferred from request literals without public `any`, broad-string widening, or manually supplied response generics.
- `if()` branches retain `true`/`false` decision literals; each `switch()` case retains its own selected key and the complete probability-key union.
- This directory is not a Git repository, so the plan has no commit steps.

---

### Task 1: Define and validate lower-level Choice decisions

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/validate.ts`
- Modify: `src/core/client.ts`
- Modify: `src/core/index.ts`
- Create: `test/core/choice.test.ts`
- Create: `test/core/types.test.ts`

**Interfaces:**
- Consumes: existing `ChoiceInput`, `ChoiceDecision`, `DecisionProvider`, stable errors, and abort handling.
- Produces: `ChoiceOptions`, `JudgeClient.choice()`, `normalizeQuestion()`, `normalizeChoiceOptions()`, and `validateChoiceDecision()`.

- [x] **Step 1: Write failing public-boundary Choice tests**

Cover a valid result and trimmed question; empty question; empty, whitespace,
untrimmed, and duplicate options; pre-aborted evaluation; impossible selected
value; wrong kind; non-object probabilities; missing and extra probability
keys; non-finite/out-of-range probabilities and confidence; distribution sums
outside tolerance; and a sum within `1e-6`.

```ts
const decision = await judge.choice({
  context: {},
  options: ["billing", "support"],
  question: "  Route this ticket  ",
});
assert.equal(received.question, "Route this ticket");
assert.equal(decision.value, "support");
```

- [x] **Step 2: Run the focused test and verify the red state**

Run: `node --test test/core/choice.test.ts`

Expected: FAIL because `JudgeClient` has no `choice()` method.

- [x] **Step 3: Add Choice client types**

Add these contracts and export them from `src/core/index.ts`:

```ts
export interface ChoiceOptions<
  S,
  O extends readonly [string, ...string[]],
> extends ChoiceInput<S, O> {}

export interface JudgeClient {
  choice: <S, const O extends readonly [string, ...string[]]>(
    options: ChoiceOptions<S, O>
  ) => Promise<ChoiceDecision<O[number]>>;
}
```

- [x] **Step 4: Implement exact Choice validation**

Add question/options normalization and provider-result validation. Compare
`Object.keys(probabilities)` with the legal option set, validate each value and
confidence with the existing unit-interval helper, and reject when:

```ts
Math.abs(sum - 1) > 1e-6
```

Return the original validated decision object so provider metadata and identity
are preserved.

- [x] **Step 5: Implement the shared Choice evaluation pipeline**

```ts
const evaluateChoice = async <
  S,
  const O extends readonly [string, ...string[]],
>(
  provider: DecisionProvider,
  options: ChoiceOptions<S, O>
): Promise<ChoiceDecision<O[number]>> => {
  const question = normalizeQuestion(options.question);
  const legalOptions = normalizeChoiceOptions(options.options);
  throwIfAborted(options.signal);
  const decision = await provider.choice({
    context: options.context,
    options: legalOptions,
    question,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  throwIfAborted(options.signal);
  return validateChoiceDecision(decision, legalOptions);
};
```

Expose it through `JudgeClient.choice()`.

- [x] **Step 6: Add compile-time request/response assertions**

Define local `Equal` and `Expect` helpers in `test/core/types.test.ts`. Assert
that literal Choice options produce an exact value/probability union and that
existing `if()` metadata and awaited returns remain exact:

```ts
type Equal<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
type Expect<T extends true> = T;

const verify = (judge: JudgeClient) => {
  const choice = judge.choice({
    context: {},
    options: ["billing", "support"],
    question: "Route",
  });
  type ChoiceResult = Expect<Equal<
    typeof choice,
    Promise<ChoiceDecision<"billing" | "support">>
  >>;

  const branch = judge.if({
    condition: "Proceed?",
    context: {},
    else: ({ decision }) => {
      type FalseValue = Expect<Equal<typeof decision.value, false>>;
      return "stopped" as const;
    },
    then: ({ decision }) => {
      type TrueValue = Expect<Equal<typeof decision.value, true>>;
      return Promise.resolve("started" as const);
    },
  });
  type IfResult = Expect<Equal<
    typeof branch,
    Promise<"started" | "stopped">
  >>;
};
void verify;
```

- [x] **Step 7: Run the focused test to green**

Run: `node --test test/core/choice.test.ts`

Expected: all Choice tests pass.

### Task 2: Add typed `judge.switch()` control flow

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/client.ts`
- Modify: `src/core/index.ts`
- Modify: `docs/specs/core.md`
- Create: `test/core/switch.test.ts`
- Modify: `test/core/types.test.ts`

**Interfaces:**
- Consumes: shared Choice pipeline, `ConfidencePolicy`, validation errors, and abort handling.
- Produces: `ChoiceBranchMeta`, `ChoiceCases`, `JudgeSwitchOptions`, and `JudgeClient.switch()`.

- [x] **Step 1: Write failing switch behavior and inference tests**

Cover selected routing, awaited heterogeneous return values, empty/invalid case
maps, provider options derived from exact case keys, below-threshold uncertainty,
threshold equality, malformed decisions executing no callback, post-provider
cancellation, and unchanged callback errors.

```ts
const result = judge.switch({
  cases: {
    billing: () => "invoice" as const,
    support: async () => "ticket" as const,
  },
  context: {},
  question: "Route this",
});
type Result = Expect<Equal<
  typeof result,
  Promise<"invoice" | "ticket">
>>;
```

- [x] **Step 2: Run the focused test and verify the red state**

Run: `node --test test/core/switch.test.ts`

Expected: FAIL because `JudgeClient` has no `switch()` method.

- [x] **Step 3: Add switch types**

```ts
export interface ChoiceBranchMeta<
  Selected extends K,
  K extends string = Selected,
> {
  decision: ChoiceDecision<K> & { value: Selected };
  invocationId: string;
}

export type ChoiceCases<
  K extends string,
  C extends Record<K, (...args: never[]) => unknown>,
> = C & {
  [P in K]: (meta: ChoiceBranchMeta<P, K>) => ReturnType<C[P]>;
};

export interface JudgeSwitchOptions<
  S,
  K extends string,
  C extends Record<K, (...args: never[]) => unknown>,
  U = never,
> {
  cases: ChoiceCases<K, C>;
  confidence?: ConfidencePolicy<U>;
  context: S;
  question: string;
  signal?: AbortSignal;
}
```

Add a const-generic `switch()` returning
`Promise<Awaited<ReturnType<C[K]>> | Awaited<U>>`.

- [x] **Step 4: Validate and snapshot the case map**

Require a non-null, non-array object with at least one enumerable own string
key. Require trimmed, non-empty keys and function values. Snapshot entries in a
`Map` before provider evaluation so later caller mutation cannot alter the
legal option set or selected callback.

- [x] **Step 5: Implement switch execution**

Validate confidence before provider evaluation, generate one `randomUUID()`,
evaluate Choice with the case keys, route below-minimum confidence only to
`uncertain`, otherwise find and execute only the selected case, and check the
signal immediately before either callback.

- [x] **Step 6: Run focused switch and core tests**

Run: `node --test test/core/switch.test.ts test/core/choice.test.ts test/core/if.test.ts`

Expected: all tests pass and existing Boolean behavior remains unchanged.

- [x] **Step 7: Lock exact switch inference and update the canonical spec**

Extend `test/core/types.test.ts` to prove that each callback sees its own
selected literal, all callbacks see the complete probability key union, async
callback results are awaited into an exact union, and uncertainty adds only its
exact return type. Update `docs/specs/core.md` with the same `ChoiceCases` and
`JudgeSwitchOptions` contracts so documentation and emitted declarations agree.

Run: `npm run typecheck`

Expected: all equality assertions compile without `any`, casts, or manually
supplied response type arguments at the call sites.

### Task 3: Add deterministic Choice mock fixtures

**Files:**
- Modify: `src/mock/index.ts`
- Modify: `test/mock/mock-provider.test.ts`

**Interfaces:**
- Consumes: `ChoiceDecision`, `ChoiceInput`, and existing mock abort/configuration behavior.
- Produces: `ChoiceFixture`, `MockProviderOptions.choice`, and a FIFO `DecisionProvider.choice()` implementation.

- [x] **Step 1: Write failing mock Choice tests**

Cover FIFO consumption, derived selected-value confidence, explicit confidence,
preserved `raw`, exhausted queue, cancellation, source fixture immutability, and
integration with `judge.switch()`.

```ts
const provider = mockProvider({
  choice: [{
    probabilities: { billing: 0.1, support: 0.9 },
    value: "support",
  }],
});
assert.equal((await provider.choice(request)).confidence, 0.9);
```

- [x] **Step 2: Run the focused test and verify the red state**

Run: `node --test test/mock/mock-provider.test.ts`

Expected: FAIL because Choice fixtures are not accepted or consumed.

- [x] **Step 3: Add Choice fixture contracts and FIFO behavior**

```ts
export interface ChoiceFixture {
  confidence?: number;
  probabilities: Readonly<Record<string, number>>;
  raw?: unknown;
  value: string;
}

export interface MockProviderOptions {
  boolean?: readonly Readonly<BooleanFixture>[];
  choice?: readonly Readonly<ChoiceFixture>[];
}
```

Copy the input queue, abort before consumption, return a `kind: "choice"`
decision, and derive omitted confidence from `probabilities[value]`. Reject an
empty queue with `ConfigurationError` code `mock_queue_exhausted`.

- [x] **Step 4: Run mock and integration tests to green**

Run: `node --test test/mock/mock-provider.test.ts test/core/switch.test.ts`

Expected: all tests pass.

### Task 4: Verify public types, packaging, and isolation

**Files:**
- Modify: `docs/superpowers/plans/2026-09-18-choice-switch.md`

**Interfaces:**
- Confirms the existing public ESM subpaths and provider-neutral build boundary remain intact.

- [x] **Step 1: Run focused and medium gates**

Run: `npm run lint && npm run typecheck && npm run build`

Expected: all commands exit zero.

- [x] **Step 2: Inspect runtime exports and core isolation**

Run the package self-import smoke check and search `dist/core` for
`mock|jev|typesafe|gateway`. Expect `choice` and `switch` on a created client,
the existing core/module exports to resolve, and no forbidden provider imports.

- [x] **Step 3: Run the full quality gate**

Run: `npm run fix && npm run check && npm run test:coverage && npm run build && npm pack --dry-run && npx ultracite doctor`

Expected: all tests and commands pass; Ultracite reports no warnings or failures.

- [x] **Step 4: Mark this plan complete**

Change every completed task checkbox in this file from `[ ]` to `[x]` only
after its corresponding verification succeeds.
