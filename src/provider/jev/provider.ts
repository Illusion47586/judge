import {
  AbortError,
  ConfigurationError,
  JudgeError,
  ProviderError,
} from "../../core/errors.ts";
import type {
  BooleanInput,
  ChoiceInput,
  DecisionProvider,
  ScoreInput,
} from "../../core/types.ts";
import type {
  GatewayEvaluationRequest,
  GatewayEvaluationResult,
  GatewayPlugin,
  GatewayRequestOptions,
} from "../../gateway/types.ts";
import {
  normalizeContextBudget,
  warnForContextBudget,
} from "./context-budget.ts";
import {
  normalizeBooleanAnswer,
  normalizeChoiceAnswer,
  normalizeScoreAnswer,
} from "./normalize.ts";
import { serializeState } from "./serialize.ts";
import type {
  CreateJevProviderOptions,
  NormalizedContextBudget,
} from "./types.ts";

const requireIdentifier = (value: unknown, name: string): string => {
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

const requireCapability = (
  gateway: GatewayPlugin,
  capability: "boolean" | "choice" | "score"
): void => {
  if (!(gateway.capabilities.jev && gateway.capabilities[capability])) {
    throw new ConfigurationError(
      `Gateway "${gateway.id}" does not support Jev ${capability} evaluation.`,
      { code: "unsupported_gateway_capability" }
    );
  }
};

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new AbortError("The Judge evaluation was aborted.", {
      cause: signal.reason,
    });
  }
};

const evaluate = async (
  gateway: GatewayPlugin,
  request: GatewayEvaluationRequest,
  options: GatewayRequestOptions | undefined,
  contextBudget: NormalizedContextBudget | undefined
): Promise<GatewayEvaluationResult> => {
  throwIfAborted(options?.signal);
  await warnForContextBudget(request, contextBudget);
  throwIfAborted(options?.signal);
  try {
    return await gateway.evaluate(request, options);
  } catch (cause) {
    if (cause instanceof JudgeError) {
      throw cause;
    }
    if (options?.signal?.aborted) {
      throw new AbortError("The Judge evaluation was aborted.", {
        cause,
      });
    }
    throw new ProviderError("The Jev gateway evaluation failed.", {
      cause,
      code: "gateway_error",
    });
  }
};

const requestOptions = (
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined
): GatewayRequestOptions | undefined => {
  if (!(signal || timeoutMs !== undefined)) {
    return undefined;
  }
  return {
    ...(signal ? { signal } : {}),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
};

export const createJevProvider = (
  options: CreateJevProviderOptions
): DecisionProvider => {
  const { gateway, timeoutMs } = options;
  const candidate: unknown = gateway;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    typeof (candidate as Record<string, unknown>).evaluate !== "function" ||
    typeof (candidate as Record<string, unknown>).capabilities !== "object" ||
    (candidate as Record<string, unknown>).capabilities === null
  ) {
    throw new ConfigurationError("A valid Jev gateway is required.");
  }
  const gatewayId = requireIdentifier(gateway.id, "Gateway id");
  const model = requireIdentifier(options.model ?? gateway.model, "Jev model");
  const contextBudget = normalizeContextBudget(options.contextBudget);
  if (
    timeoutMs !== undefined &&
    (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
  ) {
    throw new ConfigurationError("Jev timeoutMs must be a positive number.");
  }
  const normalizationContext = { gateway: gatewayId, model };

  return {
    boolean: async <S>(input: BooleanInput<S>) => {
      requireCapability(gateway, "boolean");
      const state = serializeState(input.context);
      const request: GatewayEvaluationRequest = {
        model,
        questions: {
          decision: { instructions: input.condition, type: "noul" },
        },
        state,
      };
      const result = await evaluate(
        gateway,
        request,
        requestOptions(input.signal, timeoutMs),
        contextBudget
      );
      return normalizeBooleanAnswer(result, normalizationContext);
    },

    choice: async <S, const O extends readonly [string, ...string[]]>(
      input: ChoiceInput<S, O>
    ) => {
      requireCapability(gateway, "choice");
      const state = serializeState(input.context);
      const request: GatewayEvaluationRequest = {
        model,
        questions: {
          decision: {
            criteria: Object.fromEntries(
              input.options.map((option) => [option, option])
            ),
            instructions: input.question,
            type: "choice",
          },
        },
        state,
      };
      const result = await evaluate(
        gateway,
        request,
        requestOptions(input.signal, timeoutMs),
        contextBudget
      );
      return normalizeChoiceAnswer(result, input.options, normalizationContext);
    },

    score: async <S, const L extends readonly [string, string, ...string[]]>(
      input: ScoreInput<S, L>
    ) => {
      requireCapability(gateway, "score");
      const state = serializeState(input.context);
      const levels = [...input.levels] as unknown as L;
      const request: GatewayEvaluationRequest = {
        model,
        questions: {
          decision: {
            criteria: levels,
            instructions: input.question,
            type: "score",
          },
        },
        state,
      };
      const result = await evaluate(
        gateway,
        request,
        requestOptions(input.signal, timeoutMs),
        contextBudget
      );
      return normalizeScoreAnswer(result, levels, normalizationContext);
    },
  };
};

export type { CreateJevProviderOptions } from "./types.ts";
