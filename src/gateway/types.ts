export type JevQuestion =
  | {
      readonly criteria?: {
        readonly false: string;
        readonly true: string;
      };
      readonly instructions: string;
      readonly type: "noul";
    }
  | {
      readonly criteria: Readonly<Record<string, string>>;
      readonly instructions: string;
      readonly type: "choice";
    }
  | {
      readonly criteria: readonly [string, string, ...string[]];
      readonly instructions: string;
      readonly type: "score";
    };

export interface GatewayEvaluationRequest {
  readonly model: string;
  readonly questions: Readonly<Record<string, JevQuestion>>;
  readonly state: unknown;
}

export interface GatewayRequestOptions {
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface GatewayCapabilities {
  readonly batching: boolean;
  readonly boolean: boolean;
  readonly choice: boolean;
  readonly customHeaders: boolean;
  readonly jev: boolean;
  readonly score: boolean;
}

export interface GatewayMetadata {
  readonly gateway: string;
  readonly latencyMs?: number;
  readonly model: string;
  readonly provider?: string;
  readonly raw?: unknown;
  readonly requestId?: string;
  readonly resolvedModel?: string;
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  };
}

export interface GatewayEvaluationResult {
  readonly body: unknown;
  readonly metadata?: GatewayMetadata;
}

export interface GatewayPlugin {
  readonly capabilities: Readonly<GatewayCapabilities>;
  readonly evaluate: (
    request: GatewayEvaluationRequest,
    options?: GatewayRequestOptions
  ) => Promise<GatewayEvaluationResult>;
  readonly id: string;
  readonly model: string;
}
