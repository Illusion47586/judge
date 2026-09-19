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
