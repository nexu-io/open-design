import type { BoundedJsonObject, BoundedJsonValue } from './live-artifacts';

export type ConnectorStatus = 'available' | 'connected' | 'error' | 'disabled';

export type ConnectorToolSideEffect = 'read' | 'write' | 'destructive' | 'unknown';

export type ConnectorToolApproval = 'auto' | 'confirm' | 'disabled';

export interface ConnectorToolSafety {
  sideEffect: ConnectorToolSideEffect;
  approval: ConnectorToolApproval;
  reason: string;
}

export interface ConnectorToolDetail {
  name: string;
  title: string;
  description?: string;
  inputSchemaJson?: BoundedJsonObject;
  outputSchemaJson?: BoundedJsonObject;
  safety: ConnectorToolSafety;
  refreshEligible: boolean;
}

export interface ConnectorDetail {
  id: string;
  name: string;
  provider: string;
  category: string;
  description?: string;
  status: ConnectorStatus;
  accountLabel?: string;
  tools: ConnectorToolDetail[];
  featuredToolNames?: string[];
  minimumApproval?: ConnectorToolApproval;
  lastError?: string;
  auth?: ConnectorAuthDetail;
}

export interface ConnectorAuthDetail {
  provider: 'local' | 'none' | 'oauth' | 'composio';
  configured: boolean;
}

export interface ConnectorListResponse {
  connectors: ConnectorDetail[];
}

export interface ConnectorStatusSummary {
  status: ConnectorStatus;
  accountLabel?: string;
  lastError?: string;
}

export interface ConnectorStatusResponse {
  statuses: Record<string, ConnectorStatusSummary>;
}

export interface ConnectorDiscoveryMeta {
  provider: 'composio';
  refreshRequested?: boolean;
}

export interface ConnectorDiscoveryResponse extends ConnectorListResponse {
  meta?: ConnectorDiscoveryMeta;
}

export interface ConnectorDetailResponse {
  connector: ConnectorDetail;
}

export interface ConnectorConnectResponse extends ConnectorDetailResponse {
  auth?: {
    kind: 'redirect_required' | 'pending' | 'connected';
    redirectUrl?: string;
    providerConnectionId?: string;
    expiresAt?: string;
  };
}

export interface ConnectorExecuteRequest {
  connectorId: string;
  toolName: string;
  input: BoundedJsonObject;
}

export interface ConnectorExecuteResponse {
  ok: true;
  connectorId: string;
  accountLabel?: string;
  toolName: string;
  safety: ConnectorToolSafety;
  output: BoundedJsonValue;
  outputSummary?: string;
  providerExecutionId?: string;
  metadata?: BoundedJsonObject;
}
