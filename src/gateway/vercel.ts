import { createGateway, type GatewayEvaluationModelId } from "@ai-sdk/gateway";
import { experimental_evaluate } from "ai";

import { ConfigurationError } from "../core/errors.ts";
import { createRequestSignal } from "../provider/jev/http.ts";
import { defineGateway } from "./custom.ts";
import { normalizeGatewayError } from "./errors.ts";
import type {
  GatewayEvaluationRequest,
  GatewayPlugin,
  GatewayRequestOptions,
  JevQuestion,
} from "./types.ts";

const DEFAULT_MODEL = "typesafe-ai/jev";

/** Configuration for {@link vercelGateway}. */
export interface VercelGatewayOptions {
  /** Vercel AI Gateway API key used to authenticate remote requests. */
  readonly apiKey: string;
  /**
   * Alternative AI Gateway base URL.
   *
   * @defaultValue The Vercel AI Gateway SDK default endpoint.
   */
  readonly baseUrl?: string;
  /** Headers included with every request; per-request headers take precedence. */
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * Default evaluation model identifier.
   *
   * @defaultValue `"typesafe-ai/jev"`
   */
  readonly model?: string;
}

interface EvaluationInput {
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  maxRetries: number;
  model: unknown;
  questions: Record<string, unknown>;
  state: unknown;
}

type Evaluator = (input: EvaluationInput) => Promise<unknown>;
type ModelFactory = (model: string) => unknown;

interface TestDependencies {
  evaluate?: Evaluator;
  modelFactory?: ModelFactory;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validateString = (value: unknown, name: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new ConfigurationError(
      `${name} must be a non-empty, trimmed string.`
    );
  }
  return value;
};

const toAiQuestion = (question: JevQuestion): Record<string, unknown> => ({
  ...question,
  type: question.type === "noul" ? "boolean" : question.type,
});

const answerConfidence = (
  probabilities: unknown,
  selected: unknown
): unknown =>
  isRecord(probabilities) && typeof selected === "string"
    ? probabilities[selected]
    : undefined;

const toJevAnswer = (answer: unknown, question: JevQuestion | undefined) => {
  if (!isRecord(answer)) {
    return answer;
  }
  if (answer.type === "boolean") {
    return { noul: answer.probability, type: "noul" };
  }
  if (answer.type === "choice") {
    return {
      choice: answer.choice,
      confidence: answerConfidence(answer.probabilities, answer.choice),
      probabilities: answer.probabilities,
      type: "choice",
    };
  }
  if (answer.type === "score") {
    const criteria = question?.type === "score" ? question.criteria : [];
    const { probabilities } = answer;
    const numericProbabilities = isRecord(probabilities)
      ? Object.values(probabilities).filter(
          (value): value is number => typeof value === "number"
        )
      : [];
    return {
      confidence:
        numericProbabilities.length === 0
          ? undefined
          : Math.max(...numericProbabilities),
      legend: Object.fromEntries(
        criteria.map((level, index) => [index, level])
      ),
      probabilities,
      score: answer.score,
      type: "score",
    };
  }
  return answer;
};

const convertResult = (
  value: unknown,
  request: GatewayEvaluationRequest,
  startedAt: number
) => {
  if (!(isRecord(value) && isRecord(value.answers))) {
    return { body: value };
  }
  const answers = Object.fromEntries(
    Object.entries(value.answers).map(([id, answer]) => [
      id,
      toJevAnswer(answer, request.questions[id]),
    ])
  );
  const response = isRecord(value.response) ? value.response : undefined;
  const usage = isRecord(value.usage) ? value.usage : undefined;
  return {
    body: { answers },
    metadata: {
      gateway: "vercel",
      latencyMs: performance.now() - startedAt,
      model: request.model,
      ...(Object.hasOwn(value, "providerMetadata")
        ? { raw: value.providerMetadata }
        : {}),
      ...(typeof response?.id === "string" ? { requestId: response.id } : {}),
      ...(typeof response?.modelId === "string"
        ? { resolvedModel: response.modelId }
        : {}),
      ...(usage
        ? {
            usage: {
              ...(typeof usage.inputTokens === "number"
                ? { inputTokens: usage.inputTokens }
                : {}),
              ...(typeof usage.outputTokens === "number"
                ? { outputTokens: usage.outputTokens }
                : {}),
            },
          }
        : {}),
    },
  };
};

/**
 * Creates a Vercel AI Gateway adapter.
 *
 * @remarks Calling a Judge client with this gateway performs remote,
 * potentially billable work. This adapter requires the optional
 * `@ai-sdk/gateway` and `ai` peer dependencies and uses the native evaluation
 * API. It disables SDK retries to avoid hidden duplicate evaluations.
 * Per-request abort signals and timeouts are combined; `timeoutMs` is measured
 * in milliseconds. Vercel owns model availability, rate limits, context
 * limits, and billing.
 *
 * @param options - Credentials and Vercel AI Gateway configuration.
 * @returns A reusable {@link GatewayPlugin}.
 * @throws {@link ConfigurationError} if a required string is missing or not
 * trimmed. Evaluation can reject with cancellation, timeout, or normalized
 * provider errors.
 *
 * @example
 * ```ts
 * import { createJudge } from "@brkn-labs/judge";
 * import { vercelGateway } from "@brkn-labs/judge/gateway/vercel";
 *
 * const judge = createJudge({
 *   gateway: vercelGateway({ apiKey: process.env.AI_GATEWAY_API_KEY! }),
 * });
 * const decision = await judge.boolean({
 *   condition: "This support request requires urgent attention",
 *   context: { message: "Production is unavailable" },
 * });
 * ```
 */
export const vercelGateway = (options: VercelGatewayOptions): GatewayPlugin => {
  const apiKey = validateString(options.apiKey, "apiKey");
  const model = validateString(options.model ?? DEFAULT_MODEL, "model");
  const dependencies = options as VercelGatewayOptions & TestDependencies;
  const provider = createGateway({
    apiKey,
    ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
    ...(options.headers ? { headers: { ...options.headers } } : {}),
  });
  const modelFactory: ModelFactory =
    dependencies.modelFactory ??
    ((id) => provider.evaluation(id as GatewayEvaluationModelId));
  const evaluator: Evaluator =
    dependencies.evaluate ??
    ((input) => experimental_evaluate(input as never) as Promise<unknown>);

  return defineGateway({
    capabilities: {
      batching: true,
      boolean: true,
      choice: true,
      customHeaders: true,
      jev: true,
      score: true,
    },
    evaluate: async (
      request: GatewayEvaluationRequest,
      requestOptions?: GatewayRequestOptions
    ) => {
      const startedAt = performance.now();
      const requestSignal = createRequestSignal(
        requestOptions?.signal,
        requestOptions?.timeoutMs
      );
      try {
        const headers = { ...options.headers, ...requestOptions?.headers };
        const result = await evaluator({
          ...(requestSignal.signal
            ? { abortSignal: requestSignal.signal }
            : {}),
          ...(Object.keys(headers).length === 0 ? {} : { headers }),
          maxRetries: 0,
          model: modelFactory(request.model),
          questions: Object.fromEntries(
            Object.entries(request.questions).map(([id, question]) => [
              id,
              toAiQuestion(question),
            ])
          ),
          state: request.state,
        });
        return convertResult(result, request, startedAt);
      } catch (cause) {
        return normalizeGatewayError(
          cause,
          requestOptions?.signal,
          requestSignal.timedOut()
        );
      } finally {
        requestSignal.cleanup();
      }
    },
    id: "vercel",
    model,
  });
};
