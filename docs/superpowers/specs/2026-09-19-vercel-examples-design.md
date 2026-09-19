# Vercel AI Gateway Examples Design

## Goal

Add a runnable `examples/` suite that teaches every Judge primitive and shows
several realistic domains, with every remote evaluation routed through Vercel
AI Gateway.

The examples are executable documentation. They prioritize small inputs,
visible typed results, explicit uncertainty behavior, and code that a consumer
can adapt without learning repository internals.

## Credentials and execution safety

The repository-root `.env` file is ignored before any examples are added. A
tracked `.env.example` contains only:

```dotenv
AI_GATEWAY_API_KEY=
```

Examples use Node's native `--env-file=.env`; no environment-loading dependency
is added. A shared helper reads `AI_GATEWAY_API_KEY`, rejects an absent or empty
value with a concise setup message, and passes it explicitly to
`vercelGateway()`. Judge and the gateway factory continue to avoid implicit
environment access.

Normal linting, typechecking, builds, and unit tests make no remote calls. Live
example scripts are separate and explicit because each evaluation can be
billable. The documentation states how many evaluations a command performs.

## Structure

```text
examples/
  README.md
  _shared.ts
  01-boolean.ts
  02-if.ts
  03-choice.ts
  04-switch.ts
  05-score.ts
  06-support-triage.ts
  07-transaction-risk.ts
  08-incident-escalation.ts
  09-agent-tool-routing.ts
```

`_shared.ts` is the only configuration helper. It creates a Vercel-backed Judge
client using the default `typesafe-ai/jev` model and provides a small JSON output
helper. It contains no domain behavior.

Every numbered file is independently runnable and performs exactly one remote
evaluation. Examples use static fixture data so repeated executions are easy to
compare. They print the returned decision or selected application result,
including normalized metadata where useful, but never print credentials.

## Focused primitive examples

The first five files teach one API at a time:

1. `boolean()` judges whether a refund request needs manual review and prints
   its Boolean value, true probability, and confidence.
2. `if()` chooses an escalation or normal-queue callback and demonstrates the
   explicit `uncertain` callback.
3. `choice()` routes a request among an exact literal tuple and shows that the
   selected value and probability keys remain request-directed.
4. `switch()` derives its legal outcomes from case keys and returns different
   typed application values from the selected callback.
5. `score()` evaluates ordered severity levels and prints the weighted score,
   aligned levels, probabilities, and confidence.

Examples should not use type assertions to recover precision that Judge already
provides. Literal tuples and case maps demonstrate the inferred types directly.

## Mixed-domain examples

The domain examples remain one-evaluation programs rather than multi-step agent
workflows:

- Customer-support triage uses `switch()` to route billing, technical, account,
  or general tickets, with human review as the uncertainty result.
- Transaction risk uses `score()` with ordered low, guarded, high, and critical
  risk levels, then applies a deterministic local policy to the validated score.
- Incident escalation uses `if()` to decide whether an operational incident
  requires immediate escalation, including an explicit uncertain result.
- Agent/tool routing uses `switch()` across browser, code, research, and human
  review handlers. The model chooses only from application-declared tools and
  never executes generated code.

Together these scenarios cover business routing, risk assessment, operations,
and agentic orchestration without pretending Judge is a general-purpose agent.

## Package scripts

Package scripts expose one command per example plus an aggregate command. Each
live command builds first and uses `node --env-file=.env` so imports exercise the
same emitted package entry points consumers receive.

The aggregate command builds once and executes all nine numbered files in
order. It performs nine remote evaluations. Its name and documentation make the
network and billing behavior explicit.

A separate examples typecheck builds the package and checks all example files
without executing them. This check joins the repository's broad verification
gate, while live commands never run in `npm test` or `npm run check`.

## Imports and publishing

Numbered examples import `createJudge` from `@brkn-labs/judge` and
`vercelGateway` from `@brkn-labs/judge/gateway/vercel`. They therefore validate
the public subpaths rather than importing `src/` internals.

The package's published `files` list remains focused on runtime artifacts and
the main README for this milestone. Repository examples are linked from the main
README and documented in `examples/README.md`; publishing them can be decided
when the package changes from private prerelease status.

## Verification

The implementation is complete when:

- `.env` and common local variants are ignored while `.env.example` remains
  tracked;
- all nine examples compile against emitted public declarations;
- each numbered example has exactly one Judge evaluation call;
- every example uses the shared explicit Vercel configuration;
- normal checks make no network requests;
- example documentation includes setup, individual commands, the aggregate
  nine-evaluation warning, and expected output shape;
- lint, typecheck, unit tests, example typecheck, build, and package isolation
  checks all pass.
