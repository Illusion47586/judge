# Core specification

[Back to README](../../README.md) · [v0.1 specification](v0.1.md)

## Role and boundary

`@brkn-labs/judge/core` defines provider-independent decisions, context,
confidence, errors, observability, and callback execution. It has no knowledge
of Jev, TypeSafe credentials, gateways, model identifiers, or vendor payloads.

Core treats providers as untrusted dependencies. A provider can select only an
outcome the application has already declared; core validates that selection
before application code runs.

## Provider contract

```ts
export interface DecisionProvider {
  boolean<S>(input: BooleanInput<S>): Promise<BooleanDecision>;

  choice<S, const O extends readonly [string, ...string[]]>(
    input: ChoiceInput<S, O>
  ): Promise<ChoiceDecision<O[number]>>;

  score<S, const L extends readonly [string, string, ...string[]]>(
    input: ScoreInput<S, L>
  ): Promise<ScoreDecision<L[number]>>;
}
```

Every input includes resolved context and an optional `AbortSignal`. Choice and
Score inputs carry non-empty literal tuples. Provider methods MUST NOT execute
callbacks, merge application context layers, or apply confidence policy.

## Decision types

### Boolean

```ts
export type BooleanDecision = {
  kind: "boolean";
  value: boolean;
  probabilityTrue: number;
  confidence: number;
  metadata?: ProviderMetadata;
  raw?: unknown;
};
```

`probabilityTrue` and `confidence` MUST be finite numbers in `[0, 1]`.
`confidence` is provider-defined and normalized; core does not reinterpret it
as an empirical probability of correctness.

### Choice

```ts
export type ChoiceDecision<K extends string> = {
  kind: "choice";
  value: K;
  probabilities: Record<K, number>;
  confidence: number;
  metadata?: ProviderMetadata;
  raw?: unknown;
};
```

The chosen value MUST be a legal option. `probabilities` MUST contain every
legal option exactly once, contain no extra option, and contain only finite
values in `[0, 1]`. Its sum MUST be within an absolute tolerance of `1e-6` from
`1`. An adapter MAY normalize drift within that tolerance and MUST reject a
larger deviation with `ProviderContractError`.

### Score

```ts
export type ScoreDecision<L extends string> = {
  kind: "score";
  score: number;
  levels: readonly L[];
  probabilities: readonly number[];
  confidence: number;
  metadata?: ProviderMetadata;
  raw?: unknown;
};
```

Score levels form an ordered, non-empty literal tuple with at least two levels.
`score` is a finite probability-weighted position between `0` and
`levels.length - 1`. `probabilities` aligns by index with `levels`, contains one
finite `[0, 1]` value per level, and follows the Choice distribution-sum
tolerance. `score()` is an experimental lower-level primitive in v0.1 and does
not have a control-flow wrapper.

## Client creation

Provider-neutral construction requires a provider:

```ts
import { createJudge } from "@brkn-labs/judge/core";

const judge = createJudge({
  provider,
  context: {
    application: "checkout",
    environment: "production",
  },
  onDecision(event) {
    logger.info(event);
  },
});
```

Core MUST reject a missing or malformed provider with `ConfigurationError`.

## Boolean control flow

```ts
export type ConfidenceThreshold = {
  minimum: number;
};

export type ConfidencePolicy<U, D = BooleanDecision> = ConfidenceThreshold & {
  uncertain: (meta: UncertainMeta<D>) => U | Promise<U>;
};

export type JudgeIfOptions<S, T, E, U = never> = {
  context: S;
  condition: string | Condition<S>;
  then: (meta: BranchMeta<true>) => T | Promise<T>;
  else: (meta: BranchMeta<false>) => E | Promise<E>;
  confidence?: ConfidencePolicy<U>;
  signal?: AbortSignal;
};

export function judgeIf<S, T, E, U = never>(
  options: JudgeIfOptions<S, T, E, U>
): Promise<Awaited<T> | Awaited<E> | Awaited<U>>;
```

The condition MUST be a non-empty string after trimming or a compatible typed
condition. A valid accepted `true` decision invokes `then`; a valid accepted
`false` decision invokes `else`; a decision below the configured threshold
invokes `uncertain`. Exactly one callback runs.

## Choice control flow

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

export type JudgeSwitchOptions<
  S,
  K extends string,
  C extends Record<K, (...args: never[]) => unknown>,
  U = never,
> = {
  context: S;
  question: string;
  cases: ChoiceCases<K, C>;
  confidence?: ConfidencePolicy<U, ChoiceDecision<K>>;
  signal?: AbortSignal;
};

export function judgeSwitch<
  S,
  const K extends string,
  const C extends Record<K, (...args: never[]) => unknown>,
  U = never,
>(
  options: JudgeSwitchOptions<S, K, C, U>
): Promise<Awaited<ReturnType<C[K]>> | Awaited<U>>;
```

The keys of `cases` are the complete legal choice set and MUST be the exact
options sent to the provider. A selected value outside those keys is a
`ProviderContractError` and executes no callback. Each callback receives a
decision whose selected value is narrowed to its own case key, while
`probabilities` retains the complete case-key union. Const type parameters
preserve literal keys and callback return values without requiring `as const`
on the case map.

A future typed reusable `ChoiceQuestion` will carry its exact key union. When
that API is added, passing a case map with a missing or additional key MUST fail
at compile time.

## Lower-level decisions

```ts
const booleanDecision = await judge.boolean({
  context,
  condition: "Is the request suspicious?",
  signal,
});

const choiceDecision = await judge.choice({
  context,
  question: "Which agent should handle this?",
  options: ["browser", "code", "research"],
  signal,
});

const scoreDecision = await judge.score({
  context,
  question: "How severe is this incident?",
  levels: ["low", "medium", "high", "critical"],
  signal,
});
```

These methods return normalized decisions and never execute application
callbacks.

## Confidence

An invocation confidence policy contains a minimum and uncertainty callback.
The minimum MUST be finite and within `[0, 1]`.

Reusable presets carry only a threshold:

```ts
type PresetConfidence = {
  minimum: number;
};
```

When an invocation uses a preset threshold, it may supply an uncertainty
handler whose minimum is optional:

```ts
type PresetInvocationConfidence<U> = {
  minimum?: number;
  uncertain: (meta: UncertainMeta) => U | Promise<U>;
};
```

The invocation minimum overrides the preset minimum. If neither supplies a
minimum, the uncertainty handler is invalid. If a preset threshold is active
but no uncertainty handler can be resolved, Judge throws `ConfigurationError`
before context resolution.

Acceptance is `decision.confidence >= minimum`. Without an effective policy,
Judge executes the provider-selected normal branch. Core does not invent
entropy, top-choice margin, or calibration behavior.

## Context composition

Judge supports four ordered layers:

```text
global < scoped < preset.getContext(input) < invocation
```

Only plain objects are mergeable layers. Judge recursively merges plain-object
properties, replaces arrays and primitive values, and treats `undefined` as an
absent override. It MUST prevent prototype pollution by ignoring or rejecting
dangerous keys such as `__proto__`, `prototype`, and `constructor`.

`withContext(context)` returns a client with an additional scoped layer. It
does not mutate its parent. `scope<T>()` creates a compile-time context
requirement and has no runtime validation in v0.1.

## Serialization

The v0.1 serialization boundary accepts:

- `null`, strings, booleans, and finite numbers;
- arrays containing supported values;
- plain objects with string keys and supported values.

It rejects functions, symbols, bigint, `NaN`, infinities, circular references,
unsupported class instances, symbol keys, accessors that throw, and objects
whose traversal fails. Dates require explicit conversion by the application.

Unsupported context throws `SerializationError` before provider invocation.
Core MUST NOT silently drop unsupported values.

## Reusable conditions and questions

```ts
const isUrgent = judge.condition<Ticket>(
  "Does this ticket require immediate attention?"
);

const supportRoute = judge.choiceQuestion<Ticket>()({
  billing: "Payments, invoices, refunds, or charges",
  technical: "Product functionality or defects",
  account: "Authentication or account access",
});
```

Conditions retain their context type. Choice questions retain their context
type, exact key union, and optional description for each choice.

## Presets

Boolean and Choice presets are distinct contracts:

```ts
export type BooleanPreset<I, C> = {
  kind: "boolean";
  name?: string;
  condition: string | Condition<C>;
  getContext?: GetContext<I, C>;
  confidence?: PresetConfidence;
  contextCache?: ContextCache<I>;
};

export type ChoicePreset<I, C, K extends string> = {
  kind: "choice";
  name?: string;
  question: ChoiceQuestion<C, K>;
  getContext?: GetContext<I, C>;
  confidence?: PresetConfidence;
  contextCache?: ContextCache<I>;
};

export type GetContextArgs<I> = {
  input: I;
  signal?: AbortSignal;
  invocationId: string;
};

export type GetContext<I, C> = (
  args: GetContextArgs<I>
) => C | Promise<C>;
```

`getContext()` runs exactly once per semantic evaluation immediately before the
provider request. Its `input` is application-only data and is not sent to the
provider. Its resolved value participates in context composition.

If `getContext()` rejects, Judge makes no provider request and executes no
callback. Context caching is disabled by default and MAY be enabled only with
an explicit TTL and cache-key function. Caching belongs to preset resolution,
not transport.

## Cancellation lifecycle

Judge checks `signal.aborted`:

1. before context resolution;
2. after context resolution and before provider invocation;
3. after provider resolution and immediately before callback execution.

The same signal is forwarded to `getContext()` and the provider. Observed
cancellation throws `AbortError`. A remote service may already have completed
work, but Judge MUST NOT begin a callback after observing cancellation.

## Callback behavior

Callbacks are application code. Judge awaits only the selected callback and
returns its result. A callback exception or rejection passes through unchanged.
Judge MUST NOT retry a callback, normalize its failure as `ProviderError`, or
execute another branch afterward.

`BranchMeta` includes invocation ID and the normalized accepted decision.
`UncertainMeta` includes invocation ID, the normalized rejected decision, and
the effective threshold. Metadata MUST NOT contain full context by default.

## Errors

```ts
export class ConfigurationError extends Error {}
export class SerializationError extends Error {}
export class ProviderError extends Error {}
export class ProviderContractError extends Error {}
export class AbortError extends Error {}
```

Public errors MAY carry a stable `code` and safe `cause`. Vendor exceptions are
not part of the public contract. Raw vendor data is opt-in and must not be
included in messages that applications commonly log.

## Observability

```ts
export type DecisionEvent = {
  id: string;
  kind: "boolean" | "choice" | "score";
  selected: string | boolean;
  confidence: number;
  outcome: "accepted" | "uncertain";
  durationMs: number;
  provider: string;
  gateway?: string;
  model?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};
```

Judge emits the event after validation and confidence routing are known and
before callback execution. The event describes the decision, not the callback
result. Hook errors are isolated and cannot change the selected callback or its
result. When configured, `onError` receives the hook failure as an
observability error.

Full context and raw provider output are excluded by default. Explicit debug
capture is sensitive and MUST be opt-in.

## Core invariants

- Provider output is validated before application code runs.
- Exactly one callback executes per control-flow invocation.
- No callback starts after cancellation is observed.
- Invalid, failed, or aborted evaluations execute no callback.
- Provider-specific configuration never appears in core types.
- `/core` has no runtime dependency path to any integration.
