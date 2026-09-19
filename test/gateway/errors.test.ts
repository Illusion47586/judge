import assert from "node:assert/strict";
import test from "node:test";

import { ContextLimitError, ProviderError } from "../../src/core/index.ts";
import { normalizeGatewayError } from "../../src/gateway/errors.ts";

test("normalizes explicit nested context failures", () => {
  const cause = {
    data: {
      error: {
        message: "Maximum context length exceeded.",
        type: "context_length_exceeded",
      },
    },
    statusCode: 400,
  };

  assert.throws(
    () => normalizeGatewayError(cause),
    (error) =>
      error instanceof ContextLimitError &&
      error.code === "context_limit" &&
      error.cause === cause
  );
});

test("does not infer context failure from status alone", () => {
  for (const statusCode of [400, 413, 422]) {
    assert.throws(
      () => normalizeGatewayError({ statusCode }),
      (error) =>
        error instanceof ProviderError &&
        !(error instanceof ContextLimitError) &&
        error.code === "invalid_request"
    );
  }
});
