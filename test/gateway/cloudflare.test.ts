import assert from "node:assert/strict";
import test from "node:test";

import { ConfigurationError } from "../../src/core/index.ts";
import { cloudflareGateway } from "../../src/gateway/cloudflare.ts";

test("Cloudflare invokes the native Workers AI model with Jev payload", async () => {
  let captured: unknown;
  const gateway = cloudflareGateway({
    accountId: "account",
    apiToken: "token",
    client: {
      ai: {
        run: (model: string, params: unknown, options: unknown) => {
          captured = { model, options, params };
          return Promise.resolve({
            answers: { decision: { noul: 0.7, type: "noul" } },
          });
        },
      },
    },
    gatewayId: "production",
  } as never);

  const result = await gateway.evaluate({
    model: "typesafe/jev",
    questions: { decision: { instructions: "Proceed?", type: "noul" } },
    state: { id: 1 },
  });

  assert.deepEqual(captured, {
    model: "typesafe/jev",
    options: undefined,
    params: {
      account_id: "account",
      gateway: { id: "production" },
      questions: { decision: { instructions: "Proceed?", type: "noul" } },
      state: { id: 1 },
    },
  });
  assert.deepEqual(result.body, {
    answers: { decision: { noul: 0.7, type: "noul" } },
  });
});

test("Cloudflare validates explicit credentials", () => {
  assert.throws(
    () => cloudflareGateway({ accountId: "", apiToken: "token" }),
    ConfigurationError
  );
});
