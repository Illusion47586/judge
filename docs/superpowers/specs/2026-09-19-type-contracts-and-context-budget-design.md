# Public Type Contracts and Context Budget Design

**Date:** 2026-09-19
**Status:** Approved design

## Summary

Judge will strengthen its type-safety proof with compile-time consumer contracts
and add an opt-in, advisory context-budget warning for Jev requests. Provider
context-window rejections will be normalized into a dedicated public error.

The warning is deliberately approximate. TypeSafe AI currently advertises a
32K context window for Jev, but it does not publish the tokenizer needed for an
exact local count. Judge will therefore tell users about the limit, estimate
the complete serialized request, and preserve the provider as the final
authority.

## Goals

- Prove request-directed return types through the built public package.
- Prove invalid consumer programs are rejected by TypeScript.
- Warn opt-in users before a Jev request approaches a configured context limit.
- Apply the same behavior to direct TypeSafe, Vercel, Cloudflare, OpenRouter,
  and custom Jev-compatible gateways.
- Normalize authoritative provider context-limit failures into a stable Judge
  error without misclassifying unrelated bad requests.
- Keep warning behavior side-effect free unless the consumer explicitly
  supplies a callback.

## Non-goals

- Claiming exact token counts without an official Jev tokenizer.
- Rejecting a request based only on the local estimate.
- Reading a model limit from a remote catalog at runtime.
- Logging warnings to the console or emitting Node process warnings.
- Adding context-budget behavior to the provider-neutral `/core` client.
- Encoding semantic constraints such as trimmed strings or unique tuple values
  in TypeScript. Those remain runtime validations.

## Public API

The root Jev-backed `createJudge()` options gain an optional
`contextBudget` property:

```ts
const judge = createJudge({
  gateway,
  contextBudget: {
    maxTokens: 32_768,
    warnAt: 0.8,
    onWarning: ({ estimatedTokens, maxTokens, ratio, model }) => {
      telemetry.capture("judge.context.warning", {
        estimatedTokens,
        maxTokens,
        ratio,
        model,
      });
    },
  },
});
```

The public types are:

```ts
interface ContextBudgetOptions {
  readonly maxTokens: number;
  readonly onWarning: (
    warning: Readonly<ContextBudgetWarning>
  ) => void | Promise<void>;
  readonly warnAt?: number;
}

interface ContextBudgetWarning {
  readonly code: "context_window_approaching";
  readonly estimatedTokens: number;
  readonly maxTokens: number;
  readonly model: string;
  readonly ratio: number;
  readonly warnAt: number;
}
```

`warnAt` defaults to `0.8`. Supplying `contextBudget` is the opt-in mechanism;
Judge has no global warning handler and produces no implicit output.

Judge also exports `ContextLimitError extends ProviderError`. Its stable error
code is `context_limit`, and the original transport or provider error remains
available as `cause`.

## Architecture

Context-budget behavior belongs in the Jev provider, immediately before the
gateway boundary. At that point Judge has the complete normalized request:

```text
typed Judge input
  -> runtime input validation
  -> JSON-safe state serialization
  -> complete Jev state-and-questions request
  -> optional context-budget estimate and callback
  -> gateway transport
  -> provider response normalization
```

This single boundary covers every Jev transport without duplicating logic in
individual gateway adapters. The provider-neutral `/core` entry point remains
unaware of Jev models and token limits.

The root `createJudge()` passes the optional policy into `createJevProvider()`.
Both direct API-key configuration and explicit gateway configuration expose the
same option.

## Estimation and Warning Behavior

Judge serializes the complete `GatewayEvaluationRequest` and estimates tokens
as:

```text
ceil(UTF-8 byte length / 4)
```

The estimate includes serialized state, question instructions, choice labels,
score levels, property names, and JSON structure. It is named
`estimatedTokens` everywhere and documented as a heuristic.

Before transport, Judge computes `ratio = estimatedTokens / maxTokens`. When
the ratio is greater than or equal to `warnAt`, Judge invokes `onWarning`
exactly once for that evaluation and awaits its result. Judge then sends the
request regardless of the estimated size.

If `onWarning` throws or rejects, that error propagates unchanged and Judge
does not send the request. This makes callback ordering deterministic and
avoids silent observability failures.

Judge validates the policy during construction:

- `maxTokens` must be a positive integer.
- `warnAt` must be a finite number greater than zero and at most one.
- `onWarning` must be a function.

Invalid policies throw `ConfigurationError` before any evaluation.

## Provider Error Normalization

Gateway error normalization will recognize context-limit failures only when
the provider supplies an explicit context-related error type/code or an
unambiguous context-window message. Recognized signals include canonical types
such as `context_length_exceeded` and messages that pair a context/token limit
with an exceeded/maximum condition.

An HTTP `400`, `413`, or `422` status alone is insufficient. Unrelated bad
requests keep their existing classification. A recognized failure becomes:

```ts
new ContextLimitError("The request exceeds the model context window.", {
  cause,
});
```

Direct TypeSafe and gateway transports must feed their errors through the same
classification behavior wherever their error shapes permit it.

## Documentation

The README will state that Jev currently advertises a 32K context window and
that limits may change by model or provider. The example configuration will
use `maxTokens: 32_768`, but the SDK will not silently hard-code that value.

Documentation will distinguish three concepts:

- context window: how much serialized input a single evaluation can accept;
- request rate limit: how frequently a model may be called;
- account credit or quota: how much usage an account may purchase or consume.

It will explicitly describe the local estimate as advisory and the provider
response as authoritative.

## Compile-time Type Contracts

Judge will add a dedicated consumer type-contract project that compiles against
the built package exports. It will not import `src/` files directly.

Positive contracts will assert exact types for:

- `choice()` values and probability keys derived from the request tuple;
- `score()` level unions derived from the ordered level tuple;
- `if()` Boolean branch narrowing and the awaited union of branch and uncertain
  return values;
- `switch()` per-case decision narrowing, complete probability keys, and the
  awaited union of all case and uncertain return values;
- root and subpath public exports added by this feature.

Negative contracts will use `@ts-expect-error` so the build fails if an invalid
program becomes accepted. They will cover:

- undeclared choice values and probability keys;
- empty choice tuples;
- score tuples with fewer than two levels;
- invalid callback metadata assumptions;
- impossible `if()` branch values;
- incompatible assignments from `if()` and `switch()` return unions;
- invalid context-budget configuration shapes.

The contract typecheck will build declarations first, then invoke `tsc
--noEmit` with a dedicated configuration. It will become part of `npm run
check`.

## Runtime Verification

Focused unit tests will cover:

- estimates below, exactly at, and above the warning threshold;
- UTF-8/multibyte request content;
- complete request coverage rather than context-only estimation;
- exactly-once callback invocation;
- awaiting asynchronous callbacks before transport;
- callback failure preventing transport;
- invalid policy construction;
- no callback when the feature is absent or below threshold;
- explicit context-limit provider errors becoming `ContextLimitError`;
- ordinary `400` and `422` errors retaining their existing classification.

Existing malformed-provider tests continue to verify the runtime half of the
type-safety boundary: external data must be validated before it is exposed as a
typed decision.

## Tree-shaking and Compatibility

The estimator will use platform primitives only and add no dependency. The
provider-neutral `/core` graph will remain isolated from Jev and gateway code.
No optional gateway dependency will move into the root graph.

The new types and error are additive root exports. Existing users who omit
`contextBudget` retain identical request and error behavior except that an
unambiguous context-window rejection receives the more precise public error
subclass and code.

## Acceptance Criteria

- Built-package consumer contracts pass for every Judge primitive.
- Each important invalid program is guarded by a used `@ts-expect-error`.
- The opt-in callback receives a deterministic immutable warning before
  transport at or above the configured threshold.
- Estimation never blocks a request by itself.
- Context-limit failures are precisely normalized and retain their cause.
- README guidance covers Jev's advertised 32K context window and explains that
  the estimate is approximate.
- Lint, source typecheck, consumer-contract typecheck, unit tests, build, and
  package dry run all pass.
