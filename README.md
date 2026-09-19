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
