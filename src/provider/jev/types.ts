import type { GatewayPlugin } from "../../gateway/types.ts";

/** Describes an advisory warning that a request is nearing its context budget. */
export interface ContextBudgetWarning {
  /** Stable discriminator for context-budget warnings. */
  readonly code: "context_window_approaching";
  /**
   * Approximate token count for the complete serialized Jev request.
   *
   * @remarks This heuristic is not an authoritative provider token count.
   */
  readonly estimatedTokens: number;
  /** Positive caller-configured context maximum in tokens. */
  readonly maxTokens: number;
  /** Requested model associated with the serialized request. */
  readonly model: string;
  /** The approximate usage ratio, `estimatedTokens / maxTokens`. */
  readonly ratio: number;
  /** Effective warning threshold as a ratio greater than zero and at most one. */
  readonly warnAt: number;
}

/** Configures advisory preflight warnings for estimated context usage. */
export interface ContextBudgetOptions {
  /**
   * Positive context-window maximum in tokens.
   *
   * @remarks Supply the current limit for the selected model; Judge does not
   * assume a permanent provider limit.
   */
  readonly maxTokens: number;
  /**
   * Receives a warning before transport when the estimate reaches `warnAt`.
   *
   * @remarks Judge awaits this callback before sending the request. If it
   * throws or rejects, the error propagates unchanged and transport does not
   * begin. The estimate remains advisory and never blocks automatically.
   */
  readonly onWarning: (
    warning: Readonly<ContextBudgetWarning>
  ) => void | Promise<void>;
  /**
   * Ratio at which `onWarning` runs, greater than zero and at most one.
   *
   * @defaultValue 0.8
   */
  readonly warnAt?: number;
}

/** Internal normalized form of {@link ContextBudgetOptions}. */
export interface NormalizedContextBudget {
  /** Validated positive context maximum in tokens. */
  readonly maxTokens: number;
  /** Validated warning callback. */
  readonly onWarning: ContextBudgetOptions["onWarning"];
  /** Validated effective warning ratio. */
  readonly warnAt: number;
}

/** Internal configuration for constructing the Jev decision provider. */
export interface CreateJevProviderOptions {
  /** Optional advisory context-budget policy. */
  readonly contextBudget?: ContextBudgetOptions;
  /** Jev-compatible gateway used to transport serialized evaluations. */
  readonly gateway: GatewayPlugin;
  /** Optional requested model override. */
  readonly model?: string;
  /** Optional positive request timeout in milliseconds. */
  readonly timeoutMs?: number;
}
