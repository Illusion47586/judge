import { ConfigurationError, JudgeError } from "../core/errors.ts";
import {
  createRequestSignal,
  DEFAULT_MAX_RESPONSE_BYTES,
  errorForStatus,
  type Fetcher,
  mapFetchFailure,
  readBoundedJson,
} from "../provider/jev/http.ts";
import { defineGateway } from "./custom.ts";
import type {
  GatewayEvaluationRequest,
  GatewayPlugin,
  GatewayRequestOptions,
} from "./types.ts";

const DEFAULT_BASE_URL = "https://openrouter.ai/api";
const DEFAULT_MODEL = "typesafe/jev-1.13";
const TRAILING_SLASH = /\/$/u;

export interface OpenRouterGatewayOptions {
  readonly apiKey: string;
  readonly appTitle?: string;
  readonly baseUrl?: string;
  readonly httpReferer?: string;
  readonly maxResponseBytes?: number;
  readonly model?: string;
  readonly provider?: Readonly<Record<string, unknown>>;
}

interface TestDependencies {
  fetch?: Fetcher;
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

const endpointFor = (baseUrl: string | undefined): string => {
  try {
    const url = new URL(baseUrl ?? DEFAULT_BASE_URL);
    if (
      !(url.protocol === "https:" || url.protocol === "http:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new TypeError("Unsupported protocol.");
    }
    return `${url.toString().replace(TRAILING_SLASH, "")}/alpha/decisions`;
  } catch (cause) {
    throw new ConfigurationError("baseUrl must be a valid HTTP(S) URL.", {
      cause,
    });
  }
};

export const openRouterGateway = (
  options: OpenRouterGatewayOptions
): GatewayPlugin => {
  const apiKey = validateString(options.apiKey, "apiKey");
  const model = validateString(options.model ?? DEFAULT_MODEL, "model");
  const appTitle =
    options.appTitle === undefined
      ? undefined
      : validateString(options.appTitle, "appTitle");
  const httpReferer =
    options.httpReferer === undefined
      ? undefined
      : validateString(options.httpReferer, "httpReferer");
  const endpoint = endpointFor(options.baseUrl);
  const maxResponseBytes =
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes <= 0) {
    throw new ConfigurationError(
      "maxResponseBytes must be a positive integer."
    );
  }
  const dependencies = options as OpenRouterGatewayOptions & TestDependencies;
  const fetcher = dependencies.fetch ?? globalThis.fetch;

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
      const requestSignal = createRequestSignal(
        requestOptions?.signal,
        requestOptions?.timeoutMs
      );
      try {
        const response = await fetcher(endpoint, {
          body: JSON.stringify({
            model: request.model,
            ...(options.provider ? { provider: options.provider } : {}),
            questions: request.questions,
            state: request.state,
          }),
          headers: {
            ...requestOptions?.headers,
            ...(httpReferer ? { "HTTP-Referer": httpReferer } : {}),
            ...(appTitle ? { "X-OpenRouter-Title": appTitle } : {}),
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          method: "POST",
          ...(requestSignal.signal ? { signal: requestSignal.signal } : {}),
        });
        if (!response.ok) {
          throw errorForStatus(response.status);
        }
        const body = await readBoundedJson(response, maxResponseBytes);
        const requestId = response.headers.get("x-request-id") ?? undefined;
        return {
          body,
          metadata: {
            gateway: "openrouter",
            latencyMs: performance.now() - startedAt,
            model: request.model,
            ...(requestId ? { requestId } : {}),
          },
        };
      } catch (cause) {
        if (cause instanceof JudgeError) {
          throw cause;
        }
        return mapFetchFailure(
          cause,
          requestOptions?.signal,
          requestSignal.timedOut()
        );
      } finally {
        requestSignal.cleanup();
      }
    },
    id: "openrouter",
    model,
  });
};
