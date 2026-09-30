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
  // Bedrock only. Named AWS profile for the credential-chain auth mode; the
  // daemon then lists models through the AWS CLI and `apiKey` may be empty.
  awsProfile?: string;
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
