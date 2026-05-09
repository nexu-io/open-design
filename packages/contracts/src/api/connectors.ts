import type { BoundedJsonObject, BoundedJsonValue } from './live-artifacts';

export type ConnectorStatus = 'available' | 'connected' | 'error' | 'disabled';

export type ConnectorToolSideEffect = 'read' | 'write' | 'destructive' | 'unknown';

export type ConnectorToolApproval = 'auto' | 'confirm' | 'disabled';

export type ConnectorToolUseCase = 'personal_daily_digest';

export interface ConnectorToolSafety {
  sideEffect: ConnectorToolSideEffect;
  approval: ConnectorToolApproval;
  reason: string;
}

export interface ConnectorToolCuration {
  useCases?: ConnectorToolUseCase[];
  reason?: string;
}

export interface ConnectorToolDetail {
  name: string;
  title: string;
  description?: string;
  inputSchemaJson?: BoundedJsonObject;
  outputSchemaJson?: BoundedJsonObject;
  safety: ConnectorToolSafety;
  refreshEligible: boolean;
  curation?: ConnectorToolCuration;
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
  /**
   * Runtime execution allowlist. Subset of `tools` — the catalog's
   * static curation plus any provider-discovered tools that are
   * read-only with auto approval. Used by the agent layer to gate
   * which tools are invocable. Note: this list **grows** on Composio
   * hydration (a GitHub-style provider can add tens of read tools to
   * the catalog baseline of 2), so it is not the right anchor for a
   * stable UI summary count — see `curatedToolNames` for that.
   *
   * Optional in the type only to keep test fixtures terse — the daemon
   * always populates this from `connectorDefinitionToDetail` so wire
   * payloads are guaranteed to carry it.
   */
  allowedToolNames?: string[];
  /**
   * Hand-curated catalog subset. Stable across hydration: never
   * extended by provider discovery, only the static catalog names.
   * UIs surfacing a single "N tools" summary (the connector card and
   * drawer header badges) should read this so the displayed count
   * doesn't lurch when an API key flips on (issue #748). The full
   * provider inventory is still discoverable in the drawer's tools
   * section, which renders `tools` directly.
   *
   * Optional in the type only for fixture brevity, see `allowedToolNames`.
   */
  curatedToolNames?: string[];
  toolCount?: number;
  toolsNextCursor?: string;
  toolsHasMore?: boolean;
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

export interface ConnectorAuthConfigPrepareRequest {
  connectorIds: string[];
}

export type ConnectorAuthConfigPrepareResult =
  | { status: 'ready'; authConfigId: string }
  | { status: 'custom_required'; message: string }
  | { status: 'error'; message: string };

export interface ConnectorAuthConfigPrepareResponse {
  results: Record<string, ConnectorAuthConfigPrepareResult>;
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
