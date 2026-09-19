import type { GatewayPlugin } from "../../gateway/types.ts";

export interface ContextBudgetWarning {
  readonly code: "context_window_approaching";
  readonly estimatedTokens: number;
  readonly maxTokens: number;
  readonly model: string;
  readonly ratio: number;
  readonly warnAt: number;
}

export interface ContextBudgetOptions {
  readonly maxTokens: number;
  readonly onWarning: (
    warning: Readonly<ContextBudgetWarning>
  ) => void | Promise<void>;
  readonly warnAt?: number;
}

export interface NormalizedContextBudget {
  readonly maxTokens: number;
  readonly onWarning: ContextBudgetOptions["onWarning"];
  readonly warnAt: number;
}

export interface CreateJevProviderOptions {
  readonly contextBudget?: ContextBudgetOptions;
  readonly gateway: GatewayPlugin;
  readonly model?: string;
  readonly timeoutMs?: number;
}
