# Judge Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the project to Judge and produce a coherent, internally consistent documentation set derived from the original Jev SDK specification.

**Architecture:** Judge is one ESM-only package with a batteries-included Jev root and a provider-neutral `/core` subpath. Documentation is layered into product intent, normative specifications, an explanatory lifecycle, and a roadmap; each concept has one normative owner and other documents link to it.

**Tech Stack:** Markdown, TypeScript examples, Node.js 22.18+, npm, Ultracite/Biome, Node's native test runner.

## Global Constraints

- Product name is **Judge**; package name is **`@brkn-labs/judge`**.
- Public factory and client names are **`createJudge()`** and **`judge`**.
- Positioning line is **“Probabilistic judgment. Deterministic execution.”**
- Jev is Judge's default provider, not the product identity.
- `createJudge({ apiKey })` uses the direct TypeSafe API; `createJudge({ gateway })` uses an explicit gateway.
- Credentials and gateway selection are always explicit. Judge does not silently read environment variables or choose a gateway.
- `@brkn-labs/judge/core` is provider-neutral and must have no dependency path to Jev, TypeSafe, mock, or gateways.
- The package is ESM-only, declares `"sideEffects": false`, and exposes integrations through independent subpath exports.
- The root includes Jev but no optional gateway or non-Jev provider. Unrelated integrations must tree-shake completely.
- Models select constrained outcomes; TypeScript validates; application callbacks execute. Judge never executes generated code.
- Exactly one application callback executes after a valid, accepted decision.
- The original source at `/Users/dhruvtiwari/Developer/personal/Semantic Control Flow for TypeScript — Jev SDK Technical Specification.md` is reference material, not a file to edit.
- The workspace is not currently a Git repository, so this plan does not include commit steps.

---

### Task 1: Rename the project and package

**Files:**
- Move: `/Users/dhruvtiwari/Developer/verdict` to `/Users/dhruvtiwari/Developer/judge`
- Modify: `/Users/dhruvtiwari/Developer/judge/package.json`
- Modify: `/Users/dhruvtiwari/Developer/judge/package-lock.json`
- Modify: `/Users/dhruvtiwari/Developer/judge/test/index.test.ts`

**Interfaces:**
- Consumes: the approved Judge identity and the existing Node/TypeScript scaffold.
- Produces: a working `@brkn-labs/judge` package scaffold at `/Users/dhruvtiwari/Developer/judge`.

- [x] **Step 1: Rename the project directory**

Run:

```bash
mv /Users/dhruvtiwari/Developer/verdict /Users/dhruvtiwari/Developer/judge
```

Expected: `/Users/dhruvtiwari/Developer/judge/package.json` exists and the old directory does not.

- [x] **Step 2: Change package identity and declare the tree-shaking contract**

Update `package.json` to contain:

```json
{
  "name": "@brkn-labs/judge",
  "version": "0.0.0",
  "private": true,
  "description": "Probabilistic judgment. Deterministic execution.",
  "type": "module",
  "sideEffects": false
}
```

Preserve the existing scripts, dev dependencies, and Node engine requirement. Do not add runtime exports or implementation dependencies during this documentation phase.

- [x] **Step 3: Update the lockfile through npm**

Run:

```bash
npm install --package-lock-only
```

Expected: the root package name in `package-lock.json` is `@brkn-labs/judge`, with no dependency version changes unless required by npm lockfile normalization.

- [x] **Step 4: Update the smoke-test wording**

The test remains behavior-free and reads:

```ts
import assert from "node:assert/strict";
import test from "node:test";

test("the Judge TypeScript entry point loads in Node", async () => {
  const judge = await import("../src/index.ts");

  assert.deepEqual(Object.keys(judge), []);
});
```

- [x] **Step 5: Verify the renamed scaffold**

Run from `/Users/dhruvtiwari/Developer/judge`:

```bash
npm run check
```

Expected: Ultracite, TypeScript, and the Node unit test all pass.

---

### Task 2: Write the product entry points

**Files:**
- Create: `/Users/dhruvtiwari/Developer/judge/README.md`
- Create: `/Users/dhruvtiwari/Developer/judge/docs/product/vision.md`

**Interfaces:**
- Consumes: Judge identity, product boundary, root/direct/gateway/core import model.
- Produces: the approachable project overview and durable product thesis linked by all later specifications.

- [x] **Step 1: Write `README.md`**

Use this exact section order:

```markdown
# Judge
> Probabilistic judgment. Deterministic execution.

## Why Judge
## Quick start
## How it works
## Imports and tree-shaking
## Safety boundary
## Documentation
## Status
```

The quick-start example must show direct Jev configuration:

```ts
import { createJudge } from "@brkn-labs/judge";

const judge = createJudge({
  apiKey: process.env.TYPESAFE_API_KEY!,
});

const result = await judge.if({
  context: ticket,
  condition: "Does this ticket require immediate attention?",
  then: () => escalate(ticket),
  else: () => queue(ticket),
  confidence: {
    minimum: 0.85,
    uncertain: ({ decision }) => review(ticket, decision),
  },
});
```

The README must state that the model evaluates only the constrained judgment and application code owns every callback. List root, `/core`, `/mock`, and three gateway subpaths. Mark the project as specification-first and pre-release; do not claim the runtime is implemented.

- [x] **Step 2: Write `docs/product/vision.md`**

Use this exact section order:

```markdown
# Product vision
## Thesis
## The problem
## The Judge model
## Target use cases
## Design goals
## Non-goals
## Product principles
## Success for v0.1
```

Preserve these source ideas:

- semantic judgments should feel like normal typed dependencies;
- context is structured data, separate from the question;
- uncertainty is a runtime state rather than an error;
- cheap judgments can route to deterministic code or escalate to expensive reasoning;
- provider independence is a core architectural property;
- no compiler transform, generated-code execution, core retrieval system, or calibration guarantee.

End with: “Models judge. TypeScript constrains. Application code executes.”

- [x] **Step 3: Validate product terminology**

Run:

```bash
rg -n "Verdict|createSemantic|semantic\\.(if|switch)|Jev SDK" README.md docs/product
```

Expected: no matches.

---

### Task 3: Write the normative v0.1 and core specifications

**Files:**
- Create: `/Users/dhruvtiwari/Developer/judge/docs/specs/v0.1.md`
- Create: `/Users/dhruvtiwari/Developer/judge/docs/specs/core.md`

**Interfaces:**
- Consumes: product vision, source specification sections 1–6 and 8–13, approved reconciliation decisions.
- Produces: the canonical release contract and provider-independent type/runtime contract.

- [x] **Step 1: Write `docs/specs/v0.1.md`**

Use this exact section order:

```markdown
# Judge v0.1 specification
## Status and normative language
## Scope
## Package entry points
## Public API
## Required execution guarantees
## Confidence and uncertainty
## Context
## Providers and transports
## Errors
## Observability
## Runtime safety
## Tree-shaking requirements
## Acceptance criteria
## Deferred features
```

The public surface must include:

```ts
createJudge(options)
judge.if(options)
judge.switch(options)
judge.boolean(options)
judge.choice(options)
judge.score(options)
judge.condition<T>(condition)
judge.choiceQuestion<T>()(criteria)
judge.preset(definition)
judge.withContext(context)
judge.scope<T>()
```

The acceptance criteria must explicitly test:

- correct `then`, `else`, selected case, and `uncertain` execution;
- return-type unions and literal case inference;
- invalid provider results never execute callbacks;
- context precedence `global < scoped < getContext(input) < invocation`;
- threshold boundary uses `confidence >= minimum`;
- cancellation prevents callback execution, including a post-provider race;
- unit tests use the deterministic mock without remote credentials;
- direct TypeSafe and explicit gateway Jev paths normalize to identical core decisions;
- `/core` bundles contain no Jev, direct TypeSafe transport, mock, or gateway
  code;
- each optional integration is absent unless its exact subpath is imported.

- [x] **Step 2: Write `docs/specs/core.md` decision contracts**

Define these stable provider-independent shapes:

```ts
interface DecisionProvider {
  boolean<S>(input: BooleanInput<S>): Promise<BooleanDecision>;
  choice<S, const O extends readonly [string, ...string[]]>(
    input: ChoiceInput<S, O>
  ): Promise<ChoiceDecision<O[number]>>;
  score<S, const L extends readonly [string, ...string[]]>(
    input: ScoreInput<S, L>
  ): Promise<ScoreDecision<L[number]>>;
}

type BooleanDecision = {
  kind: "boolean";
  value: boolean;
  probabilityTrue: number;
  confidence: number;
  raw?: unknown;
};

type ChoiceDecision<K extends string> = {
  kind: "choice";
  value: K;
  probabilities: Record<K, number>;
  confidence: number;
  raw?: unknown;
};
```

Specify finite `[0, 1]` validation, every legal choice exactly once, rejection of impossible choices, and adapter normalization of only insignificant floating-point drift. Use an absolute distribution-sum tolerance of `1e-6`; deviations beyond it are `ProviderContractError`.

- [x] **Step 3: Write `docs/specs/core.md` control-flow contracts**

Define `if()` and `switch()` generics so callback results form awaited unions and case keys remain literal. Require exactly one callback. Specify that callback exceptions pass through unchanged and are not provider errors.

Define confidence configuration as two layers:

```ts
type ConfidenceThreshold = {
  minimum: number;
};

type ConfidencePolicy<U> = ConfidenceThreshold & {
  uncertain: (meta: UncertainMeta) => U | Promise<U>;
};
```

Presets may carry `ConfidenceThreshold`; invocations that want uncertainty routing supply the `uncertain` callback. A threshold without a resolvable uncertainty callback is a `ConfigurationError` before provider evaluation.

- [x] **Step 4: Write `docs/specs/core.md` context and preset contracts**

Specify context precedence:

```text
global < scoped < preset.getContext(input) < invocation
```

Deep-merge plain objects, replace arrays, and treat `undefined` as absent rather than deletion. `getContext()` runs exactly once per evaluation, receives `{ input, signal, invocationId }`, is uncached by default, and prevents provider invocation if it fails.

Define separate reusable Boolean and Choice preset contracts. Do not use one `SemanticPreset` type that contains only `condition` while claiming Choice support.

Serialization accepts JSON-compatible primitives, arrays, and plain objects. It rejects functions, symbols, bigint, non-finite numbers, circular references, and unsupported class instances with `SerializationError`. Dates require explicit application conversion in v0.1.

- [x] **Step 5: Write cancellation and observability behavior**

Require signal checks before context resolution, before provider invocation, and immediately before callback execution. Forward the same signal to context resolution and transport. No callback may start after cancellation is observed.

Define decision events as evaluation metadata emitted after a normalized decision and confidence outcome are known. Context and raw output are excluded by default. An `onDecision` hook error is isolated, reported through an optional `onError` hook, and cannot change branch selection or callback return values.

- [x] **Step 6: Check normative ownership and links**

Run:

```bash
rg -n "MUST|MUST NOT|SHOULD|MAY" docs/specs/v0.1.md docs/specs/core.md
rg -n "Verdict|createSemantic|semantic\\.(if|switch)" docs/specs/v0.1.md docs/specs/core.md
```

Expected: deliberate normative terms are present; stale product/API names are absent.

---

### Task 4: Write Jev and gateway specifications

**Files:**
- Create: `/Users/dhruvtiwari/Developer/judge/docs/specs/provider-jev.md`
- Create: `/Users/dhruvtiwari/Developer/judge/docs/specs/gateway-plugins.md`

**Interfaces:**
- Consumes: `DecisionProvider`, normalized decision shapes, explicit direct/gateway root configuration.
- Produces: isolated Jev adaptation and transport contracts that never own control-flow semantics.

- [x] **Step 1: Write `docs/specs/provider-jev.md`**

Use this exact section order:

```markdown
# Jev provider specification
## Role and boundaries
## Root factory configuration
## Direct TypeSafe transport
## Gateway transport
## Request mapping
## Response normalization
## Error mapping
## Cancellation and timeouts
## Metadata
## Tests
## Upstream assumptions
```

Specify this mutually exclusive root configuration:

```ts
type DirectJevOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
};

type GatewayJevOptions = {
  gateway: GatewayPlugin;
  model?: string;
  timeoutMs?: number;
};
```

The direct path uses Node's built-in `fetch` with no TypeSafe SDK dependency,
defaults `baseUrl` to `https://api.typesafe.ai` and model to `jev-latest`, and
passes the key as a Bearer token. The document must date these defaults as
September 18, 2026 and link to the official TypeSafe HTTP API reference. Do not
promise the model alias is behaviorally stable.

Map Judge context to Jev `state`, Boolean/Choice/Score definitions to named `questions`, and returned answers to stable core decisions. Provider code validates upstream output before returning. It never applies confidence policy or invokes callbacks.

- [x] **Step 2: Write `docs/specs/gateway-plugins.md`**

Use this exact section order:

```markdown
# Gateway plugin specification
## Role and boundaries
## Contract
## Capabilities
## Configuration
## Metadata normalization
## Error normalization
## Vercel
## Cloudflare
## OpenRouter
## Shared contract tests
## Tree-shaking requirements
## Upstream assumptions
```

Define:

```ts
interface GatewayPlugin {
  readonly id: string;
  readonly capabilities: GatewayCapabilities;
  evaluate(
    request: GatewayEvaluationRequest,
    options?: GatewayRequestOptions
  ): Promise<GatewayEvaluationResponse>;
}
```

Capabilities cover Jev, Boolean, Choice, Score, batching, and custom headers. Unsupported capabilities fail locally with `ConfigurationError`. Gateway-specific routing remains inside each gateway subpath and never appears in core types.

Document the subpaths and dated model identifiers:

```text
@brkn-labs/judge/gateway/vercel       typesafe-ai/jev
@brkn-labs/judge/gateway/cloudflare   typesafe/jev
@brkn-labs/judge/gateway/openrouter   typesafe/jev-1.13 or ~typesafe/jev-latest
```

Treat all identifiers as dated upstream assumptions. Link to each gateway's first-party Jev/model documentation.

- [x] **Step 3: Specify the gateway contract suite**

Require shared tests for Boolean, Choice, Score, impossible options, malformed distributions, cancellation, normalized transport failures, usage/model/request metadata, and absence of callback execution.

Require bundle fixtures proving each gateway subpath can be imported independently and that importing one gateway includes neither sibling gateways nor the mock provider.

- [x] **Step 4: Check provider/core separation**

Run:

```bash
rg -n "execute.*callback|then:|else:|cases:" docs/specs/provider-jev.md docs/specs/gateway-plugins.md
```

Expected: callback examples appear only when explicitly explaining prohibited behavior; neither integration specification owns branch execution.

---

### Task 5: Write the lifecycle, roadmap, and documentation verification

**Files:**
- Create: `/Users/dhruvtiwari/Developer/judge/docs/architecture/decision-lifecycle.md`
- Create: `/Users/dhruvtiwari/Developer/judge/docs/roadmap.md`
- Modify: all documentation files for final cross-links and consistency fixes

**Interfaces:**
- Consumes: all normative specifications.
- Produces: explanatory architecture, scoped future work, and a fully navigable documentation set.

- [x] **Step 1: Write `docs/architecture/decision-lifecycle.md`**

Use this exact section order:

```markdown
# Decision lifecycle
## Overview
## 1. Validate configuration
## 2. Resolve fresh preset context
## 3. Compose context layers
## 4. Serialize provider input
## 5. Evaluate
## 6. Normalize and validate
## 7. Apply confidence policy
## 8. Re-check cancellation
## 9. Execute one callback
## 10. Emit metadata and return
## Failure boundaries
```

Include one concise sequence diagram in Mermaid or text. Make clear that provider evaluation can have occurred remotely even if local cancellation prevents callback execution. Explain that callback failures are application failures and are never normalized into `ProviderError`.

- [x] **Step 2: Write `docs/roadmap.md`**

Use these categories:

```markdown
# Roadmap
## v0.1 — specified
## Candidate v0.2 work
## Research tracks
## Explicitly uncommitted ideas
```

Place local/open providers, runtime schemas, reference retrieval, context compression, calibration datasets, batch evaluation, richer confidence policy, OpenTelemetry, and framework adapters after v0.1. State that inclusion and order are not promises.

- [x] **Step 3: Add cross-links**

Every documentation file must link back to `README.md` or to its nearest index-level document. `README.md` links to all seven documents. `v0.1.md` links to `core.md`, `provider-jev.md`, `gateway-plugins.md`, `decision-lifecycle.md`, and `roadmap.md`.

- [x] **Step 4: Run terminology and malformed-Markdown checks**

Run:

```bash
rg -n "Verdict|createSemantic|semantic\\.(if|switch)|@semantic-control|Jev SDK" README.md docs --glob '!docs/superpowers/**'
rg -n '^# $|^# `|^# &nbsp;|&nbsp;' README.md docs --glob '!docs/superpowers/**'
```

Expected: no matches. “Jev provider” and equivalent adapter-specific descriptions remain valid.

- [x] **Step 5: Run link and coverage inspection**

Run:

```bash
find docs -type f -name '*.md' -print | sort
rg -n '^#' README.md docs --glob '!docs/superpowers/**'
```

Expected: all seven planned documents exist, headings follow the approved structure, and the documentation is easy to navigate.

- [x] **Step 6: Run repository verification**

Run:

```bash
npm run fix
npm run check
npm run test:coverage
npx ultracite doctor
```

Expected: formatting, linting, type checking, unit tests, coverage, and Ultracite diagnostics all pass. If Ultracite does not lint Markdown, record that the Markdown-specific `rg` checks were the applicable documentation gate.

---

## Plan self-review

- The source specification's product definition, APIs, types, context, confidence, presets, providers, gateways, errors, observability, safety, acceptance criteria, example thesis, assumptions, and roadmap all have an owning document.
- The approved Judge name, root Jev default, direct API-key path, explicit gateways, `/core` isolation, ESM-only package, subpath routing, and complete tree-shaking boundary are represented in tasks and verification.
- The plan contains no unresolved placeholders.
- Public names are consistent: `createJudge`, `judge`, `DecisionProvider`, `GatewayPlugin`, and `@brkn-labs/judge`.
