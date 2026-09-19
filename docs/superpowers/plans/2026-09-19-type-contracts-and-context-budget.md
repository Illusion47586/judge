# Type Contracts and Context Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove Judge's public request-directed types, add opt-in advisory warnings for large serialized Jev requests, and normalize authoritative context-window failures.

**Architecture:** Compile positive and negative consumer contracts through the built package exports. Estimate the complete Jev request at the provider boundary so direct TypeSafe, Vercel, Cloudflare, OpenRouter, and custom gateways share one policy. Classify explicit provider context-limit signals without treating every bad request as a context failure.

**Tech Stack:** TypeScript 7, Node.js 22.18+, Node test runner, ESM package self-references, Ultracite/Biome.

## Global Constraints

- Add no dependency.
- Keep the package Node-only, ESM-only, and compatible with Node `22.18.0`.
- Use `ceil(UTF-8 byte length / 4)` only as an advisory estimate.
- Never reject a request solely because of the estimate.
- Emit no console or process warning; the feature is opt-in through a callback.
- Require `maxTokens`; do not hard-code Jev's advertised 32K window at runtime.
- Keep `/core` provider-neutral and preserve tree-shaking boundaries.
- Make no live provider request during verification.

---

### Task 1: Built-package compile-time contracts

**Files:**
- Create: `test-d/public-contracts.test-d.ts`
- Create: `tsconfig.type-contracts.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `JudgeClient`, `ChoiceDecision`, and `ScoreDecision` from the built `@brkn-labs/judge` package.
- Produces: `npm run typecheck:contracts`, proving exact valid inference and rejected invalid programs.

- [ ] **Step 1: Create the red consumer fixture**

Create `test-d/public-contracts.test-d.ts` initially without suppression comments:

```ts
import type {
  ChoiceDecision,
  JudgeClient,
  ScoreDecision,
} from "@brkn-labs/judge";

type Equal<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;
type Expect<T extends true> = T;
declare const judge: JudgeClient;

const choice = judge.choice({
  context: {},
  options: ["billing", "support"],
  question: "Route",
});
type ChoiceContract = Expect<
  Equal<typeof choice, Promise<ChoiceDecision<"billing" | "support">>>
>;
void (null as unknown as ChoiceContract);
choice.then((decision) => {
  const valid: number = decision.probabilities.billing;
  const invalid: number = decision.probabilities.sales;
  const impossible: "sales" = decision.value;
  return [valid, invalid, impossible];
});

const conditional = judge.if({
  condition: "Proceed?",
  confidence: {
    minimum: 0.8,
    uncertain: () => ({ review: true }) as const,
  },
  context: {},
  else: ({ decision }) => {
    const exact: false = decision.value;
    const impossible: true = decision.value;
    return { stopped: exact } as const;
  },
  then: ({ decision }) => {
    const exact: true = decision.value;
    const impossible: false = decision.value;
    return Promise.resolve({ started: exact } as const);
  },
});
type IfContract = Expect<
  Equal<
    typeof conditional,
    Promise<
      | { readonly review: true }
      | { readonly started: true }
      | { readonly stopped: false }
    >
  >
>;
void (null as unknown as IfContract);
conditional.then((result) => {
  const impossible: { readonly started: true } = result;
  return impossible;
});

const switched = judge.switch({
  cases: {
    billing: ({ decision }) => {
      const exact: "billing" = decision.value;
      const impossible = decision.probabilities.sales;
      void impossible;
      return { invoice: exact } as const;
    },
    support: ({ decision }) => {
      const exact: "support" = decision.value;
      return Promise.resolve({ ticket: exact } as const);
    },
  },
  confidence: {
    minimum: 0.8,
    uncertain: () => ({ review: true }) as const,
  },
  context: {},
  question: "Route",
});
type SwitchContract = Expect<
  Equal<
    Awaited<typeof switched>,
    | { readonly invoice: "billing" }
    | { readonly review: true }
    | { readonly ticket: "support" }
  >
>;
void (null as unknown as SwitchContract);
switched.then((result) => {
  const impossible: { readonly invoice: "billing" } = result;
  return impossible;
});

const score = judge.score({
  context: {},
  levels: ["low", "medium", "high"],
  question: "Risk",
});
type ScoreContract = Expect<
  Equal<typeof score, Promise<ScoreDecision<"high" | "low" | "medium">>>
>;
void (null as unknown as ScoreContract);

judge.choice({ context: {}, options: [], question: "Empty" });
judge.score({ context: {}, levels: ["only"], question: "Too short" });
```

Create `tsconfig.type-contracts.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "rootDir": "."
  },
  "include": ["test-d/**/*.ts"]
}
```

Add this script:

```json
"typecheck:contracts": "npm run build --silent && tsc --noEmit -p tsconfig.type-contracts.json"
```

- [ ] **Step 2: Verify the fixture is red**

Run: `npm run typecheck:contracts`

Expected: FAIL on `sales`, impossible Boolean assignments, empty choice options, and a one-level score. Positive equality checks must not fail.

- [ ] **Step 3: Turn every intentional rejection into a negative contract**

Add `@ts-expect-error` directly before each invalid line:

```ts
// @ts-expect-error "sales" was not declared by this request.
const invalid: number = decision.probabilities.sales;
// @ts-expect-error an undeclared choice cannot be returned.
const impossible: "sales" = decision.value;

// @ts-expect-error the else branch is narrowed to false.
const impossible: true = decision.value;
// @ts-expect-error the then branch is narrowed to true.
const impossible: false = decision.value;

// @ts-expect-error the result can be either branch or the uncertain branch.
const impossible: { readonly started: true } = result;

// @ts-expect-error switch probabilities contain only case keys.
const impossible = decision.probabilities.sales;

// @ts-expect-error the result can be any case or the uncertain branch.
const impossible: { readonly invoice: "billing" } = result;

// @ts-expect-error choice requires at least one option.
judge.choice({ context: {}, options: [], question: "Empty" });
// @ts-expect-error score requires at least two levels.
judge.score({ context: {}, levels: ["only"], question: "Too short" });
```

- [ ] **Step 4: Add the contract compiler to the main gate**

Set:

```json
"check": "npm run lint && npm run typecheck && npm run typecheck:contracts && npm run typecheck:examples && npm run test:unit"
```

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck:contracts && npm run lint`

Expected: PASS; unused `@ts-expect-error` directives must fail the compiler.

```bash
git add test-d/public-contracts.test-d.ts tsconfig.type-contracts.json package.json
git commit -m "test: add public type contracts"
```

---

### Task 2: Opt-in context-budget warnings

**Files:**
- Create: `src/provider/jev/context-budget.ts`
- Create: `test/provider/context-budget.test.ts`
- Modify: `src/provider/jev/types.ts`
- Modify: `src/provider/jev/provider.ts`
- Modify: `src/index.ts`
- Modify: `test/provider/jev-provider.test.ts`
- Modify: `test/index.test.ts`
- Modify: `test-d/public-contracts.test-d.ts`

**Interfaces:**
- Consumes: the final `GatewayEvaluationRequest` and optional `ContextBudgetOptions`.
- Produces: `ContextBudgetOptions`, `ContextBudgetWarning`, `estimateRequestTokens()`, `normalizeContextBudget()`, and `warnForContextBudget()`.

- [ ] **Step 1: Write the failing focused unit tests**

Create `test/provider/context-budget.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { ConfigurationError } from "../../src/core/index.ts";
import type { GatewayEvaluationRequest } from "../../src/gateway/types.ts";
import {
  estimateRequestTokens,
  normalizeContextBudget,
  warnForContextBudget,
} from "../../src/provider/jev/context-budget.ts";

const request: GatewayEvaluationRequest = {
  model: "typesafe-ai/jev",
  questions: { decision: { instructions: "Proceed?", type: "noul" } },
  state: { message: "hello" },
};

test("estimates the complete UTF-8 request", () => {
  const expected = Math.ceil(
    new TextEncoder().encode(JSON.stringify(request)).byteLength / 4
  );
  assert.equal(estimateRequestTokens(request), expected);
  assert.ok(estimateRequestTokens({ ...request, state: { message: "你好" } }) > 0);
});

test("warns once at the threshold and awaits the callback", async () => {
  const events: string[] = [];
  const estimatedTokens = estimateRequestTokens(request);
  const budget = normalizeContextBudget({
    maxTokens: estimatedTokens * 2,
    onWarning: async (warning) => {
      events.push("warning");
      await Promise.resolve();
      assert.deepEqual(warning, {
        code: "context_window_approaching",
        estimatedTokens,
        maxTokens: estimatedTokens * 2,
        model: request.model,
        ratio: 0.5,
        warnAt: 0.5,
      });
      events.push("complete");
    },
    warnAt: 0.5,
  });
  await warnForContextBudget(request, budget);
  events.push("returned");
  assert.deepEqual(events, ["warning", "complete", "returned"]);
});

test("validates policy construction", () => {
  const onWarning = () => undefined;
  for (const value of [
    { maxTokens: 0, onWarning },
    { maxTokens: 1.5, onWarning },
    { maxTokens: 100, onWarning, warnAt: 0 },
    { maxTokens: 100, onWarning, warnAt: 1.1 },
    { maxTokens: 100, onWarning: "log" },
  ]) {
    assert.throws(() => normalizeContextBudget(value as never), ConfigurationError);
  }
});

test("does not warn below the default threshold or without a policy", async () => {
  let calls = 0;
  const budget = normalizeContextBudget({
    maxTokens: estimateRequestTokens(request) * 2,
    onWarning: () => {
      calls += 1;
    },
  });
  await warnForContextBudget(request, budget);
  await warnForContextBudget(request, undefined);
  assert.equal(calls, 0);
});
```

- [ ] **Step 2: Run the test red**

Run: `node --test test/provider/context-budget.test.ts`

Expected: FAIL because the context-budget module does not exist.

- [ ] **Step 3: Define the types and implementation**

Add to `src/provider/jev/types.ts`:

```ts
export interface ContextBudgetWarning {
  readonly code: "context_window_approaching";
  readonly estimatedTokens: number;
  readonly maxTokens: number;
  readonly model: string;
  readonly ratio: number;
  readonly warnAt: number;
}
export interface ContextBudgetOptions {
  readonly maxTokens: number;
  readonly onWarning: (warning: Readonly<ContextBudgetWarning>) => void | Promise<void>;
  readonly warnAt?: number;
}
export interface NormalizedContextBudget {
  readonly maxTokens: number;
  readonly onWarning: ContextBudgetOptions["onWarning"];
  readonly warnAt: number;
}
```

Add `readonly contextBudget?: ContextBudgetOptions` to `CreateJevProviderOptions`.

Create `src/provider/jev/context-budget.ts`:

```ts
import { ConfigurationError } from "../../core/errors.ts";
import type { GatewayEvaluationRequest } from "../../gateway/types.ts";
import type {
  ContextBudgetOptions,
  ContextBudgetWarning,
  NormalizedContextBudget,
} from "./types.ts";

export const estimateRequestTokens = (request: GatewayEvaluationRequest): number =>
  Math.ceil(new TextEncoder().encode(JSON.stringify(request)).byteLength / 4);

export const normalizeContextBudget = (
  value: ContextBudgetOptions | undefined
): NormalizedContextBudget | undefined => {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value.maxTokens) || value.maxTokens <= 0) {
    throw new ConfigurationError("contextBudget.maxTokens must be a positive integer.");
  }
  const warnAt = value.warnAt ?? 0.8;
  if (!Number.isFinite(warnAt) || warnAt <= 0 || warnAt > 1) {
    throw new ConfigurationError("contextBudget.warnAt must be greater than zero and at most one.");
  }
  if (typeof value.onWarning !== "function") {
    throw new ConfigurationError("contextBudget.onWarning must be a function.");
  }
  return Object.freeze({ maxTokens: value.maxTokens, onWarning: value.onWarning, warnAt });
};

export const warnForContextBudget = async (
  request: GatewayEvaluationRequest,
  budget: NormalizedContextBudget | undefined
): Promise<void> => {
  if (!budget) return;
  const estimatedTokens = estimateRequestTokens(request);
  const ratio = estimatedTokens / budget.maxTokens;
  if (ratio < budget.warnAt) return;
  const warning: ContextBudgetWarning = Object.freeze({
    code: "context_window_approaching",
    estimatedTokens,
    maxTokens: budget.maxTokens,
    model: request.model,
    ratio,
    warnAt: budget.warnAt,
  });
  await budget.onWarning(warning);
};
```

- [ ] **Step 4: Verify the unit and add provider ordering tests**

Run: `node --test test/provider/context-budget.test.ts`

Expected: PASS.

Append to `test/provider/jev-provider.test.ts`:

```ts
test("awaits a context warning before transport", async () => {
  const events: string[] = [];
  const provider = createJevProvider({
    contextBudget: {
      maxTokens: 1,
      onWarning: async () => {
        events.push("warning");
        await Promise.resolve();
        events.push("warning-complete");
      },
    },
    gateway: gatewayWith(
      { answers: { decision: { noul: 0.8, type: "noul" } } },
      () => events.push("transport")
    ),
  });
  await provider.boolean({ condition: "Proceed?", context: {} });
  assert.deepEqual(events, ["warning", "warning-complete", "transport"]);
});

test("does not send when the warning callback fails", async () => {
  const failure = new Error("telemetry unavailable");
  let calls = 0;
  const provider = createJevProvider({
    contextBudget: {
      maxTokens: 1,
      onWarning: () => {
        throw failure;
      },
    },
    gateway: gatewayWith({}, () => {
      calls += 1;
    }),
  });
  await assert.rejects(
    provider.boolean({ condition: "Proceed?", context: {} }),
    (error) => error === failure
  );
  assert.equal(calls, 0);
});
```

- [ ] **Step 5: Wire the complete request before transport**

In `createJevProvider()`, call `normalizeContextBudget(options.contextBudget)`
once. Change its internal evaluation boundary to:

```ts
const evaluate = async (
  gateway: GatewayPlugin,
  request: GatewayEvaluationRequest,
  options: GatewayRequestOptions | undefined,
  contextBudget: NormalizedContextBudget | undefined
): Promise<GatewayEvaluationResult> => {
  throwIfAborted(options?.signal);
  await warnForContextBudget(request, contextBudget);
  throwIfAborted(options?.signal);
  try {
    return await gateway.evaluate(request, options);
  } catch (cause) {
    if (cause instanceof JudgeError) throw cause;
    if (options?.signal?.aborted) {
      throw new AbortError("The Judge evaluation was aborted.", { cause });
    }
    throw new ProviderError("The Jev gateway evaluation failed.", {
      cause,
      code: "gateway_error",
    });
  }
};
```

Build each Boolean, Choice, and Score request in a local constant and pass that
same object plus `contextBudget` to `evaluate()`.

- [ ] **Step 6: Expose root configuration and contracts**

Add optional `contextBudget?: ContextBudgetOptions` to both root direct and
gateway branches in `src/index.ts`, pass it into `createJevProvider()`, and
export `ContextBudgetOptions` and `ContextBudgetWarning`.

Add this root test to `test/index.test.ts` using existing imports for
`createJudge` and `defineGateway`:

```ts
test("root Judge forwards context budgets", async () => {
  const events: string[] = [];
  const gateway = defineGateway({
    capabilities: {
      batching: false,
      boolean: true,
      choice: true,
      customHeaders: false,
      jev: true,
      score: true,
    },
    evaluate: () => {
      events.push("transport");
      return Promise.resolve({
        body: { answers: { decision: { noul: 0.9, type: "noul" } } },
      });
    },
    id: "test",
    model: "typesafe-ai/jev",
  });
  const judge = createJudge({
    contextBudget: {
      maxTokens: 1,
      onWarning: () => events.push("warning"),
    },
    gateway,
  });
  await judge.boolean({ condition: "Proceed?", context: {} });
  assert.deepEqual(events, ["warning", "transport"]);
});
```

Append these public contracts:

```ts
import { createJudge } from "@brkn-labs/judge";
import type { ContextBudgetOptions, ContextBudgetWarning } from "@brkn-labs/judge";
import type { GatewayPlugin } from "@brkn-labs/judge/gateway/custom";
declare const gateway: GatewayPlugin;
const budget: ContextBudgetOptions = {
  maxTokens: 32_768,
  onWarning: (warning) => {
    const exact: ContextBudgetWarning = warning;
    return Promise.resolve(exact).then(() => undefined);
  },
  warnAt: 0.8,
};
createJudge({ contextBudget: budget, gateway });
// @ts-expect-error maxTokens is required.
createJudge({ contextBudget: { onWarning: () => undefined }, gateway });
// @ts-expect-error warning delivery must be a callback.
createJudge({ contextBudget: { maxTokens: 32_768, onWarning: "console" }, gateway });
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
node --test test/provider/context-budget.test.ts test/provider/jev-provider.test.ts test/index.test.ts
npm run typecheck:contracts
npm run lint
```

Expected: PASS without network access.

```bash
git add src/provider/jev/context-budget.ts src/provider/jev/types.ts src/provider/jev/provider.ts src/index.ts test/provider/context-budget.test.ts test/provider/jev-provider.test.ts test/index.test.ts test-d/public-contracts.test-d.ts
git commit -m "feat: add Jev context budget warnings"
```

---

### Task 3: Context-limit error normalization

**Files:**
- Modify: `src/core/errors.ts`
- Modify: `src/core/index.ts`
- Modify: `src/index.ts`
- Modify: `src/gateway/errors.ts`
- Modify: `src/provider/jev/http.ts`
- Modify: `src/provider/jev/direct.ts`
- Create: `test/gateway/errors.test.ts`
- Modify: `test/provider/direct-jev.test.ts`
- Modify: `test-d/public-contracts.test-d.ts`

**Interfaces:**
- Consumes: unknown nested gateway failures and bounded direct-provider error bodies.
- Produces: `ContextLimitError`, code `context_limit`, and `isContextLimitFailure(value)`.

- [ ] **Step 1: Write failing gateway tests**

Create `test/gateway/errors.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { ContextLimitError, ProviderError } from "../../src/core/index.ts";
import { normalizeGatewayError } from "../../src/gateway/errors.ts";

test("normalizes explicit nested context failures", () => {
  const cause = {
    statusCode: 400,
    data: { error: { message: "Maximum context length exceeded.", type: "context_length_exceeded" } },
  };
  assert.throws(
    () => normalizeGatewayError(cause),
    (error) => error instanceof ContextLimitError && error.code === "context_limit" && error.cause === cause
  );
});

test("does not infer context failure from status alone", () => {
  for (const statusCode of [400, 413, 422]) {
    assert.throws(
      () => normalizeGatewayError({ statusCode }),
      (error) => error instanceof ProviderError && !(error instanceof ContextLimitError) && error.code === "invalid_request"
    );
  }
});
```

- [ ] **Step 2: Run the tests red**

Run: `node --test test/gateway/errors.test.ts`

Expected: FAIL because `ContextLimitError` and explicit classification do not exist.

- [ ] **Step 3: Add the error and classifier**

Add to `src/core/errors.ts`:

```ts
export class ContextLimitError extends ProviderError {
  constructor(
    message = "The request exceeds the model context window.",
    options?: JudgeErrorOptions
  ) {
    super(message, { ...options, code: "context_limit" });
  }
}
```

Export it from `src/core/index.ts` and `src/index.ts`. In
`src/gateway/errors.ts`, add this cycle-safe classifier:

```ts
const CONTEXT_CODE = /^(?:context_length_exceeded|context_window_exceeded|max_context_length_exceeded)$/iu;
const CONTEXT_MESSAGE = /(?:context\s+(?:length|window)|token\s+limit).*(?:exceed|maximum|too\s+(?:large|long))/iu;

const CONTEXT_FIELDS = [
  "cause",
  "code",
  "data",
  "error",
  "message",
  "response",
  "responseBody",
  "type",
] as const;

export const isContextLimitFailure = (value: unknown): boolean => {
  const seen = new Set<object>();
  const visit = (candidate: unknown, depth: number): boolean => {
    if (typeof candidate === "string") {
      return CONTEXT_CODE.test(candidate) || CONTEXT_MESSAGE.test(candidate);
    }
    if (!isRecord(candidate) || depth > 6 || seen.has(candidate)) {
      return false;
    }
    seen.add(candidate);
    return CONTEXT_FIELDS.some((field) =>
      Object.hasOwn(candidate, field) ? visit(candidate[field], depth + 1) : false
    );
  };
  return visit(value, 0);
};
```

Export `isContextLimitFailure(value: unknown): boolean`. Invoke it in
`normalizeGatewayError()` after abort/timeout handling and before status
mapping, throwing `new ContextLimitError(undefined, { cause })`. Map bare `413`
to `invalid_request`, not `context_limit`.

- [ ] **Step 4: Verify gateway behavior and write the direct red test**

Run:

```bash
node --test test/gateway/errors.test.ts test/gateway/vercel.test.ts test/gateway/cloudflare.test.ts test/gateway/openrouter.test.ts
```

Expected: PASS.

Append to `test/provider/direct-jev.test.ts`:

```ts
test("maps an explicit direct-provider context error", async () => {
  const gateway = directJevGateway(
    { apiKey: "secret" },
    () =>
      Promise.resolve(
        Response.json(
          {
            error: {
              message: "Maximum context length exceeded.",
              type: "context_length_exceeded",
            },
          },
          { status: 422 }
        )
      )
  );
  await assert.rejects(
    gateway.evaluate({ model: "jev", questions: {}, state: {} }),
    (error) =>
      error instanceof ContextLimitError && error.code === "context_limit"
  );
});
```

Run: `node --test test/provider/direct-jev.test.ts`

Expected: FAIL because direct transport discards error bodies.

- [ ] **Step 5: Inspect bounded direct error bodies**

Add to `src/provider/jev/http.ts`:

```ts
export const errorForResponse = async (
  response: Response,
  maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
): Promise<ProviderError> => {
  let body: unknown;
  try {
    body = await readBoundedJson(response, maxResponseBytes);
  } catch {
    body = undefined;
  }
  if (isContextLimitFailure(body)) {
    return new ContextLimitError(undefined, { cause: body });
  }
  return errorForStatus(response.status);
};
```

Import its dependencies. In `src/provider/jev/direct.ts`, replace
`throw errorForStatus(response.status)` with:

```ts
throw await errorForResponse(response, config.maxResponseBytes);
```

- [ ] **Step 6: Add the public type contract, verify, and commit**

Append:

```ts
import { ContextLimitError, ProviderError } from "@brkn-labs/judge";
const contextError: ProviderError = new ContextLimitError();
const contextCode: string = contextError.code;
void contextCode;
```

Run:

```bash
node --test test/gateway/errors.test.ts test/provider/direct-jev.test.ts
npm run typecheck:contracts
npm run lint
```

Expected: PASS.

```bash
git add src/core/errors.ts src/core/index.ts src/index.ts src/gateway/errors.ts src/provider/jev/http.ts src/provider/jev/direct.ts test/gateway/errors.test.ts test/provider/direct-jev.test.ts test-d/public-contracts.test-d.ts
git commit -m "feat: normalize context limit errors"
```

---

### Task 4: Documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-09-19-type-contracts-and-context-budget.md`

**Interfaces:**
- Consumes: the completed public API and tests.
- Produces: user guidance and an updated pull request branch.

- [ ] **Step 1: Document the limit and advisory policy**

Add `## Context windows and usage limits` after Gateway setup. Include the
complete `createJudge({ gateway, contextBudget: { maxTokens: 32_768, warnAt:
0.8, onWarning } })` example. State explicitly:

```md
Jev currently advertises a 32K-token context window. A context window limits
the serialized input accepted by one evaluation; it is different from a
request rate limit or an account credit/quota.

Judge estimates the UTF-8 size of the complete serialized request. The result
is advisory rather than an exact tokenizer count, and Judge never blocks a
request from that estimate. The provider remains authoritative; an explicit
provider rejection is exposed as `ContextLimitError` with code
`context_limit`. Confirm the current model limit in your provider catalog
before configuring production policy.
```

- [ ] **Step 2: Run focused and full gates**

Run:

```bash
node --test test/provider/context-budget.test.ts test/provider/jev-provider.test.ts test/gateway/errors.test.ts test/provider/direct-jev.test.ts test/index.test.ts
npm run typecheck:contracts
npm run typecheck:examples
npm run check
npm run build
npm pack --dry-run
```

Expected: all checks pass without live provider requests.

- [ ] **Step 3: Verify isolation and credential safety**

Run:

```bash
node --test test/package-isolation.test.ts test/package-exports.test.ts
git check-ignore .env .env.local
git ls-files .env .env.local
git grep -n -E 'AI_GATEWAY_API_KEY=[[:alnum:]_./+-]{16,}' -- ':!docs/superpowers/**'
```

Expected: isolation tests pass; environment files are ignored and untracked;
the credential scan prints nothing.

- [ ] **Step 4: Complete the plan and commit**

Mark every completed checkbox `[x]`, then run:

```bash
git add README.md docs/superpowers/plans/2026-09-19-type-contracts-and-context-budget.md
git commit -m "docs: explain Jev context budgets"
git status --short
```

Expected: clean working tree.

- [ ] **Step 5: Review and update pull request 1**

Run:

```bash
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git push origin feat/vercel-examples
gh pr view 1 --json url,title,headRefName,baseRefName
```

Expected: the branch is pushed and pull request 1 still targets `main`.
