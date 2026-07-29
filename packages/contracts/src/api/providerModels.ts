import type { ConnectionTestKind, ConnectionTestProtocol } from './connectionTest';
import type { AgentModelOption } from './registry';

export type ProviderModelsKind =
  | ConnectionTestKind
  | 'no_models'
  | 'unsupported_protocol';

export interface ProviderModelsRequest {
  protocol: ConnectionTestProtocol;
  baseUrl: string;
  apiKey: string;
  // Azure only. Kept in the contract so the request shape can stay aligned
  // with provider testing, even though Azure model discovery is not supported.
  apiVersion?: string;
}

export type ProviderModelOption = AgentModelOption;

export interface ProviderModelsResponse {
  ok: boolean;
  kind: ProviderModelsKind;
  latencyMs: number;
  models?: ProviderModelOption[];
  status?: number;
  detail?: string;
}
