# Judge Documentation Design

## Objective

Create a coherent documentation system for Judge from the existing “Semantic Control Flow for TypeScript — Jev SDK Technical Specification.” Judge is the product; Jev is its first decision-provider adapter. The new documentation must preserve the source specification’s useful contracts while resolving its inconsistencies, repairing its Markdown, and separating stable core semantics from changeable provider and gateway details.

## Product identity

- Product: **Judge**
- Organization: **BRKN Labs**
- npm package: **`@brkn-labs/judge`**
- Repository: **`brkn-labs/judge`**
- Factory: **`createJudge()`**
- Client instance: **`judge`**
- Positioning: **Probabilistic judgment. Deterministic execution.**

The public examples use `judge.if()` and `judge.switch()`. Documentation may use “semantic decision” as a technical term, but it must not use Jev as the SDK or product name.

## Product boundary

Judge turns constrained probabilistic decisions into typed TypeScript control flow. A decision provider selects an outcome; Judge validates it, applies confidence policy, and invokes exactly one callback owned by the application.

Judge never executes model-generated code. Core does not perform retrieval, silently retry decisions, speculate across branches, or treat uncalibrated probabilities as correctness guarantees.

Jev remains the first supported provider. It is documented as an adapter behind Judge’s provider contract, not as a dependency of core semantics.

## Documentation structure

```text
README.md
docs/
  product/
    vision.md
  specs/
    v0.1.md
    core.md
    provider-jev.md
    gateway-plugins.md
  architecture/
    decision-lifecycle.md
  roadmap.md
```

### `README.md`

The approachable entry point. It explains the product in one screen, shows a minimal `judge.if()` example, states the safety boundary, lists subpath imports, and links to deeper documentation. It is descriptive rather than normative.

### `docs/product/vision.md`

The durable product thesis, target use cases, design principles, goals, and non-goals. It explains why explicit uncertainty is useful and why deterministic application callbacks remain outside the provider.

### `docs/specs/v0.1.md`

The canonical v0.1 contract and source of truth. It defines scope, public API, required behavior, runtime invariants, errors, observability, acceptance criteria, and deferred features. It links to focused specifications instead of duplicating their details.

Normative language uses **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** deliberately.

### `docs/specs/core.md`

The provider-independent technical specification. It defines decision types, provider interfaces, `if` and `switch`, lower-level primitives, confidence handling, context composition, reusable definitions, presets, serialization boundaries, cancellation, callback execution, and TypeScript inference requirements.

### `docs/specs/provider-jev.md`

The Jev adapter specification. It maps Judge Boolean, Choice, and Score requests onto Jev’s state-and-questions protocol, defines normalization and contract validation, and isolates upstream experimental APIs. It contains no control-flow callback behavior.

### `docs/specs/gateway-plugins.md`

The transport plugin specification. It defines the gateway interface, capability checks, normalized metadata and errors, gateway-specific configuration boundaries, initial Vercel/Cloudflare/OpenRouter support, and the shared gateway contract-test requirements.

### `docs/architecture/decision-lifecycle.md`

An explanatory walkthrough of one evaluation:

```text
validate configuration
  -> resolve preset context
  -> compose context layers
  -> serialize provider input
  -> evaluate through provider
  -> normalize and validate decision
  -> apply confidence policy
  -> re-check cancellation
  -> execute exactly one callback
  -> emit observability event
  -> return callback result
```

It clarifies failure and cancellation boundaries without becoming a second normative specification.

### `docs/roadmap.md`

The explicitly deferred surface: runtime schemas, retrieval and context compression, calibration tooling, batching, richer confidence policies, OpenTelemetry, local providers, and framework adapters.

## Distribution and imports

Judge v0.1 is one ESM-only npm package with explicit subpath exports:

```ts
import { createJudge } from "@brkn-labs/judge";
import { createJudge as createCoreJudge } from "@brkn-labs/judge/core";
import { mockProvider } from "@brkn-labs/judge/mock";
import { vercelGateway } from "@brkn-labs/judge/gateway/vercel";
```

The root entry point is the batteries-included Jev experience. It supports two
mutually exclusive, explicit transport configurations:

```ts
const direct = createJudge({
  apiKey: process.env.TYPESAFE_API_KEY!,
});

const routed = createJudge({
  gateway: vercelGateway({ apiKey: process.env.AI_GATEWAY_API_KEY! }),
});
```

The direct path uses the first-party TypeSafe API, defaults to the current
`jev-latest` model alias, and calls `POST /v1/systemone` with Node's built-in
`fetch`. It accepts optional model, base URL, timeout, response-size, and
explicit retry configuration. Judge must not read credentials implicitly or
silently select a gateway. Applications pass the TypeSafe API key directly to
`createJudge()` when using the direct path.

The `/core` entry point is the provider-neutral experience. Its
`createJudge({ provider })` factory requires an explicit `DecisionProvider` and
has no dependency path to Jev, the direct TypeSafe transport, or a gateway
implementation.

Additional gateway routes are:

```text
@brkn-labs/judge/gateway/cloudflare
@brkn-labs/judge/gateway/openrouter
```

The documentation must not present separately published integration packages for v0.1.

## Tree-shaking contract

Complete tree-shaking is a product requirement, not an incidental bundler optimization.

- The package declares `"sideEffects": false`.
- The root entry point includes the default Jev adapter and direct TypeSafe
  transport, but does not include optional gateways or non-Jev providers.
- The `/core` entry point exports only provider-independent APIs and must not
  import or re-export Jev, mock, TypeSafe, or gateway implementations.
- Each public subpath is an independent ESM entry point.
- There is no global plugin registry or import-time registration.
- Provider and gateway modules do not perform import-time side effects.
- Provider-specific dependencies remain unreachable from the `/core` module
  graph.
- Importing one integration must not load sibling integrations.
- Release verification includes bundle-analysis fixtures proving unused integrations are absent.

“Complete tree-shaking” therefore has an explicit boundary: consumers choosing
the root receive Jev because it is Judge's default; consumers choosing `/core`
receive no Jev or transport code. In both cases, every unrelated optional
integration must be absent from the resulting bundle.

Tree-shaking requirements belong in both the v0.1 acceptance criteria and the gateway/provider specifications where applicable.

## Source-specification reconciliation

The new specifications resolve the following ambiguities rather than copying them:

1. Preset confidence configuration and invocation uncertainty handling are distinct. A preset may supply an acceptance threshold; the invocation supplies the callback that executes when the threshold fails.
2. Reusable presets have explicit Boolean and Choice forms rather than one type that claims to represent both while containing only `condition`.
3. Cancellation is checked before evaluation, propagated through context resolution and transport, and checked again immediately before user callback execution.
4. Observability distinguishes evaluation metadata from callback results. Hook failures cannot change the selected branch or returned application value.
5. Serialization behavior explicitly rejects unsupported values and circular structures instead of relying on an undefined notion of serializability.
6. Probability validation defines finite `[0, 1]` values, complete legal option sets, and a documented tolerance for floating-point distribution drift.
7. `score()` may be specified as an experimental primitive if its v0.1 acceptance criteria remain weaker than Boolean and Choice support.
8. Package names and imports consistently use `@brkn-labs/judge` subpaths.
9. The root factory defaults to Jev through either an explicit TypeSafe API key
   or an explicit gateway. Provider-neutral construction uses `/core`.
10. The direct adapter uses Node's built-in `fetch`, maps Judge Boolean to
    TypeSafe `noul`, and preserves TypeSafe Score as a numeric weighted result
    rather than inventing a selected level.

## Documentation consistency rules

- Every public example must type-check against the eventual package API.
- A concept has one normative definition; other documents link to it.
- Provider-specific fields never appear in core public types.
- Examples never concatenate structured context into prompt strings.
- Examples never execute generated code or multiple candidate callbacks.
- Full context and raw provider output are treated as sensitive and excluded from default logging.
- Current upstream model identifiers and experimental APIs are dated assumptions, not permanent guarantees.

## Verification

Documentation work is complete when:

- All planned documents exist and link to one another correctly.
- Searches find no stale Verdict product name or “Jev SDK” branding, except when discussing the original source or the Jev adapter.
- Code examples consistently use `createJudge()` and the documented subpaths.
- The normative specs contain no contradictory confidence, context, cancellation, or packaging rules.
- Markdown passes the repository’s Ultracite checks where supported.
- The documentation contains no malformed heading fragments inherited from the source document.
- The v0.1 acceptance criteria include bundle-analysis tests for the complete tree-shaking contract.

## Out of scope

This documentation phase does not implement the Judge runtime, provider adapters, gateway transports, build pipeline, or bundle-analysis fixtures. It defines the contracts those implementations must satisfy.
