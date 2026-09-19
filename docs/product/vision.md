# Product vision

[Back to README](../../README.md)

## Thesis

Judge makes probabilistic intelligence feel like a normal typed dependency
inside deterministic TypeScript software.

Many useful application decisions are semantic rather than syntactic: whether
a ticket is urgent, which team owns an issue, whether a transaction merits
review, or which bounded action an agent should take next. Judge gives those
decisions familiar control-flow shapes without handing execution to a model.

## The problem

Applications commonly integrate models through prompts and unstructured text.
That approach pushes parsing, validation, uncertainty, retries, and provider
details into business logic. It also blurs a critical boundary: deciding what
should happen is not the same as executing it.

For decisions with a closed outcome space, applications need a smaller and
safer abstraction. Legal outcomes should be visible to TypeScript, invalid
provider output should be rejected, low confidence should have a deliberate
path, and tests should not require a remote model.

## The Judge model

Judge separates the system into three responsibilities:

1. The application supplies typed, structured facts and a semantic question.
2. A decision provider selects one constrained outcome and reports confidence.
3. Judge validates that outcome and executes exactly one application callback.

The provider never receives callback implementations and Judge never executes
provider-generated code. Context contains facts; conditions and questions
describe the judgment to make about those facts.

Uncertainty is a first-class control-flow outcome. Applications may accept a
decision above a threshold and route lower-confidence decisions to a person,
policy engine, or more capable reasoning model.

## Target use cases

- Support, incident, and ownership routing.
- Fraud, abuse, risk, and policy screening.
- Content classification with a closed taxonomy.
- Workflow gates that escalate ambiguous cases.
- Agent action selection from an application-owned tool set.
- Cheap semantic checks before expensive reasoning or human review.

Judge is strongest when the outcome space is bounded and every outcome maps to
code the application already owns.

## Design goals

- Feel like native asynchronous TypeScript control flow.
- Infer legal outcomes and callback return types from ordinary objects.
- Keep uncertainty explicit and configurable.
- Keep context structured, typed, inspectable, and separate from instructions.
- Isolate provider and transport changes behind stable contracts.
- Make every decision observable and testable with a deterministic mock.
- Preserve complete tree-shaking through side-effect-free ESM subpaths.
- Make cancellation and callback-execution boundaries precise.

## Non-goals

Judge v0.1 does not:

- replace JavaScript syntax or require a compiler transform;
- execute model-generated code;
- provide a general agent runtime;
- build retrieval or context compression into core;
- silently choose credentials, providers, or gateways;
- claim that an uncalibrated probability measures empirical correctness;
- automatically retry decisions or run multiple callbacks for comparison.

## Product principles

### Constrain before executing

The application defines the complete legal outcome space. Provider output is
untrusted until Judge validates it against that space.

### Make ambiguity visible

Low confidence is not hidden inside logs and is not treated as a normal branch.
Applications choose an explicit uncertainty policy.

### Keep facts structured

Applications should not concatenate business objects into prompt strings.
Context remains structured until a provider adapter serializes it.

### Resolve context at invocation time

Reusable presets may fetch current application data immediately before an
evaluation. Cached or definition-time context must never become stale by
accident.

### Separate semantics from transport

Core understands decisions, confidence, context, errors, and callbacks. Jev
adapts those decisions to its protocol. Gateways own authentication, routing,
and vendor-specific metadata.

### Escalate deliberately

Fast, inexpensive judgments should handle clear cases. Ambiguous or important
cases may escalate to deeper reasoning or human review through application
code.

## Success for v0.1

Judge v0.1 succeeds when an application can:

- configure default Jev through a direct TypeSafe key or explicit gateway;
- use a provider-neutral core when desired;
- express typed Boolean and choice control flow;
- route low-confidence results explicitly;
- compose fresh structured context from documented layers;
- cancel without allowing a later callback race;
- test all branches without a network or API key;
- observe decisions without exposing sensitive context by default;
- import only the integrations it uses.

Models judge. TypeScript constrains. Application code executes.
