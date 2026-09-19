export interface BooleanInput<S> {
  condition: string;
  context: S;
  signal?: AbortSignal;
}

export interface ChoiceInput<S, O extends readonly [string, ...string[]]> {
  context: S;
  options: O;
  question: string;
  signal?: AbortSignal;
}

export interface ScoreInput<
  S,
  L extends readonly [string, string, ...string[]],
> {
  context: S;
  levels: L;
  question: string;
  signal?: AbortSignal;
}

export interface ProviderMetadata {
  gateway?: string;
  latencyMs?: number;
  model: string;
  provider: "jev";
  raw?: unknown;
  requestId?: string;
  resolvedModel?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface BooleanDecision {
  confidence: number;
  kind: "boolean";
  metadata?: ProviderMetadata;
  probabilityTrue: number;
  raw?: unknown;
  value: boolean;
}

export interface ChoiceDecision<K extends string> {
  confidence: number;
  kind: "choice";
  metadata?: ProviderMetadata;
  probabilities: Record<K, number>;
  raw?: unknown;
  value: K;
}

export interface ScoreDecision<L extends string> {
  confidence: number;
  kind: "score";
  levels: readonly L[];
  metadata?: ProviderMetadata;
  probabilities: readonly number[];
  raw?: unknown;
  score: number;
}

export interface DecisionProvider {
  boolean: <S>(input: BooleanInput<S>) => Promise<BooleanDecision>;

  choice: <S, const O extends readonly [string, ...string[]]>(
    input: ChoiceInput<S, O>
  ) => Promise<ChoiceDecision<O[number]>>;

  score: <S, const L extends readonly [string, string, ...string[]]>(
    input: ScoreInput<S, L>
  ) => Promise<ScoreDecision<L[number]>>;
}

export interface ConfidencePolicy<U, D = BooleanDecision> {
  minimum: number;
  uncertain: (meta: UncertainMeta<D>) => U | Promise<U>;
}

export interface BranchMeta<V extends boolean> {
  decision: BooleanDecision & { value: V };
  invocationId: string;
}

export interface UncertainMeta<D = BooleanDecision> {
  decision: D;
  invocationId: string;
  minimum: number;
}

export interface ChoiceBranchMeta<
  Selected extends K,
  K extends string = Selected,
> {
  decision: ChoiceDecision<K> & { value: Selected };
  invocationId: string;
}

export type ChoiceCases<
  K extends string,
  C extends Record<K, (...args: never[]) => unknown>,
> = C & {
  [P in K]: (meta: ChoiceBranchMeta<P, K>) => ReturnType<C[P]>;
};

export interface BooleanOptions<S> {
  condition: string;
  context: S;
  signal?: AbortSignal;
}

export interface ChoiceOptions<S, O extends readonly [string, ...string[]]>
  extends ChoiceInput<S, O> {}

export interface ScoreOptions<
  S,
  L extends readonly [string, string, ...string[]],
> extends ScoreInput<S, L> {}

export interface JudgeIfOptions<S, T, E, U = never> extends BooleanOptions<S> {
  confidence?: ConfidencePolicy<U>;
  else: (meta: BranchMeta<false>) => E | Promise<E>;
  then: (meta: BranchMeta<true>) => T | Promise<T>;
}

export interface JudgeSwitchOptions<
  S,
  K extends string,
  C extends Record<K, (...args: never[]) => unknown>,
  U = never,
> {
  cases: ChoiceCases<K, C>;
  confidence?: ConfidencePolicy<U, ChoiceDecision<K>>;
  context: S;
  question: string;
  signal?: AbortSignal;
}

export interface JudgeClient {
  boolean: <S>(options: BooleanOptions<S>) => Promise<BooleanDecision>;

  choice: <S, const O extends readonly [string, ...string[]]>(
    options: ChoiceOptions<S, O>
  ) => Promise<ChoiceDecision<O[number]>>;

  if: <S, T, E, U = never>(
    options: JudgeIfOptions<S, T, E, U>
  ) => Promise<Awaited<T> | Awaited<E> | Awaited<U>>;

  score: <S, const L extends readonly [string, string, ...string[]]>(
    options: ScoreOptions<S, L>
  ) => Promise<ScoreDecision<L[number]>>;

  switch: <
    S,
    const K extends string,
    const C extends Record<K, (...args: never[]) => unknown>,
    U = never,
  >(
    options: JudgeSwitchOptions<S, K, C, U>
  ) => Promise<Awaited<ReturnType<C[K]>> | Awaited<U>>;
}

export interface CreateJudgeOptions {
  provider: DecisionProvider;
}
