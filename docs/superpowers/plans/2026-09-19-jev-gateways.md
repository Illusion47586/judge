# Jev Provider and Gateway Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver the default Jev-backed Judge client, exact Score decisions, Vercel/Cloudflare/OpenRouter gateway subpaths, and a public custom Jev transport contract without weakening type safety or tree-shaking.

**Architecture:** Core gains only provider-neutral Score validation. A shared Jev provider outside core serializes context, maps typed Judge inputs to one named Jev question, validates untrusted answers, and delegates transport to a `GatewayPlugin`. Direct TypeSafe and each optional gateway are isolated ESM modules; root imports only direct/shared Jev code and accepts externally-created plugins.

**Tech Stack:** Node.js 22.18+, TypeScript 7, Node `fetch`, Node `node:test`, AI SDK 7.0.x, `@ai-sdk/gateway` 4.0.x, Cloudflare SDK 7.1.x, Ultracite/Biome.

## Global Constraints

- The package remains ESM-only and declares `"sideEffects": false`.
- `/core` has no Jev, TypeSafe, gateway, SDK, or custom-adapter runtime dependency.
- Root includes direct TypeSafe transport but imports no optional gateway SDK.
- Vercel and Cloudflare SDKs are optional peers; OpenRouter and custom adapters add no runtime dependency.
- Every transport preserves Jev's state-and-questions protocol and never invokes application callbacks.
- Chat completions, tool calls, generated prose, and generic structured-output prompting are forbidden Jev emulations.
- Transport bodies are `unknown` until exhaustively validated by the shared Jev provider.
- Public Boolean, Choice, and Score responses remain request-directed and compile-time exact.
- Probability values are finite `[0, 1]` numbers and distributions sum to `1` within absolute tolerance `1e-6`.
- The caller signal reaches the transport; caller cancellation is `AbortError`, while local timeout is `ProviderError` code `timeout`.
- Direct TypeSafe retries are opt-in and limited to HTTP `429` and `529`.
- No normal test requires a live credential or network call.
- This directory is not a Git repository, so the plan has no commit steps.

---

### Task 1: Add exact lower-level Score support to core

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/validate.ts`
- Modify: `src/core/client.ts`
- Modify: `src/core/index.ts`
- Create: `test/core/score.test.ts`
- Modify: `test/core/types.test.ts`

**Interfaces:**
- Consumes: existing `ScoreInput`, `ScoreDecision`, `DecisionProvider.score()`, abort handling, and stable core errors.
- Produces: `ScoreOptions`, `JudgeClient.score()`, `normalizeScoreLevels()`, and `validateScoreDecision()`.

- [x] **Step 1: Write failing Score runtime tests**

Cover trimmed question, exact ordered levels, finite score bounds, exact returned
levels, aligned probability length, finite unit probabilities, distribution sum,
confidence, cancellation, and no provider call for invalid local input.

```ts
const result = await judge.score({
  context: { incident: "database latency" },
  levels: ["low", "medium", "high"],
  question: "  How severe is this?  ",
});

assert.deepEqual(result.levels, ["low", "medium", "high"]);
assert.equal(result.score, 1.8);
```

- [x] **Step 2: Run the Score test in the red state**

Run: `node --test test/core/score.test.ts`

Expected: FAIL because `JudgeClient.score()` does not exist.

- [x] **Step 3: Add Score options and client typing**

```ts
export interface ScoreOptions<
  S,
  L extends readonly [string, string, ...string[]],
> extends ScoreInput<S, L> {}

export interface JudgeClient {
  score: <S, const L extends readonly [string, string, ...string[]]>(
    options: ScoreOptions<S, L>
  ) => Promise<ScoreDecision<L[number]>>;
}
```

Export `ScoreOptions` through `/core`.

- [x] **Step 4: Implement Score local and provider-result validation**

Require at least two unique, non-empty, already-trimmed levels. Validate that
returned levels equal the request by index, probability length equals level
length, every probability and confidence is finite in `[0, 1]`, the sum differs
from `1` by at most `1e-6`, and score is finite in
`[0, levels.length - 1]`. Invalid local input is `ConfigurationError`; invalid
provider output is `ProviderContractError`.

- [x] **Step 5: Implement the Score evaluation pipeline**

```ts
const evaluateScore = async <
  S,
  const L extends readonly [string, string, ...string[]],
>(provider: DecisionProvider, options: ScoreOptions<S, L>) => {
  const question = normalizeQuestion(options.question);
  const levels = normalizeScoreLevels(options.levels);
  throwIfAborted(options.signal);
  const decision = await provider.score({
    context: options.context,
    levels,
    question,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  throwIfAborted(options.signal);
  return validateScoreDecision(decision, levels);
};
```

- [x] **Step 6: Lock request-directed Score inference**

Extend `test/core/types.test.ts`:

```ts
const scored = judge.score({
  context: {},
  levels: ["low", "medium", "high"],
  question: "Severity",
});
type ScoreResult = Expect<
  Equal<typeof scored, Promise<ScoreDecision<"low" | "medium" | "high">>>
>;
```

- [x] **Step 7: Run focused core gates**

Run: `node --test test/core/score.test.ts && npm run typecheck`

Expected: all Score tests and type assertions pass.

### Task 2: Define the gateway contract and custom adapter

**Files:**
- Create: `src/gateway/types.ts`
- Create: `src/gateway/custom.ts`
- Create: `test/gateway/custom.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `JevQuestion`, `GatewayEvaluationRequest`, `GatewayRequestOptions`, `GatewayEvaluationResult`, `GatewayCapabilities`, `GatewayMetadata`, `GatewayPlugin`, and `defineGateway()`.

- [x] **Step 1: Write failing custom adapter tests**

Test a valid snapshot, an empty/untrimmed id or model, missing/non-boolean
capabilities, a non-function evaluator, immutability after construction, and
request/result identity through the evaluator.

```ts
const plugin = defineGateway({
  id: "internal",
  model: "internal/jev",
  capabilities: ALL_CAPABILITIES,
  evaluate: (request) => Promise.resolve({ body: request }),
});
assert.equal(plugin.id, "internal");
```

- [x] **Step 2: Run the custom adapter test in the red state**

Run: `node --test test/gateway/custom.test.ts`

Expected: FAIL because `/gateway/custom` source does not exist.

- [x] **Step 3: Define complete transport types**

Use the exact interfaces from
`docs/superpowers/specs/2026-09-19-jev-gateways-design.md`. Keep
`GatewayEvaluationResult.body` as `unknown`; do not place these types in core.

- [x] **Step 4: Implement `defineGateway()` validation and snapshotting**

Validate trimmed `id` and `model`, all six explicit boolean capability fields,
and a function evaluator. Copy/freeze identity and capability data while retaining
the evaluator function:

```ts
return Object.freeze({
  capabilities: Object.freeze({ ...definition.capabilities }),
  evaluate: definition.evaluate,
  id: definition.id,
  model: definition.model,
});
```

- [x] **Step 5: Add the custom package export**

Add `./gateway/custom` to `package.json`, targeting
`dist/gateway/custom.{js,d.ts}`. Do not export a gateway barrel that imports
built-ins.

- [x] **Step 6: Run custom adapter tests and medium checks**

Run: `node --test test/gateway/custom.test.ts && npm run typecheck && npm run lint`

Expected: all commands pass.

### Task 3: Implement shared Jev serialization and response normalization

**Files:**
- Create: `src/provider/jev/serialize.ts`
- Create: `src/provider/jev/normalize.ts`
- Create: `src/provider/jev/provider.ts`
- Create: `src/provider/jev/types.ts`
- Create: `test/provider/jev-provider.test.ts`
- Modify: `src/core/types.ts`
- Modify: `src/core/index.ts`

**Interfaces:**
- Consumes: `DecisionProvider`, exact Boolean/Choice/Score inputs and decisions, `GatewayPlugin`, stable core errors.
- Produces: `createJevProvider({ gateway, model?, timeoutMs? })`, `ProviderMetadata`, JSON-safe context serialization, and normalized decisions.

- [x] **Step 1: Write failing shared-provider contract tests**

Use `defineGateway()` fakes to cover exact request mapping for all three kinds,
serialization failure before transport, immutable JSON-compatible state,
capability rejection before transport, answer-name/kind validation, impossible
Choice, Score legend mismatch, all probability failures, gateway metadata,
unknown error wrapping, stable Judge error passthrough, and cancellation.

```ts
const provider = createJevProvider({ gateway });
const choice = await provider.choice({
  context: { ticket: "refund" },
  options: ["billing", "support"],
  question: "Route this",
});
assert.equal(choice.value, "billing");
assert.deepEqual(Object.keys(choice.probabilities).sort(), ["billing", "support"]);
```

- [x] **Step 2: Run the shared-provider test in the red state**

Run: `node --test test/provider/jev-provider.test.ts`

Expected: FAIL because the Jev provider does not exist.

- [x] **Step 3: Add additive provider metadata types**

```ts
export interface ProviderMetadata {
  gateway?: string;
  latencyMs?: number;
  model: string;
  provider: "jev";
  raw?: unknown;
  requestId?: string;
  resolvedModel?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}
```

Add optional `metadata?: ProviderMetadata` to Boolean, Choice, and Score
decisions. Existing providers may omit it.

- [x] **Step 4: Implement JSON-safe context serialization**

```ts
export const serializeState = (context: unknown): unknown => {
  try {
    const serialized = JSON.stringify(context);
    if (serialized === undefined) {
      throw new TypeError("Context has no JSON representation.");
    }
    return JSON.parse(serialized) as unknown;
  } catch (cause) {
    throw new SerializationError("Judge context could not be serialized.", {
      cause,
    });
  }
};
```

- [x] **Step 5: Implement strict Jev answer normalization**

Parse the response as an object with `answers` and exactly the generated question
id. Map Noul probability to `value = probability >= 0.5` and selected-outcome
confidence. Map Choice directly after exact option/probability validation. Map
Score legend keys `0..n-1` to the exact ordered request levels, align
probabilities, and validate score/confidence. Attach normalized metadata only
after validating every included metadata field.

- [x] **Step 6: Implement `createJevProvider()`**

For each method, validate `gateway.capabilities.jev` and the operation-specific
capability, serialize context, build one question named `decision`, call
`gateway.evaluate()` with the same signal and configured timeout, wrap unknown
failures as `ProviderError` code `gateway_error`, and return the normalized
decision. Generate these exact criteria when core has no descriptions:

```ts
// Boolean
{ type: "noul", instructions: input.condition }

// Choice
{
  type: "choice",
  instructions: input.question,
  criteria: Object.fromEntries(input.options.map((option) => [option, option])),
}

// Score
{ type: "score", instructions: input.question, criteria: input.levels }
```

- [x] **Step 7: Run the shared provider suite**

Run: `node --test test/provider/jev-provider.test.ts && npm run typecheck`

Expected: all semantic, error, and exact-type checks pass.

### Task 4: Implement direct TypeSafe transport and root factory

**Files:**
- Create: `src/provider/jev/http.ts`
- Create: `src/provider/jev/direct.ts`
- Modify: `src/index.ts`
- Create: `test/provider/direct-jev.test.ts`
- Create: `test/root.test.ts`

**Interfaces:**
- Consumes: `GatewayPlugin`, shared Jev provider, stable errors, native `fetch`.
- Produces: direct TypeSafe gateway, `DirectJevOptions`, `GatewayJevOptions`, and root `createJudge({ apiKey | gateway })`.

- [x] **Step 1: Write failing bounded-fetch and root tests**

Inject fake `fetch` functions and test URL/header/body mapping, 8 MiB default
limit, malformed JSON, 401/422/429/529/other status mapping, caller abort,
timeout, no default retry, explicit 429/529 retries, `Retry-After`, and validation
of retry/base URL/response-size options. Root tests cover api-key mode, gateway
mode, both/neither rejection, and preservation of exact client types.

- [x] **Step 2: Run direct/root tests in the red state**

Run: `node --test test/provider/direct-jev.test.ts test/root.test.ts`

Expected: FAIL because root is empty and direct transport is missing.

- [x] **Step 3: Implement shared bounded JSON fetch helpers**

Create helpers that compose caller and timeout signals, read response streams
with a byte counter before JSON parsing, classify caller abort separately from
timeout, parse `Retry-After` seconds or HTTP dates, and map status codes to stable
`ProviderError` codes without exposing response bodies.

- [x] **Step 4: Implement the direct TypeSafe plugin**

Post to the normalized base URL plus `/v1/systemone`, set Bearer and JSON headers,
send `{ model, state, questions }`, and return `{ body, metadata }`. Retry only
429/529 when configured and never exceed `maxAttempts`.

- [x] **Step 5: Implement the mutually-exclusive root factory**

```ts
export type CreateJudgeOptions = DirectJevOptions | GatewayJevOptions;

export const createJudge = (options: CreateJudgeOptions): JudgeClient => {
  const gateway = "gateway" in options
    ? options.gateway
    : directJevGateway(options);
  return createCoreJudge({
    provider: createJevProvider({
      gateway,
      ...(options.model ? { model: options.model } : {}),
      ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    }),
  });
};
```

Runtime validation must still reject unsafe JavaScript callers that provide both
or neither configuration.

- [x] **Step 6: Run direct/root and regression suites**

Run: `node --test test/provider/direct-jev.test.ts test/root.test.ts test/core/*.test.ts`

Expected: direct/root tests pass and core remains unchanged.

### Task 5: Implement the Vercel AI Gateway adapter

**Files:**
- Create: `src/gateway/vercel.ts`
- Create: `test/gateway/vercel.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: shared gateway contract, optional `ai` and `@ai-sdk/gateway` peers.
- Produces: `vercelGateway(options)` with default model `typesafe-ai/jev`.

- [x] **Step 1: Install and inspect the pinned optional peers**

Run: `npm install --save-dev ai@^7.0.107 @ai-sdk/gateway@^4.0.87`

Then add matching optional `peerDependencies` and
`peerDependenciesMeta.<package>.optional = true`. Inspect installed declarations
for `experimental_evaluate`, `createGateway`, question types, result shape,
signal, headers, and provider metadata before writing the adapter.

- [x] **Step 2: Write failing Vercel adapter tests**

Inject a narrow evaluator seam. Test explicit config validation, default/custom
model, Noul-to-Boolean discriminator mapping, Choice/Score preservation,
signal/timeout forwarding, result conversion to shared Jev body, metadata, and
SDK error normalization.

- [x] **Step 3: Run the Vercel test in the red state**

Run: `node --test test/gateway/vercel.test.ts`

Expected: FAIL because the adapter does not exist.

- [x] **Step 4: Implement `vercelGateway()` against installed SDK types**

Construct `createGateway({ apiKey, baseURL, headers })`, pass its model to
`experimental_evaluate()`, convert only `type: "noul"` to the SDK's documented
`type: "boolean"`, preserve all criteria, and convert returned answers into the
shared Jev response envelope. Keep the evaluator injection private/test-only via
a symbol or internal factory rather than broadening the public options.

- [x] **Step 5: Add and verify the Vercel export**

Add `./gateway/vercel` targeting `dist/gateway/vercel.{js,d.ts}`. Run:

`node --test test/gateway/vercel.test.ts && npm run typecheck`

Expected: all commands pass.

### Task 6: Implement the Cloudflare adapter

**Files:**
- Create: `src/gateway/cloudflare.ts`
- Create: `test/gateway/cloudflare.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: shared gateway contract and optional official `cloudflare` peer.
- Produces: `cloudflareGateway(options)` with default model `typesafe/jev`.

- [x] **Step 1: Install and inspect the pinned Cloudflare peer**

Run: `npm install --save-dev cloudflare@^7.1.0`

Add a matching optional peer declaration. Inspect `client.ai.run()` declarations
for custom model inputs, headers, abort signals, and response envelopes.

- [x] **Step 2: Write failing Cloudflare adapter tests**

Inject the narrow `ai.run()` surface. Test account/token/model validation,
`state`/`questions` preservation, account id, optional `cf-aig-gateway-id`,
response envelope extraction, metadata, signal forwarding, and SDK status/error
normalization.

- [x] **Step 3: Run the Cloudflare test in the red state**

Run: `node --test test/gateway/cloudflare.test.ts`

Expected: FAIL because the adapter does not exist.

- [x] **Step 4: Implement `cloudflareGateway()` against installed SDK types**

Construct `new Cloudflare({ apiToken })`, call `client.ai.run(model, params,
requestOptions)`, pass the Jev input without prompt conversion, unwrap the
official response envelope exactly once, and return shared gateway metadata.
Keep the injected narrow client in an internal factory.

- [x] **Step 5: Add and verify the Cloudflare export**

Add `./gateway/cloudflare` targeting `dist/gateway/cloudflare.{js,d.ts}`. Run:

`node --test test/gateway/cloudflare.test.ts && npm run typecheck`

Expected: all commands pass.

### Task 7: Implement the OpenRouter Decisions adapter

**Files:**
- Create: `src/gateway/openrouter.ts`
- Create: `test/gateway/openrouter.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: shared gateway contract and bounded native-fetch helpers.
- Produces: `openRouterGateway(options)` with default model `typesafe/jev-1.13`.

- [x] **Step 1: Write failing OpenRouter transport tests**

Inject fake fetch and test the exact `/api/alpha/decisions` URL, Bearer auth,
`HTTP-Referer`, `X-OpenRouter-Title`, model override, provider routing object,
state/questions preservation, response bound, cancellation/timeout, stable
status mapping, metadata extraction, and proof that no chat payload or endpoint
is used.

- [x] **Step 2: Run the OpenRouter test in the red state**

Run: `node --test test/gateway/openrouter.test.ts`

Expected: FAIL because the adapter does not exist.

- [x] **Step 3: Implement `openRouterGateway()`**

Post `{ model, state, questions, provider? }` with native fetch. Normalize the
base URL so the default resolves exactly to
`https://openrouter.ai/api/alpha/decisions`. Use the shared response-bound,
timeout, abort, and HTTP error helpers. Do not import `@openrouter/sdk` and do not
send `messages`, `response_format`, or `tools`.

- [x] **Step 4: Add and verify the OpenRouter export**

Add `./gateway/openrouter` targeting `dist/gateway/openrouter.{js,d.ts}`. Run:

`node --test test/gateway/openrouter.test.ts && npm run typecheck`

Expected: all commands pass.

### Task 8: Complete documentation, packaging, and isolation verification

**Files:**
- Modify: `README.md`
- Modify: `docs/specs/provider-jev.md`
- Modify: `docs/specs/gateway-plugins.md`
- Modify: `docs/specs/core.md`
- Modify: `test/package-exports.test.ts`
- Create: `test/package-isolation.test.ts`
- Modify: `docs/superpowers/plans/2026-09-19-jev-gateways.md`

**Interfaces:**
- Confirms all public examples, declarations, optional-peer behavior, and module boundaries match implementation.

- [x] **Step 1: Update user-facing documentation**

Add concise direct, Vercel, Cloudflare, OpenRouter, and custom examples; document
each required optional install; warn about explicit retry billing; document Score
as lower-level only; and update gateway specs with actual SDK/HTTP choices and
verified model identifiers.

- [x] **Step 2: Expand package export tests**

After build, import root, core, mock, custom, Vercel, Cloudflare, and OpenRouter
entry points independently. Assert expected factory exports and root
`createJudge`. Tests run with dev copies of optional peers installed.

- [x] **Step 3: Add emitted-graph isolation tests**

Read emitted JS files and recursively follow relative imports. Assert these
forbidden dependency names are absent from each graph:

```ts
const boundaries = {
  core: ["jev", "gateway", "cloudflare", "@ai-sdk", "openrouter"],
  root: ["cloudflare", "@ai-sdk/gateway", "@openrouter/sdk"],
  custom: ["cloudflare", "@ai-sdk", "openrouter"],
  vercel: ["cloudflare", "openrouter"],
  cloudflare: ["@ai-sdk", "openrouter"],
  openrouter: ["cloudflare", "@ai-sdk"],
};
```

Also assert no graph includes `/mock` unless importing the mock subpath.

- [x] **Step 4: Run medium package gates**

Run: `npm run fix && npm run lint && npm run typecheck && npm run build`

Expected: all commands pass with emitted declarations for every subpath.

- [x] **Step 5: Run full verification**

Run:

```text
npm run check
npm run test:coverage
npm run build
npm pack --dry-run
npx ultracite doctor
```

Expected: every command exits zero; normal tests make no live network requests;
Ultracite reports no warnings or failures.

- [x] **Step 6: Mark the plan complete**

Change each completed checkbox in this file from `[ ]` to `[x]` only after its
corresponding verification passes.
