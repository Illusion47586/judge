import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

interface SurfaceFile {
  examples?: Readonly<Record<string, readonly string[]>>;
  members?: Readonly<Record<string, readonly string[]>>;
  symbols: readonly string[];
}

const EXAMPLE_TAG = /@example/u;
const JSDOC_AT_END = /\/\*\*[\s\S]*?\*\/\s*$/u;
const NON_WHITESPACE = /\S/u;
const PACKAGE_IMPORT = /@brkn-labs\/judge/u;

const publicSurface: Readonly<Record<string, SurfaceFile>> = {
  "src/core/client.ts": {
    examples: { createJudge: [] },
    symbols: ["createJudge"],
  },
  "src/core/errors.ts": {
    members: { JudgeError: ["code"] },
    symbols: [
      "AbortError",
      "ConfigurationError",
      "ContextLimitError",
      "JudgeError",
      "ProviderContractError",
      "ProviderError",
      "SerializationError",
    ],
  },
  "src/core/types.ts": {
    examples: { JudgeClient: ["boolean", "choice", "if", "score", "switch"] },
    members: {
      BooleanDecision: [
        "confidence",
        "kind",
        "metadata",
        "probabilityTrue",
        "raw",
        "value",
      ],
      BooleanInput: ["condition", "context", "signal"],
      BooleanOptions: ["condition", "context", "signal"],
      BranchMeta: ["decision", "invocationId"],
      ChoiceBranchMeta: ["decision", "invocationId"],
      ChoiceDecision: [
        "confidence",
        "kind",
        "metadata",
        "probabilities",
        "raw",
        "value",
      ],
      ChoiceInput: ["context", "options", "question", "signal"],
      ConfidencePolicy: ["minimum", "uncertain"],
      CreateJudgeOptions: ["provider"],
      DecisionProvider: ["boolean", "choice", "score"],
      JudgeClient: ["boolean", "choice", "if", "score", "switch"],
      JudgeIfOptions: ["confidence", "else", "then"],
      JudgeSwitchOptions: [
        "cases",
        "confidence",
        "context",
        "question",
        "signal",
      ],
      ProviderMetadata: [
        "gateway",
        "inputTokens",
        "latencyMs",
        "model",
        "outputTokens",
        "provider",
        "raw",
        "requestId",
        "resolvedModel",
        "usage",
      ],
      ScoreDecision: [
        "confidence",
        "kind",
        "levels",
        "metadata",
        "probabilities",
        "raw",
        "score",
      ],
      ScoreInput: ["context", "levels", "question", "signal"],
      UncertainMeta: ["decision", "invocationId", "minimum"],
    },
    symbols: [
      "BooleanDecision",
      "BooleanInput",
      "BooleanOptions",
      "BranchMeta",
      "ChoiceBranchMeta",
      "ChoiceCases",
      "ChoiceDecision",
      "ChoiceInput",
      "ChoiceOptions",
      "ConfidencePolicy",
      "CreateJudgeOptions",
      "DecisionProvider",
      "JudgeClient",
      "JudgeIfOptions",
      "JudgeSwitchOptions",
      "ProviderMetadata",
      "ScoreDecision",
      "ScoreInput",
      "ScoreOptions",
      "UncertainMeta",
    ],
  },
  "src/gateway/cloudflare.ts": {
    examples: { cloudflareGateway: [] },
    members: {
      CloudflareGatewayOptions: ["accountId", "apiToken", "gatewayId", "model"],
    },
    symbols: ["CloudflareGatewayOptions", "cloudflareGateway"],
  },
  "src/gateway/custom.ts": {
    examples: { defineGateway: [] },
    symbols: ["defineGateway"],
  },
  "src/gateway/openrouter.ts": {
    examples: { openRouterGateway: [] },
    members: {
      OpenRouterGatewayOptions: [
        "apiKey",
        "appTitle",
        "baseUrl",
        "httpReferer",
        "maxResponseBytes",
        "model",
        "provider",
      ],
    },
    symbols: ["OpenRouterGatewayOptions", "openRouterGateway"],
  },
  "src/gateway/types.ts": {
    members: {
      GatewayCapabilities: [
        "batching",
        "boolean",
        "choice",
        "customHeaders",
        "jev",
        "score",
      ],
      GatewayEvaluationRequest: ["model", "questions", "state"],
      GatewayEvaluationResult: ["body", "metadata"],
      GatewayMetadata: [
        "gateway",
        "inputTokens",
        "latencyMs",
        "model",
        "outputTokens",
        "provider",
        "raw",
        "requestId",
        "resolvedModel",
        "usage",
      ],
      GatewayPlugin: ["capabilities", "evaluate", "id", "model"],
      GatewayRequestOptions: ["headers", "signal", "timeoutMs"],
      JevQuestion: ["criteria", "false", "instructions", "true", "type"],
    },
    symbols: [
      "GatewayCapabilities",
      "GatewayEvaluationRequest",
      "GatewayEvaluationResult",
      "GatewayMetadata",
      "GatewayPlugin",
      "GatewayRequestOptions",
      "JevQuestion",
    ],
  },
  "src/gateway/vercel.ts": {
    examples: { vercelGateway: [] },
    members: {
      VercelGatewayOptions: ["apiKey", "baseUrl", "headers", "model"],
    },
    symbols: ["VercelGatewayOptions", "vercelGateway"],
  },
  "src/index.ts": {
    examples: { createJudge: [] },
    members: {
      GatewayJevOptions: [
        "apiKey",
        "contextBudget",
        "gateway",
        "model",
        "timeoutMs",
      ],
    },
    symbols: ["CreateJudgeOptions", "GatewayJevOptions", "createJudge"],
  },
  "src/mock/index.ts": {
    examples: { mockProvider: [] },
    members: {
      BooleanFixture: ["confidence", "probabilityTrue", "raw", "value"],
      ChoiceFixture: ["confidence", "probabilities", "raw", "value"],
      MockProviderOptions: ["boolean", "choice"],
    },
    symbols: [
      "BooleanFixture",
      "ChoiceFixture",
      "MockProviderOptions",
      "mockProvider",
    ],
  },
  "src/provider/jev/direct.ts": {
    members: {
      DirectJevOptions: [
        "apiKey",
        "baseUrl",
        "maxResponseBytes",
        "model",
        "retry",
        "timeoutMs",
      ],
      RetryOptions: ["initialDelayMs", "maxAttempts", "maxDelayMs"],
    },
    symbols: ["DirectJevOptions", "RetryOptions"],
  },
  "src/provider/jev/types.ts": {
    members: {
      ContextBudgetOptions: ["maxTokens", "onWarning", "warnAt"],
      ContextBudgetWarning: [
        "code",
        "estimatedTokens",
        "maxTokens",
        "model",
        "ratio",
        "warnAt",
      ],
    },
    symbols: ["ContextBudgetOptions", "ContextBudgetWarning"],
  },
};

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const declarationPattern = (symbol: string): RegExp =>
  new RegExp(
    `export\\s+(?:class|const|function|interface|type)\\s+${escapeRegex(symbol)}\\b`,
    "u"
  );

const leadingJSDoc = (source: string, offset: number): string =>
  source.slice(0, offset).match(JSDOC_AT_END)?.[0] ?? "";

const declarationBlock = (source: string, offset: number): string => {
  const declaration = source.slice(offset);
  const isType = declaration.startsWith("export type ");
  const firstBrace = declaration.indexOf("{");
  if (firstBrace < 0) {
    const semicolon = declaration.indexOf(";");
    return declaration.slice(0, semicolon < 0 ? undefined : semicolon + 1);
  }
  let depth = 0;
  for (let index = firstBrace; index < declaration.length; index += 1) {
    const character = declaration[index];
    if (character === "{") {
      depth += 1;
    }
    if (character === "}") {
      depth -= 1;
    }
    if (
      (!isType && depth === 0) ||
      (isType && depth === 0 && character === ";")
    ) {
      return declaration.slice(0, index + 1);
    }
  }
  return declaration;
};

const memberOffsets = (block: string, member: string): number[] => {
  const pattern = new RegExp(
    `^[ \\t]*(?:readonly\\s+)?${escapeRegex(member)}\\??\\s*:`,
    "gmu"
  );
  return [...block.matchAll(pattern)].map((match) => match.index);
};

test("every manifested public declaration and member has JSDoc", () => {
  for (const [relativePath, surface] of Object.entries(publicSurface)) {
    const source = readFileSync(resolve(relativePath), "utf8");
    for (const symbol of surface.symbols) {
      const match = declarationPattern(symbol).exec(source);
      assert.ok(match, `${relativePath} is missing ${symbol}`);
      assert.match(
        leadingJSDoc(source, match.index),
        NON_WHITESPACE,
        `${symbol} needs JSDoc`
      );
      const block = declarationBlock(source, match.index);
      for (const member of surface.members?.[symbol] ?? []) {
        const offsets = memberOffsets(block, member);
        assert.ok(offsets.length > 0, `${symbol}.${member} is missing`);
        for (const offset of offsets) {
          assert.match(
            leadingJSDoc(block, offset),
            NON_WHITESPACE,
            `${symbol}.${member} needs JSDoc`
          );
        }
      }
      const exampleMembers = surface.examples?.[symbol];
      if (exampleMembers) {
        const targets =
          exampleMembers.length === 0
            ? [leadingJSDoc(source, match.index)]
            : exampleMembers.map((member) => {
                const [offset] = memberOffsets(block, member);
                assert.notEqual(
                  offset,
                  undefined,
                  `${symbol}.${member} is missing`
                );
                return leadingJSDoc(block, offset ?? 0);
              });
        for (const docs of targets) {
          assert.match(docs, EXAMPLE_TAG, `${symbol} needs @example`);
          assert.match(
            docs,
            PACKAGE_IMPORT,
            `${symbol} needs a package import`
          );
        }
      }
    }
  }
});

test("distributed declarations retain representative JSDoc", () => {
  execFileSync("npm", ["run", "build"], {
    cwd: process.cwd(),
    stdio: "pipe",
  });
  const markers = {
    "dist/core/errors.d.ts": "Base class for stable Judge errors",
    "dist/core/types.d.ts": "A provider-neutral Judge client",
    "dist/gateway/cloudflare.d.ts": "Creates a Cloudflare Workers AI adapter",
    "dist/gateway/custom.d.ts": "Defines a custom Jev-compatible gateway",
    "dist/gateway/openrouter.d.ts": "Creates an OpenRouter Decisions adapter",
    "dist/gateway/vercel.d.ts": "Creates a Vercel AI Gateway adapter",
    "dist/index.d.ts": "Creates a Jev-backed Judge client",
    "dist/mock/index.d.ts": "Creates a deterministic FIFO decision provider",
  } as const;
  for (const [file, marker] of Object.entries(markers)) {
    assert.match(readFileSync(resolve(file), "utf8"), new RegExp(marker, "u"));
  }
});
