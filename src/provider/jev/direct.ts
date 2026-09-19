import { ConfigurationError, JudgeError } from "../../core/errors.ts";
import { defineGateway } from "../../gateway/custom.ts";
import type {
  GatewayEvaluationRequest,
  GatewayPlugin,
  GatewayRequestOptions,
} from "../../gateway/types.ts";
import {
  createRequestSignal,
  DEFAULT_MAX_RESPONSE_BYTES,
  errorForResponse,
  type Fetcher,
  mapFetchFailure,
  parseRetryAfter,
  readBoundedJson,
  waitForRetry,
} from "./http.ts";

const DEFAULT_BASE_URL = "https://api.typesafe.ai";
const DEFAULT_MODEL = "jev-latest";
const TRAILING_SLASH = /\/$/u;

/** Configures retries for direct Jev rate and capacity responses. */
export interface RetryOptions {
  /**
   * Delay before the first retry in milliseconds.
   *
   * @defaultValue 250
   */
  readonly initialDelayMs?: number;
  /**
   * Total number of attempts, including the initial request.
   *
   * @remarks Only HTTP `429` and `529` responses are retried. Retrying after a
   * provider processed a request but its response was lost can cause duplicate
   * billable work.
   */
  readonly maxAttempts: number;
  /**
   * Maximum exponential backoff delay in milliseconds.
   *
   * @defaultValue 5000
   */
  readonly maxDelayMs?: number;
}

/** Configures direct requests to the TypeSafe AI Jev API. */
export interface DirectJevOptions {
  /** A non-empty, trimmed TypeSafe AI API key. */
  readonly apiKey: string;
  /**
   * HTTP(S) API origin without credentials, query parameters, or a fragment.
   *
   * @defaultValue `"https://api.typesafe.ai"`
   */
  readonly baseUrl?: string;
  /**
   * Positive maximum response-body size in bytes.
   *
   * @defaultValue 8_388_608
   */
  readonly maxResponseBytes?: number;
  /**
   * Jev model requested for each evaluation.
   *
   * @defaultValue `"jev-latest"`
   */
  readonly model?: string;
  /**
   * Retry policy for HTTP `429` and `529` responses.
   *
   * @remarks Retries are disabled when this property is omitted and may cause
   * duplicate billable work if an earlier response was lost.
   */
  readonly retry?: RetryOptions;
  /** A positive per-evaluation timeout in milliseconds. */
  readonly timeoutMs?: number;
}

const positiveInteger = (value: unknown, name: string): number => {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new ConfigurationError(`${name} must be a positive integer.`);
  }
  return value as number;
};

const nonnegativeNumber = (value: unknown, name: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ConfigurationError(`${name} must be a non-negative number.`);
  }
  return value;
};

const normalizeBaseUrl = (value: string | undefined): string => {
  try {
    const url = new URL(value ?? DEFAULT_BASE_URL);
    if (
      !(url.protocol === "https:" || url.protocol === "http:") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new TypeError("Unsupported URL.");
    }
    return url.toString().replace(TRAILING_SLASH, "");
  } catch (cause) {
    throw new ConfigurationError("baseUrl must be a valid HTTP(S) URL.", {
      cause,
    });
  }
};

const normalizeRetry = (retry: RetryOptions | undefined) => {
  if (retry === undefined) {
    return;
  }
  const maxAttempts = positiveInteger(retry.maxAttempts, "retry.maxAttempts");
  const initialDelayMs = nonnegativeNumber(
    retry.initialDelayMs ?? 250,
    "retry.initialDelayMs"
  );
  const maxDelayMs = nonnegativeNumber(
    retry.maxDelayMs ?? 5000,
    "retry.maxDelayMs"
  );
  return Object.freeze({ initialDelayMs, maxAttempts, maxDelayMs });
};

type NormalizedRetry = NonNullable<ReturnType<typeof normalizeRetry>>;

const retryForStatus = (
  status: number,
  attempt: number,
  retry: NormalizedRetry | undefined
): NormalizedRetry | undefined => {
  if (
    retry &&
    attempt < retry.maxAttempts &&
    (status === 429 || status === 529)
  ) {
    return retry;
  }
  return undefined;
};

const validateOptions = (options: DirectJevOptions) => {
  if (
    typeof options.apiKey !== "string" ||
    options.apiKey.length === 0 ||
    options.apiKey.trim() !== options.apiKey
  ) {
    throw new ConfigurationError("apiKey must be a non-empty, trimmed string.");
  }
  const maxResponseBytes = positiveInteger(
    options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    "maxResponseBytes"
  );
  return {
    apiKey: options.apiKey,
    endpoint: `${normalizeBaseUrl(options.baseUrl)}/v1/systemone`,
    maxResponseBytes,
    model: options.model ?? DEFAULT_MODEL,
    retry: normalizeRetry(options.retry),
  };
};

const successfulResult = (
  response: Response,
  body: unknown,
  model: string,
  startedAt: number
) => {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const resolvedModel = response.headers.get("x-model-id") ?? undefined;
  return {
    body,
    metadata: {
      gateway: "typesafe",
      latencyMs: performance.now() - startedAt,
      model,
      ...(requestId ? { requestId } : {}),
      ...(resolvedModel ? { resolvedModel } : {}),
    },
  };
};

/**
 * Creates the internal gateway used for direct TypeSafe AI Jev requests.
 *
 * @remarks Each evaluation performs remote, potentially billable work. Most
 * consumers should pass {@link DirectJevOptions} to the package-root
 * `createJudge` factory instead of calling this transport helper.
 *
 * @param options - Direct Jev credentials, limits, model, and retry policy.
 * @param fetcher - Fetch implementation used to send requests.
 * @returns A Jev-compatible gateway plugin.
 * @throws {@link ConfigurationError} if a local option is invalid.
 */
export const directJevGateway = (
  options: DirectJevOptions,
  fetcher: Fetcher = globalThis.fetch
): GatewayPlugin => {
  const config = validateOptions(options);

  const performAttempt = async (
    request: GatewayEvaluationRequest,
    requestOptions: GatewayRequestOptions | undefined,
    attempt: number,
    startedAt: number
  ): Promise<Awaited<ReturnType<GatewayPlugin["evaluate"]>>> => {
    const requestSignal = createRequestSignal(
      requestOptions?.signal,
      requestOptions?.timeoutMs
    );
    try {
      const response = await fetcher(config.endpoint, {
        body: JSON.stringify(request),
        headers: {
          ...requestOptions?.headers,
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
        ...(requestSignal.signal ? { signal: requestSignal.signal } : {}),
      });

      const retry = response.ok
        ? undefined
        : retryForStatus(response.status, attempt, config.retry);
      if (retry) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        const exponential = Math.min(
          retry.maxDelayMs,
          retry.initialDelayMs * 2 ** (attempt - 1)
        );
        await response.body?.cancel();
        requestSignal.cleanup();
        await waitForRetry(retryAfter ?? exponential, requestOptions?.signal);
        return performAttempt(request, requestOptions, attempt + 1, startedAt);
      }
      if (!response.ok) {
        throw await errorForResponse(response, config.maxResponseBytes);
      }

      const body = await readBoundedJson(response, config.maxResponseBytes);
      return successfulResult(response, body, request.model, startedAt);
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
  };

  const perform = (
    request: GatewayEvaluationRequest,
    requestOptions?: GatewayRequestOptions
  ) => performAttempt(request, requestOptions, 1, performance.now());

  return defineGateway({
    capabilities: {
      batching: true,
      boolean: true,
      choice: true,
      customHeaders: true,
      jev: true,
      score: true,
    },
    evaluate: perform,
    id: "typesafe",
    model: config.model,
  });
};
