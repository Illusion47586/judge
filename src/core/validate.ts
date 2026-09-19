import {
  AbortError,
  ConfigurationError,
  ProviderContractError,
} from "./errors.ts";
import type {
  BooleanDecision,
  ChoiceDecision,
  ScoreDecision,
} from "./types.ts";

const DISTRIBUTION_TOLERANCE = 1e-6;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isUnitInterval = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

export const normalizeCondition = (condition: string): string => {
  if (typeof condition !== "string") {
    throw new ConfigurationError("Boolean conditions must be strings.", {
      code: "invalid_condition",
    });
  }

  const normalized = condition.trim();
  if (normalized.length === 0) {
    throw new ConfigurationError("Boolean conditions must not be empty.", {
      code: "invalid_condition",
    });
  }

  return normalized;
};

export const normalizeQuestion = (question: string): string => {
  if (typeof question !== "string") {
    throw new ConfigurationError("Choice questions must be strings.", {
      code: "invalid_question",
    });
  }

  const normalized = question.trim();
  if (normalized.length === 0) {
    throw new ConfigurationError("Choice questions must not be empty.", {
      code: "invalid_question",
    });
  }

  return normalized;
};

export const normalizeChoiceOptions = <
  const O extends readonly [string, ...string[]],
>(
  options: O
): O => {
  if (!Array.isArray(options) || options.length === 0) {
    throw new ConfigurationError(
      "Choice options must contain at least one value.",
      { code: "invalid_choice_options" }
    );
  }

  const seen = new Set<string>();
  for (const option of options) {
    if (
      typeof option !== "string" ||
      option.length === 0 ||
      option !== option.trim() ||
      seen.has(option)
    ) {
      throw new ConfigurationError(
        "Choice options must be unique, non-empty, trimmed strings.",
        { code: "invalid_choice_options" }
      );
    }
    seen.add(option);
  }

  return options;
};

export const normalizeScoreLevels = <
  const L extends readonly [string, string, ...string[]],
>(
  levels: L
): L => {
  if (!Array.isArray(levels) || levels.length < 2) {
    throw new ConfigurationError(
      "Score levels must contain at least two values.",
      { code: "invalid_score_levels" }
    );
  }

  const seen = new Set<string>();
  for (const level of levels) {
    if (
      typeof level !== "string" ||
      level.length === 0 ||
      level !== level.trim() ||
      seen.has(level)
    ) {
      throw new ConfigurationError(
        "Score levels must be unique, non-empty, trimmed strings.",
        { code: "invalid_score_levels" }
      );
    }
    seen.add(level);
  }

  return levels;
};

export const validateMinimum = (minimum: number): void => {
  if (!isUnitInterval(minimum)) {
    throw new ConfigurationError(
      "Confidence minimum must be a finite number between 0 and 1.",
      { code: "invalid_confidence_minimum" }
    );
  }
};

export const validateBooleanDecision = (value: unknown): BooleanDecision => {
  if (!isRecord(value)) {
    throw new ProviderContractError(
      "The provider returned a non-object decision."
    );
  }

  if (value.kind !== "boolean") {
    throw new ProviderContractError(
      "The provider returned a non-Boolean decision."
    );
  }

  if (typeof value.value !== "boolean") {
    throw new ProviderContractError(
      "The provider returned an invalid Boolean value."
    );
  }

  if (!isUnitInterval(value.probabilityTrue)) {
    throw new ProviderContractError(
      "The provider returned an invalid true probability."
    );
  }

  if (!isUnitInterval(value.confidence)) {
    throw new ProviderContractError(
      "The provider returned invalid confidence."
    );
  }

  return value as unknown as BooleanDecision;
};

export const validateChoiceDecision = <
  const O extends readonly [string, ...string[]],
>(
  value: unknown,
  options: O
): ChoiceDecision<O[number]> => {
  if (!isRecord(value) || Array.isArray(value)) {
    throw new ProviderContractError(
      "The provider returned a non-object decision."
    );
  }

  if (value.kind !== "choice") {
    throw new ProviderContractError(
      "The provider returned a non-Choice decision."
    );
  }

  if (typeof value.value !== "string" || !options.includes(value.value)) {
    throw new ProviderContractError(
      "The provider selected an impossible Choice value."
    );
  }

  if (!isRecord(value.probabilities) || Array.isArray(value.probabilities)) {
    throw new ProviderContractError(
      "The provider returned invalid Choice probabilities."
    );
  }

  const probabilityKeys = Object.keys(value.probabilities);
  if (
    probabilityKeys.length !== options.length ||
    probabilityKeys.some((key) => !options.includes(key))
  ) {
    throw new ProviderContractError(
      "The provider returned probabilities for the wrong Choice options."
    );
  }

  let sum = 0;
  for (const option of options) {
    const probability = value.probabilities[option];
    if (!isUnitInterval(probability)) {
      throw new ProviderContractError(
        "The provider returned an invalid Choice probability."
      );
    }
    sum += probability;
  }

  if (Math.abs(sum - 1) > DISTRIBUTION_TOLERANCE) {
    throw new ProviderContractError(
      "The provider returned Choice probabilities that do not sum to one."
    );
  }

  if (!isUnitInterval(value.confidence)) {
    throw new ProviderContractError(
      "The provider returned invalid confidence."
    );
  }

  return value as unknown as ChoiceDecision<O[number]>;
};

export const validateScoreDecision = <
  const L extends readonly [string, string, ...string[]],
>(
  value: unknown,
  levels: L
): ScoreDecision<L[number]> => {
  if (!isRecord(value) || Array.isArray(value) || value.kind !== "score") {
    throw new ProviderContractError(
      "The provider returned a non-Score decision."
    );
  }

  if (
    !Array.isArray(value.levels) ||
    value.levels.length !== levels.length ||
    value.levels.some((level, index) => level !== levels[index])
  ) {
    throw new ProviderContractError(
      "The provider returned the wrong ordered Score levels."
    );
  }

  if (
    !Array.isArray(value.probabilities) ||
    value.probabilities.length !== levels.length
  ) {
    throw new ProviderContractError(
      "The provider returned misaligned Score probabilities."
    );
  }

  let sum = 0;
  let weightedScore = 0;
  for (const [index, probability] of value.probabilities.entries()) {
    if (!isUnitInterval(probability)) {
      throw new ProviderContractError(
        "The provider returned an invalid Score probability."
      );
    }
    sum += probability;
    weightedScore += probability * index;
  }

  if (Math.abs(sum - 1) > DISTRIBUTION_TOLERANCE) {
    throw new ProviderContractError(
      "The provider returned Score probabilities that do not sum to one."
    );
  }

  if (!isUnitInterval(value.confidence)) {
    throw new ProviderContractError(
      "The provider returned invalid confidence."
    );
  }

  if (
    typeof value.score !== "number" ||
    !Number.isFinite(value.score) ||
    value.score < 0 ||
    value.score > levels.length - 1
  ) {
    throw new ProviderContractError(
      "The provider returned an invalid Score value."
    );
  }

  if (Math.abs(value.score - weightedScore) > DISTRIBUTION_TOLERANCE) {
    throw new ProviderContractError(
      "The provider returned a Score value inconsistent with its probabilities."
    );
  }

  return value as unknown as ScoreDecision<L[number]>;
};

export const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new AbortError("The Judge evaluation was aborted.", {
      cause: signal.reason,
    });
  }
};
