import type { ConnectionTestKind, ConnectionTestProtocol } from './connectionTest';
import type { ReasoningExecutionRequestFields } from './reasoningExecution';
import type { AgentModelOption } from './registry';

export type ProviderModelsKind =
  | ConnectionTestKind
  | 'no_models'
  | 'unsupported_protocol';

export interface ProviderModelsRequest extends ReasoningExecutionRequestFields {
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
  /**
   * The provider answered with its curated fallback rather than a live
   * catalogue. Present only for providers that have one (OrcaRouter); its
   * absence means `models` is live when `ok` is true.
   *
   * Carried so a picker can tell a degraded list from a live one: the caller
   * must use a successful live response alone (an empty one included) and fall
   * back to `models` only here.
   */
  degraded?: boolean;
  /**
   * Metadata-preserving fallback rows for the degraded case. Distinct from
   * `models` so a caller can never merge unverified rows into a live list.
   */
  seedModels?: ProviderModelOption[];
}
