# Staggered Example Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fail-fast aggregate example command with a sequential runner that spaces Vercel requests, retries explicit rate limits once, continues after failures, and summarizes all nine examples.

**Architecture:** A dependency-injected orchestration module will own scheduling and retry policy, while a thin CLI boundary selects `.env.local` or `.env` and spawns Node children. Unit tests will fake attempts and waits so offline verification has no real delays or network activity.

**Tech Stack:** Node.js 22.18+, TypeScript 7, Node test runner, native child processes, native `--env-file`, Ultracite/Biome.

## Global Constraints

- Default inter-example delay: `15_000` milliseconds.
- Default explicit rate-limit retry delay: `60_000` milliseconds.
- Each example receives at most two attempts.
- Retry only output containing HTTP `429` or Judge `rate_limit`.
- Continue after every final failure and preserve example order in the summary.
- Prefer `.env.local`, then `.env`; inspect existence but never credential contents.
- Forward child output but retain at most the final 65,536 stderr characters for classification.
- Add no dependency and make no live request until all offline gates pass.
- Never claim that staggering guarantees bypassing Vercel's limit.

---

### Task 1: Testable scheduling and retry policy

**Files:**
- Create: `scripts/run-examples.ts`
- Create: `test/examples-runner.test.ts`

**Interfaces:**
- Produces: `ExampleAttempt`, `ExampleRunResult`, `RunExamplesOptions`, `isRateLimited(output)`, `parseDelay(value, name, fallback)`, and `runExamples(options)`.

- [ ] **Step 1: Write failing scheduling tests**

Create `test/examples-runner.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  isRateLimited,
  parseDelay,
  runExamples,
} from "../scripts/run-examples.ts";

test("runs examples in order with delays only between examples", async () => {
  const events: string[] = [];
  const results = await runExamples({
    attempt: (file) => {
      events.push(`run:${file}`);
      return Promise.resolve({ code: 0, stderrTail: "" });
    },
    delayMs: 15,
    files: ["01.ts", "02.ts", "03.ts"],
    retryDelayMs: 60,
    wait: (milliseconds) => {
      events.push(`wait:${milliseconds}`);
      return Promise.resolve();
    },
  });

  assert.deepEqual(events, [
    "run:01.ts",
    "wait:15",
    "run:02.ts",
    "wait:15",
    "run:03.ts",
  ]);
  assert.deepEqual(results, [
    { attempts: 1, file: "01.ts", passed: true },
    { attempts: 1, file: "02.ts", passed: true },
    { attempts: 1, file: "03.ts", passed: true },
  ]);
});

test("retries an explicit rate limit once after the retry delay", async () => {
  const events: string[] = [];
  let attempts = 0;
  const [result] = await runExamples({
    attempt: () => {
      attempts += 1;
      events.push(`attempt:${attempts}`);
      return Promise.resolve(
        attempts === 1
          ? { code: 1, stderrTail: "ProviderError code: rate_limit" }
          : { code: 0, stderrTail: "" }
      );
    },
    delayMs: 15,
    files: ["01.ts"],
    retryDelayMs: 60,
    wait: (milliseconds) => {
      events.push(`wait:${milliseconds}`);
      return Promise.resolve();
    },
  });

  assert.deepEqual(events, ["attempt:1", "wait:60", "attempt:2"]);
  assert.deepEqual(result, { attempts: 2, file: "01.ts", passed: true });
});

test("does not retry unrelated failures and continues", async () => {
  const attempted: string[] = [];
  const results = await runExamples({
    attempt: (file) => {
      attempted.push(file);
      return Promise.resolve({
        code: file === "01.ts" ? 1 : 0,
        stderrTail: file === "01.ts" ? "authentication" : "",
      });
    },
    delayMs: 0,
    files: ["01.ts", "02.ts"],
    retryDelayMs: 0,
    wait: () => Promise.resolve(),
  });

  assert.deepEqual(attempted, ["01.ts", "02.ts"]);
  assert.deepEqual(results, [
    { attempts: 1, file: "01.ts", passed: false },
    { attempts: 1, file: "02.ts", passed: true },
  ]);
});

test("a second rate limit is final", async () => {
  let attempts = 0;
  const [result] = await runExamples({
    attempt: () => {
      attempts += 1;
      return Promise.resolve({ code: 1, stderrTail: "HTTP 429" });
    },
    delayMs: 0,
    files: ["01.ts"],
    retryDelayMs: 0,
    wait: () => Promise.resolve(),
  });
  assert.equal(attempts, 2);
  assert.deepEqual(result, { attempts: 2, file: "01.ts", passed: false });
});

test("recognizes only explicit rate-limit output", () => {
  assert.equal(isRateLimited("statusCode: 429"), true);
  assert.equal(isRateLimited("code: 'rate_limit'"), true);
  assert.equal(isRateLimited("quota exceeded"), false);
});

test("parses non-negative integer delays", () => {
  assert.equal(parseDelay(undefined, "delay", 15_000), 15_000);
  assert.equal(parseDelay("0", "delay", 15_000), 0);
  assert.equal(parseDelay("2500", "delay", 15_000), 2500);
  for (const value of ["-1", "1.5", "nope"]) {
    assert.throws(() => parseDelay(value, "delay", 15_000), /delay/u);
  }
});
```

- [ ] **Step 2: Run the scheduler tests red**

Run: `node --test test/examples-runner.test.ts`

Expected: FAIL because `scripts/run-examples.ts` does not exist.

- [ ] **Step 3: Implement the pure orchestration API**

Create `scripts/run-examples.ts` with these exported contracts and functions:

```ts
export interface ExampleAttempt {
  readonly code: number;
  readonly stderrTail: string;
}

export interface ExampleRunResult {
  readonly attempts: number;
  readonly file: string;
  readonly passed: boolean;
}

export interface RunExamplesOptions {
  readonly attempt: (file: string) => Promise<ExampleAttempt>;
  readonly delayMs: number;
  readonly files: readonly string[];
  readonly retryDelayMs: number;
  readonly wait: (milliseconds: number) => Promise<void>;
}

const RATE_LIMIT = /(?:\b429\b|\brate_limit\b)/iu;

export const isRateLimited = (output: string): boolean =>
  RATE_LIMIT.test(output);

export const parseDelay = (
  value: string | undefined,
  name: string,
  fallback: number
): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new TypeError(`${name} must be a non-negative integer.`);
  }
  return parsed;
};

export const runExamples = async (
  options: RunExamplesOptions
): Promise<ExampleRunResult[]> => {
  const results: ExampleRunResult[] = [];
  for (const [index, file] of options.files.entries()) {
    let attempts = 1;
    let attempt = await options.attempt(file);
    if (attempt.code !== 0 && isRateLimited(attempt.stderrTail)) {
      await options.wait(options.retryDelayMs);
      attempts = 2;
      attempt = await options.attempt(file);
    }
    results.push({ attempts, file, passed: attempt.code === 0 });
    if (index < options.files.length - 1) {
      await options.wait(options.delayMs);
    }
  }
  return results;
};
```

- [ ] **Step 4: Run focused tests and lint**

Run: `node --test test/examples-runner.test.ts && npm run lint`

Expected: PASS without real waiting or network work.

- [ ] **Step 5: Commit the orchestration unit**

```bash
git add scripts/run-examples.ts test/examples-runner.test.ts
git commit -m "feat: add staggered example scheduler"
```

---

### Task 2: CLI spawning, environment selection, and summary

**Files:**
- Modify: `scripts/run-examples.ts`
- Modify: `test/examples-runner.test.ts`
- Modify: `package.json`
- Modify: `test/examples.test.ts`

**Interfaces:**
- Consumes: Task 1 orchestration and nine example paths.
- Produces: `selectEnvironmentFile(exists)`, `spawnExample(file, envFile)`, CLI output, and the updated `example:all` script.

- [ ] **Step 1: Add failing environment-selection tests**

Append:

```ts
import { selectEnvironmentFile } from "../scripts/run-examples.ts";

test("prefers .env.local without reading environment files", () => {
  const checked: string[] = [];
  const selected = selectEnvironmentFile((file) => {
    checked.push(file);
    return file === ".env.local" || file === ".env";
  });
  assert.equal(selected, ".env.local");
  assert.deepEqual(checked, [".env.local"]);
});

test("falls back to .env and rejects a missing environment", () => {
  assert.equal(selectEnvironmentFile((file) => file === ".env"), ".env");
  assert.throws(() => selectEnvironmentFile(() => false), /\.env\.example/u);
});
```

Run: `node --test test/examples-runner.test.ts`

Expected: FAIL because `selectEnvironmentFile` is missing.

- [ ] **Step 2: Implement environment selection and child spawning**

Add Node imports and production constants:

```ts
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_DELAY_MS = 15_000;
const DEFAULT_RETRY_DELAY_MS = 60_000;
const STDERR_TAIL_LIMIT = 65_536;
const EXAMPLES = [
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

export const selectEnvironmentFile = (
  exists: (file: string) => boolean = existsSync
): ".env.local" | ".env" => {
  if (exists(".env.local")) return ".env.local";
  if (exists(".env")) return ".env";
  throw new Error("Create .env.local or .env from .env.example before running examples.");
};
```

Implement `spawnExample` with `spawn(process.execPath,
[`--env-file=${envFile}`, file], { stdio: ["inherit", "pipe", "pipe"] })`.
Forward stdout/stderr chunks with `process.stdout.write` and
`process.stderr.write`. Keep only `stderrTail.slice(-STDERR_TAIL_LIMIT)`. Resolve
with `{ code: code ?? 1, stderrTail }` on `close`, and reject on `error`.

- [ ] **Step 3: Add the CLI boundary and summary**

At module execution, compare `process.argv[1]` with `fileURLToPath(import.meta.url)`.
When equal:

1. Select the environment file.
2. Parse both delay variables.
3. Print the remote/billable and retry warning plus chosen delays.
4. Call `runExamples()` with `EXAMPLES`, `spawnExample`, and native `wait`.
5. Print one line per result using `PASS`/`FAIL`, filename, and attempt count.
6. Set `process.exitCode = 1` if any result failed.
7. Catch configuration/spawn failures, print only the error message, and set
   `process.exitCode = 1`.

- [ ] **Step 4: Update package contracts**

Change:

```json
"example:all": "npm run build --silent && node scripts/run-examples.ts"
```

Update `test/examples.test.ts` so it asserts `example:all` contains
`scripts/run-examples.ts` and no longer asserts that its command ends with the
ninth example. Keep all nine individual command assertions.

- [ ] **Step 5: Verify CLI structure without live execution**

Run:

```bash
node --test test/examples-runner.test.ts test/examples.test.ts
npm pkg get scripts.example:all
npm run lint
npm run typecheck
```

Expected: tests and checks pass; the script points to the runner; no child
example executes.

- [ ] **Step 6: Commit the CLI runner**

```bash
git add scripts/run-examples.ts test/examples-runner.test.ts package.json test/examples.test.ts
git commit -m "feat: run examples with rate-limit backoff"
```

---

### Task 3: Documentation, offline gates, and live Vercel run

**Files:**
- Modify: `examples/README.md`
- Modify: `docs/superpowers/plans/2026-09-19-staggered-example-runner.md`

**Interfaces:**
- Consumes: completed runner and the user's ignored `.env.local`.
- Produces: documented controls, full offline verification, and a nine-example live result report.

- [ ] **Step 1: Document stagger, retry, environment, and billing behavior**

Update the aggregate-command section in `examples/README.md` with:

### Run the staggered suite

`npm run example:all` runs all nine examples sequentially. It prefers
`.env.local`, falls back to `.env`, and waits 15 seconds between examples.
Explicit `429` or `rate_limit` failures are retried once after 60 seconds.
Other failures are not retried, and later examples still run.

Override delays when needed:

```sh
JUDGE_EXAMPLE_DELAY_MS=20000 \
JUDGE_EXAMPLE_RETRY_DELAY_MS=90000 \
npm run example:all
```

Every successful attempt is a remote, potentially billable evaluation. A
retry can also be billable if the first response was lost after provider work.
The default successful path takes at least two minutes of intentional waiting.
The command exits non-zero if any example ultimately fails.

Change setup instructions to say `.env.local` is preferred while `.env` remains
supported.

- [ ] **Step 2: Run every offline gate**

Run:

```bash
node --test test/examples-runner.test.ts test/examples.test.ts
npm run check
npm run build
npm pack --dry-run
node --test test/package-isolation.test.ts test/package-exports.test.ts
git check-ignore .env .env.local
git ls-files .env .env.local
```

Expected: all checks pass; both environment files are ignored and untracked;
no live example has run.

- [ ] **Step 3: Commit documentation before live work**

```bash
git add examples/README.md
git commit -m "docs: explain staggered example runs"
git status --short
```

Expected: clean tree.

- [ ] **Step 4: Run the live suite**

Run: `npm run example:all`

Expected: all nine examples are attempted using `.env.local`, with 15-second
spacing and at most one 60-second retry per explicit rate limit. Do not expose
the API key. Capture the final summary and note every retry or final failure.

- [ ] **Step 5: Complete the plan and update PR 1**

Mark completed checkboxes `[x]`, then run:

```bash
git add docs/superpowers/plans/2026-09-19-staggered-example-runner.md
git commit -m "docs: complete staggered runner plan"
git push origin feat/vercel-examples
gh pr view 1 --json url,title,headRefName,baseRefName,state
```

Expected: the runner, tests, documentation, and recorded completion state are
pushed to the existing open pull request against `main`.
