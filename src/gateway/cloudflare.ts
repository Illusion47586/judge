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

/** Configuration for {@link cloudflareGateway}. */
export interface CloudflareGatewayOptions {
  /** Cloudflare account identifier that owns the Workers AI request. */
  readonly accountId: string;
  /** Cloudflare API token authorized to invoke Workers AI. */
  readonly apiToken: string;
  /** Optional Cloudflare AI Gateway identifier for routing and observability. */
  readonly gatewayId?: string;
  /**
   * Default Workers AI model identifier.
   *
   * @defaultValue `"typesafe/jev"`
   */
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

/**
 * Creates a Cloudflare Workers AI adapter.
 *
 * @remarks Calling a Judge client with this gateway performs remote,
 * potentially billable work. This adapter requires the optional `cloudflare`
 * peer dependency. SDK retries are disabled to avoid hidden duplicate
 * evaluations. Per-request headers, abort signals, and timeouts are forwarded
 * to Cloudflare; `timeoutMs` is measured in milliseconds. Cloudflare owns
 * model availability, rate limits, context limits, and billing.
 *
 * @param options - Cloudflare credentials, routing, and model configuration.
 * @returns A reusable {@link GatewayPlugin}.
 * @throws {@link ConfigurationError} if a required string is missing or not
 * trimmed. Evaluation can reject with cancellation, timeout, or normalized
 * provider errors.
 *
 * @example
 * ```ts
 * import { createJudge } from "@brkn-labs/judge";
 * import { cloudflareGateway } from "@brkn-labs/judge/gateway/cloudflare";
 *
 * const judge = createJudge({
 *   gateway: cloudflareGateway({
 *     accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
 *     apiToken: process.env.CLOUDFLARE_API_TOKEN!,
 *   }),
 * });
 * const route = await judge.choice({
 *   context: { ticket: "Invoice total is incorrect" },
 *   options: ["billing", "support"],
 *   question: "Which team should own this ticket?",
 * });
 * ```
 */
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
