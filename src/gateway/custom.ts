import { ConfigurationError } from "../core/errors.ts";

import type { GatewayCapabilities, GatewayPlugin } from "./types.ts";

export type {
  GatewayCapabilities,
  GatewayEvaluationRequest,
  GatewayEvaluationResult,
  GatewayMetadata,
  GatewayPlugin,
  GatewayRequestOptions,
  JevQuestion,
} from "./types.ts";

const capabilityNames = [
  "batching",
  "boolean",
  "choice",
  "customHeaders",
  "jev",
  "score",
] as const satisfies readonly (keyof GatewayCapabilities)[];

const validateIdentifier = (value: unknown, name: string): string => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new ConfigurationError(
      `Gateway ${name} must be a non-empty, trimmed string.`
    );
  }

  return value;
};

const snapshotCapabilities = (value: unknown): GatewayCapabilities => {
  if (typeof value !== "object" || value === null) {
    throw new ConfigurationError("Gateway capabilities must be an object.");
  }

  const record = value as Record<string, unknown>;
  for (const name of capabilityNames) {
    if (typeof record[name] !== "boolean") {
      throw new ConfigurationError(
        `Gateway capability '${name}' must be a boolean.`
      );
    }
  }

  return Object.freeze({
    batching: record.batching as boolean,
    boolean: record.boolean as boolean,
    choice: record.choice as boolean,
    customHeaders: record.customHeaders as boolean,
    jev: record.jev as boolean,
    score: record.score as boolean,
  });
};

/**
 * Defines a custom Jev-compatible gateway.
 *
 * @remarks A custom plugin's `evaluate` function may perform remote,
 * potentially billable work. Judge does not add retries around this function;
 * the plugin owns its transport, cancellation, timeout, and retry behavior.
 * Capability flags are snapshotted and frozen, while `evaluate` is preserved.
 * The callback receives native Jev state and keyed questions; its returned
 * body remains untrusted until Judge validates the requested decisions.
 *
 * @param definition - Gateway identity, capabilities, model, and evaluator.
 * @returns An immutable, validated {@link GatewayPlugin}.
 * @throws {@link ConfigurationError} if the definition, identifiers,
 * capabilities, or evaluator are invalid.
 *
 * @example
 * ```ts
 * import { defineGateway } from "@brkn-labs/judge/gateway/custom";
 *
 * const gateway = defineGateway({
 *   id: "internal",
 *   model: "internal/jev",
 *   capabilities: {
 *     batching: true,
 *     boolean: true,
 *     choice: true,
 *     customHeaders: true,
 *     jev: true,
 *     score: true,
 *   },
 *   async evaluate(request, options) {
 *     const response = await fetch("https://example.com/evaluate", {
 *       method: "POST",
 *       headers: { "content-type": "application/json", ...options?.headers },
 *       body: JSON.stringify(request),
 *       signal: options?.signal,
 *     });
 *     return { body: await response.json() };
 *   },
 * });
 * ```
 */
export const defineGateway = (definition: GatewayPlugin): GatewayPlugin => {
  const candidate: unknown = definition;
  if (typeof candidate !== "object" || candidate === null) {
    throw new ConfigurationError("Gateway definition must be an object.");
  }
  const record = candidate as Record<string, unknown>;
  if (typeof record.evaluate !== "function") {
    throw new ConfigurationError("Gateway evaluate must be a function.");
  }

  return Object.freeze({
    capabilities: snapshotCapabilities(record.capabilities),
    evaluate: record.evaluate as GatewayPlugin["evaluate"],
    id: validateIdentifier(record.id, "id"),
    model: validateIdentifier(record.model, "model"),
  });
};
