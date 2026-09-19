# Decision lifecycle

[Back to README](../../README.md) · [v0.1 specification](../specs/v0.1.md) · [core specification](../specs/core.md)

## Overview

A Judge control-flow call crosses a deliberate boundary from application data
to probabilistic evaluation and back to deterministic execution. No application
callback can run until every preceding stage succeeds.

```text
Application    Core                Provider             Callback
    |           |                     |                    |
    | invoke    |                     |                    |
    |---------->| validate            |                    |
    |           | resolve context     |                    |
    |           | compose + serialize |                    |
    |           |-------------------->| evaluate           |
    |           |<--------------------| decision           |
    |           | validate + gate     |                    |
    |           | check cancellation  |                    |
    |           |----------------------------------------->| run once
    |           |<-----------------------------------------| result
    |<----------| return              |                    |
```

## 1. Validate configuration

Judge validates everything it can without I/O: non-empty conditions, non-empty
case maps, finite confidence thresholds in `[0, 1]`, mutually exclusive direct
and gateway transport options, provider capabilities, and the initial
`AbortSignal` state.

Invalid configuration throws `ConfigurationError`. An already-aborted signal
throws `AbortError`. Neither condition resolution nor provider evaluation has
started, and no callback can run.

## 2. Resolve fresh preset context

When an invocation uses a preset with `getContext()`, Judge calls it exactly
once with application input, the invocation ID, and the same `AbortSignal` used
throughout evaluation.

`input` is an application concern. It may contain identifiers, clients, or data
that should never reach the model. Only the resolved context participates in
provider state.

If context resolution rejects, the error passes through its documented context
resolution boundary. Judge makes no provider request and executes no callback.

## 3. Compose context layers

Judge creates effective context in this precedence order:

```text
global < scoped < preset.getContext(input) < invocation
```

Plain objects merge recursively. Arrays and primitive values replace inherited
values. An `undefined` property does not delete an inherited value. Dangerous
prototype keys are rejected or ignored safely.

The composed value is unique to the invocation and does not mutate the client,
scope, preset, or caller's input.

## 4. Serialize provider input

Judge traverses effective context before provider invocation. JSON-compatible
primitives, arrays, and plain objects are accepted. Circular references,
functions, symbols, bigint, non-finite numbers, unsupported class instances,
and failed property access throw `SerializationError`.

Unsupported values are never silently removed. Applications convert types such
as `Date` explicitly so model-visible state remains intentional and inspectable.

## 5. Evaluate

Judge checks cancellation again, then calls the configured `DecisionProvider`.
The provider receives structured context, one constrained semantic question,
the exact legal option or level set, and the shared signal.

The default Jev provider uses either the direct TypeSafe transport or one
explicit gateway. Provider and gateway code cannot see callback functions and
cannot execute application branches.

## 6. Normalize and validate

Provider output is untrusted. The adapter and core jointly ensure the decision
kind is expected, every numeric value is finite and in range, the selected value
is legal, and a probability record has the exact requested key set and valid
sum.

An invalid response throws `ProviderContractError`. Transport or remote
execution failures throw `ProviderError`. No callback runs after either error.

## 7. Apply confidence policy

Judge compares normalized confidence with the effective threshold:

```text
confidence >= minimum -> selected normal callback
confidence < minimum  -> uncertainty callback
```

Equality passes. When no confidence policy exists, the valid selected normal
branch runs regardless of confidence. Judge does not infer entropy, margin, or
calibration semantics.

This stage identifies the callback but does not invoke it yet.

## 8. Re-check cancellation

Judge checks the signal immediately before calling application code. This closes
the race in which cancellation occurs while the provider is evaluating or
after its promise resolves.

An upstream service may already have processed and billed the request. Local
cancellation cannot undo remote work; it guarantees that Judge will not begin
an application callback after observing the abort.

## 9. Execute one callback

Judge invokes exactly one of `then`, `else`, a selected `cases` function, or
`uncertain`. It never speculates across callbacks or runs another callback when
the selected one fails.

Callbacks are application code. Their exceptions and rejected promises pass
through unchanged. They are not provider failures and are never automatically
retried.

## 10. Emit metadata and return

Judge emits normalized decision metadata without full context or raw provider
output by default. Observability describes evaluation and routing, not callback
business results.

Hook failures are isolated and may be reported through `onError`; they cannot
change the callback or its result. Judge awaits the selected callback and
returns that value to the caller.

## Failure boundaries

| Stage | Failure | Provider called? | Callback called? |
| --- | --- | --- | --- |
| Configuration | `ConfigurationError` | No | No |
| Context resolution | Application/context error | No | No |
| Serialization | `SerializationError` | No | No |
| Transport/evaluation | `ProviderError` or `AbortError` | Maybe | No |
| Contract validation | `ProviderContractError` | Yes | No |
| Final cancellation check | `AbortError` | Yes | No |
| Observability hook | Reported through `onError` | Yes | Yes, as selected |
| Application callback | Original callback error | Yes | Exactly one attempted |

The normative requirements live in the [core specification](../specs/core.md).
This document explains their order and operational consequences.
