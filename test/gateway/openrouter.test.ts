import assert from "node:assert/strict";
import test from "node:test";

import { openRouterGateway } from "../../src/gateway/openrouter.ts";

test("OpenRouter calls Decisions, never chat completions", async () => {
  let captured: { input: string; init?: RequestInit } | undefined;
  const gateway = openRouterGateway({
    apiKey: "secret",
    appTitle: "Judge app",
    fetch: (input: string, init?: RequestInit) => {
      captured = { input, ...(init ? { init } : {}) };
      return Promise.resolve(
        Response.json({ answers: { decision: { noul: 0.6, type: "noul" } } })
      );
    },
    httpReferer: "https://example.com",
    provider: { order: ["TypeSafe"] },
  } as never);

  await gateway.evaluate({
    model: "typesafe/jev-1.13",
    questions: { decision: { instructions: "Proceed?", type: "noul" } },
    state: { id: 1 },
  });

  assert.equal(captured?.input, "https://openrouter.ai/api/alpha/decisions");
  assert.equal(captured?.input.includes("chat"), false);
  assert.deepEqual(JSON.parse(String(captured?.init?.body)), {
    model: "typesafe/jev-1.13",
    provider: { order: ["TypeSafe"] },
    questions: { decision: { instructions: "Proceed?", type: "noul" } },
    state: { id: 1 },
  });
  assert.deepEqual(captured?.init?.headers, {
    authorization: "Bearer secret",
    "content-type": "application/json",
    "HTTP-Referer": "https://example.com",
    "X-OpenRouter-Title": "Judge app",
  });
});
