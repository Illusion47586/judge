import { ProviderContractError } from "../../core/errors.ts";
import type {
  BooleanDecision,
  ChoiceDecision,
  ProviderMetadata,
  ScoreDecision,
} from "../../core/types.ts";
import {
  validateBooleanDecision,
  validateChoiceDecision,
  validateScoreDecision,
} from "../../core/validate.ts";
import type {
  GatewayEvaluationResult,
  GatewayMetadata,
} from "../../gateway/types.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fail = (message: string): never => {
  throw new ProviderContractError(message);
};

const requireUnitInterval = (value: unknown, name: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    return fail(`Jev returned an invalid ${name}.`);
  }
  return value;
};

const requireIdentifier = (value: unknown, name: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    return fail(`Jev returned invalid ${name} metadata.`);
  }
  return value;
};

const optionalNonnegativeNumber = (
  value: unknown,
  name: string
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fail(`Jev returned invalid ${name} metadata.`);
  }
  return value;
};

const optionalTokenCount = (
  value: unknown,
  name: string
): number | undefined => {
  const count = optionalNonnegativeNumber(value, name);
  if (count !== undefined && !Number.isInteger(count)) {
    return fail(`Jev returned invalid ${name} metadata.`);
  }
  return count;
};

const normalizeUsage = (
  value: unknown
): ProviderMetadata["usage"] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return fail("Jev returned invalid usage metadata.");
  }
  const inputTokens = optionalTokenCount(value.inputTokens, "input token");
  const outputTokens = optionalTokenCount(value.outputTokens, "output token");
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
  };
};

const normalizeMetadata = (
  value: GatewayMetadata | undefined,
  gateway: string,
  model: string
): ProviderMetadata | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    return fail("Jev returned invalid provider metadata.");
  }

  requireIdentifier(value.gateway, "gateway");
  requireIdentifier(value.model, "model");
  const latencyMs = optionalNonnegativeNumber(value.latencyMs, "latency");
  const requestId =
    value.requestId === undefined
      ? undefined
      : requireIdentifier(value.requestId, "request ID");
  const resolvedModel =
    value.resolvedModel === undefined
      ? undefined
      : requireIdentifier(value.resolvedModel, "resolved model");
  const usage = normalizeUsage(value.usage);

  return {
    gateway,
    ...(latencyMs === undefined ? {} : { latencyMs }),
    model,
    provider: "jev",
    ...(Object.hasOwn(value, "raw") ? { raw: value.raw } : {}),
    ...(requestId === undefined ? {} : { requestId }),
    ...(resolvedModel === undefined ? {} : { resolvedModel }),
    ...(usage === undefined ? {} : { usage }),
  };
};

const extractAnswer = (result: GatewayEvaluationResult): unknown => {
  if (!isRecord(result)) {
    return fail("The gateway returned an invalid Jev result.");
  }
  if (!(isRecord(result.body) && isRecord(result.body.answers))) {
    return fail("Jev returned an invalid answers envelope.");
  }
  if (
    Object.keys(result.body.answers).length !== 1 ||
    !Object.hasOwn(result.body.answers, "decision")
  ) {
    return fail("Jev did not return the exact requested answer.");
  }
  return result.body.answers.decision;
};

interface NormalizeContext {
  gateway: string;
  model: string;
}

export const normalizeBooleanAnswer = (
  result: GatewayEvaluationResult,
  context: NormalizeContext
): BooleanDecision => {
  const raw = extractAnswer(result);
  if (!isRecord(raw) || raw.type !== "noul") {
    return fail("Jev returned the wrong Boolean answer kind.");
  }
  const probabilityTrue = requireUnitInterval(raw.noul, "Noul probability");
  const metadata = normalizeMetadata(
    result.metadata,
    context.gateway,
    context.model
  );

  return validateBooleanDecision({
    confidence: Math.max(probabilityTrue, 1 - probabilityTrue),
    kind: "boolean",
    ...(metadata === undefined ? {} : { metadata }),
    probabilityTrue,
    raw,
    value: probabilityTrue >= 0.5,
  });
};

export const normalizeChoiceAnswer = <
  const O extends readonly [string, ...string[]],
>(
  result: GatewayEvaluationResult,
  options: O,
  context: NormalizeContext
): ChoiceDecision<O[number]> => {
  const raw = extractAnswer(result);
  if (!isRecord(raw) || raw.type !== "choice") {
    return fail("Jev returned the wrong Choice answer kind.");
  }
  const metadata = normalizeMetadata(
    result.metadata,
    context.gateway,
    context.model
  );
  return validateChoiceDecision(
    {
      confidence: raw.confidence,
      kind: "choice",
      ...(metadata === undefined ? {} : { metadata }),
      probabilities: raw.probabilities,
      raw,
      value: raw.choice,
    },
    options
  );
};

export const normalizeScoreAnswer = <
  const L extends readonly [string, string, ...string[]],
>(
  result: GatewayEvaluationResult,
  levels: L,
  context: NormalizeContext
): ScoreDecision<L[number]> => {
  const raw = extractAnswer(result);
  if (!isRecord(raw) || raw.type !== "score") {
    return fail("Jev returned the wrong Score answer kind.");
  }
  if (!(isRecord(raw.legend) && isRecord(raw.probabilities))) {
    return fail("Jev returned an invalid Score legend or probabilities.");
  }
  const { legend, probabilities: probabilityRecord } = raw;
  const expectedKeys = levels.map((_, index) => String(index));
  const hasExactKeys = (record: Record<string, unknown>): boolean => {
    const keys = Object.keys(record);
    return (
      keys.length === expectedKeys.length &&
      expectedKeys.every((key) => Object.hasOwn(record, key))
    );
  };
  if (!(hasExactKeys(legend) && hasExactKeys(probabilityRecord))) {
    return fail("Jev returned misaligned Score data.");
  }
  const returnedLevels = expectedKeys.map((key) => legend[key]);
  if (returnedLevels.some((level, index) => level !== levels[index])) {
    return fail("Jev returned the wrong Score legend.");
  }
  const probabilities = expectedKeys.map((key) => probabilityRecord[key]);
  const metadata = normalizeMetadata(
    result.metadata,
    context.gateway,
    context.model
  );

  return validateScoreDecision(
    {
      confidence: raw.confidence,
      kind: "score",
      levels: [...levels],
      ...(metadata === undefined ? {} : { metadata }),
      probabilities,
      raw,
      score: raw.score,
    },
    levels
  );
};
