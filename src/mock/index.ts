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

export interface BooleanFixture {
  confidence?: number;
  probabilityTrue: number;
  raw?: unknown;
  value: boolean;
}

export interface ChoiceFixture {
  confidence?: number;
  probabilities: Readonly<Record<string, number>>;
  raw?: unknown;
  value: string;
}

export interface MockProviderOptions {
  boolean?: readonly Readonly<BooleanFixture>[];
  choice?: readonly Readonly<ChoiceFixture>[];
}

const abortIfNeeded = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new AbortError("The mock evaluation was aborted.", {
      cause: signal.reason,
    });
  }
};

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
