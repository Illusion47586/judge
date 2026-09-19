import type { GatewayPlugin } from "../../gateway/types.ts";

export interface CreateJevProviderOptions {
  readonly gateway: GatewayPlugin;
  readonly model?: string;
  readonly timeoutMs?: number;
}
