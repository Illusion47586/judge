# Jev Provider and Gateway Adapters Design

## Goal

Implement Judge's shared Jev provider, the default direct TypeSafe transport,
Vercel AI Gateway, Cloudflare, OpenRouter, and a public custom gateway adapter
contract.

All transports preserve Jev's native state-and-questions protocol. None may
emulate Jev through chat completions, generated prose, tool calls, or generic
JSON-schema prompting.

## Public entry points

The package adds these independent ESM subpaths:

```text
@brkn-labs/judge
@brkn-labs/judge/gateway/custom
@brkn-labs/judge/gateway/vercel
@brkn-labs/judge/gateway/cloudflare
@brkn-labs/judge/gateway/openrouter
```

Existing `/core` and `/mock` entry points remain provider-neutral and
independent.

The root `createJudge()` configures the shared Jev provider and accepts exactly
one transport configuration:

```ts
const direct = createJudge({
  apiKey: process.env.TYPESAFE_API_KEY!,
});

const routed = createJudge({
  gateway: vercelGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY!,
  }),
});
```

Passing both `apiKey` and `gateway`, passing neither, or passing an empty API key
throws `ConfigurationError` before evaluation. No factory reads credentials or
selects a gateway from environment variables implicitly.

```ts
interface DirectJevOptions {
  apiKey: string;
  baseUrl?: string;
  maxResponseBytes?: number;
  model?: string;
  retry?: RetryOptions;
  timeoutMs?: number;
}

interface GatewayJevOptions {
  gateway: GatewayPlugin;
  model?: string;
  timeoutMs?: number;
}
```

## Architecture and ownership

The shared Jev provider owns semantic behavior:

- serializing structured Judge context into Jev state;
- mapping Boolean, Choice, and Score requests into named Jev questions;
- generating collision-safe internal question identifiers;
- calling one configured transport;
- treating every transport response as untrusted;
- validating answer kind, selected values, ordered levels, probabilities,
  confidence, and distribution sums;
- returning the exact request-directed Judge decision types;
- normalizing provider metadata;
- never invoking application callbacks.

A gateway plugin owns only transport behavior:

- credentials and endpoint selection;
- model identifiers and gateway-specific routing options;
- SDK or HTTP execution;
- request cancellation and local timeout propagation;
- transport response extraction;
- gateway-specific metadata extraction;
- normalization of vendor failures into stable Judge errors.

Core continues to own configuration validation for `if()` and `switch()`,
confidence routing, final cancellation checks, and exactly-one-callback
execution.

This milestone also exposes the already-specified lower-level `judge.score()`
method. Without it, the Score capability promised by every Jev transport would
not be reachable through the Judge client. `score()` returns a
`ScoreDecision<L[number]>` whose levels retain the request's exact ordered
literal tuple. It has no control-flow wrapper.

## Shared Jev wire contract

Gateway contracts live outside `/core` and are exported through
`/gateway/custom` so third-party transports can implement them without importing
a built-in gateway.

```ts
export type JevQuestion =
  | {
      type: "noul";
      instructions: string;
      criteria?: { readonly true: string; readonly false: string };
    }
  | {
      type: "choice";
      instructions: string;
      criteria: Readonly<Record<string, string>>;
    }
  | {
      type: "score";
      instructions: string;
      criteria: readonly [string, string, ...string[]];
    };

export interface GatewayEvaluationRequest {
  model: string;
  questions: Readonly<Record<string, JevQuestion>>;
  state: unknown;
}

export interface GatewayRequestOptions {
  headers?: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface GatewayEvaluationResult {
  body: unknown;
  metadata?: GatewayMetadata;
}

export interface GatewayCapabilities {
  batching: boolean;
  boolean: boolean;
  choice: boolean;
  customHeaders: boolean;
  jev: boolean;
  score: boolean;
}

export interface GatewayMetadata {
  gateway: string;
  latencyMs?: number;
  model: string;
  provider?: string;
  raw?: unknown;
  requestId?: string;
  resolvedModel?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface GatewayPlugin {
  readonly capabilities: Readonly<GatewayCapabilities>;
  readonly id: string;
  readonly model: string;
  evaluate: (
    request: GatewayEvaluationRequest,
    options?: GatewayRequestOptions
  ) => Promise<GatewayEvaluationResult>;
}
```

`body` is intentionally `unknown`. A custom adapter cannot make an untrusted
remote payload safe through a TypeScript assertion; the shared provider performs
exhaustive runtime validation before producing a typed Judge decision.

The provider sends one named question per current Judge operation. The contract
supports several questions so gateway batching can be added without a breaking
transport change.

## Custom adapters

`defineGateway()` accepts a `GatewayPlugin` definition, validates and snapshots
its identity and capabilities, and returns a side-effect-free plugin:

```ts
const internalGateway = defineGateway({
  id: "internal-proxy",
  capabilities: {
    batching: true,
    boolean: true,
    choice: true,
    customHeaders: true,
    jev: true,
    score: true,
  },
  model: "internal/jev",
  evaluate: async (request, options) => ({
    body: await callInternalProxy(request, options),
  }),
});
```

The identifier and default model must be non-empty trimmed strings. Capability
fields must all be explicit booleans. `evaluate` must be a function. Invalid
definitions fail with `ConfigurationError` when `defineGateway()` is called.

Custom gateways may throw Judge's stable `AbortError`, `ProviderError`, or
`ProviderContractError`. Any other rejection is caught at the shared provider
boundary and wrapped in `ProviderError` with code `gateway_error`; its original
value may be attached as `cause` but never becomes the public error contract.

## Direct TypeSafe transport

The root direct path uses Node's built-in `fetch` and no TypeSafe SDK runtime
dependency. It posts the shared Jev request body to:

```text
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer <apiKey>
```

Defaults:

- model: `jev-latest`;
- base URL: `https://api.typesafe.ai`;
- maximum response size: `8_388_608` bytes;
- retries: disabled.

The direct configuration may override `model`, `baseUrl`, `timeoutMs`, and
`maxResponseBytes`. It also supports the existing explicit retry policy:

```ts
interface RetryOptions {
  initialDelayMs?: number;
  maxAttempts: number;
  maxDelayMs?: number;
}
```

Retries are disabled unless this option is present. Only HTTP `429` and `529`
are retryable. A valid `Retry-After` header takes precedence over bounded
exponential backoff. `maxAttempts` includes the initial request and must be a
positive integer. Documentation warns that retries can produce more than one
billed evaluation when a response is lost.

## Vercel AI Gateway

Entry point:

```ts
import { vercelGateway } from "@brkn-labs/judge/gateway/vercel";
```

The adapter uses AI SDK 7's `experimental_evaluate()` with a model created by
`@ai-sdk/gateway`. It has optional peer dependencies on `ai` and
`@ai-sdk/gateway`. Configuration includes:

```ts
interface VercelGatewayOptions {
  apiKey: string;
  baseUrl?: string;
  headers?: Readonly<Record<string, string>>;
  model?: string;
}
```

The default model is `typesafe-ai/jev`. The API key is explicit and is not read
from the environment by Judge. The adapter maps the shared Jev request to
`state`, `questions`, and `model`; it does not translate the request into a
language-model prompt. AI SDK names the Boolean question kind `"boolean"`, while
the direct Jev wire format names it `"noul"`; the adapter performs that single
explicit discriminator mapping and maps the evaluated result back into the
shared Jev response shape.

Tests inject an evaluator seam so contract tests do not require credentials or
network access. The production default uses the optional peers.

Official reference: <https://vercel.com/ai-gateway/models/jev>.

## Cloudflare

Entry point:

```ts
import { cloudflareGateway } from "@brkn-labs/judge/gateway/cloudflare";
```

The adapter uses the official `cloudflare` TypeScript SDK's `client.ai.run()`
operation and has an optional peer dependency on `cloudflare`. Configuration
includes:

```ts
interface CloudflareGatewayOptions {
  accountId: string;
  apiToken: string;
  gatewayId?: string;
  model?: string;
}
```

The default model is `typesafe/jev`. The input preserves `state` and `questions`
exactly. When `gatewayId` is present, the adapter supplies Cloudflare's documented
AI Gateway routing metadata without changing the Jev payload.

Tests inject the narrow `ai.run()` client surface. This protects Judge from
unrelated SDK changes and avoids live credentials.

Official references:

- <https://developers.cloudflare.com/ai/models/typesafe/jev/>
- <https://developers.cloudflare.com/api/node/resources/ai/methods/run>

## OpenRouter

Entry point:

```ts
import { openRouterGateway } from "@brkn-labs/judge/gateway/openrouter";
```

OpenRouter serves Jev through its native Decisions endpoint, not chat
completions:

```text
POST https://openrouter.ai/api/alpha/decisions
Authorization: Bearer <apiKey>
```

The official Go SDK exposes this as `Alpha.Decisions.Create`. The current
official TypeScript SDK does not expose or document the corresponding operation,
so the first adapter uses built-in `fetch`. It must not call `chat.send()`.

Configuration includes:

```ts
interface OpenRouterGatewayOptions {
  apiKey: string;
  appTitle?: string;
  baseUrl?: string;
  httpReferer?: string;
  maxResponseBytes?: number;
  model?: string;
  provider?: Readonly<Record<string, unknown>>;
}
```

The default model is the pinned `typesafe/jev-1.13`. Callers may explicitly use
the moving `~typesafe/jev-latest` alias. App attribution maps to OpenRouter's
documented headers. Provider routing options remain OpenRouter-specific and are
copied into the Decisions request without entering core types.

Judge may adopt `@openrouter/sdk` in a later compatible release when the
TypeScript package exposes its native Decisions operation. That substitution
does not change the public gateway contract.

Official references:

- <https://github.com/OpenRouterTeam/go-sdk>
- <https://openrouter.ai/typesafe>

## Optional peer dependencies and tree-shaking

Optional integration dependencies are declared as peers with optional peer
metadata and as development dependencies for compilation and contract tests:

- `ai` and `@ai-sdk/gateway` for `/gateway/vercel`;
- `cloudflare` for `/gateway/cloudflare`;
- no runtime package for OpenRouter, direct TypeSafe, or custom adapters.

Each built-in gateway statically imports only its own SDK. Importing one gateway
must not load or reference another gateway. Root may import shared gateway types
and the direct Jev transport but must not import any built-in optional gateway.
`/core` must contain no Jev, TypeSafe, SDK, gateway, or custom-adapter runtime
code.

Build verification inspects emitted module graphs and package contents, not only
source paths. Each subpath receives an explicit `exports` entry and declaration
entry.

## Runtime validation and type safety

Public responses remain fully request-directed:

- Boolean returns a validated `BooleanDecision`;
- Choice values and probability keys equal the request's exact literal options;
- Score levels equal the request's exact ordered literal levels;
- `if()` and `switch()` retain their exact callback metadata and awaited return
  unions.

Normalized provider metadata is exposed additively on every decision:

```ts
interface ProviderMetadata {
  gateway?: string;
  latencyMs?: number;
  model: string;
  provider: "jev";
  raw?: unknown;
  requestId?: string;
  resolvedModel?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}
```

`BooleanDecision`, `ChoiceDecision`, and `ScoreDecision` receive an optional
`metadata?: ProviderMetadata` field. Gateway `raw` metadata is retained only
when the gateway explicitly supplies it and is never logged automatically.

The Jev provider validates:

- a response object and exact named answer;
- the expected answer kind;
- Noul probability and derived Boolean value/confidence;
- legal Choice selection, exact probability keys, and confidence;
- exact Score legend order, aligned probabilities, finite weighted score, and
  confidence;
- every probability as finite and within `[0, 1]`;
- every distribution sum within absolute tolerance `1e-6` of `1`;
- resolved model, request identifiers, and usage fields before metadata
  normalization.

No transport response type is trusted solely because an SDK supplied a static
type. Internal assertions are allowed only after the corresponding runtime
validator succeeds.

Before transport evaluation, the shared provider converts context to a
JSON-compatible value with `JSON.stringify()` and `JSON.parse()`. Cycles,
`bigint`, throwing `toJSON()` methods, and other serialization failures become
`SerializationError` before network activity. The resulting parsed value—not
the caller's mutable object—is sent as Jev state.

## Cancellation, timeouts, and response bounds

The same caller `AbortSignal` propagates from core through the Jev provider into
the selected gateway. A configured timeout composes with the caller signal.
Caller cancellation surfaces as `AbortError`; a local timeout surfaces as
`ProviderError` with code `timeout`.

Fetch transports bound response bodies before parsing. SDK transports rely on
their SDK's body handling but still validate the parsed response structure.
Core performs the final cancellation check that prevents application callback
execution.

## Stable error mapping

Built-in transports normalize at least these classes:

| Failure | Judge error |
| --- | --- |
| Invalid local configuration | `ConfigurationError` |
| Caller cancellation | `AbortError` |
| Authentication or authorization | `ProviderError`, code `authentication` |
| Payment or quota failure | `ProviderError`, code `quota` |
| Rate limit | `ProviderError`, code `rate_limit` |
| Timeout | `ProviderError`, code `timeout` |
| Unsupported/unavailable model | `ProviderError`, code `model_unavailable` |
| Other network or remote failure | `ProviderError`, code `provider_error` |
| Malformed or impossible response | `ProviderContractError` |

Vendor SDK error classes, response text, credential values, and raw headers do
not become the public contract.

## Testing

One shared gateway contract suite runs against synthetic transports for direct
TypeSafe, Vercel, Cloudflare, OpenRouter, and custom adapters. It verifies:

- exact Boolean, Choice, and Score request mapping;
- request-directed response types;
- malformed and impossible response rejection;
- missing, extra, invalid, and incorrectly summed probabilities;
- cancellation and timeouts;
- stable authentication, rate-limit, quota, unavailable-model, and network
  errors;
- normalized model, resolved model, request ID, gateway, latency, and usage;
- no gateway execution of application callbacks;
- unsupported capabilities failing before network activity;
- no live credentials required.

Package tests verify every subpath import independently. Module-graph or emitted
output checks prove:

- `/core` includes no Jev or gateway code;
- root includes no optional gateway SDK;
- Vercel includes neither Cloudflare nor OpenRouter;
- Cloudflare includes neither Vercel nor OpenRouter;
- OpenRouter includes neither Vercel nor Cloudflare;
- custom includes no vendor SDK;
- no integration includes `/mock` unless explicitly imported.

Optional live smoke tests are excluded from the normal test command and run only
when an explicit gateway credential is supplied.

## Deferred scope

Gateway-managed retries, provider fallback policy, gateway caching configuration,
multi-question batching at the Judge client layer, browser credential support,
and automatic environment-variable discovery remain outside this milestone.
