# Roadmap

[Back to README](../README.md) · [v0.1 specification](specs/v0.1.md)

The roadmap records direction, not release promises. Inclusion, order, and API
shape may change after implementation experience and user feedback.

## v0.1 — specified

The v0.1 specification covers:

- ESM-only `@brkn-labs/judge` with side-effect-free subpath exports;
- default Jev through a direct TypeSafe API key or explicit gateway;
- provider-neutral construction through `/core`;
- Boolean and Choice control-flow wrappers;
- lower-level Boolean, Choice, and experimental Score decisions;
- typed conditions, choice questions, and fresh-context presets;
- global, scoped, preset-resolved, and invocation context layers;
- minimum-confidence uncertainty routing;
- stable errors, cancellation, timeouts, and observability hooks;
- deterministic mock-provider testing;
- Vercel, Cloudflare, and OpenRouter gateway contracts;
- bundle-analysis requirements for complete integration tree-shaking.

The specification does not imply that these components are already implemented.

## Candidate v0.2 work

### Runtime schemas

Accept Standard Schema-compatible validators, including Zod, for runtime
context and decision-boundary validation while preserving inference.

### Richer confidence policy

Explore minimum top-choice margin, entropy limits, per-case thresholds,
calibration profiles, and application-defined acceptance predicates. Policies
must remain explicit and must not change existing `if()` or `switch()`
semantics silently.

### Batch evaluation

Evaluate several independent questions against shared state when a provider can
preserve typed results and per-question validation. Batching must not imply
speculative callback execution.

### OpenTelemetry

Add spans and metrics using normalized metadata without capturing full context
or raw responses by default.

### Framework adapters

Provide optional integrations for workflow engines and agent runtimes without
moving orchestration concerns into core.

## Research tracks

### Local and open providers

Investigate local Jev-compatible or alternative constrained-decision providers.
Any provider must satisfy the same decision and error contracts as the default
adapter.

### Retrieval and context compression

Explore reference retrieval, context selection, and compression as optional
layers. Core should continue to accept resolved structured context without
becoming a retrieval framework.

### Calibration and datasets

Develop tools for recording decisions, outcomes, drift, and threshold quality.
Calibration claims require application-specific evidence rather than provider
confidence alone.

### Policy evaluation tooling

Investigate offline replay, threshold simulation, and cost/accuracy trade-off
analysis using recorded normalized decisions.

## Explicitly uncommitted ideas

- A policy DSL spanning confidence, margin, entropy, and case-specific rules.
- Persistent decision caches beyond explicit preset context caching.
- Multi-provider fallback and consensus.
- A compiler transform or custom syntax.
- Model-generated callback code.

The last two conflict with Judge's current product boundary and would require a
new design, not an incremental extension.
