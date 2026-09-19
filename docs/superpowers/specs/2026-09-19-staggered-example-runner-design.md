# Staggered Vercel Example Runner Design

**Date:** 2026-09-19
**Status:** Approved design

## Summary

Judge will replace the fail-fast `example:all` command with a sequential,
staggered runner for the nine Vercel AI Gateway examples. The runner will
reduce burst pressure, retry a rate-limited example once, continue after
individual failures, and print a final summary.

Staggering cannot guarantee that Vercel's unpublished free-tier per-model rate
limit will not be reached. The runner therefore treats rate limiting as an
expected recoverable condition rather than claiming to bypass it.

## Behavior

- Build the package once before the runner starts.
- Run examples `01` through `09` sequentially in filename order.
- Wait 15 seconds between examples by default.
- Let `JUDGE_EXAMPLE_DELAY_MS` override the inter-example delay with a
  non-negative integer number of milliseconds.
- If an attempt fails and its output contains an explicit HTTP `429` or Judge
  `rate_limit` signal, wait 60 seconds and retry that example exactly once.
- Let `JUDGE_EXAMPLE_RETRY_DELAY_MS` override the retry delay with a
  non-negative integer number of milliseconds.
- Do not retry authentication, quota, invalid-request, context-limit, provider
  contract, or application errors.
- Continue to later examples after any final failure.
- Print a compact final summary showing pass/fail and attempt count for every
  example.
- Exit zero only when all examples eventually pass.

The runner will state before execution that each successful attempt can be a
remote, potentially billable evaluation and that a lost response could make a
retry billable even when the first attempt's outcome is unknown.

## Environment Loading

The runner will inspect only file existence, never credential contents. It will
use the first existing file in this order:

1. `.env.local`
2. `.env`

If neither exists, it will fail before spawning an example with instructions to
create one from `.env.example`. The selected file is passed to child Node
processes through native `--env-file`; the runner never prints the key.

## Implementation Boundary

Create `scripts/run-examples.ts` with an exported, dependency-injected
`runExamples()` function plus a small CLI boundary. The orchestration function
will accept example paths, delay values, a process-attempt function, and a wait
function. Production defaults use `node:child_process` and `node:timers/promises`.

Each child process will execute:

```text
node --env-file=<selected file> examples/NN-name.ts
```

Child stdout and stderr will be forwarded to the terminal. A bounded tail of
stderr will be retained only long enough to identify `429` or `rate_limit`;
the runner will not persist output.

## Package Commands

`example:all` becomes:

```json
"example:all": "npm run build --silent && node scripts/run-examples.ts"
```

Individual `example:*` commands remain available and unchanged. The examples
README will recommend `example:all` for the staggered suite and document both
delay environment variables, the one-retry policy, environment-file priority,
potential billing, total minimum wall time, and non-zero exit behavior.

## Verification

Unit tests will use fake attempts and fake waits, with no network calls or real
delays. They will prove:

- examples run sequentially in input order;
- the configured inter-example delay occurs only between examples;
- successful examples are attempted once;
- explicit rate limits receive one delayed retry;
- non-rate-limit errors are not retried;
- a second rate-limit failure is final;
- later examples run after failures;
- summary results preserve order and attempt counts;
- invalid delay values fail before an attempt;
- `.env.local` is preferred over `.env` without reading either file.

After unit, type, lint, build, package, and isolation checks pass, the full live
suite will run with the user's existing `.env.local`. The live command may take
several minutes because of inter-example and retry delays. Its results will be
reported per example without exposing credentials.

## Acceptance Criteria

- `npm run example:all` uses the staggered runner.
- All nine examples are attempted even when one fails.
- Only explicit rate-limit failures receive one retry.
- The runner selects `.env.local` before `.env` and never prints credentials.
- Offline tests use no real delays or gateway requests.
- All repository verification gates pass before the live run.
- The live Vercel run is reported honestly; staggering is not described as a
  guaranteed rate-limit bypass.
