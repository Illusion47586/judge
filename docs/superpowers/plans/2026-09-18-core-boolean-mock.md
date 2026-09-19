# Core Boolean and Mock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first usable Judge slice: provider-neutral Boolean decisions, `judge.if()`, deterministic mock decisions, and publishable ESM `/core` and `/mock` subpaths.

**Architecture:** Core owns public decision types, stable errors, provider validation, confidence routing, cancellation boundaries, and callback execution. The mock implements the provider contract with FIFO fixtures and never executes callbacks. TypeScript emits preserved ESM modules and declarations so subpaths remain independently tree-shakeable.

**Tech Stack:** Node.js 22.18+, TypeScript 7, npm, Node `node:test`, Ultracite/Biome.

## Global Constraints

- Root package remains `@brkn-labs/judge`, ESM-only, and `"sideEffects": false`.
- `/core` MUST have no dependency on `/mock`, Jev, TypeSafe, or gateways.
- The root entry remains behavior-free until the default Jev adapter is implemented.
- Exactly one callback executes after a valid accepted or uncertain Boolean decision.
- Invalid configuration and provider results execute no callback.
- The same `AbortSignal` reaches the provider and is checked before provider invocation and immediately before callback execution.
- Callback exceptions pass through unchanged.
- No runtime dependencies are added.
- This directory is not a Git repository, so the plan has no commit steps.

---

### Task 1: Configure publishable ESM output

**Files:**
- Modify: `package.json`
- Create: `tsconfig.build.json`
- Test: `test/package-exports.test.ts`

**Interfaces:**
- Produces `dist/index.js`, `dist/core/index.js`, `dist/mock/index.js`, and matching declarations.
- Exposes `.`, `./core`, and `./mock` through explicit package exports.

- [x] Write a package-exports test that runs `npm run build`, imports `dist/core/index.js` and `dist/mock/index.js`, and verifies the expected exports exist while the root has no exports.
- [x] Run `node --test test/package-exports.test.ts`; expect failure because no build script or subpath output exists.
- [x] Add `build`, `clean`, and `prepack` scripts; add `files`, `exports`, and `types` metadata without changing runtime dependencies.
- [x] Add `tsconfig.build.json` extending the strict config with declaration output, source maps, `rootDir: "src"`, `outDir: "dist"`, and relative TypeScript import rewriting.
- [x] Run the focused package-exports test and expect it to pass after later source entry points exist.

### Task 2: Define stable core contracts and errors

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/errors.ts`
- Create: `src/core/validate.ts`
- Create: `src/core/index.ts`
- Test: `test/core/boolean.test.ts`

**Interfaces:**
- Produces `BooleanInput`, `BooleanDecision`, forward-compatible Choice/Score contracts, `DecisionProvider`, branch metadata, confidence policy, and stable errors.
- Produces `validateBooleanDecision()` and `throwIfAborted()` for the client.

- [x] Write failing public-boundary tests for a valid Boolean result, empty condition, malformed probability/confidence, malformed provider shape, and pre-aborted signal.
- [x] Run `node --test test/core/boolean.test.ts`; expect module/export failures.
- [x] Implement stable error classes with `name`, optional stable `code`, and optional `cause`.
- [x] Implement provider and decision types from `docs/specs/core.md` without implementing Choice or Score client methods.
- [x] Implement Boolean configuration/result validation with finite `[0, 1]` checks and `ProviderContractError` for malformed provider output.
- [x] Run the focused Boolean tests until they pass.

### Task 3: Implement `createJudge()`, `boolean()`, and `if()`

**Files:**
- Create: `src/core/client.ts`
- Modify: `src/core/index.ts`
- Test: `test/core/if.test.ts`

**Interfaces:**
- Consumes `DecisionProvider`, validators, errors, and metadata types.
- Produces `createJudge({ provider })`, `JudgeClient.boolean()`, and `JudgeClient.if()`.

- [x] Write failing tests proving true, false, uncertain, equality-at-threshold, return-value awaiting, exactly-one callback, invalid-threshold short circuit, post-provider cancellation, and unchanged callback errors.
- [x] Run `node --test test/core/if.test.ts`; expect missing client exports.
- [x] Implement `boolean()` with trimmed-condition validation, signal checks, provider invocation, and response validation.
- [x] Implement `if()` by calling the Boolean pipeline, validating confidence before provider invocation, selecting one callback, checking cancellation immediately before it, and returning its awaited value.
- [x] Run the focused `if()` tests until they pass.
- [x] Run `npm run typecheck` to verify inferred return unions and public generics.

### Task 4: Implement the deterministic mock provider

**Files:**
- Create: `src/mock/index.ts`
- Test: `test/mock/mock-provider.test.ts`

**Interfaces:**
- Consumes core provider and decision types through a direct `../core` source import, never through the root entry.
- Produces `mockProvider({ boolean })` with FIFO Boolean fixtures and required Choice/Score provider methods that fail clearly until configured in later milestones.

- [x] Write failing tests for FIFO decisions, derived default confidence, explicit confidence, exhausted queue, aborted call, and source fixture immutability.
- [x] Run `node --test test/mock/mock-provider.test.ts`; expect missing mock export.
- [x] Implement fixture normalization without mutating caller arrays or objects.
- [x] Implement deterministic Boolean FIFO consumption and stable configuration errors for missing Choice/Score fixtures.
- [x] Run mock tests until they pass.
- [x] Run all unit tests to verify mock decisions drive `judge.if()` through the public boundary.

### Task 5: Verify build boundaries and full quality gate

**Files:**
- Modify: `src/index.ts` only if needed to preserve an intentionally empty root.
- Modify: `package.json` scripts only if verification exposes a gap.

**Interfaces:**
- Confirms public ESM/declaration output and provider isolation.

- [x] Run `npm run build` and inspect `dist/core/index.js`, `dist/mock/index.js`, and their declaration files.
- [x] Search the core output for mock, Jev, TypeSafe, and gateway imports; expect none.
- [x] Import `@brkn-labs/judge/core` and `@brkn-labs/judge/mock` through package self-references after build; expect successful ESM resolution.
- [x] Run `npm run fix`, `npm run check`, `npm run test:coverage`, `npm run build`, and `npx ultracite doctor`.
- [x] Mark this plan complete only when every relevant command passes.

## Verification ladder

- Fast: `node --test test/core/boolean.test.ts`, `test/core/if.test.ts`, or `test/mock/mock-provider.test.ts`.
- Medium: `npm run typecheck`, `npm run lint`, and `npm run build`.
- Full: `npm run check`, `npm run test:coverage`, package self-import smoke checks, output-boundary search, and `npx ultracite doctor`.

## Deferred from this slice

Choice, Score execution, `switch()`, context composition, serialization, presets,
observability, the direct Jev HTTP adapter, gateways, and bundle-size fixtures
remain later milestones. Their public provider types may be defined now only to
avoid a breaking `DecisionProvider` change.
