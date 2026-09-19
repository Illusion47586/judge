# Public JSDoc Design

**Date:** 2026-09-19
**Status:** Approved design

## Summary

Judge will provide editor-native documentation for its complete public package
surface. Every exported declaration and every public property or method will be
documented at its source definition so TypeScript preserves the documentation
in emitted declaration files and consumers see it through IntelliSense.

Examples will use real `@brkn-labs/judge` package imports. The change will add
no documentation generator or runtime dependency.

## Goals

- Document every public symbol exposed by the root, `/core`, gateway, and
  `/mock` entry points.
- Document every property and method on public interfaces.
- Provide complete package-import examples for primary factories and Judge
  methods.
- Explain operational behavior that affects billing, retries, callback
  execution, uncertainty, context limits, cancellation, and errors.
- Preserve comments in distributed `.d.ts` files.
- Make undocumented future public exports detectable in tests.

## Non-goals

- Generating or hosting a TypeDoc website.
- Adding TypeDoc, API Extractor, or another documentation dependency.
- Duplicating full examples on simple metadata interfaces.
- Treating provider metadata or `raw` payloads as stable schemas.
- Claiming an exact Jev tokenizer, permanent context window, or permanent
  provider rate limit.
- Documenting internal helpers that cannot be imported from package exports.

## Documentation Format

Comments will use a TypeDoc-compatible JSDoc subset:

- a concise summary on every public symbol and member;
- `@remarks` for lifecycle, billing, validation, or compatibility details;
- `@example` on factories and all Judge methods;
- `@param` and `@returns` on public functions;
- `@throws` for configuration, transport, cancellation, provider-contract, and
  application-callback failures where applicable;
- `@defaultValue` for optional settings with SDK defaults;
- `@see` and `{@link ...}` for directly related public APIs.

Documentation will be written where the declaration originates, not only on a
barrel re-export. This lets editor tooling follow re-exports to the documented
symbol and avoids divergent copies of the same contract.

## Coverage

### Root entry point

- `createJudge`
- `CreateJudgeOptions`
- `GatewayJevOptions`
- direct Jev configuration, retry configuration, context-budget configuration,
  and context-budget warning data
- all root-exported errors and decision/control-flow types

### Provider-neutral core

- `createJudge` and `CreateJudgeOptions`
- `JudgeClient` methods: `boolean`, `choice`, `score`, `if`, and `switch`
- Boolean, Choice, and Score inputs, options, and decision results
- `DecisionProvider`
- branch metadata, choice-case metadata, confidence policy, and uncertain
  metadata
- every public error class

Method documentation will explain exact request-directed inference. For
example, `choice()` derives its result union and probability keys from the
provided tuple, while `switch()` derives legal outcomes from case keys and
returns the awaited union of callback results.

### Gateway protocol and adapters

- gateway request, result, metadata, options, capabilities, plugin, and Jev
  question types
- `defineGateway`
- `vercelGateway` and `VercelGatewayOptions`
- `cloudflareGateway` and `CloudflareGatewayOptions`
- `openRouterGateway` and `OpenRouterGatewayOptions`

Each adapter will identify required credentials or bindings, optional peer
dependencies, default model behavior, timeout and abort behavior, and whether
calling the resulting Judge client may perform remote billable work.

### Direct Jev transport

- `DirectJevOptions`
- `RetryOptions`
- relevant limits, URL requirements, timeout units, retry behavior, and the
  duplicate-billing caveat for retries

### Mock provider

- `mockProvider`
- `MockProviderOptions`
- `BooleanFixture`
- `ChoiceFixture`

Mock documentation will explain FIFO consumption, exhaustion behavior,
immutability, cancellation, and its intended use in deterministic tests.

## Content Rules

- Lead with observable consumer behavior rather than implementation detail.
- State explicitly when a call can initiate remote, potentially billable work.
- State that `if()` and `switch()` execute exactly one application callback
  after a validated provider decision and never speculate across callbacks.
- Describe confidence and probability ranges as inclusive values from zero to
  one.
- Document score ordering and numeric score range relative to the number of
  supplied levels.
- Document time values in milliseconds and size values in bytes.
- Describe `raw` and provider-specific metadata as unstable diagnostic data.
- Describe the context estimate as advisory and provider errors as
  authoritative.
- Avoid repeating marketing copy in property-level documentation.

## Examples

Primary public factories and every `JudgeClient` method will include an
`@example` block. Examples will:

- import from `@brkn-labs/judge` or the exact documented subpath;
- be short enough for an editor hover;
- contain all required configuration and request properties;
- show literal inference without unnecessary type assertions;
- avoid embedding real credentials;
- note remote or billable behavior when applicable;
- use callbacks that make the inferred return union understandable.

Simple data interfaces receive summaries and property documentation rather
than repetitive example blocks.

## Error Documentation

Every public error class will document its stable default `code` and when it is
raised. Function-level `@throws` tags will reference the applicable error
classes:

- `ConfigurationError` for invalid local setup or request configuration;
- `SerializationError` for non-JSON-compatible context;
- `AbortError` for caller cancellation;
- `ProviderError` for transport and provider failures;
- `ContextLimitError` for explicit provider context-window rejection;
- `ProviderContractError` for malformed or impossible provider responses.

Application callback errors from `if()`, `switch()`, confidence handlers, and
context-warning handlers propagate unchanged and will be documented as such.

## Verification Architecture

A new Node test will use a dependency-free source scanner to inspect source
declarations. TypeScript 7 no longer exposes the stable parser API from its
package root, so the scanner uses an explicit public-surface manifest that maps
public symbols and members to their source files.

For every manifested declaration, the test will require:

- at least one JSDoc block on the declaration;
- JSDoc on every public interface property and method;
- an `@example` tag for factories and Judge methods;
- no empty summaries or empty required tags.

The manifest will enumerate the symbols reachable from package exports. When a
new public export is added, its source declaration must be deliberately added
to the manifest and documented.

A second assertion will build the package and inspect emitted declaration
files. It will verify representative root, core, gateway, and mock comments are
present, proving the distribution retains editor documentation.

The documentation test will not parse or execute example code. Existing
built-package consumer type contracts remain the executable source of truth
for the examples' API shapes, and implementation will keep equivalent snippets
there where a new public shape is introduced.

## Tree-shaking and Compatibility

JSDoc is erased from JavaScript output and retained only in declaration files.
It adds no runtime import or side effect. The source scanner uses only Node
standard-library modules and runs only in tests.

No runtime signature or public type shape changes are required. Package entry
points and optional peer boundaries remain unchanged.

## Acceptance Criteria

- Every public declaration in the manifest has meaningful JSDoc.
- Every public interface property and method has meaningful JSDoc.
- Every factory and Judge method has a package-import `@example`.
- Operational caveats and stable error codes are documented.
- Representative comments survive in emitted `.d.ts` files.
- Documentation completeness tests pass.
- Existing source typecheck, consumer-contract typecheck, example typecheck,
  unit tests, tree-shaking checks, build, and package dry run pass.
- No live provider request is made during verification.
