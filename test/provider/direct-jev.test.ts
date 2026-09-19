import assert from "node:assert/strict";
import test from "node:test";

import {
  AbortError,
  ConfigurationError,
  ProviderContractError,
  ProviderError,
} from "../../src/core/index.ts";
import { directJevGateway } from "../../src/provider/jev/direct.ts";

const request = {
  model: "jev-latest",
  questions: { decision: { instructions: "Proceed?", type: "noul" as const } },
  state: { id: 1 },
};

test("direct Jev posts the native state-and-questions payload", async () => {
  let captured: { input: string; init?: RequestInit } | undefined;
  const gateway = directJevGateway({ apiKey: "secret" }, (input, init) => {
    captured = { input: String(input), ...(init ? { init } : {}) };
    return Promise.resolve(
      new Response('{"answers":{"decision":{"type":"noul","noul":0.9}}}', {
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_1",
        },
        status: 200,
      })
    );
  });

  const result = await gateway.evaluate(request);

  assert.equal(captured?.input, "https://api.typesafe.ai/v1/systemone");
  assert.equal(captured?.init?.method, "POST");
  assert.deepEqual(captured?.init?.headers, {
    authorization: "Bearer secret",
    "content-type": "application/json",
  });
  assert.deepEqual(JSON.parse(String(captured?.init?.body)), request);
  assert.deepEqual(result.body, {
    answers: { decision: { noul: 0.9, type: "noul" } },
  });
  assert.equal(result.metadata?.requestId, "req_1");
});

test("direct Jev maps stable HTTP errors without exposing response text", async () => {
  const cases = [
    [401, "authentication"],
    [403, "authentication"],
    [402, "quota"],
    [422, "invalid_request"],
    [429, "rate_limit"],
    [529, "model_unavailable"],
    [500, "provider_error"],
  ] as const;

  await Promise.all(
    cases.map(async ([status, code]) => {
      const gateway = directJevGateway({ apiKey: "secret" }, () =>
        Promise.resolve(new Response("sensitive vendor body", { status }))
      );
      await assert.rejects(gateway.evaluate(request), (error) => {
        assert.equal(error instanceof ProviderError, true);
        assert.equal((error as ProviderError).code, code);
        assert.equal(String(error).includes("sensitive"), false);
        return true;
      });
    })
  );
});

test("direct Jev rejects malformed and oversized JSON responses", async () => {
  const malformed = directJevGateway({ apiKey: "secret" }, () =>
    Promise.resolve(new Response("not-json", { status: 200 }))
  );
  await assert.rejects(malformed.evaluate(request), ProviderContractError);

  const oversized = directJevGateway(
    { apiKey: "secret", maxResponseBytes: 5 },
    () => Promise.resolve(new Response("123456", { status: 200 }))
  );
  await assert.rejects(
    oversized.evaluate(request),
    (error) =>
      error instanceof ProviderError && error.code === "response_too_large"
  );
});

test("direct Jev does not retry by default and retries only configured 429/529", async () => {
  let defaultCalls = 0;
  const withoutRetry = directJevGateway({ apiKey: "secret" }, () => {
    defaultCalls += 1;
    return Promise.resolve(new Response(null, { status: 429 }));
  });
  await assert.rejects(withoutRetry.evaluate(request), ProviderError);
  assert.equal(defaultCalls, 1);

  let retryCalls = 0;
  const withRetry = directJevGateway(
    {
      apiKey: "secret",
      retry: { initialDelayMs: 0, maxAttempts: 3, maxDelayMs: 0 },
    },
    () => {
      retryCalls += 1;
      return Promise.resolve(
        retryCalls < 3
          ? new Response(null, { headers: { "retry-after": "0" }, status: 529 })
          : Response.json({ answers: {} })
      );
    }
  );
  await withRetry.evaluate(request);
  assert.equal(retryCalls, 3);
});

test("direct Jev maps caller abort distinctly", async () => {
  const controller = new AbortController();
  const gateway = directJevGateway({ apiKey: "secret" }, (_input, init) => {
    controller.abort("stop");
    return Promise.reject(init?.signal?.reason);
  });

  await assert.rejects(
    gateway.evaluate(request, { signal: controller.signal }),
    AbortError
  );
});

test("direct Jev maps a local timeout distinctly", async () => {
  const gateway = directJevGateway(
    { apiKey: "secret" },
    (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          {
            once: true,
          }
        );
      })
  );

  await assert.rejects(
    gateway.evaluate(request, { timeoutMs: 1 }),
    (error) => error instanceof ProviderError && error.code === "timeout"
  );
});

test("direct Jev validates local configuration", () => {
  for (const options of [
    { apiKey: "" },
    { apiKey: "secret", baseUrl: "ftp://example.com" },
    { apiKey: "secret", maxResponseBytes: 0 },
    { apiKey: "secret", retry: { maxAttempts: 0 } },
  ]) {
    assert.throws(() => directJevGateway(options as never), ConfigurationError);
  }
});
