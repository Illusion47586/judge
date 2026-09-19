import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import { fileURLToPath } from "node:url";

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

const RATE_LIMIT = /(?:\b429\b|\brate_limit\b)/iu;

export const isRateLimited = (output: string): boolean =>
  RATE_LIMIT.test(output);

export const parseDelay = (
  value: string | undefined,
  name: string,
  fallback: number
): number => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new TypeError(`${name} must be a non-negative integer.`);
  }

  return parsed;
};

export const selectEnvironmentFile = (
  exists: (file: string) => boolean = existsSync
): ".env.local" | ".env" => {
  if (exists(".env.local")) {
    return ".env.local";
  }
  if (exists(".env")) {
    return ".env";
  }
  throw new Error(
    "Create .env.local or .env from .env.example before running examples."
  );
};

export const spawnExample = (
  file: string,
  envFile: ".env.local" | ".env"
): Promise<ExampleAttempt> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`--env-file=${envFile}`, file], {
      stdio: ["inherit", "pipe", "pipe"],
    });
    let stderrTail = "";

    child.stdout.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      stderrTail = (stderrTail + chunk.toString()).slice(-STDERR_TAIL_LIMIT);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ code: code ?? 1, stderrTail });
    });
  });

export const runExamples = async (
  options: RunExamplesOptions
): Promise<ExampleRunResult[]> => {
  const results: ExampleRunResult[] = [];

  for (const [index, file] of options.files.entries()) {
    let attempts = 1;
    // biome-ignore lint/performance/noAwaitInLoops: examples must run sequentially to stagger provider requests.
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

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const main = async (): Promise<void> => {
  const envFile = selectEnvironmentFile();
  const delayMs = parseDelay(
    process.env.JUDGE_EXAMPLE_DELAY_MS,
    "JUDGE_EXAMPLE_DELAY_MS",
    DEFAULT_DELAY_MS
  );
  const retryDelayMs = parseDelay(
    process.env.JUDGE_EXAMPLE_RETRY_DELAY_MS,
    "JUDGE_EXAMPLE_RETRY_DELAY_MS",
    DEFAULT_RETRY_DELAY_MS
  );

  process.stdout.write(
    `Running ${EXAMPLES.length} remote examples; requests may be billable. Explicit rate limits are retried once.\n` +
      `Inter-example delay: ${delayMs}ms; rate-limit retry delay: ${retryDelayMs}ms.\n`
  );

  const results = await runExamples({
    attempt: (file) => spawnExample(file, envFile),
    delayMs,
    files: EXAMPLES,
    retryDelayMs,
    wait,
  });

  process.stdout.write("\nExample summary:\n");
  for (const result of results) {
    const attemptLabel = result.attempts === 1 ? "attempt" : "attempts";
    process.stdout.write(
      `${result.passed ? "PASS" : "FAIL"} ${result.file} (${result.attempts} ${attemptLabel})\n`
    );
  }

  if (results.some((result) => !result.passed)) {
    process.exitCode = 1;
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  });
}
