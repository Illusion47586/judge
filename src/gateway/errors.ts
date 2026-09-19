import { AbortError, JudgeError, ProviderError } from "../core/errors.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const errorStatus = (error: unknown): number | undefined => {
  if (!isRecord(error)) {
    return undefined;
  }
  const status = error.status ?? error.statusCode;
  return typeof status === "number" ? status : undefined;
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
  } else if (status === 400 || status === 422) {
    code = "invalid_request";
  }
  throw new ProviderError("The gateway request failed.", { cause, code });
};
