import { createJudge as createCoreJudge } from "./core/client.ts";
import { ConfigurationError } from "./core/errors.ts";
import type { JudgeClient } from "./core/types.ts";
import type { GatewayPlugin } from "./gateway/types.ts";
import {
  type DirectJevOptions,
  directJevGateway,
} from "./provider/jev/direct.ts";
import { createJevProvider } from "./provider/jev/provider.ts";
import type { ContextBudgetOptions } from "./provider/jev/types.ts";

export interface GatewayJevOptions {
  readonly apiKey?: never;
  readonly contextBudget?: ContextBudgetOptions;
  readonly gateway: GatewayPlugin;
  readonly model?: string;
  readonly timeoutMs?: number;
}

export type CreateJudgeOptions =
  | (DirectJevOptions & {
      readonly contextBudget?: ContextBudgetOptions;
      readonly gateway?: never;
    })
  | GatewayJevOptions;

export const createJudge = (options: CreateJudgeOptions): JudgeClient => {
  const candidate: unknown = options;
  if (typeof candidate !== "object" || candidate === null) {
    throw new ConfigurationError("Judge configuration must be an object.");
  }
  const record = candidate as Record<string, unknown>;
  const hasApiKey =
    Object.hasOwn(record, "apiKey") && record.apiKey !== undefined;
  const hasGateway =
    Object.hasOwn(record, "gateway") && record.gateway !== undefined;
  if (hasApiKey === hasGateway) {
    throw new ConfigurationError(
      "Provide exactly one of apiKey or gateway to create Judge."
    );
  }

  const gateway = hasGateway
    ? (record.gateway as GatewayPlugin)
    : directJevGateway(options as DirectJevOptions);
  return createCoreJudge({
    provider: createJevProvider({
      gateway,
      ...(options.contextBudget === undefined
        ? {}
        : { contextBudget: options.contextBudget }),
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.timeoutMs }),
    }),
  });
};

export {
  AbortError,
  ConfigurationError,
  ContextLimitError,
  JudgeError,
  ProviderContractError,
  ProviderError,
  SerializationError,
} from "./core/errors.ts";
export type {
  BooleanDecision,
  BooleanOptions,
  BranchMeta,
  ChoiceBranchMeta,
  ChoiceDecision,
  ChoiceOptions,
  ConfidencePolicy,
  JudgeClient,
  JudgeIfOptions,
  JudgeSwitchOptions,
  ProviderMetadata,
  ScoreDecision,
  ScoreOptions,
  UncertainMeta,
} from "./core/types.ts";
export type { DirectJevOptions, RetryOptions } from "./provider/jev/direct.ts";
export type {
  ContextBudgetOptions,
  ContextBudgetWarning,
} from "./provider/jev/types.ts";
