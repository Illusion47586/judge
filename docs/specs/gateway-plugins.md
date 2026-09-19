# Gateway plugin specification

[Back to README](../../README.md) · [v0.1 specification](v0.1.md) · [Jev provider](provider-jev.md)

## Role and boundaries

Gateways are transport and routing plugins. They normalize authentication,
endpoint selection, model identifiers, request and response payloads, usage
metadata, and transport errors for the Jev provider.

A gateway MUST NOT merge Judge context, apply confidence policy, implement
`if()` or `switch()`, or execute application callbacks. Those semantics belong
to core.

## Contract

```ts
export interface GatewayPlugin {
  readonly id: string;
  readonly capabilities: GatewayCapabilities;

  evaluate(
    request: GatewayEvaluationRequest,
    options?: GatewayRequestOptions
  ): Promise<GatewayEvaluationResponse>;
}

export type GatewayRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
};
```

`GatewayEvaluationRequest` contains the Jev model, structured state, named
questions, and safe normalized metadata. `GatewayEvaluationResponse` contains
answers plus `GatewayMetadata`. Both are provider-layer contracts and are not
exported from `/core`.

## Capabilities

```ts
export type GatewayCapabilities = {
  jev: boolean;
  boolean: boolean;
  choice: boolean;
  score: boolean;
  batching: boolean;
  customHeaders: boolean;
};
```

Plugins MUST advertise capabilities without a network request. Before
evaluation, the Jev provider checks the capabilities required by the requested
decision. Unsupported operations throw `ConfigurationError` locally.

A plugin MUST NOT claim a capability that it emulates by converting Jev state
and questions into unconstrained chat messages. Jev-capable transports preserve
the native structured request and response semantics.

## Configuration

Gateway selection is explicit:

```ts
const gateway = vercelGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY!,
  model: "typesafe-ai/jev",
});

const judge = createJudge({ gateway });
```

Judge MUST NOT select a gateway from environment variables or installed
packages. Convenience helpers MAY read environment values only when called
explicitly and MUST fail loudly when required configuration is absent.

Timeout, cancellation, and optional headers use shared request options.
Provider preference, fallback, billing, caching, and routing have different
vendor meanings and remain gateway-specific configuration.

## Metadata normalization

```ts
export type GatewayMetadata = {
  gateway: string;
  model: string;
  resolvedModel?: string;
  requestId?: string;
  latencyMs?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  provider?: string;
  raw?: unknown;
};
```

Normalized metadata MUST be sufficient for core observability without reading
vendor fields. The `raw` field is an opt-in debugging escape hatch and MUST NOT
be logged by default.

## Error normalization

Plugins map authentication, network, rate-limit, timeout, unavailable-model,
and remote execution failures to `ProviderError` with stable codes. An
upstream payload that violates the declared gateway response shape becomes
`ProviderContractError`.

Cancellation requested by the caller becomes `AbortError`. Vendor SDK errors
MUST NOT leak as the public error contract, though they MAY be attached as a
safe cause.

## Vercel

Entry point:

```ts
import { vercelGateway } from "@brkn-labs/judge/gateway/vercel";
```

Configuration includes an explicit AI Gateway API key, model, and optional
Vercel routing settings. The model default verified September 18, 2026 is
`typesafe-ai/jev`.

The plugin uses AI SDK 7's `experimental_evaluate()` with
`@ai-sdk/gateway`. It maps Judge state directly to Jev state and preserves named
Boolean, Choice, and Score questions; it never uses chat completion. Install
`ai` and `@ai-sdk/gateway` alongside Judge when importing this subpath.

Reference: [Vercel Jev model](https://vercel.com/ai-gateway/models/jev).

## Cloudflare

Entry point:

```ts
import { cloudflareGateway } from "@brkn-labs/judge/gateway/cloudflare";
```

Configuration includes an explicit account ID, API token, model, and optional
AI Gateway ID. The model default verified September 18, 2026 is `typesafe/jev`.

The v0.1 transport invokes `client.ai.run()` from the official `cloudflare`
TypeScript SDK and preserves Jev's state-and-questions payload. Install
`cloudflare` alongside Judge when importing this subpath. Cloudflare logging,
caching, rate limiting, fallback, and dynamic routing remain plugin options.

Reference: [Cloudflare Jev model](https://developers.cloudflare.com/ai/models/typesafe/jev/).

## OpenRouter

Entry point:

```ts
import { openRouterGateway } from "@brkn-labs/judge/gateway/openrouter";
```

Configuration includes an explicit API key, model, attribution headers, and
optional provider-routing preferences. Verified September 18, 2026 identifiers
include:

- pinned `typesafe/jev-1.13`;
- moving alias `~typesafe/jev-latest`.

Production applications SHOULD pin a model when confidence thresholds depend
on stable behavior. Selecting the latest alias is an explicit request for
behavior to change as the alias advances.

The adapter uses OpenRouter's native `POST /api/alpha/decisions` endpoint with
Node `fetch`; it does not use chat completions and adds no SDK dependency.

Reference: [OpenRouter TypeSafe models](https://openrouter.ai/typesafe).

## Shared contract tests

Every gateway entry point MUST pass the same contract suite:

- Boolean evaluation normalizes to the stable core shape.
- Choice rejects values outside the exact requested set.
- Score preserves legal ordered levels.
- Missing or malformed probabilities become `ProviderContractError`.
- Cancellation prevents later callback execution at the core boundary.
- Authentication, rate-limit, timeout, and network failures become
  `ProviderError` without leaking vendor classes.
- Model, resolved model, request ID, latency, and usage normalize when present.
- No gateway module imports or executes control-flow callbacks.
- Unsupported capabilities fail before network activity.

Gateway contract tests use recorded or synthetic transport fixtures and require
no live credentials. Optional live smoke tests are separate.

## Tree-shaking requirements

Each gateway is a side-effect-free, independent ESM subpath. Importing one
gateway MUST NOT import or register another gateway, the mock provider, or
provider-neutral `/core` through a root barrel that pulls in integrations.

Release bundle fixtures MUST prove:

- `/core` contains no gateway or TypeSafe code;
- the default root contains no optional gateway code;
- a Vercel fixture contains neither Cloudflare nor OpenRouter;
- a Cloudflare fixture contains neither Vercel nor OpenRouter;
- an OpenRouter fixture contains neither Vercel nor Cloudflare;
- no fixture includes the mock unless `/mock` is imported.

Source layout alone is not sufficient evidence. Tests inspect emitted bundle
module graphs or metafiles.

## Upstream assumptions

The gateway matrix was verified September 19, 2026:

| Gateway | Jev identifier | v0.1 status |
| --- | --- | --- |
| Vercel AI Gateway | `typesafe-ai/jev` | Supported |
| Cloudflare | `typesafe/jev` | Supported |
| OpenRouter | `typesafe/jev-1.13`, `~typesafe/jev-latest` | Supported |

These identifiers describe current upstream availability, not permanent Judge
guarantees. A removed or unavailable model produces a clear `ProviderError`.
