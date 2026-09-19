/** Describes a Boolean judgment requested directly from a decision provider. */
export interface BooleanInput<S> {
  /** A trimmed, non-empty semantic condition for the provider to evaluate. */
  condition: string;
  /** Optional evaluation context; Jev providers require JSON-compatible data. */
  context?: S | undefined;
  /** Cancels provider work and rejects the evaluation when aborted. */
  signal?: AbortSignal;
}

/** Describes a closed-set judgment requested directly from a decision provider. */
export interface ChoiceInput<S, O extends readonly [string, ...string[]]> {
  /** Optional evaluation context; Jev providers require JSON-compatible data. */
  context?: S | undefined;
  /** A non-empty literal tuple of unique, trimmed, non-empty legal values. */
  options: O;
  /** A trimmed, non-empty semantic question for the provider to answer. */
  question: string;
  /** Cancels provider work and rejects the evaluation when aborted. */
  signal?: AbortSignal;
}

/** Describes an ordered-scale judgment requested directly from a provider. */
export interface ScoreInput<
  S,
  L extends readonly [string, string, ...string[]],
> {
  /** Optional evaluation context; Jev providers require JSON-compatible data. */
  context?: S | undefined;
  /**
   * At least two unique, trimmed labels ordered from lowest to highest. Score
   * `0` maps to the first label and `levels.length - 1` maps to the last.
   */
  levels: L;
  /** A trimmed, non-empty semantic question for the provider to answer. */
  question: string;
  /** Cancels provider work and rejects the evaluation when aborted. */
  signal?: AbortSignal;
}

/** Identifies the provider and diagnostics associated with a decision. */
export interface ProviderMetadata {
  /** The gateway adapter ID, when a gateway handled the request. */
  gateway?: string;
  /** End-to-end provider latency in milliseconds, when reported. */
  latencyMs?: number;
  /** The model requested by Judge. */
  model: string;
  /** The fixed provider discriminator for Jev-compatible decisions. */
  provider: "jev";
  /**
   * Provider-specific diagnostic data.
   * @remarks Provider-specific diagnostic data. Its shape is not a stable Judge API.
   */
  raw?: unknown;
  /** The provider or gateway request identifier, when reported. */
  requestId?: string;
  /** The concrete model selected upstream, when reported. */
  resolvedModel?: string;
  /** Token usage reported by the upstream provider. */
  usage?: {
    /** The number of input tokens reported by the provider. */
    inputTokens?: number;
    /** The number of output tokens reported by the provider. */
    outputTokens?: number;
  };
}

/** A validated Boolean decision returned by Judge. */
export interface BooleanDecision {
  /** Provider confidence as an inclusive value from `0` to `1`. */
  confidence: number;
  /** The stable discriminator for Boolean decisions. */
  kind: "boolean";
  /** Provider identity, model, usage, and diagnostics, when available. */
  metadata?: ProviderMetadata;
  /** The probability the condition is true, inclusive from `0` to `1`. */
  probabilityTrue: number;
  /**
   * The unmodified provider result, when retained.
   * @remarks Provider-specific diagnostic data. Its shape is not a stable Judge API.
   */
  raw?: unknown;
  /** The Boolean value selected by the provider. */
  value: boolean;
}

/** A validated closed-set decision whose legal values come from the request. */
export interface ChoiceDecision<K extends string> {
  /** Provider confidence as an inclusive value from `0` to `1`. */
  confidence: number;
  /** The stable discriminator for Choice decisions. */
  kind: "choice";
  /** Provider identity, model, usage, and diagnostics, when available. */
  metadata?: ProviderMetadata;
  /** Values from `0` to `1`, keyed by the exact option union and summing to `1`. */
  probabilities: Record<K, number>;
  /**
   * The unmodified provider result, when retained.
   * @remarks Provider-specific diagnostic data. Its shape is not a stable Judge API.
   */
  raw?: unknown;
  /** The provider-selected value, narrowed to the requested option union. */
  value: K;
}

/** A validated decision on an ordered, request-defined scale. */
export interface ScoreDecision<L extends string> {
  /** Provider confidence as an inclusive value from `0` to `1`. */
  confidence: number;
  /** The stable discriminator for Score decisions. */
  kind: "score";
  /** The requested level labels in their original order. */
  levels: readonly L[];
  /** Provider identity, model, usage, and diagnostics, when available. */
  metadata?: ProviderMetadata;
  /** Values from `0` to `1`, aligned by level index and summing to `1`. */
  probabilities: readonly number[];
  /**
   * The unmodified provider result, when retained.
   * @remarks Provider-specific diagnostic data. Its shape is not a stable Judge API.
   */
  raw?: unknown;
  /** A numeric score from `0` through `levels.length - 1`, inclusive. */
  score: number;
}

/**
 * Supplies provider-neutral semantic decisions to a {@link JudgeClient}.
 * @remarks Implementations may perform remote, potentially billable work.
 */
export interface DecisionProvider {
  /** Evaluates a Boolean condition, possibly through remote, billable work. */
  boolean: <S>(input: BooleanInput<S>) => Promise<BooleanDecision>;
  /** Chooses one requested option, possibly through remote, billable work. */
  choice: <S, const O extends readonly [string, ...string[]]>(
    input: ChoiceInput<S, O>
  ) => Promise<ChoiceDecision<O[number]>>;
  /** Scores the requested levels, possibly through remote, billable work. */
  score: <S, const L extends readonly [string, string, ...string[]]>(
    input: ScoreInput<S, L>
  ) => Promise<ScoreDecision<L[number]>>;
}

/** Defines fallback behavior when provider confidence is below a threshold. */
export interface ConfidencePolicy<U, D = BooleanDecision> {
  /** The minimum accepted confidence, inclusive from `0` to `1`. */
  minimum: number;
  /** Handles a below-threshold decision; errors propagate unchanged. */
  uncertain: (meta: UncertainMeta<D>) => U | Promise<U>;
}

/** Metadata passed to the selected Boolean control-flow callback. */
export interface BranchMeta<V extends boolean> {
  /** The validated decision narrowed to the callback's Boolean branch. */
  decision: BooleanDecision & {
    /** The branch-specific Boolean literal selected by the provider. */
    value: V;
  };
  /** A unique identifier shared by this control-flow invocation. */
  invocationId: string;
}

/** Metadata passed to a confidence policy's below-threshold handler. */
export interface UncertainMeta<D = BooleanDecision> {
  /** The validated decision that fell below the configured minimum. */
  decision: D;
  /** A unique identifier for this control-flow invocation. */
  invocationId: string;
  /** The inclusive minimum confidence that the decision did not meet. */
  minimum: number;
}

/** Metadata passed to the selected Choice control-flow callback. */
export interface ChoiceBranchMeta<
  Selected extends K,
  K extends string = Selected,
> {
  /** The validated decision narrowed to the selected case key. */
  decision: ChoiceDecision<K> & {
    /** The case-specific literal value selected by the provider. */
    value: Selected;
  };
  /** A unique identifier shared by this control-flow invocation. */
  invocationId: string;
}

/**
 * Maps every legal Choice value to its correctly narrowed callback.
 * @remarks The keys form the complete legal choice set sent to the provider.
 */
export type ChoiceCases<
  K extends string,
  C extends Record<K, (...args: never[]) => unknown>,
> = C & {
  [P in K]: (meta: ChoiceBranchMeta<P, K>) => ReturnType<C[P]>;
};

/** Configures a Boolean evaluation through {@link JudgeClient.boolean}. */
export interface BooleanOptions<S> {
  /** A trimmed, non-empty semantic condition for Judge to evaluate. */
  condition: string;
  /** Optional evaluation context; Jev providers require JSON-compatible data. */
  context?: S | undefined;
  /** Cancels provider work and rejects the evaluation when aborted. */
  signal?: AbortSignal;
}

/** Configures a closed-set evaluation through {@link JudgeClient.choice}. */
export interface ChoiceOptions<S, O extends readonly [string, ...string[]]>
  extends ChoiceInput<S, O> {}

/** Configures an ordered-scale evaluation through {@link JudgeClient.score}. */
export interface ScoreOptions<
  S,
  L extends readonly [string, string, ...string[]],
> extends ScoreInput<S, L> {}

/**
 * Configures Boolean semantic control flow.
 * @remarks Exactly one of `then`, `else`, or `uncertain` runs after a validated
 * decision. Callbacks are never speculative, and their errors propagate unchanged.
 */
export interface JudgeIfOptions<S, T, E, U = never> extends BooleanOptions<S> {
  /** Optional policy that routes below-threshold decisions to `uncertain`. */
  confidence?: ConfidencePolicy<U>;
  /** Runs only when the decision is false and confidence is accepted. */
  else: (meta: BranchMeta<false>) => E | Promise<E>;
  /** Runs only when the decision is true and confidence is accepted. */
  then: (meta: BranchMeta<true>) => T | Promise<T>;
}

/**
 * Configures closed-set semantic control flow.
 * @remarks Exactly one matching case or `uncertain` runs after a validated
 * decision. Callbacks are never speculative, and their errors propagate unchanged.
 */
export interface JudgeSwitchOptions<
  S,
  K extends string,
  C extends Record<K, (...args: never[]) => unknown>,
  U = never,
> {
  /** The complete mapping whose keys define all legal provider choices. */
  cases: ChoiceCases<K, C>;
  /** Optional policy that routes below-threshold decisions to `uncertain`. */
  confidence?: ConfidencePolicy<U, ChoiceDecision<K>>;
  /** Optional evaluation context; Jev providers require JSON-compatible data. */
  context?: S | undefined;
  /** A trimmed, non-empty semantic question for Judge to answer. */
  question: string;
  /** Cancels provider work before callback execution when aborted. */
  signal?: AbortSignal;
}

/** A provider-neutral Judge client for decisions and typed semantic control flow. */
export interface JudgeClient {
  /**
   * Evaluates a semantic condition as a Boolean decision.
   * @remarks Provider work may be remote and billable. Judge validates the result.
   * @param options - The condition, context, and optional cancellation signal.
   * @returns A validated Boolean decision.
   * @throws {@link ConfigurationError}, {@link SerializationError},
   * {@link AbortError}, {@link ProviderError}, or {@link ProviderContractError}.
   * @example
   * ```ts
   * import { createJudge } from "@brkn-labs/judge";
   * const judge = createJudge({ apiKey: process.env.JEV_API_KEY! });
   * const decision = await judge.boolean({
   *   condition: "The message violates the content policy",
   *   context: { message: "A user-submitted message" },
   * });
   * console.log(decision.value, decision.probabilityTrue);
   * ```
   */
  boolean: <S>(options: BooleanOptions<S>) => Promise<BooleanDecision>;

  /**
   * Chooses one value from a request-defined literal tuple.
   * @remarks Provider work may be remote and billable. Values and probability
   * keys exactly follow `options.options`.
   * @param options - The question, options, context, and optional signal.
   * @returns A Choice decision parameterized by the exact option union.
   * @throws {@link ConfigurationError}, {@link SerializationError},
   * {@link AbortError}, {@link ProviderError}, or {@link ProviderContractError}.
   * @example
   * ```ts
   * import { createJudge } from "@brkn-labs/judge";
   * const judge = createJudge({ apiKey: process.env.JEV_API_KEY! });
   * const decision = await judge.choice({
   *   context: { message: "I was charged twice" },
   *   options: ["billing", "support"],
   *   question: "Which team should handle this request?",
   * });
   * console.log(decision.value, decision.probabilities.billing);
   * ```
   */
  choice: <S, const O extends readonly [string, ...string[]]>(
    options: ChoiceOptions<S, O>
  ) => Promise<ChoiceDecision<O[number]>>;

  /**
   * Evaluates a Boolean decision and executes exactly one typed callback.
   * @remarks Callbacks are never speculative. The selected callback is awaited,
   * and its errors propagate unchanged. Provider work may be remote and billable.
   * @param options - The request, callbacks, and optional confidence policy.
   * @returns The awaited union of `then`, `else`, and `uncertain` results.
   * @throws {@link ConfigurationError} for invalid input or confidence settings.
   * @throws {@link SerializationError} for non-JSON-compatible context.
   * @throws {@link AbortError} when the caller cancels evaluation.
   * @throws {@link ProviderError} for transport or upstream failures.
   * @throws {@link ProviderContractError} for malformed provider output.
   * @throws Errors from the selected application callback unchanged.
   * @example
   * ```ts
   * import { createJudge } from "@brkn-labs/judge";
   * const judge = createJudge({ apiKey: process.env.JEV_API_KEY! });
   * const result = await judge.if({
   *   condition: "This incident needs immediate escalation",
   *   context: { severity: "unknown" },
   *   confidence: { minimum: 0.8, uncertain: () => ({ action: "review" as const }) },
   *   then: () => ({ action: "page" as const }),
   *   else: () => ({ action: "queue" as const }),
   * });
   * // result.action is "page" | "queue" | "review".
   * ```
   */
  if: <S, T, E, U = never>(
    options: JudgeIfOptions<S, T, E, U>
  ) => Promise<Awaited<T> | Awaited<E> | Awaited<U>>;

  /**
   * Scores context against an ordered, request-defined set of levels.
   * @remarks Provider work may be remote and billable. Score `0` maps to the
   * first level and `levels.length - 1` maps to the last.
   * @param options - The question, levels, context, and optional signal.
   * @returns A Score decision parameterized by the exact level union.
   * @throws {@link ConfigurationError}, {@link SerializationError},
   * {@link AbortError}, {@link ProviderError}, or {@link ProviderContractError}.
   * @example
   * ```ts
   * import { createJudge } from "@brkn-labs/judge";
   * const judge = createJudge({ apiKey: process.env.JEV_API_KEY! });
   * const decision = await judge.score({
   *   context: { change: "Rotates a production database credential" },
   *   levels: ["low", "medium", "high"],
   *   question: "How risky is this change?",
   * });
   * console.log(decision.score, decision.levels);
   * ```
   */
  score: <S, const L extends readonly [string, string, ...string[]]>(
    options: ScoreOptions<S, L>
  ) => Promise<ScoreDecision<L[number]>>;

  /**
   * Chooses from case keys and executes exactly one narrowed callback.
   * @remarks Cases are snapshotted before one provider decision; callbacks are
   * never speculative and their errors propagate unchanged. Work may be billable.
   * @param options - The question, context, cases, and confidence policy.
   * @returns The awaited union of all case and `uncertain` callback results.
   * @throws {@link ConfigurationError} for invalid cases or confidence settings.
   * @throws {@link SerializationError} for non-JSON-compatible context.
   * @throws {@link AbortError} when the caller cancels evaluation.
   * @throws {@link ProviderError} for transport or upstream failures.
   * @throws {@link ProviderContractError} for malformed or impossible output.
   * @throws Errors from the selected application callback unchanged.
   * @example
   * ```ts
   * import { createJudge } from "@brkn-labs/judge";
   * const judge = createJudge({ apiKey: process.env.JEV_API_KEY! });
   * const result = await judge.switch({
   *   context: { message: "My invoice is incorrect" },
   *   question: "Which team should handle this request?",
   *   confidence: { minimum: 0.75, uncertain: () => ({ route: "review" as const }) },
   *   cases: {
   *     billing: ({ decision }) => ({ route: decision.value }),
   *     support: ({ decision }) => ({ route: decision.value }),
   *   },
   * });
   * // result.route is "billing" | "support" | "review".
   * ```
   */
  switch: <
    S,
    const K extends string,
    const C extends Record<K, (...args: never[]) => unknown>,
    U = never,
  >(
    options: JudgeSwitchOptions<S, K, C, U>
  ) => Promise<Awaited<ReturnType<C[K]>> | Awaited<U>>;
}

/** Configures the provider-neutral `createJudge` factory. */
export interface CreateJudgeOptions {
  /** The sole provider used for every evaluation made by the returned client. */
  provider: DecisionProvider;
}
