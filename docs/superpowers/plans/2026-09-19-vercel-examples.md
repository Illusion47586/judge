# Vercel AI Gateway Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add nine independently runnable, fully typed Judge examples that all use Vercel AI Gateway, plus safe credential setup, documentation, and non-network verification.

**Architecture:** Repository examples import Judge only through its emitted public package subpaths and share one Vercel configuration helper. Five files isolate individual primitives; four one-evaluation scenarios cover support, risk, operations, and agent routing. Static contract tests and a dedicated examples typecheck validate the suite without making live requests.

**Tech Stack:** Node.js 22.18+, TypeScript 7, native `--env-file`, Vercel AI SDK 7, `@ai-sdk/gateway`, Node test runner, Ultracite/Biome.

## Global Constraints

- Ignore repository-root `.env` and common `.env.*` variants before adding examples; keep `.env.example` tracked.
- The only credential variable is `AI_GATEWAY_API_KEY`, passed explicitly to `vercelGateway()`.
- Add no dotenv package or other environment-loading dependency.
- Every numbered example performs exactly one remote Judge evaluation.
- Normal lint, typecheck, build, and unit-test commands must make no network requests.
- Live execution must be explicit and documented as potentially billable.
- All example imports use `@brkn-labs/judge` and `@brkn-labs/judge/gateway/vercel`, never `src/` paths.
- The aggregate live command performs exactly nine evaluations in filename order.
- Preserve ESM-only, Node-only execution and the package's existing tree-shaking boundaries.

---

### Task 1: Credential safety and shared Vercel harness

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `examples/_shared.ts`
- Create: `test/examples.test.ts`
- Modify: `biome.jsonc`

**Interfaces:**
- Consumes: root `createJudge(options)` and `vercelGateway(options)` public exports.
- Produces: `judge: JudgeClient` and `printResult(label: string, value: unknown): void` for every numbered example.

- [ ] **Step 1: Add a failing credential-safety contract test**

Create `test/examples.test.ts` with the first contract:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("example credentials stay out of Git", () => {
  const gitignore = readFileSync(".gitignore", "utf8");
  const envExample = readFileSync(".env.example", "utf8");

  assert.match(gitignore, /^\.env$/mu);
  assert.match(gitignore, /^\.env\.\*$/mu);
  assert.match(gitignore, /^!\.env\.example$/mu);
  assert.equal(envExample, "AI_GATEWAY_API_KEY=\n");
});
```

- [ ] **Step 2: Run the focused test in the red state**

Run: `node --test test/examples.test.ts`

Expected: FAIL because `.env.example` does not exist.

- [ ] **Step 3: Ignore local environment files and add the safe template**

Append these exact rules to `.gitignore`:

```gitignore
.env
.env.*
!.env.example
```

Create `.env.example`:

```dotenv
AI_GATEWAY_API_KEY=
```

Run: `git check-ignore .env .env.local && ! git check-ignore .env.example`

Expected: `.env` and `.env.local` are reported as ignored; `.env.example` is not ignored.

- [ ] **Step 4: Add the shared explicit Vercel configuration**

Create `examples/_shared.ts`:

```ts
import { createJudge } from "@brkn-labs/judge";
import { vercelGateway } from "@brkn-labs/judge/gateway/vercel";

const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();

if (!apiKey?.trim()) {
  throw new Error(
    "Set AI_GATEWAY_API_KEY in the repository-root .env file before running examples."
  );
}

export const judge = createJudge({
  gateway: vercelGateway({ apiKey }),
});

export const printResult = (label: string, value: unknown): void => {
  console.log(`\n${label}\n${JSON.stringify(value, null, 2)}`);
};
```

Add an examples-only lint override to `biome.jsonc` because console output is the
intended interface of runnable examples:

```json
{
  "includes": ["examples/**/*.ts"],
  "linter": {
    "rules": {
      "suspicious": {
        "noConsole": "off"
      }
    }
  }
}
```

- [ ] **Step 5: Run the focused test and lint**

Run: `node --test test/examples.test.ts && npm run lint`

Expected: PASS with no network activity.

- [ ] **Step 6: Commit the credential boundary and helper**

```bash
git add .gitignore .env.example biome.jsonc examples/_shared.ts test/examples.test.ts
git commit -m "feat: add safe Vercel example harness"
```

### Task 2: Focused primitive examples

**Files:**
- Create: `examples/01-boolean.ts`
- Create: `examples/02-if.ts`
- Create: `examples/03-choice.ts`
- Create: `examples/04-switch.ts`
- Create: `examples/05-score.ts`
- Modify: `test/examples.test.ts`

**Interfaces:**
- Consumes: `judge` and `printResult` from `examples/_shared.ts`.
- Produces: five independent, single-evaluation programs covering `boolean`, `if`, `choice`, `switch`, and `score`.

- [ ] **Step 1: Extend the contract test for the five focused examples**

Append to `test/examples.test.ts`:

```ts
const focusedExamples = [
  "examples/01-boolean.ts",
  "examples/02-if.ts",
  "examples/03-choice.ts",
  "examples/04-switch.ts",
  "examples/05-score.ts",
] as const;

const evaluationCall = /\bjudge\.(?:boolean|if|choice|switch|score)\s*\(/gu;

test("focused examples use the shared harness exactly once", () => {
  for (const file of focusedExamples) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /from "\.\/_shared\.ts"/u);
    assert.equal([...source.matchAll(evaluationCall)].length, 1, file);
  }
});
```

- [ ] **Step 2: Run the contract test in the red state**

Run: `node --test test/examples.test.ts`

Expected: FAIL because the five numbered files do not exist.

- [ ] **Step 3: Add `boolean()` and `if()` examples**

Create `examples/01-boolean.ts`:

```ts
import { judge, printResult } from "./_shared.ts";

const decision = await judge.boolean({
  condition: "Does this refund request require manual review?",
  context: {
    accountAgeDays: 12,
    amountUsd: 480,
    priorRefunds: 3,
    reason: "Item arrived damaged",
  },
});

printResult("Boolean decision", decision);
```

Create `examples/02-if.ts`:

```ts
import { judge, printResult } from "./_shared.ts";

const result = await judge.if({
  condition: "Should this customer request be escalated immediately?",
  confidence: {
    minimum: 0.8,
    uncertain: ({ decision }) => ({
      action: "manual-review" as const,
      confidence: decision.confidence,
    }),
  },
  context: {
    customerTier: "enterprise",
    message: "Production checkout has been unavailable for twenty minutes.",
    openIncidents: 1,
  },
  else: ({ decision }) => ({
    action: "standard-queue" as const,
    confidence: decision.confidence,
  }),
  then: ({ decision }) => ({
    action: "page-on-call" as const,
    confidence: decision.confidence,
  }),
});

printResult("If result", result);
```

- [ ] **Step 4: Add `choice()`, `switch()`, and `score()` examples**

Create `examples/03-choice.ts`:

```ts
import { judge, printResult } from "./_shared.ts";

const decision = await judge.choice({
  context: {
    subject: "Cannot update the card used for my subscription",
    text: "The billing page rejects my new company card.",
  },
  options: ["billing", "technical", "account", "general"],
  question: "Which team should handle this support request?",
});

printResult("Choice decision", decision);
```

Create `examples/04-switch.ts`:

```ts
import { judge, printResult } from "./_shared.ts";

const result = await judge.switch({
  cases: {
    approve: ({ decision }) => ({
      action: "approve" as const,
      confidence: decision.confidence,
    }),
    deny: ({ decision }) => ({
      action: "deny" as const,
      confidence: decision.confidence,
    }),
    review: ({ decision }) => ({
      action: "review" as const,
      confidence: decision.confidence,
    }),
  },
  context: {
    amountUsd: 850,
    countryMismatch: true,
    customerHistory: "Two years with no disputes",
  },
  question: "What action should be taken on this transaction?",
});

printResult("Switch result", result);
```

Create `examples/05-score.ts`:

```ts
import { judge, printResult } from "./_shared.ts";

const decision = await judge.score({
  context: {
    affectedCustomers: 2400,
    durationMinutes: 18,
    symptoms: ["Elevated API latency", "Intermittent checkout failures"],
  },
  levels: ["low", "moderate", "high", "critical"],
  question: "How severe is this production incident?",
});

printResult("Score decision", decision);
```

- [ ] **Step 5: Run focused contract, lint, and source typecheck**

Run: `node --test test/examples.test.ts && npm run lint && npm run typecheck`

Expected: PASS without evaluating any example.

- [ ] **Step 6: Commit the focused examples**

```bash
git add examples/0{1,2,3,4,5}-*.ts test/examples.test.ts
git commit -m "feat: add focused Judge examples"
```

### Task 3: Mixed-domain examples

**Files:**
- Create: `examples/06-support-triage.ts`
- Create: `examples/07-transaction-risk.ts`
- Create: `examples/08-incident-escalation.ts`
- Create: `examples/09-agent-tool-routing.ts`
- Modify: `test/examples.test.ts`

**Interfaces:**
- Consumes: the shared Vercel-backed `judge` and `printResult` helper.
- Produces: four single-evaluation programs spanning business routing, risk, operations, and agent orchestration.

- [ ] **Step 1: Extend the contract test for all nine files**

Replace `focusedExamples` in `test/examples.test.ts` with:

```ts
const exampleFiles = [
  "examples/01-boolean.ts",
  "examples/02-if.ts",
  "examples/03-choice.ts",
  "examples/04-switch.ts",
  "examples/05-score.ts",
  "examples/06-support-triage.ts",
  "examples/07-transaction-risk.ts",
  "examples/08-incident-escalation.ts",
  "examples/09-agent-tool-routing.ts",
] as const;
```

Rename the test to `"every numbered example uses the shared harness exactly once"`
and iterate over `exampleFiles`.

- [ ] **Step 2: Run the contract test in the red state**

Run: `node --test test/examples.test.ts`

Expected: FAIL because examples 06 through 09 do not exist.

- [ ] **Step 3: Add support and transaction-risk scenarios**

Create `examples/06-support-triage.ts`:

```ts
import { judge, printResult } from "./_shared.ts";

const routing = await judge.switch({
  cases: {
    account: ({ decision }) => ({
      queue: "account" as const,
      confidence: decision.confidence,
    }),
    billing: ({ decision }) => ({
      queue: "billing" as const,
      confidence: decision.confidence,
    }),
    general: ({ decision }) => ({
      queue: "general" as const,
      confidence: decision.confidence,
    }),
    technical: ({ decision }) => ({
      queue: "technical" as const,
      confidence: decision.confidence,
    }),
  },
  confidence: {
    minimum: 0.75,
    uncertain: ({ decision }) => ({
      queue: "human-review" as const,
      confidence: decision.confidence,
    }),
  },
  context: {
    customerTier: "business",
    message: "Our SSO users are redirected back to the login screen.",
    subject: "Team cannot sign in",
  },
  question: "Which support queue should own this ticket?",
});

printResult("Support triage", routing);
```

Create `examples/07-transaction-risk.ts`:

```ts
import { judge, printResult } from "./_shared.ts";

const risk = await judge.score({
  context: {
    accountAgeDays: 4,
    amountUsd: 1250,
    billingCountry: "US",
    deviceCountry: "DE",
    failedAttemptsLastHour: 3,
  },
  levels: ["low", "guarded", "high", "critical"],
  question: "What is the fraud risk of this transaction?",
});

const action =
  risk.score >= 2.5
    ? "block"
    : risk.score >= 1.5
      ? "manual-review"
      : "allow";

printResult("Transaction risk", { action, risk });
```

- [ ] **Step 4: Add incident and agent-routing scenarios**

Create `examples/08-incident-escalation.ts`:

```ts
import { judge, printResult } from "./_shared.ts";

const escalation = await judge.if({
  condition: "Does this incident require immediate on-call escalation?",
  confidence: {
    minimum: 0.85,
    uncertain: ({ decision }) => ({
      action: "incident-commander-review" as const,
      confidence: decision.confidence,
    }),
  },
  context: {
    affectedRegions: ["iad", "fra"],
    customerImpact: "Checkout requests fail intermittently",
    errorRatePercent: 18,
    startedMinutesAgo: 11,
  },
  else: ({ decision }) => ({
    action: "continue-investigation" as const,
    confidence: decision.confidence,
  }),
  then: ({ decision }) => ({
    action: "page-on-call" as const,
    confidence: decision.confidence,
  }),
});

printResult("Incident escalation", escalation);
```

Create `examples/09-agent-tool-routing.ts`:

```ts
import { judge, printResult } from "./_shared.ts";

const routing = await judge.switch({
  cases: {
    browser: ({ decision }) => ({
      tool: "browser" as const,
      confidence: decision.confidence,
    }),
    code: ({ decision }) => ({
      tool: "code" as const,
      confidence: decision.confidence,
    }),
    human_review: ({ decision }) => ({
      tool: "human-review" as const,
      confidence: decision.confidence,
    }),
    research: ({ decision }) => ({
      tool: "research" as const,
      confidence: decision.confidence,
    }),
  },
  confidence: {
    minimum: 0.8,
    uncertain: ({ decision }) => ({
      tool: "human-review" as const,
      confidence: decision.confidence,
    }),
  },
  context: {
    request: "Compare the current pricing and limits of three hosted databases.",
    requiresCurrentInformation: true,
    requiresRepositoryChanges: false,
  },
  question: "Which application-declared tool should handle this request?",
});

printResult("Agent tool routing", routing);
```

- [ ] **Step 5: Run focused contract, lint, and source typecheck**

Run: `node --test test/examples.test.ts && npm run lint && npm run typecheck`

Expected: PASS with nine source files checked structurally and no network calls.

- [ ] **Step 6: Commit the domain examples**

```bash
git add examples/0{6,7,8,9}-*.ts test/examples.test.ts
git commit -m "feat: add mixed-domain Judge examples"
```

### Task 4: Public-package typecheck, commands, and documentation

**Files:**
- Create: `tsconfig.examples.json`
- Create: `examples/README.md`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `test/examples.test.ts`

**Interfaces:**
- Consumes: all nine numbered examples and package `exports` declarations.
- Produces: `typecheck:examples`, nine individual `example:*` commands, and `example:all`.

- [ ] **Step 1: Add failing script and documentation assertions**

Append to `test/examples.test.ts`:

```ts
test("package scripts expose typed and live example commands", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};

  assert.equal(typeof scripts["typecheck:examples"], "string");
  assert.equal(typeof scripts["example:boolean"], "string");
  assert.equal(typeof scripts["example:if"], "string");
  assert.equal(typeof scripts["example:choice"], "string");
  assert.equal(typeof scripts["example:switch"], "string");
  assert.equal(typeof scripts["example:score"], "string");
  assert.equal(typeof scripts["example:support"], "string");
  assert.equal(typeof scripts["example:risk"], "string");
  assert.equal(typeof scripts["example:incident"], "string");
  assert.equal(typeof scripts["example:agent"], "string");
  assert.match(scripts["example:all"] ?? "", /09-agent-tool-routing\.ts/u);
});
```

- [ ] **Step 2: Run the focused test in the red state**

Run: `node --test test/examples.test.ts`

Expected: FAIL because the example scripts do not exist.

- [ ] **Step 3: Add the dedicated public-package typecheck**

Create `tsconfig.examples.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "."
  },
  "include": ["examples/**/*.ts"]
}
```

Add these exact scripts to `package.json`:

```json
{
  "check": "npm run lint && npm run typecheck && npm run typecheck:examples && npm run test:unit",
  "typecheck:examples": "npm run build --silent && tsc --noEmit -p tsconfig.examples.json",
  "example:boolean": "npm run build --silent && node --env-file=.env examples/01-boolean.ts",
  "example:if": "npm run build --silent && node --env-file=.env examples/02-if.ts",
  "example:choice": "npm run build --silent && node --env-file=.env examples/03-choice.ts",
  "example:switch": "npm run build --silent && node --env-file=.env examples/04-switch.ts",
  "example:score": "npm run build --silent && node --env-file=.env examples/05-score.ts",
  "example:support": "npm run build --silent && node --env-file=.env examples/06-support-triage.ts",
  "example:risk": "npm run build --silent && node --env-file=.env examples/07-transaction-risk.ts",
  "example:incident": "npm run build --silent && node --env-file=.env examples/08-incident-escalation.ts",
  "example:agent": "npm run build --silent && node --env-file=.env examples/09-agent-tool-routing.ts",
  "example:all": "npm run build --silent && node --env-file=.env examples/01-boolean.ts && node --env-file=.env examples/02-if.ts && node --env-file=.env examples/03-choice.ts && node --env-file=.env examples/04-switch.ts && node --env-file=.env examples/05-score.ts && node --env-file=.env examples/06-support-triage.ts && node --env-file=.env examples/07-transaction-risk.ts && node --env-file=.env examples/08-incident-escalation.ts && node --env-file=.env examples/09-agent-tool-routing.ts"
}
```

- [ ] **Step 4: Document setup, commands, and billing behavior**

Create `examples/README.md` with:

```markdown
# Judge examples

All examples use Jev through Vercel AI Gateway.

## Setup

```sh
cp .env.example .env
```

Add your Vercel AI Gateway key to `.env`:

```dotenv
AI_GATEWAY_API_KEY=your_key_here
```

Run one example with its `npm run example:*` command. For example:

```sh
npm run example:switch
```

Run `npm run typecheck:examples` to compile every example without making remote
requests.

`npm run example:all` executes all nine examples sequentially. It performs nine
remote, potentially billable evaluations.

## Focused APIs

| File | Command | API |
| --- | --- | --- |
| `01-boolean.ts` | `npm run example:boolean` | `boolean()` |
| `02-if.ts` | `npm run example:if` | `if()` |
| `03-choice.ts` | `npm run example:choice` | `choice()` |
| `04-switch.ts` | `npm run example:switch` | `switch()` |
| `05-score.ts` | `npm run example:score` | `score()` |

## Domain scenarios

| File | Command | Domain |
| --- | --- | --- |
| `06-support-triage.ts` | `npm run example:support` | Customer support |
| `07-transaction-risk.ts` | `npm run example:risk` | Transaction risk |
| `08-incident-escalation.ts` | `npm run example:incident` | Operations |
| `09-agent-tool-routing.ts` | `npm run example:agent` | Agent/tool routing |
```

Add an `Examples` section to the root `README.md` that links to
`examples/README.md`, shows `cp .env.example .env`, and states that the aggregate
command performs nine remote evaluations.

- [ ] **Step 5: Run contract and public declaration checks**

Run: `node --test test/examples.test.ts && npm run typecheck:examples`

Expected: PASS. `typecheck:examples` builds first and compiles package imports;
it does not execute the examples.

- [ ] **Step 6: Commit scripts and documentation**

```bash
git add tsconfig.examples.json examples/README.md package.json README.md test/examples.test.ts
git commit -m "docs: add Vercel example commands"
```

### Task 5: Full verification and repository handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-09-19-vercel-examples.md`

**Interfaces:**
- Consumes: the finished example suite and all repository verification scripts.
- Produces: a fully checked local branch ready to push; live execution remains user-controlled.

- [ ] **Step 1: Verify credentials are absent and ignored**

Run:

```bash
git check-ignore .env .env.local
git ls-files .env .env.local
rg -n -P 'AI_GATEWAY_API_KEY=(?!$|your_key_here$)[^\s]+' . \
  --glob '!node_modules/**' --glob '!dist/**' --glob '!.env' \
  --glob '!docs/superpowers/**'
```

Expected: the first command reports both ignored paths; `git ls-files` prints
nothing; the search finds no committed credential value.

- [ ] **Step 2: Run focused and medium gates**

Run:

```bash
node --test test/examples.test.ts
npm run typecheck:examples
npm run lint
```

Expected: every command exits zero without network access.

- [ ] **Step 3: Run the full repository gate**

Run: `npm run check && npm run build && npm pack --dry-run`

Expected: all unit tests, declaration checks, emitted-graph isolation checks,
build, and package dry run pass. No numbered example executes.

- [ ] **Step 4: Confirm live commands without invoking them**

Run:

```bash
npm pkg get scripts.example:boolean scripts.example:all
node --help | rg -- '--env-file'
```

Expected: both scripts use `node --env-file=.env`, and the installed Node version
documents native `--env-file` support. Do not run a live example without the
user's Vercel credential and explicit request.

- [ ] **Step 5: Mark the plan complete and commit verification state**

Change every completed checkbox in this plan from `[ ]` to `[x]`, then run:

```bash
git add docs/superpowers/plans/2026-09-19-vercel-examples.md
git commit -m "docs: complete Vercel examples plan"
git status --short
```

Expected: the commit succeeds and the working tree is clean.

- [ ] **Step 6: Push only after reviewing the final commit range**

Run:

```bash
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git push origin main
```

Expected: the design, plan, example implementation, tests, and documentation are
pushed to the personal `judge` repository on `main`.
