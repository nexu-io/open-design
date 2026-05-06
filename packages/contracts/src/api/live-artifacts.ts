import type { JsonPrimitive } from '../common';

export type BoundedJsonValue =
  | JsonPrimitive
  | BoundedJsonValue[]
  | { [key: string]: BoundedJsonValue };

export interface BoundedJsonObject {
  [key: string]: BoundedJsonValue;
}

export type LiveArtifactStatus = 'active' | 'archived' | 'error';

export type LiveArtifactRefreshStatus = 'never' | 'idle' | 'running' | 'succeeded' | 'failed';

export type LiveArtifactPreviewType = 'html' | 'jsx' | 'markdown';

export type LiveArtifactSourceType = 'local_file' | 'daemon_tool' | 'connector_tool';

export type LiveArtifactConnectorApprovalPolicy =
  | 'read_only_auto'
  | 'manual_refresh_granted_for_read_only';

export type LiveArtifactRefreshPermission = 'none' | 'manual_refresh_granted_for_read_only';

export type LiveArtifactOutputTransform = 'identity' | 'compact_table' | 'metric_summary';

export type LiveArtifactProvenanceGenerator = 'agent' | 'refresh_runner';

export type LiveArtifactProvenanceSourceType = 'connector' | 'local_file' | 'user_input' | 'derived';

export interface LiveArtifactPreview {
  type: LiveArtifactPreviewType;
  entry: string;
}

export interface LiveArtifactDocument {
  format: 'html_template_v1';
  templatePath: 'template.html';
  generatedPreviewPath: 'index.html';
  dataPath: 'data.json';
  /** Derived cache hydrated from dataPath in API responses; data.json is canonical. */
  dataJson: BoundedJsonObject;
  dataSchemaJson?: BoundedJsonObject;
  sourceJson?: LiveArtifactSource;
}

export interface LiveArtifactSource {
  type: LiveArtifactSourceType;
  toolName?: string;
  input: BoundedJsonObject;
  connector?: {
    connectorId: string;
    accountLabel?: string;
    toolName: string;
    approvalPolicy?: LiveArtifactConnectorApprovalPolicy;
  };
  outputMapping?: {
    dataPaths?: Array<{ from: string; to: string }>;
    transform?: LiveArtifactOutputTransform;
  };
  refreshPermission: LiveArtifactRefreshPermission;
}

export interface LiveArtifactProvenanceSource {
  label: string;
  type: LiveArtifactProvenanceSourceType;
  ref?: string;
}

export interface LiveArtifactProvenance {
  generatedAt: string;
  generatedBy: LiveArtifactProvenanceGenerator;
  notes?: string;
  sources: LiveArtifactProvenanceSource[];
}

export interface LiveArtifact {
  schemaVersion: 1;
  id: string;
  projectId: string;
  sessionId?: string;
  createdByRunId?: string;
  title: string;
  slug: string;
  status: LiveArtifactStatus;
  pinned: boolean;
  preview: LiveArtifactPreview;
  refreshStatus: LiveArtifactRefreshStatus;
  createdAt: string;
  updatedAt: string;
  lastRefreshedAt?: string;
  document: LiveArtifactDocument;
}

export type LiveArtifactDaemonOwnedInputField =
  | 'id'
  | 'projectId'
  | 'createdAt'
  | 'updatedAt'
  | 'createdByRunId'
  | 'schemaVersion'
  | 'refreshStatus'
  | 'lastRefreshedAt';

export type LiveArtifactRejectDaemonOwnedInputFields = {
  [Field in LiveArtifactDaemonOwnedInputField]?: never;
};

export type LiveArtifactCreateInput = LiveArtifactRejectDaemonOwnedInputFields & {
  title: string;
  slug?: string;
  sessionId?: string;
  pinned?: boolean;
  status?: LiveArtifactStatus;
  preview: LiveArtifactPreview;
  document: LiveArtifactDocument;
};

export type LiveArtifactUpdateInput = LiveArtifactRejectDaemonOwnedInputFields & {
  title?: string;
  slug?: string;
  pinned?: boolean;
  status?: LiveArtifactStatus;
  preview?: LiveArtifactPreview;
  document?: LiveArtifactDocument;
};

export type LiveArtifactSummary = Omit<LiveArtifact, 'document'> & {
  hasDocument: boolean;
};

export interface LiveArtifactListResponse {
  artifacts: LiveArtifactSummary[];
}

export interface LiveArtifactDetailResponse {
  artifact: LiveArtifact;
}

export interface LiveArtifactRefreshResponse {
  artifact: LiveArtifact;
  refresh: {
    id: string;
    status: 'succeeded';
    refreshedSourceCount: number;
  };
}

export type LiveArtifactRefreshStepStatus = 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped';

export interface LiveArtifactRefreshErrorRecord {
  code?: string;
  message: string;
  path?: string;
}

export interface LiveArtifactRefreshSourceMetadata {
  sourceType: 'document';
  toolName?: string;
  connector?: {
    connectorId: string;
    accountLabel?: string;
    toolName: string;
    approvalPolicy?: LiveArtifactConnectorApprovalPolicy;
  };
}

export interface LiveArtifactRefreshLogEntry {
  schemaVersion: 1;
  projectId: string;
  artifactId: string;
  refreshId: string;
  sequence: number;
  step: string;
  status: LiveArtifactRefreshStepStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  source?: LiveArtifactRefreshSourceMetadata;
  error?: LiveArtifactRefreshErrorRecord;
  metadata?: BoundedJsonObject;
  createdAt: string;
}

export interface LiveArtifactRefreshLogResponse {
  refreshes: LiveArtifactRefreshLogEntry[];
}
