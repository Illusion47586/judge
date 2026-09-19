import {
  AbortError,
  ProviderContractError,
  ProviderError,
} from "../../core/errors.ts";

export const DEFAULT_MAX_RESPONSE_BYTES = 8_388_608;

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const rejectOversized = async (
  reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<never> => {
  await reader.cancel();
  throw new ProviderError("The provider response exceeded the size limit.", {
    code: "response_too_large",
  });
};

export const readBoundedJson = async (
  response: Response,
  maxResponseBytes: number
): Promise<unknown> => {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > maxResponseBytes
  ) {
    throw new ProviderError("The provider response exceeded the size limit.", {
      code: "response_too_large",
    });
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ProviderContractError("The provider returned an empty response.");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  let readResult = await reader.read();
  while (!readResult.done) {
    total += readResult.value.byteLength;
    if (total > maxResponseBytes) {
      return rejectOversized(reader);
    }
    chunks.push(readResult.value);
    // biome-ignore lint/performance/noAwaitInLoops: stream chunks must be consumed sequentially.
    readResult = await reader.read();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (cause) {
    throw new ProviderContractError("The provider returned malformed JSON.", {
      cause,
    });
  }
};

export const errorForStatus = (status: number): ProviderError => {
  let code = "provider_error";
  if (status === 401 || status === 403) {
    code = "authentication";
  } else if (status === 402) {
    code = "quota";
  } else if (status === 422) {
    code = "invalid_request";
  } else if (status === 429) {
    code = "rate_limit";
  } else if (status === 404 || status === 529) {
    code = "model_unavailable";
  }
  return new ProviderError(`The provider request failed with HTTP ${status}.`, {
    code,
  });
};

export const parseRetryAfter = (
  value: string | null,
  now = Date.now()
): number | undefined => {
  if (value === null) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined;
};

export const waitForRetry = (
  delayMs: number,
  signal?: AbortSignal
): Promise<void> => {
  if (signal?.aborted) {
    throw new AbortError("The Judge evaluation was aborted.", {
      cause: signal.reason,
    });
  }
  if (delayMs === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(
          new AbortError("The Judge evaluation was aborted.", {
            cause: signal.reason,
          })
        );
      },
      { once: true }
    );
  });
};

interface RequestSignal {
  cleanup: () => void;
  signal: AbortSignal | undefined;
  timedOut: () => boolean;
}

export const createRequestSignal = (
  callerSignal: AbortSignal | undefined,
  timeoutMs: number | undefined
): RequestSignal => {
  if (timeoutMs === undefined) {
    return {
      cleanup: () => undefined,
      signal: callerSignal,
      timedOut: () => false,
    };
  }
  const timeoutController = new AbortController();
  const timer = setTimeout(
    () => timeoutController.abort(new Error("Judge provider timeout")),
    timeoutMs
  );
  const signal = callerSignal
    ? AbortSignal.any([callerSignal, timeoutController.signal])
    : timeoutController.signal;
  return {
    cleanup: () => clearTimeout(timer),
    signal,
    timedOut: () => timeoutController.signal.aborted && !callerSignal?.aborted,
  };
};

export const mapFetchFailure = (
  cause: unknown,
  callerSignal: AbortSignal | undefined,
  timedOut: boolean
): never => {
  if (callerSignal?.aborted) {
    throw new AbortError("The Judge evaluation was aborted.", { cause });
  }
  if (timedOut) {
    throw new ProviderError("The provider request timed out.", {
      cause,
      code: "timeout",
    });
  }
  throw new ProviderError("The provider request failed.", {
    cause,
    code: "provider_error",
  });
};
