import { ConfigurationError } from "../../core/errors.ts";
import type { GatewayEvaluationRequest } from "../../gateway/types.ts";
import type {
  ContextBudgetOptions,
  ContextBudgetWarning,
  NormalizedContextBudget,
} from "./types.ts";

export const estimateRequestTokens = (
  request: GatewayEvaluationRequest
): number =>
  Math.ceil(new TextEncoder().encode(JSON.stringify(request)).byteLength / 4);

export const normalizeContextBudget = (
  value: ContextBudgetOptions | undefined
): NormalizedContextBudget | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value.maxTokens) || value.maxTokens <= 0) {
    throw new ConfigurationError(
      "contextBudget.maxTokens must be a positive integer."
    );
  }
  const warnAt = value.warnAt ?? 0.8;
  if (!Number.isFinite(warnAt) || warnAt <= 0 || warnAt > 1) {
    throw new ConfigurationError(
      "contextBudget.warnAt must be greater than zero and at most one."
    );
  }
  if (typeof value.onWarning !== "function") {
    throw new ConfigurationError("contextBudget.onWarning must be a function.");
  }
  return Object.freeze({
    maxTokens: value.maxTokens,
    onWarning: value.onWarning,
    warnAt,
  });
};

export const warnForContextBudget = async (
  request: GatewayEvaluationRequest,
  budget: NormalizedContextBudget | undefined
): Promise<void> => {
  if (!budget) {
    return;
  }
  const estimatedTokens = estimateRequestTokens(request);
  const ratio = estimatedTokens / budget.maxTokens;
  if (ratio < budget.warnAt) {
    return;
  }
  const warning: ContextBudgetWarning = Object.freeze({
    code: "context_window_approaching",
    estimatedTokens,
    maxTokens: budget.maxTokens,
    model: request.model,
    ratio,
    warnAt: budget.warnAt,
  });
  await budget.onWarning(warning);
};
