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
  if (value === undefined) {
    return fallback;
  }

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
