# Jev provider specification

[Back to README](../../README.md) · [v0.1 specification](v0.1.md) · [core specification](core.md)

## Role and boundaries

Jev is Judge's default decision provider. It maps Judge's stable Boolean,
Choice, and Score contracts to TypeSafe's state-and-questions protocol and maps
responses back to core decisions.

The provider owns protocol translation, transport delegation, response
validation, and normalized provider metadata. It MUST NOT merge application
context layers, apply confidence policy, select callbacks, or execute callbacks.

## Root factory configuration

The root `createJudge()` factory accepts one of two mutually exclusive Jev
configurations:

```ts
export type DirectJevOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxResponseBytes?: number;
  retry?: {
    maxAttempts: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
  };
};

export type GatewayJevOptions = {
  gateway: GatewayPlugin;
  model?: string;
  timeoutMs?: number;
};
```

Passing both `apiKey` and `gateway`, passing neither, or passing an empty API key
throws `ConfigurationError` before evaluation. Judge MUST NOT infer credentials
or gateway choice from installed packages or environment variables.

The application may read an environment variable and pass it explicitly:

```ts
const judge = createJudge({
  apiKey: process.env.TYPESAFE_API_KEY!,
});
```

## Direct TypeSafe transport

The direct path uses Node's built-in `fetch` and has no TypeSafe SDK runtime
dependency. It calls the official
[`POST /v1/systemone`](https://docs.typesafe.ai/api) HTTP endpoint with the API
key as a Bearer token. It is intended for trusted server-side environments;
TypeSafe API keys MUST NOT be embedded in browser bundles or exposed to clients.

Defaults verified on September 19, 2026:

| Option | Default |
| --- | --- |
| `baseUrl` | `https://api.typesafe.ai` |
| `model` | `jev-latest` |
| `maxResponseBytes` | `8_388_608` |

The model alias intentionally follows the latest Jev release. Applications
that tune confidence thresholds SHOULD pin a version when reproducible behavior
matters. Judge treats these defaults as adapter configuration, not core API.

The adapter appends `/v1/systemone` to the validated base URL and sends:

```http
POST /v1/systemone
Authorization: Bearer <apiKey>
Content-Type: application/json
```

The body contains `model`, structured `state`, and named `questions`. The
adapter MUST combine the caller's cancellation signal with its timeout, bound
the response before fully parsing JSON, and normalize fetch, HTTP, and payload
failures before they cross the provider boundary.

The base URL MUST reject embedded credentials, query strings, and fragments.
Judge MAY permit plain HTTP only for an explicitly configured local test or
proxy endpoint.

## Gateway transport

When `gateway` is present, the Jev provider sends a normalized
`GatewayEvaluationRequest` to that plugin. It MUST check advertised capabilities
locally before issuing a request.

The root never selects a gateway implicitly:

```ts
const judge = createJudge({
  gateway: vercelGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY!,
  }),
});
```

Gateway authentication, endpoints, vendor routing, caching, retries, and
billing controls remain plugin-owned. The Jev provider owns only semantic
request mapping and normalized decisions.

## Request mapping

Every Judge evaluation becomes one named Jev question with resolved context as
shared state:

```ts
const request = {
  model,
  state: resolvedContext,
  questions: {
    decision: {
      type: "noul",
      instructions: condition,
    },
  },
};
```

Mapping rules:

- Judge context maps to Jev `state` without prompt-string concatenation.
- A Judge Boolean condition maps to one TypeSafe `noul` question.
- A Choice question maps to one Choice question whose criteria keys exactly
  equal the legal options supplied by core.
- A Score question maps to one Score question whose levels preserve tuple order.
- The application-facing invocation ID MAY be attached as safe request metadata
  but MUST NOT alter the semantic question.
- Callback functions and callback source MUST never enter provider state.

The adapter SHOULD make one question per Judge primitive invocation in v0.1.
Batch and multi-question evaluation are deferred even if Jev supports them.

## Response normalization

The adapter MUST validate the upstream answer before returning a core decision.

For Boolean decisions it produces:

```ts
{
  kind: "boolean",
  value,
  probabilityTrue,
  confidence,
  raw,
}
```

The direct `noul` answer is a probability `p` in `[0, 1]`. Judge normalizes it
as `probabilityTrue: p`, `value: p >= 0.5`, and
`confidence: Math.max(p, 1 - p)`. This derivation is adapter behavior, not an
empirical correctness guarantee.

Choice answers produce the selected legal value, complete probability record,
normalized confidence, and optional raw response.

TypeSafe Score answers return a numeric probability-weighted score, a numeric
key-to-description legend, a probability per legend entry, and confidence. The
adapter validates that the legend exactly matches the requested ordered levels
and normalizes it to:

```ts
{
  kind: "score",
  score,
  levels,
  probabilities,
  confidence,
  raw,
}
```

The normalized probability array aligns by index with `levels`. The numeric
score MUST be finite and within `0` and `levels.length - 1` inclusive.

The adapter MUST reject:

- a missing named answer;
- an unknown decision kind;
- a choice outside the requested set or a Score legend that differs from the
  requested ordered levels;
- missing, duplicate, or additional probability keys;
- non-number, non-finite, or out-of-range probabilities;
- a distribution whose sum differs from `1` by more than `1e-6`;
- non-finite or out-of-range confidence;
- a payload that cannot be interpreted without guessing.

Drift within `1e-6` MAY be normalized. Materially invalid output becomes
`ProviderContractError`; no application callback can run afterward.

## Error mapping

The adapter maps failures into stable core errors:

| Failure | Public error |
| --- | --- |
| Empty or conflicting configuration | `ConfigurationError` |
| Context cannot be serialized | `SerializationError` |
| HTTP `401` | `ProviderError` with authentication code |
| HTTP `422` | `ProviderError` with invalid-request code |
| HTTP `429` | `ProviderError` with rate-limit code |
| HTTP `529` | `ProviderError` with model-unavailable code |
| Other non-success HTTP, network, timeout, or remote execution | `ProviderError` |
| Malformed or impossible response | `ProviderContractError` |
| Observed cancellation | `AbortError` |

HTTP error bodies and fetch messages MUST NOT become the public contract. Judge
MAY retain the original failure as a safe `cause` and raw payload as an
explicit debug field.

## Cancellation and timeouts

The Jev adapter accepts the same `AbortSignal` used by context resolution and
forwards it through the active transport. A local timeout SHOULD abort the
transport and surface as `ProviderError` with a stable timeout code unless the
caller's signal was already aborted, in which case it surfaces as `AbortError`.

Cancellation cannot guarantee that TypeSafe or a gateway did no remote work.
Core performs the final signal check that prevents callback execution.

The adapter MUST NOT retry by default. When `retry` is explicitly configured,
it MAY retry only HTTP `429` and `529`, MUST honor a valid `Retry-After` header,
and otherwise uses bounded exponential backoff. `maxAttempts` includes the
initial request and MUST be a positive integer. A retry policy applies only to
provider evaluation, never context resolution or application callbacks.

Because a lost response can make remote completion unknowable, documentation
MUST warn that a retry can produce more than one billed evaluation.

## Metadata

The adapter normalizes available metadata:

```ts
type ProviderMetadata = {
  provider: "jev";
  model: string;
  resolvedModel?: string;
  requestId?: string;
  latencyMs?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  gateway?: string;
  raw?: unknown;
};
```

Core events MAY consume normalized fields and MUST NOT depend on `raw`.

## Tests

The provider test suite covers both direct and gateway transports with fixtures:

- Boolean `true` and `false` normalization.
- Choice normalization with literal legal values.
- Score normalization with a numeric weighted score and tuple-aligned
  probabilities.
- Equivalent direct and gateway payloads produce identical decisions.
- Unknown values and malformed distributions fail before callback boundaries.
- Abort and timeout behavior uses stable errors.
- Fetch, HTTP, and gateway failures do not leak as public error types.
- Response-size limits reject oversized bodies before JSON parsing.
- Retry behavior is disabled by default and bounded when enabled.
- Model, request, latency, and usage metadata normalize when available.
- No provider module contains callback execution.

Live tests are separate, opt-in, and require credentials. Unit and contract
tests MUST run without a remote key.

## Upstream assumptions

Verified September 19, 2026 against the
[official TypeSafe HTTP API](https://docs.typesafe.ai/api):

- Evaluation uses `POST https://api.typesafe.ai/v1/systemone` with Bearer
  authentication and JSON content.
- Requests contain required `model`, `state`, and named typed `questions`.
- Direct Boolean questions use TypeSafe's `noul` type.
- Choice returns a selected option, probability record, and confidence.
- Score returns a numeric weighted score, legend, probability record, and
  confidence.
- Responses include resolved model and token usage.
- Documented HTTP failures include `401`, `422`, `429`, and `529`.
- `jev-latest` is a moving model alias.

The adapter isolates these assumptions so upstream changes do not alter core
control-flow signatures.
