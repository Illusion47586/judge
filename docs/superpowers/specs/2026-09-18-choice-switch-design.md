# Choice and Switch Design

## Goal

Add the first complete multi-way control-flow slice to Judge: a validated
lower-level `judge.choice()` decision, a typed `judge.switch()` wrapper, and
deterministic Choice fixtures in `mockProvider`.

The implementation remains provider-neutral and lives entirely in the existing
`@brkn-labs/judge/core` and `@brkn-labs/judge/mock` entry points. It adds no
runtime dependency and does not change the intentionally empty root entry.

## Public API

`judge.choice()` accepts a non-empty question, structured context, a non-empty
tuple of unique legal options, and an optional `AbortSignal`:

```ts
const decision = await judge.choice({
  question: "Where should this ticket go?",
  context: ticket,
  options: ["billing", "support", "sales"],
});
```

`judge.switch()` derives the complete legal option set from the enumerable own
keys of its `cases` object:

```ts
const result = await judge.switch({
  question: "Where should this ticket go?",
  context: ticket,
  cases: {
    billing: ({ decision }) => handleBilling(decision),
    support: ({ decision }) => handleSupport(decision),
    sales: ({ decision }) => handleSales(decision),
  },
});
```

The API has no default branch. A selected option outside the exact case keys is
a provider contract failure, not application control flow.

The case-map form is preferred over an array of entries or a fluent builder.
It is concise, cannot contain duplicate option names, and lets TypeScript infer
the complete option union and awaited callback-return union from one value.

## Types

Core adds these public contracts, following the existing naming and generic
style:

```ts
interface ChoiceOptions<
  S,
  O extends readonly [string, ...string[]],
> {
  context: S;
  options: O;
  question: string;
  signal?: AbortSignal;
}

interface ChoiceBranchMeta<Selected extends K, K extends string = Selected> {
  decision: ChoiceDecision<K> & { value: Selected };
  invocationId: string;
}

type ChoiceCases<
  K extends string,
  C extends Record<K, (...args: never[]) => unknown>,
> = C & {
  [P in K]: (meta: ChoiceBranchMeta<P, K>) => ReturnType<C[P]>;
};

interface JudgeSwitchOptions<
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

`JudgeClient.choice()` preserves the literal tuple option union.
`JudgeClient.switch()` uses const key and callback-map type parameters inferred
from the cases and returns:

```ts
Promise<Awaited<ReturnType<C[K]>> | Awaited<U>>
```

Each callback's selected decision value is narrowed to that callback's literal
key, while its probability record contains the complete literal union of all
case keys. Callback return types, including promises, are inferred rather than
supplied manually. The first implementation accepts string questions only;
reusable typed `ChoiceQuestion` definitions remain deferred.

The same request-directed rule applies to Boolean control flow. `then` receives
`decision.value: true`, `else` receives `decision.value: false`, and `if()`
returns the exact awaited union of both callbacks plus `uncertain` when present.
No public control-flow response type uses `any` or widens a known literal result
to `string`, `boolean`, or `unknown`.

## Validation

Judge validates all local configuration before invoking the provider:

- `question` must be a string and non-empty after trimming;
- `options` must contain at least one string;
- every option must be non-empty after trimming;
- every option must already equal its trimmed form so runtime values continue to
  match their TypeScript literals;
- options must be unique;
- `switch()` must contain at least one enumerable own case;
- every case key must be non-empty after trimming and must already equal its
  trimmed form;
- every case value must be a function;
- a configured confidence minimum must be finite and within `[0, 1]`.

Judge treats the Choice provider response as untrusted. A valid decision must:

- have `kind: "choice"`;
- select one of the exact requested options;
- contain a finite confidence in `[0, 1]`;
- contain a non-null, non-array object of probabilities;
- contain every legal option exactly once and no additional keys;
- assign every option a finite probability in `[0, 1]`;
- have a probability sum within an absolute tolerance of `1e-6` from `1`.

Malformed configuration raises `ConfigurationError`. Malformed provider output
raises `ProviderContractError`. Neither path executes an application callback.
Only enumerable own string keys participate in the exact-key comparison. Core
validates but does not renormalize provider probabilities.

## Execution Flow

`choice()` normalizes and validates its question and option tuple, checks
cancellation, invokes `provider.choice()`, checks cancellation again, validates
the returned decision, and returns it.

`switch()` performs this sequence:

1. Validate the confidence policy and complete case map.
2. Create one invocation identifier.
3. Evaluate through the same Choice pipeline using the case keys as options.
4. If confidence is below the configured minimum, re-check cancellation and
   execute only `uncertain`.
5. Otherwise, re-check cancellation and execute only the selected case.
6. Await and return the selected callback result.

Threshold equality is accepted. Application callback exceptions pass through
unchanged. Judge never speculatively invokes cases and never turns callback
failures into provider failures.

## Mock Provider

`mockProvider()` adds an optional `choice` FIFO fixture queue:

```ts
const provider = mockProvider({
  choice: [
    {
      value: "support",
      probabilities: {
        billing: 0.1,
        support: 0.8,
        sales: 0.1,
      },
    },
  ],
});
```

A Choice fixture contains `value`, `probabilities`, and optional `confidence`
and `raw`. When confidence is omitted, the mock derives it from the probability
assigned to the selected value. The provider copies queue arrays, does not
mutate fixture objects, observes cancellation, and reports a stable
`mock_queue_exhausted` configuration error when the Choice queue is empty.

The mock does not validate whether a fixture matches the current request.
That deliberately exercises core's public provider-response validation when the
mock is used through a Judge client. Direct provider calls remain deterministic
fixture reads.

## Testing and Verification

Focused tests cover:

- valid lower-level Choice decisions and trimmed questions;
- empty, duplicate, or malformed local options;
- impossible selected values;
- missing, additional, invalid, and incorrectly summed probabilities;
- selected case routing and awaited return unions;
- per-case selected-value narrowing and complete probability-key inference;
- Boolean `then`/`else` literal narrowing and exact awaited return unions;
- below-threshold uncertainty and equality-at-threshold acceptance;
- exactly one callback;
- pre-provider and pre-callback cancellation;
- unchanged callback exceptions;
- FIFO Choice mock fixtures, derived confidence, exhaustion, cancellation, and
source fixture immutability.

Compile-time contract tests use type equality assertions and compile under the
normal `npm run typecheck` gate. Runtime validation remains mandatory because a
provider response is untrusted even when its provider implementation satisfies
the TypeScript interface. Internal assertions are permitted only after the
corresponding value has passed exhaustive validation.

The full gate remains `npm run fix`, `npm run check`, `npm run test:coverage`,
`npm run build`, package self-import checks, core output boundary inspection,
`npm pack --dry-run`, and `npx ultracite doctor`.

## Deferred Scope

Reusable `ChoiceQuestion` definitions, presets, context composition,
serialization, Score control flow, default/fallback cases, and provider-specific
Choice transport remain outside this slice.
