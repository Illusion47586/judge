# Public JSDoc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add editor-native JSDoc to every public Judge declaration and member, preserve it in distributed declarations, and prevent future undocumented exports.

**Architecture:** Document declarations at their source rather than on barrels. A dependency-free source manifest scanner will require summaries on declarations and public members plus package-import `@example` tags on factories and Judge methods. A build-level assertion will prove representative comments survive in `.d.ts` output.

**Tech Stack:** Node.js test runner, TypeScript 7, Ultracite/Biome, ESM.

## Global Constraints

- Add no dependency; use Node standard-library modules for documentation tests.
- Use package imports in every `@example`.
- Document every public declaration and every public property or method.
- Add `@example` to factories and every `JudgeClient` method.
- State when an operation can make a remote, potentially billable request.
- Treat `raw` and provider-specific metadata as unstable diagnostic data.
- Do not claim an exact tokenizer or permanent context/rate limit.
- Preserve runtime signatures, package exports, and tree-shaking boundaries.
- Make no live provider request during verification.

---

### Task 1: Documentation completeness harness

**Files:**
- Create: `test/jsdoc.test.ts`

**Interfaces:**
- Consumes: source declarations and emitted `.d.ts` files.
- Produces: an explicit `publicSurface` manifest plus checks for declaration/member JSDoc, required examples, package imports, and emitted comments.

- [ ] **Step 1: Create the documentation harness with the core manifest**

**Execution note:** TypeScript 7 exposes version metadata rather than the
stable parser API from the `typescript` package root. The implemented harness
therefore uses an explicit source-symbol/member manifest and dependency-free
declaration scanner. This supersedes the originally planned compiler-API
prototype below while preserving the same coverage and emitted-declaration
checks.

Create `test/jsdoc.test.ts` with these helpers and initial manifest:

```ts
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

interface SurfaceFile {
  examples?: readonly string[];
  symbols: readonly string[];
}

const publicSurface: Readonly<Record<string, SurfaceFile>> = {
  "src/core/client.ts": { examples: ["createJudge"], symbols: ["createJudge"] },
  "src/core/errors.ts": {
    symbols: [
      "AbortError",
      "ConfigurationError",
      "ContextLimitError",
      "JudgeError",
      "ProviderContractError",
      "ProviderError",
      "SerializationError",
    ],
  },
  "src/core/types.ts": {
    examples: ["JudgeClient.boolean", "JudgeClient.choice", "JudgeClient.if", "JudgeClient.score", "JudgeClient.switch"],
    symbols: [
      "BooleanDecision", "BooleanInput", "BooleanOptions", "BranchMeta",
      "ChoiceBranchMeta", "ChoiceCases", "ChoiceDecision", "ChoiceInput",
      "ChoiceOptions", "ConfidencePolicy", "CreateJudgeOptions",
      "DecisionProvider", "JudgeClient", "JudgeIfOptions",
      "JudgeSwitchOptions", "ProviderMetadata", "ScoreDecision",
      "ScoreInput", "ScoreOptions", "UncertainMeta",
    ],
  },
};

const declarationName = (node: ts.Node): string | undefined => {
  if (
    (ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) &&
    node.name
  ) return node.name.text;
  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations[0];
    return declaration && ts.isIdentifier(declaration.name)
      ? declaration.name.text
      : undefined;
  }
  return undefined;
};

const documentationText = (node: ts.Node, source: ts.SourceFile): string => {
  const ranges = ts.getLeadingCommentRanges(source.text, node.getFullStart()) ?? [];
  return ranges
    .filter((range) => source.text.slice(range.pos, range.pos + 3) === "/**")
    .map((range) => source.text.slice(range.pos, range.end))
    .join("\n");
};

const memberPath = (owner: string, member: ts.Node): string | undefined => {
  if ((ts.isPropertySignature(member) || ts.isMethodSignature(member)) && member.name) {
    return ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
      ? `${owner}.${member.name.text}`
      : undefined;
  }
  return undefined;
};

const publicMembers = (owner: string, declaration: ts.Node): ts.Node[] => {
  const members: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    for (const child of node.getChildren()) {
      if (memberPath(owner, child)) members.push(child);
      visit(child);
    }
  };
  visit(declaration);
  return members;
};

test("every manifested public declaration and member has JSDoc", () => {
  for (const [relativePath, surface] of Object.entries(publicSurface)) {
    const sourceText = readFileSync(resolve(relativePath), "utf8");
    const source = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true);
    const declarations = new Map(
      source.statements.flatMap((statement) => {
        const name = declarationName(statement);
        return name ? [[name, statement] as const] : [];
      })
    );
    for (const symbol of surface.symbols) {
      const declaration = declarations.get(symbol);
      assert.ok(declaration, `${relativePath} is missing ${symbol}`);
      assert.match(documentationText(declaration, source), /\/\*\*[\s\S]*\S[\s\S]*\*\//u, `${symbol} needs JSDoc`);
      for (const member of publicMembers(symbol, declaration)) {
        const path = memberPath(symbol, member);
        if (path) assert.match(documentationText(member, source), /\/\*\*[\s\S]*\S[\s\S]*\*\//u, `${path} needs JSDoc`);
      }
    }
    for (const example of surface.examples ?? []) {
      const [owner, memberName] = example.split(".");
      const declaration = declarations.get(owner ?? "");
      assert.ok(declaration, `${example} owner is missing`);
      const target = memberName
        ? publicMembers(owner ?? "", declaration).find((node) => memberPath(owner ?? "", node) === example)
        : declaration;
      assert.ok(target, `${example} is missing`);
      const docs = documentationText(target, source);
      assert.match(docs, /@example/u, `${example} needs @example`);
      assert.match(docs, /@brkn-labs\/judge/u, `${example} needs a package import`);
    }
  }
});

test("distributed declarations retain representative JSDoc", () => {
  execFileSync("npm", ["run", "build"], { cwd: process.cwd(), stdio: "pipe" });
  const markers = {
    "dist/core/errors.d.ts": "Base class for stable Judge errors",
    "dist/core/types.d.ts": "A provider-neutral Judge client",
  } as const;
  for (const [file, marker] of Object.entries(markers)) {
    assert.match(readFileSync(resolve(file), "utf8"), new RegExp(marker, "u"));
  }
});
```

- [ ] **Step 2: Run the harness red**

Run: `node --test test/jsdoc.test.ts`

Expected: FAIL with the first undocumented core declaration.

- [ ] **Step 3: Commit the red enforcement harness**

```bash
git add test/jsdoc.test.ts
git commit -m "test: enforce public JSDoc coverage"
```

---

### Task 2: Core client, types, and errors

**Files:**
- Modify: `src/core/client.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/errors.ts`

**Interfaces:**
- Consumes: the Task 1 core manifest.
- Produces: complete provider-neutral IntelliSense documentation and examples for every Judge method.

- [ ] **Step 1: Document the core factory and error hierarchy**

Add this style of function documentation directly above core `createJudge`:

```ts
/**
 * Creates a provider-neutral Judge client.
 *
 * @remarks The supplied provider owns remote work and billing. Judge validates
 * every decision before returning it or invoking application callbacks.
 *
 * @param options - The decision provider used for every evaluation.
 * @returns A reusable {@link JudgeClient}.
 * @throws {@link ConfigurationError} if the provider is invalid.
 *
 * @example
 * ```ts
 * import { createJudge } from "@brkn-labs/judge/core";
 * import { mockProvider } from "@brkn-labs/judge/mock";
 *
 * const judge = createJudge({
 *   provider: mockProvider({ boolean: [{ probabilityTrue: 0.9, value: true }] }),
 * });
 * ```
 */
```

Use these exact class summaries and document each public `code` property:

- `JudgeError`: “Base class for stable Judge errors.”
- `ConfigurationError`: “Reports invalid local configuration or request input.” Default code `configuration_error`.
- `SerializationError`: “Reports context that cannot be represented as JSON.” Default code `serialization_error`.
- `ProviderError`: “Reports transport or upstream provider failure.” Default code `provider_error`; adapters may use a more specific code.
- `ContextLimitError`: “Reports an explicit provider context-window rejection.” Stable code `context_limit`.
- `ProviderContractError`: “Reports malformed or impossible provider output.” Default code `provider_contract_error`.
- `AbortError`: “Reports caller-requested cancellation.” Default code `abort_error`.

Each constructor comment must describe its message and optional cause; do not document the internal `JudgeErrorOptions` interface as public.

- [ ] **Step 2: Document all input and result shapes**

In `src/core/types.ts`, add declaration summaries and member comments with these semantics:

- `BooleanInput`/`BooleanOptions`: condition is a non-empty semantic question; context must be JSON-compatible for Jev providers; signal cancels work.
- `ChoiceInput`/`ChoiceOptions`: options are a non-empty literal tuple of unique trimmed values; question is non-empty; signal cancels work.
- `ScoreInput`/`ScoreOptions`: levels are an ordered tuple with at least two unique trimmed labels; score zero maps to the first level and `levels.length - 1` to the last.
- `ProviderMetadata`: document gateway, latency in milliseconds, requested model, fixed provider discriminator, unstable raw data, request ID, resolved model, and optional input/output token counts.
- `BooleanDecision`: `confidence`, `probabilityTrue` are inclusive `[0, 1]`; value uses the provider's Boolean selection.
- `ChoiceDecision`: value and probability keys are exactly the requested option union; probabilities sum to one.
- `ScoreDecision`: levels preserve request order; probabilities align by index and sum to one; score is bounded by the level index range.

Use `@remarks` on every `raw` property: “Provider-specific diagnostic data. Its shape is not a stable Judge API.”

- [ ] **Step 3: Document control flow and provider contracts**

Document:

- `DecisionProvider` and all three methods, noting that implementations may perform remote billable work and must return results matching the request.
- `ConfidencePolicy`, `minimum`, and `uncertain`, including inclusive `[0, 1]` and below-threshold behavior.
- `BranchMeta`, `ChoiceBranchMeta`, and `UncertainMeta`, including branch narrowing and invocation correlation.
- `ChoiceCases`, explaining that keys become the complete legal choice set.
- `JudgeIfOptions` and `JudgeSwitchOptions`, including exactly-one callback execution and unchanged callback-error propagation.
- core `CreateJudgeOptions.provider` as the only provider-neutral dependency.

- [ ] **Step 4: Add package-import examples to all Judge methods**

Use these example scenarios on `JudgeClient` members:

- `boolean`: content-policy decision returning `decision.value` and `decision.probabilityTrue`.
- `choice`: `options: ["billing", "support"]`, demonstrating the exact value union and probability keys.
- `score`: ordered `levels: ["low", "medium", "high"]`.
- `if`: `then`, `else`, and `uncertain` returning distinct literal objects so the awaited return union is visible.
- `switch`: `billing` and `support` cases plus an uncertain review result.

Every example must begin with:

```ts
import { createJudge } from "@brkn-labs/judge";
```

Each method comment must include `@returns` plus applicable `@throws` references to `ConfigurationError`, `SerializationError`, `AbortError`, `ProviderError`, `ProviderContractError`, and unchanged callback errors.

- [ ] **Step 5: Run the core documentation gate and commit**

Run: `node --test test/jsdoc.test.ts && npm run lint && npm run typecheck`

Expected: both JSDoc tests pass for the core-only manifest; lint and typecheck pass.

```bash
git add src/core/client.ts src/core/types.ts src/core/errors.ts
git commit -m "docs: document Judge core API"
```

---

### Task 3: Gateway protocol and adapters

**Files:**
- Modify: `test/jsdoc.test.ts`
- Modify: `src/gateway/types.ts`
- Modify: `src/gateway/custom.ts`
- Modify: `src/gateway/vercel.ts`
- Modify: `src/gateway/cloudflare.ts`
- Modify: `src/gateway/openrouter.ts`

**Interfaces:**
- Consumes: the public gateway protocol and four adapter entry points.
- Produces: documented gateway contracts, configuration constraints, defaults, and consumer examples.

- [ ] **Step 1: Extend the manifest and run red**

Add:

```ts
"src/gateway/types.ts": {
  symbols: [
    "GatewayCapabilities", "GatewayEvaluationRequest",
    "GatewayEvaluationResult", "GatewayMetadata", "GatewayPlugin",
    "GatewayRequestOptions", "JevQuestion",
  ],
},
"src/gateway/custom.ts": { examples: ["defineGateway"], symbols: ["defineGateway"] },
"src/gateway/vercel.ts": { examples: ["vercelGateway"], symbols: ["VercelGatewayOptions", "vercelGateway"] },
"src/gateway/cloudflare.ts": { examples: ["cloudflareGateway"], symbols: ["CloudflareGatewayOptions", "cloudflareGateway"] },
"src/gateway/openrouter.ts": { examples: ["openRouterGateway"], symbols: ["OpenRouterGatewayOptions", "openRouterGateway"] },
```

Run: `node --test test/jsdoc.test.ts`

Expected: FAIL on `GatewayCapabilities`.

- [ ] **Step 2: Document the gateway protocol**

Use these declaration/member semantics in `src/gateway/types.ts`:

- `JevQuestion`: a closed Boolean, Choice, or Score question sent to a Jev-compatible transport; document every `criteria`, `instructions`, and `type` member in all union branches.
- `GatewayEvaluationRequest`: requested model, keyed questions, and JSON-safe shared state.
- `GatewayRequestOptions`: immutable per-request headers, abort signal, and positive timeout in milliseconds.
- `GatewayCapabilities`: whether the gateway supports batching, Boolean, Choice, headers, Jev protocol, and Score.
- `GatewayMetadata`: gateway ID, latency milliseconds, requested and resolved models, upstream provider, unstable raw metadata, request ID, and token counts.
- `GatewayEvaluationResult`: untrusted body plus optional diagnostic metadata.
- `GatewayPlugin`: immutable capabilities, evaluation function, stable ID, and default model; evaluation output is untrusted until Judge validates it.

- [ ] **Step 3: Document custom and hosted adapters**

Add factory examples with exact subpath imports:

```ts
import { defineGateway } from "@brkn-labs/judge/gateway/custom";
import { vercelGateway } from "@brkn-labs/judge/gateway/vercel";
import { cloudflareGateway } from "@brkn-labs/judge/gateway/cloudflare";
import { openRouterGateway } from "@brkn-labs/judge/gateway/openrouter";
```

Document all option properties:

- Vercel: API key; optional base URL; immutable default headers; model default `typesafe-ai/jev`. Mention optional `ai` and `@ai-sdk/gateway` peers, native evaluation API, disabled SDK retries, remote/billable work, configuration errors, abort, timeout, and normalized provider errors.
- Cloudflare: account ID; API token; optional AI Gateway ID; model default `typesafe/jev`. Mention optional `cloudflare` peer and remote/billable work.
- OpenRouter: API key; optional application title and HTTP referer attribution; base URL default `https://openrouter.ai/api`; positive maximum response bytes default `8_388_608`; model default `typesafe/jev-1.13`; opaque provider-routing preferences. Mention Decisions API, no SDK dependency, remote/billable work, abort, timeout, bounded JSON, and errors.
- Custom: definition is snapshotted and validated; the callback receives native Jev state-and-questions; returned data remains untrusted.

Every factory must document `@param`, `@returns`, and applicable `@throws`.

- [ ] **Step 4: Extend emitted markers and verify**

Add representative markers:

```ts
"dist/gateway/custom.d.ts": "Defines a custom Jev-compatible gateway",
"dist/gateway/vercel.d.ts": "Creates a Vercel AI Gateway adapter",
"dist/gateway/cloudflare.d.ts": "Creates a Cloudflare Workers AI adapter",
"dist/gateway/openrouter.d.ts": "Creates an OpenRouter Decisions adapter",
```

Run: `node --test test/jsdoc.test.ts && npm run lint && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit gateway documentation**

```bash
git add test/jsdoc.test.ts src/gateway/types.ts src/gateway/custom.ts src/gateway/vercel.ts src/gateway/cloudflare.ts src/gateway/openrouter.ts
git commit -m "docs: document gateway APIs"
```

---

### Task 4: Root, direct Jev, context budget, mock, and full verification

**Files:**
- Modify: `test/jsdoc.test.ts`
- Modify: `src/index.ts`
- Modify: `src/provider/jev/direct.ts`
- Modify: `src/provider/jev/types.ts`
- Modify: `src/mock/index.ts`
- Modify: `docs/superpowers/plans/2026-09-19-public-jsdoc.md`

**Interfaces:**
- Consumes: the remaining root-level and mock public surface.
- Produces: complete package documentation, final emitted markers, and an updated PR.

- [ ] **Step 1: Extend the final manifest and run red**

Add:

```ts
"src/index.ts": { examples: ["createJudge"], symbols: ["CreateJudgeOptions", "GatewayJevOptions", "createJudge"] },
"src/provider/jev/direct.ts": { symbols: ["DirectJevOptions", "RetryOptions"] },
"src/provider/jev/types.ts": { symbols: ["ContextBudgetOptions", "ContextBudgetWarning"] },
"src/mock/index.ts": { examples: ["mockProvider"], symbols: ["BooleanFixture", "ChoiceFixture", "MockProviderOptions", "mockProvider"] },
```

Run: `node --test test/jsdoc.test.ts`

Expected: FAIL on `GatewayJevOptions`.

- [ ] **Step 2: Document root and direct Jev configuration**

Document root `createJudge` as the default Jev-backed factory. Its package-import example must show Vercel configuration plus an optional context budget. State that exactly one of `apiKey` or `gateway` is required, evaluation may be remote and billable, and callbacks remain application-owned.

Document:

- `GatewayJevOptions`: `apiKey` is forbidden, gateway is required, context budget is advisory, model overrides the gateway default, and timeout is positive milliseconds.
- `CreateJudgeOptions`: discriminated direct-or-gateway setup.
- `RetryOptions`: maximum attempts includes the first attempt; initial delay default `250` ms; maximum delay default `5000` ms; only `429` and `529` retry; duplicate billing is possible after a lost response.
- `DirectJevOptions`: trimmed API key; HTTP(S) base URL default `https://api.typesafe.ai`; response limit default `8_388_608` bytes; model default `jev-latest`; retries disabled unless supplied; timeout in positive milliseconds.
- `ContextBudgetOptions`: positive caller-supplied max, callback awaited before transport, threshold default `0.8`, estimates never block automatically.
- `ContextBudgetWarning`: stable code, approximate token count, configured maximum, requested model, ratio, and effective threshold.

- [ ] **Step 3: Document mock fixtures and factory**

Use these semantics:

- `BooleanFixture`: optional confidence `[0,1]`, required probability `[0,1]`, unstable raw data, selected Boolean value.
- `ChoiceFixture`: optional confidence, complete probability record summing to one, unstable raw data, selected option.
- `MockProviderOptions`: immutable FIFO Boolean and Choice fixture queues; omitted queues are empty.
- `mockProvider`: snapshots queues, consumes one fixture per successful evaluation, preserves fixtures on pre-abort, throws `ConfigurationError` code `mock_queue_exhausted` on exhaustion, and does not support Score fixtures in this release.

Add this example shape:

```ts
import { createJudge } from "@brkn-labs/judge/core";
import { mockProvider } from "@brkn-labs/judge/mock";

const judge = createJudge({
  provider: mockProvider({
    choice: [{ probabilities: { billing: 1, support: 0 }, value: "billing" }],
  }),
});
```

- [ ] **Step 4: Add final emitted markers and verify the focused gate**

Add:

```ts
"dist/index.d.ts": "Creates a Jev-backed Judge client",
"dist/mock/index.d.ts": "Creates a deterministic FIFO decision provider",
```

Run:

```bash
node --test test/jsdoc.test.ts
npm run lint
npm run typecheck
npm run typecheck:contracts
npm run typecheck:examples
```

Expected: PASS with no remote requests.

- [ ] **Step 5: Run the full repository and distribution gate**

Run:

```bash
npm run check
npm run build
npm pack --dry-run
node --test test/package-isolation.test.ts test/package-exports.test.ts
```

Expected: all unit, JSDoc, type, lint, build, package, export, and isolation checks pass.

- [ ] **Step 6: Complete the plan, commit, and update PR 1**

Mark completed checkboxes `[x]`, then run:

```bash
git add test/jsdoc.test.ts src/index.ts src/provider/jev/direct.ts src/provider/jev/types.ts src/mock/index.ts docs/superpowers/plans/2026-09-19-public-jsdoc.md
git commit -m "docs: complete public JSDoc coverage"
git status --short
git log --oneline origin/main..HEAD
git push origin feat/vercel-examples
gh pr view 1 --json url,title,headRefName,baseRefName,state
```

Expected: clean tree and the existing open pull request updated against `main`.
