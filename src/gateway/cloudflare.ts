import Cloudflare from "cloudflare";

import { ConfigurationError } from "../core/errors.ts";
import { defineGateway } from "./custom.ts";
import { normalizeGatewayError } from "./errors.ts";
import type {
  GatewayEvaluationRequest,
  GatewayPlugin,
  GatewayRequestOptions,
} from "./types.ts";

const DEFAULT_MODEL = "typesafe/jev";

export interface CloudflareGatewayOptions {
  readonly accountId: string;
  readonly apiToken: string;
  readonly gatewayId?: string;
  readonly model?: string;
}

interface CloudflareClient {
  ai: {
    run: (
      model: string,
      params: unknown,
      options?: unknown
    ) => Promise<unknown>;
  };
}

interface TestDependencies {
  client?: CloudflareClient;
}

const validateString = (value: unknown, name: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new ConfigurationError(
      `${name} must be a non-empty, trimmed string.`
    );
  }
  return value;
};

export const cloudflareGateway = (
  options: CloudflareGatewayOptions
): GatewayPlugin => {
  const accountId = validateString(options.accountId, "accountId");
  const apiToken = validateString(options.apiToken, "apiToken");
  const model = validateString(options.model ?? DEFAULT_MODEL, "model");
  const gatewayId =
    options.gatewayId === undefined
      ? undefined
      : validateString(options.gatewayId, "gatewayId");
  const dependencies = options as CloudflareGatewayOptions & TestDependencies;
  const client: CloudflareClient =
    dependencies.client ??
    (new Cloudflare({
      apiToken,
      maxRetries: 0,
    }) as unknown as CloudflareClient);

  return defineGateway({
    capabilities: {
      batching: true,
      boolean: true,
      choice: true,
      customHeaders: true,
      jev: true,
      score: true,
    },
    evaluate: async (
      request: GatewayEvaluationRequest,
      requestOptions?: GatewayRequestOptions
    ) => {
      const startedAt = performance.now();
      try {
        const body = await client.ai.run(
          request.model,
          {
            account_id: accountId,
            ...(gatewayId ? { gateway: { id: gatewayId } } : {}),
            questions: request.questions,
            state: request.state,
          },
          requestOptions
            ? {
                headers: requestOptions.headers,
                signal: requestOptions.signal,
                timeout: requestOptions.timeoutMs,
              }
            : undefined
        );
        return {
          body,
          metadata: {
            gateway: "cloudflare",
            latencyMs: performance.now() - startedAt,
            model: request.model,
          },
        };
      } catch (cause) {
        return normalizeGatewayError(cause, requestOptions?.signal);
      }
    },
    id: "cloudflare",
    model,
  });
};
