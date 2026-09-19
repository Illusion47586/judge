import {
  AbortError,
  ContextLimitError,
  JudgeError,
  ProviderError,
} from "../core/errors.ts";

const CONTEXT_CODE =
  /^(?:context_length_exceeded|context_window_exceeded|max_context_length_exceeded)$/iu;
const CONTEXT_MESSAGE =
  /(?:context\s+(?:length|window)|token\s+limit).*(?:exceed|maximum|too\s+(?:large|long))/iu;
const CONTEXT_FIELDS = [
  "cause",
  "code",
  "data",
  "error",
  "message",
  "response",
  "responseBody",
  "type",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const errorStatus = (error: unknown): number | undefined => {
  if (!isRecord(error)) {
    return undefined;
  }
  const status = error.status ?? error.statusCode;
  return typeof status === "number" ? status : undefined;
};

export const isContextLimitFailure = (value: unknown): boolean => {
  const seen = new Set<object>();
  const visit = (candidate: unknown, depth: number): boolean => {
    if (typeof candidate === "string") {
      return CONTEXT_CODE.test(candidate) || CONTEXT_MESSAGE.test(candidate);
    }
    if (!isRecord(candidate) || depth > 6 || seen.has(candidate)) {
      return false;
    }
    seen.add(candidate);
    return CONTEXT_FIELDS.some((field) =>
      Object.hasOwn(candidate, field)
        ? visit(candidate[field], depth + 1)
        : false
    );
  };
  return visit(value, 0);
};

export const normalizeGatewayError = (
  cause: unknown,
  signal?: AbortSignal,
  timedOut = false
): never => {
  if (cause instanceof JudgeError) {
    throw cause;
  }
  if (signal?.aborted) {
    throw new AbortError("The Judge evaluation was aborted.", { cause });
  }
  const name =
    isRecord(cause) && typeof cause.name === "string" ? cause.name : "";
  if (timedOut || name.toLowerCase().includes("timeout")) {
    throw new ProviderError("The gateway request timed out.", {
      cause,
      code: "timeout",
    });
  }
  if (isContextLimitFailure(cause)) {
    throw new ContextLimitError(undefined, { cause });
  }
  const status = errorStatus(cause);
  let code = "provider_error";
  if (status === 401 || status === 403) {
    code = "authentication";
  } else if (status === 402) {
    code = "quota";
  } else if (status === 429) {
    code = "rate_limit";
  } else if (status === 404 || status === 529) {
    code = "model_unavailable";
  } else if (status === 400 || status === 413 || status === 422) {
    code = "invalid_request";
  }
  throw new ProviderError("The gateway request failed.", { cause, code });
};
