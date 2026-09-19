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

/** Configures the default Jev provider through a caller-supplied gateway. */
export interface GatewayJevOptions {
  /**
   * Direct Jev credentials are forbidden when a gateway is supplied.
   *
   * @remarks Provide {@link gateway} instead.
   */
  readonly apiKey?: never;
  /**
   * Enables advisory context-window estimates before transport.
   *
   * @remarks Estimates never block a request automatically. Provider context
   * errors remain authoritative.
   */
  readonly contextBudget?: ContextBudgetOptions;
  /** The Jev-compatible transport used for evaluations. */
  readonly gateway: GatewayPlugin;
  /**
   * Overrides the gateway's default model for every evaluation.
   *
   * @defaultValue The supplied gateway's model.
   */
  readonly model?: string;
  /** A positive per-evaluation timeout in milliseconds. */
  readonly timeoutMs?: number;
}

/**
 * Selects exactly one Jev transport: a direct API key or a gateway adapter.
 *
 * @remarks Supplying both `apiKey` and `gateway`, or neither, is invalid.
 */
export type CreateJudgeOptions =
  | (DirectJevOptions & {
      /** Enables advisory context-window estimates before direct transport. */
      readonly contextBudget?: ContextBudgetOptions;
      /** Gateway adapters are forbidden when direct credentials are supplied. */
      readonly gateway?: never;
    })
  | GatewayJevOptions;

/**
 * Creates a Jev-backed Judge client.
 *
 * @remarks Provide exactly one of a direct `apiKey` or a Jev-compatible
 * `gateway`. Evaluations may perform remote, potentially billable work.
 * Application callbacks passed to `if()` and `switch()` remain
 * application-owned and their errors propagate unchanged.
 *
 * @param options - Direct Jev credentials or a configured gateway adapter.
 * @returns A reusable, Jev-backed {@link JudgeClient}.
 * @throws {@link ConfigurationError} if the transport selection or another
 * local option is invalid.
 *
 * @example Vercel AI Gateway with an advisory context budget
 * ```ts
 * import { createJudge } from "@brkn-labs/judge";
 * import { vercelGateway } from "@brkn-labs/judge/gateway/vercel";
 *
 * const judge = createJudge({
 *   gateway: vercelGateway({ apiKey: process.env.AI_GATEWAY_API_KEY! }),
 *   contextBudget: {
 *     maxTokens: 32_768,
 *     onWarning: (warning) => telemetry.capture("judge.context", warning),
 *   },
 * });
 * ```
 */
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
