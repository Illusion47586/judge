import assert from "node:assert/strict";
import test from "node:test";

import {
  isRateLimited,
  parseDelay,
  runExamples,
} from "../scripts/run-examples.ts";

const DELAY_ERROR = /delay/u;

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
    assert.throws(() => parseDelay(value, "delay", 15_000), DELAY_ERROR);
  }
});
