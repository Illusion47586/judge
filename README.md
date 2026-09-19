# Judge

> Probabilistic judgment. Deterministic execution.

Judge is a TypeScript SDK for placing constrained semantic decisions inside
ordinary application control flow. A model judges structured context; Judge
validates the result and selects exactly one callback written by your
application.

## Why Judge

Some decisions are difficult to express as fixed rules but too small to justify
a general-purpose reasoning agent. Routing a support request, screening a
transaction, or selecting the next agent tool are semantic judgments with a
closed set of legal outcomes.

Judge makes those judgments typed, observable, testable, and explicit about
uncertainty. It does not generate or execute code.

## How Judge differs

Judge is deliberately narrower than the [Vercel AI SDK](https://ai-sdk.dev/docs/introduction)
and higher-level than TypeSafe AI's official
[Jev JavaScript SDK](https://www.npmjs.com/package/@typesafe-ai/sdk):

| | Judge | Vercel AI SDK | Jev JavaScript SDK |
| --- | --- | --- | --- |
| Primary job | Put bounded semantic decisions inside application control flow | Build AI applications with generation, streaming, tools, agents, and UI integrations | Call Jev's native state-and-questions API directly |
| Model scope | Provider-neutral core; the default client uses Jev through direct or gateway transports | Broad model and provider ecosystem | Jev through TypeSafe AI |
| Result | A validated Boolean, choice, or score decision, or the return value of one selected callback | Generated or evaluated model results for the application to compose | Native typed Jev answers and metadata |
| Control flow | `if()` and `switch()` derive legal outcomes and execute exactly one application-owned callback | General primitives and agent loops; the application defines decision-specific branching | The application maps returned answers to its own branching |
| Uncertainty | Built-in confidence thresholds and an explicit `uncertain` branch | Exposes model results; decision thresholds and fallback policy are application concerns | Returns Jev probabilities and confidence; the application applies policy |
| Testing | Includes a deterministic decision mock and validates provider results before callbacks run | General-purpose model and provider test utilities | Direct Jev client; application-level decision mocks are separate |

Use Vercel AI SDK when you need a broad AI application toolkit. Use the Jev SDK
when you want direct access to Jev's native API. Use Judge when the outcome is a
closed decision that must safely select application-owned behavior. Judge can
use Jev directly or through gateways—including Vercel AI Gateway—so these tools
can be complementary rather than mutually exclusive.

## Quick start

Judge uses Jev by default. Pass a TypeSafe API key explicitly to use the direct
transport:

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

The provider evaluates only the condition. Your TypeScript callbacks own every
side effect and return value.

## How it works

Judge follows a strict boundary:

```text
structured context
  -> constrained provider decision
  -> runtime validation
  -> confidence policy
  -> exactly one application callback
```

`judge.if()` constrains the provider to a Boolean outcome. `judge.switch()`
derives the complete legal choice set from the keys of a callback object.
Lower-level `boolean()`, `choice()`, and `score()` methods return decisions
without executing callbacks.

## Imports and tree-shaking

Judge is one ESM-only package with independent entry points:

```ts
import { createJudge } from "@brkn-labs/judge";
import { createJudge as createCoreJudge } from "@brkn-labs/judge/core";
import { mockProvider } from "@brkn-labs/judge/mock";
import { vercelGateway } from "@brkn-labs/judge/gateway/vercel";
import { cloudflareGateway } from "@brkn-labs/judge/gateway/cloudflare";
import { openRouterGateway } from "@brkn-labs/judge/gateway/openrouter";
```

The root entry point includes the default Jev adapter and direct TypeSafe
transport. Use `/core` when you need a provider-neutral client with no path to
Jev or transport code. Optional gateways and providers are included only when
their exact subpaths are imported.

## Gateway setup

Vercel and Cloudflare are optional peers. Install only the integration you use:

```sh
npm install @brkn-labs/judge ai @ai-sdk/gateway
# or
npm install @brkn-labs/judge cloudflare
```

OpenRouter and custom gateways add no runtime dependency:

```ts
import { createJudge } from "@brkn-labs/judge";
import { vercelGateway } from "@brkn-labs/judge/gateway/vercel";

const judge = createJudge({
  gateway: vercelGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY!,
  }),
});
```

Equivalent factories are available as `cloudflareGateway()` and
`openRouterGateway()`:

```ts
import { cloudflareGateway } from "@brkn-labs/judge/gateway/cloudflare";
import { openRouterGateway } from "@brkn-labs/judge/gateway/openrouter";

const cloudflareJudge = createJudge({
  gateway: cloudflareGateway({ accountId, apiToken, gatewayId }),
});

const openRouterJudge = createJudge({
  gateway: openRouterGateway({ apiKey: openRouterKey }),
});
```

All credentials are explicit; Judge never reads them from the environment
itself. Use `defineGateway()` from `/gateway/custom` to adapt an internal
Jev-compatible state-and-questions transport:

```ts
import { defineGateway } from "@brkn-labs/judge/gateway/custom";

const internal = defineGateway({
  id: "internal",
  model: "internal/jev",
  capabilities: {
    batching: true,
    boolean: true,
    choice: true,
    customHeaders: true,
    jev: true,
    score: true,
  },
  evaluate: (request, options) => callInternalJev(request, options),
});
```

Direct TypeSafe retries are off by default. If you opt into `retry`, only HTTP
429 and 529 are retried, and a lost response can result in more than one billed
evaluation.

## Context windows and usage limits

[Jev currently advertises a 32K-token context window](https://vercel.com/ai-gateway/models/jev).
A context window limits the serialized input accepted by one evaluation; it is
different from a request rate limit or an account credit or quota.

Judge can issue an advisory warning before large requests:

```ts
const judge = createJudge({
  gateway,
  contextBudget: {
    maxTokens: 32_768,
    warnAt: 0.8,
    onWarning: ({ estimatedTokens, maxTokens, ratio }) => {
      telemetry.capture("judge.context.warning", {
        estimatedTokens,
        maxTokens,
        ratio,
      });
    },
  },
});
```

The estimate uses the UTF-8 size of the complete serialized Jev request. It is
not an exact tokenizer count, and Judge never blocks a request based on the
estimate. The provider remains authoritative; an explicit context-window
rejection is exposed as `ContextLimitError` with code `context_limit`.

Model limits can change. Confirm the current value in your provider catalog
before configuring a production policy.

## Examples

The [`examples/`](examples/README.md) directory contains focused examples for
every Judge primitive plus customer-support, transaction-risk, incident, and
agent-routing scenarios. They all use Vercel AI Gateway.

```sh
cp .env.example .env
npm run example:switch
```

`npm run typecheck:examples` checks every example without making remote calls.
`npm run example:all` performs nine remote, potentially billable evaluations.

## Safety boundary

Judge:

- never executes provider-generated code;
- never evaluates multiple callbacks speculatively;
- validates every provider result before application code runs;
- represents low confidence as an explicit `uncertain` branch;
- forwards cancellation through context resolution and transport;
- does not log full context or raw provider output by default;
- does not silently select a gateway, retry, or fall through after an error.

## Documentation

- [Product vision](docs/product/vision.md)
- [Judge v0.1 specification](docs/specs/v0.1.md)
- [Core specification](docs/specs/core.md)
- [Jev provider specification](docs/specs/provider-jev.md)
- [Gateway plugin specification](docs/specs/gateway-plugins.md)
- [Decision lifecycle](docs/architecture/decision-lifecycle.md)
- [Roadmap](docs/roadmap.md)

## Status

Judge is pre-release. The typed core, direct Jev transport, deterministic mock,
and Vercel, Cloudflare, OpenRouter, and custom gateway paths are implemented;
the v0.1 API may still change before its first stable release.
