import {
  AbortError,
  type BooleanDecision,
  type BooleanInput,
  type ChoiceDecision,
  type ChoiceInput,
  ConfigurationError,
  type DecisionProvider,
  type ScoreDecision,
  type ScoreInput,
} from "../core/index.ts";

/** Defines one deterministic Boolean result for the mock provider. */
export interface BooleanFixture {
  /**
   * Optional decision confidence from zero to one, inclusive.
   *
   * @defaultValue The probability of the selected value.
   */
  confidence?: number;
  /** Probability of `true`, from zero to one inclusive. */
  probabilityTrue: number;
  /**
   * Provider-specific diagnostic data copied into the decision.
   *
   * @remarks Its shape is not a stable Judge API.
   */
  raw?: unknown;
  /** Boolean value selected by this fixture. */
  value: boolean;
}

/** Defines one deterministic Choice result for the mock provider. */
export interface ChoiceFixture {
  /**
   * Optional decision confidence from zero to one, inclusive.
   *
   * @defaultValue The probability associated with `value`.
   */
  confidence?: number;
  /** Complete option-probability record whose values sum to one. */
  probabilities: Readonly<Record<string, number>>;
  /**
   * Provider-specific diagnostic data copied into the decision.
   *
   * @remarks Its shape is not a stable Judge API.
   */
  raw?: unknown;
  /** Requested option selected by this fixture. */
  value: string;
}

/** Configures immutable FIFO fixture queues for {@link mockProvider}. */
export interface MockProviderOptions {
  /**
   * Boolean fixtures consumed in array order.
   *
   * @defaultValue An empty queue.
   */
  boolean?: readonly Readonly<BooleanFixture>[];
  /**
   * Choice fixtures consumed in array order.
   *
   * @defaultValue An empty queue.
   */
  choice?: readonly Readonly<ChoiceFixture>[];
}

const abortIfNeeded = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new AbortError("The mock evaluation was aborted.", {
      cause: signal.reason,
    });
  }
};

/**
 * Creates a deterministic FIFO decision provider for tests.
 *
 * @remarks Fixture arrays are snapshotted when the provider is created. One
 * fixture is consumed by each successful Boolean or Choice evaluation. A
 * request that is already aborted preserves its fixture. Empty queues reject
 * with {@link ConfigurationError} code `mock_queue_exhausted`. Score fixtures
 * are not supported in this release and reject with code
 * `mock_score_not_configured`. Fixture `raw` values are unstable diagnostic
 * data, matching the production decision contract.
 *
 * @param options - FIFO Boolean and Choice fixture queues.
 * @returns A provider suitable for the provider-neutral Judge factory.
 * @throws {@link AbortError} when an evaluation is already aborted.
 * @throws {@link ConfigurationError} when a queue is exhausted or Score is
 * requested.
 *
 * @example
 * ```ts
 * import { createJudge } from "@brkn-labs/judge/core";
 * import { mockProvider } from "@brkn-labs/judge/mock";
 *
 * const judge = createJudge({
 *   provider: mockProvider({
 *     choice: [
 *       { probabilities: { billing: 1, support: 0 }, value: "billing" },
 *     ],
 *   }),
 * });
 * ```
 */
export const mockProvider = (
  options: MockProviderOptions
): DecisionProvider => {
  const booleanQueue = [...(options.boolean ?? [])];
  const choiceQueue = [...(options.choice ?? [])];

  return {
    boolean: <S>(input: BooleanInput<S>): Promise<BooleanDecision> =>
      Promise.resolve().then(() => {
        abortIfNeeded(input.signal);
        const fixture = booleanQueue.shift();
        if (!fixture) {
          throw new ConfigurationError("The mock Boolean queue is exhausted.", {
            code: "mock_queue_exhausted",
          });
        }

        const confidence =
          fixture.confidence ??
          (fixture.value
            ? fixture.probabilityTrue
            : 1 - fixture.probabilityTrue);
        const decision: BooleanDecision = {
          confidence,
          kind: "boolean",
          probabilityTrue: fixture.probabilityTrue,
          value: fixture.value,
          ...(Object.hasOwn(fixture, "raw") ? { raw: fixture.raw } : {}),
        };

        return decision;
      }),

    choice: <S, const O extends readonly [string, ...string[]]>(
      input: ChoiceInput<S, O>
    ): Promise<ChoiceDecision<O[number]>> =>
      Promise.resolve().then(() => {
        abortIfNeeded(input.signal);
        const fixture = choiceQueue.shift();
        if (!fixture) {
          throw new ConfigurationError("The mock Choice queue is exhausted.", {
            code: "mock_queue_exhausted",
          });
        }

        const decision = {
          confidence:
            fixture.confidence ??
            fixture.probabilities[fixture.value] ??
            Number.NaN,
          kind: "choice",
          probabilities: fixture.probabilities,
          value: fixture.value,
          ...(Object.hasOwn(fixture, "raw") ? { raw: fixture.raw } : {}),
        } as const;

        return decision as unknown as ChoiceDecision<O[number]>;
      }),

    score: <S, const L extends readonly [string, string, ...string[]]>(
      _input: ScoreInput<S, L>
    ): Promise<ScoreDecision<L[number]>> =>
      Promise.reject(
        new ConfigurationError(
          "Mock Score fixtures are not configured in this implementation slice.",
          { code: "mock_score_not_configured" }
        )
      ),
  };
};
