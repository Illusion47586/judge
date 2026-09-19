import { randomUUID } from "node:crypto";

import { ConfigurationError, ProviderContractError } from "./errors.ts";
import type {
  BooleanDecision,
  BooleanOptions,
  BranchMeta,
  ChoiceBranchMeta,
  ChoiceCases,
  ChoiceDecision,
  ChoiceOptions,
  CreateJudgeOptions,
  DecisionProvider,
  JudgeClient,
  JudgeIfOptions,
  JudgeSwitchOptions,
  ScoreDecision,
  ScoreOptions,
} from "./types.ts";
import {
  normalizeChoiceOptions,
  normalizeCondition,
  normalizeQuestion,
  normalizeScoreLevels,
  throwIfAborted,
  validateBooleanDecision,
  validateChoiceDecision,
  validateMinimum,
  validateScoreDecision,
} from "./validate.ts";

const validateProvider = (provider: unknown): DecisionProvider => {
  if (
    typeof provider !== "object" ||
    provider === null ||
    typeof (provider as Partial<DecisionProvider>).boolean !== "function" ||
    typeof (provider as Partial<DecisionProvider>).choice !== "function" ||
    typeof (provider as Partial<DecisionProvider>).score !== "function"
  ) {
    throw new ConfigurationError(
      "A DecisionProvider with Boolean, Choice, and Score methods is required.",
      { code: "invalid_provider" }
    );
  }

  return provider as DecisionProvider;
};

const evaluateBoolean = async <S>(
  provider: DecisionProvider,
  options: BooleanOptions<S>
): Promise<BooleanDecision> => {
  const condition = normalizeCondition(options.condition);
  throwIfAborted(options.signal);

  const decision = await provider.boolean({
    condition,
    context: options.context,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  throwIfAborted(options.signal);
  return validateBooleanDecision(decision);
};

const evaluateChoice = async <
  S,
  const O extends readonly [string, ...string[]],
>(
  provider: DecisionProvider,
  options: ChoiceOptions<S, O>
): Promise<ChoiceDecision<O[number]>> => {
  const question = normalizeQuestion(options.question);
  const legalOptions = normalizeChoiceOptions(options.options);
  throwIfAborted(options.signal);

  const decision = await provider.choice({
    context: options.context,
    options: legalOptions,
    question,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  throwIfAborted(options.signal);
  return validateChoiceDecision(decision, legalOptions);
};

const evaluateScore = async <
  S,
  const L extends readonly [string, string, ...string[]],
>(
  provider: DecisionProvider,
  options: ScoreOptions<S, L>
): Promise<ScoreDecision<L[number]>> => {
  const question = normalizeQuestion(options.question);
  const levels = normalizeScoreLevels(options.levels);
  throwIfAborted(options.signal);

  const decision = await provider.score({
    context: options.context,
    levels,
    question,
    ...(options.signal ? { signal: options.signal } : {}),
  });

  throwIfAborted(options.signal);
  return validateScoreDecision(decision, levels);
};

interface SwitchSnapshot<K extends string> {
  callbacks: ReadonlyMap<string, unknown>;
  options: readonly [K, ...K[]];
}

const snapshotSwitchCases = <
  K extends string,
  C extends Record<K, (...args: never[]) => unknown>,
>(
  cases: ChoiceCases<K, C>
): SwitchSnapshot<K> => {
  if (typeof cases !== "object" || cases === null || Array.isArray(cases)) {
    throw new ConfigurationError("Switch cases must be an object.", {
      code: "invalid_switch_cases",
    });
  }

  const entries = Object.entries(cases);
  if (entries.length === 0) {
    throw new ConfigurationError("Switch cases must not be empty.", {
      code: "invalid_switch_cases",
    });
  }

  for (const [key, callback] of entries) {
    if (
      key.length === 0 ||
      key !== key.trim() ||
      typeof callback !== "function"
    ) {
      throw new ConfigurationError(
        "Switch cases require trimmed, non-empty keys and function values.",
        { code: "invalid_switch_cases" }
      );
    }
  }

  return {
    callbacks: new Map(entries),
    options: entries.map(([key]) => key) as unknown as readonly [K, ...K[]],
  };
};

export const createJudge = (options: CreateJudgeOptions): JudgeClient => {
  const provider = validateProvider(options.provider);

  return {
    boolean: <S>(booleanOptions: BooleanOptions<S>): Promise<BooleanDecision> =>
      evaluateBoolean(provider, booleanOptions),

    choice: <S, const O extends readonly [string, ...string[]]>(
      choiceOptions: ChoiceOptions<S, O>
    ): Promise<ChoiceDecision<O[number]>> =>
      evaluateChoice(provider, choiceOptions),

    if: async <S, T, E, U = never>(
      ifOptions: JudgeIfOptions<S, T, E, U>
    ): Promise<Awaited<T> | Awaited<E> | Awaited<U>> => {
      if (ifOptions.confidence) {
        validateMinimum(ifOptions.confidence.minimum);
      }

      const invocationId = randomUUID();
      const decision = await evaluateBoolean(provider, ifOptions);

      if (
        ifOptions.confidence &&
        decision.confidence < ifOptions.confidence.minimum
      ) {
        throwIfAborted(ifOptions.signal);
        return (await ifOptions.confidence.uncertain({
          decision,
          invocationId,
          minimum: ifOptions.confidence.minimum,
        })) as Awaited<U>;
      }

      throwIfAborted(ifOptions.signal);
      if (decision.value) {
        const meta: BranchMeta<true> = {
          decision: decision as BooleanDecision & { value: true },
          invocationId,
        };
        return (await ifOptions.then(meta)) as Awaited<T>;
      }

      const meta: BranchMeta<false> = {
        decision: decision as BooleanDecision & { value: false },
        invocationId,
      };
      return (await ifOptions.else(meta)) as Awaited<E>;
    },

    score: <S, const L extends readonly [string, string, ...string[]]>(
      scoreOptions: ScoreOptions<S, L>
    ): Promise<ScoreDecision<L[number]>> =>
      evaluateScore(provider, scoreOptions),

    switch: async <
      S,
      const K extends string,
      const C extends Record<K, (...args: never[]) => unknown>,
      U = never,
    >(
      switchOptions: JudgeSwitchOptions<S, K, C, U>
    ): Promise<Awaited<ReturnType<C[K]>> | Awaited<U>> => {
      if (switchOptions.confidence) {
        validateMinimum(switchOptions.confidence.minimum);
      }

      const snapshot = snapshotSwitchCases(switchOptions.cases);
      const invocationId = randomUUID();
      const decision = await evaluateChoice(provider, {
        context: switchOptions.context,
        options: snapshot.options,
        question: switchOptions.question,
        ...(switchOptions.signal ? { signal: switchOptions.signal } : {}),
      });

      if (
        switchOptions.confidence &&
        decision.confidence < switchOptions.confidence.minimum
      ) {
        throwIfAborted(switchOptions.signal);
        return (await switchOptions.confidence.uncertain({
          decision,
          invocationId,
          minimum: switchOptions.confidence.minimum,
        })) as Awaited<U>;
      }

      throwIfAborted(switchOptions.signal);
      const callback = snapshot.callbacks.get(decision.value);
      if (typeof callback !== "function") {
        throw new ProviderContractError(
          "The provider selected an impossible Switch case."
        );
      }

      const selected = callback as (
        meta: ChoiceBranchMeta<typeof decision.value, K>
      ) => ReturnType<C[K]>;
      return (await selected({
        decision: decision as ChoiceDecision<K> & {
          value: typeof decision.value;
        },
        invocationId,
      })) as Awaited<ReturnType<C[K]>>;
    },
  };
};
