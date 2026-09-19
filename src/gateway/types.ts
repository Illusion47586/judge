/**
 * A semantic question encoded for a Jev-compatible evaluation endpoint.
 *
 * @remarks Judge normally creates these questions from its higher-level
 * methods. Custom gateways receive them in {@link GatewayEvaluationRequest}.
 */
export type JevQuestion =
  | {
      /** Optional labels describing the false and true outcomes. */
      readonly criteria?: {
        /** Description of the false outcome. */
        readonly false: string;
        /** Description of the true outcome. */
        readonly true: string;
      };
      /** The semantic condition the provider evaluates. */
      readonly instructions: string;
      /** Jev's protocol discriminator for a Boolean question. */
      readonly type: "noul";
    }
  | {
      /** Maps every legal choice value to its semantic description. */
      readonly criteria: Readonly<Record<string, string>>;
      /** The semantic question the provider answers. */
      readonly instructions: string;
      /** The protocol discriminator for a choice question. */
      readonly type: "choice";
    }
  | {
      /** Ordered score labels, from the lowest score to the highest. */
      readonly criteria: readonly [string, string, ...string[]];
      /** The semantic quality or property the provider scores. */
      readonly instructions: string;
      /** The protocol discriminator for a score question. */
      readonly type: "score";
    };

/** A provider-neutral batch of Jev questions sent through a gateway. */
export interface GatewayEvaluationRequest {
  /** Provider model identifier requested for this evaluation. */
  readonly model: string;
  /** Questions keyed by the IDs used to correlate returned answers. */
  readonly questions: Readonly<Record<string, JevQuestion>>;
  /** JSON-safe application context shared by every question in the batch. */
  readonly state: unknown;
}

/** Per-evaluation transport controls supplied to a gateway plugin. */
export interface GatewayRequestOptions {
  /** Additional request headers; support depends on gateway capabilities. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Signal that cancels the in-flight request when aborted. */
  readonly signal?: AbortSignal;
  /** Maximum request duration as a positive number of milliseconds. */
  readonly timeoutMs?: number;
}

/** Feature flags advertised by a gateway implementation. */
export interface GatewayCapabilities {
  /** Whether one remote request can contain multiple questions. */
  readonly batching: boolean;
  /** Whether Boolean questions are supported. */
  readonly boolean: boolean;
  /** Whether choice questions are supported. */
  readonly choice: boolean;
  /** Whether per-request custom headers are supported. */
  readonly customHeaders: boolean;
  /** Whether the gateway speaks the Jev evaluation protocol. */
  readonly jev: boolean;
  /** Whether score questions are supported. */
  readonly score: boolean;
}

/** Diagnostic metadata reported by a gateway evaluation. */
export interface GatewayMetadata {
  /** Stable Judge identifier for the gateway adapter. */
  readonly gateway: string;
  /** Elapsed gateway request time in milliseconds, when measured. */
  readonly latencyMs?: number;
  /** Model identifier requested by Judge. */
  readonly model: string;
  /** Upstream provider selected by the gateway, when reported. */
  readonly provider?: string;
  /**
   * Provider-specific diagnostic data.
   *
   * @remarks Its shape is not a stable Judge API.
   */
  readonly raw?: unknown;
  /** Provider or gateway request identifier for diagnostic correlation. */
  readonly requestId?: string;
  /** Concrete model selected by the gateway, when reported. */
  readonly resolvedModel?: string;
  /** Provider-reported token usage, when available. */
  readonly usage?: {
    /** Number of input tokens reported by the provider. */
    readonly inputTokens?: number;
    /** Number of output tokens reported by the provider. */
    readonly outputTokens?: number;
  };
}

/** Raw provider output and optional gateway diagnostics for an evaluation. */
export interface GatewayEvaluationResult {
  /**
   * Untrusted provider response consumed and validated by Judge's decision
   * provider before it can become a public decision.
   */
  readonly body: unknown;
  /** Optional request, model, latency, and usage diagnostics. */
  readonly metadata?: GatewayMetadata;
}

/** A validated adapter between Judge's Jev protocol and a model gateway. */
export interface GatewayPlugin {
  /** Immutable feature flags used to validate gateway compatibility. */
  readonly capabilities: Readonly<GatewayCapabilities>;
  /**
   * Sends a Jev evaluation through the gateway.
   *
   * @remarks Implementations may initiate remote, potentially billable work.
   * They must honor cancellation and timeouts where the transport supports
   * them and return untrusted raw output for Judge to validate.
   */
  readonly evaluate: (
    request: GatewayEvaluationRequest,
    options?: GatewayRequestOptions
  ) => Promise<GatewayEvaluationResult>;
  /** Stable, non-empty adapter identifier used in diagnostics. */
  readonly id: string;
  /** Default model identifier used by the adapter. */
  readonly model: string;
}
