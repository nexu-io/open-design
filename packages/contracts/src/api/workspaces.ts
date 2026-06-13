export type OrchestratorWorkspaceKind = 'scratch';
export type OrchestratorWorkspaceWriteback = 'external';

export interface OrchestratorWorkspace {
  kind: OrchestratorWorkspaceKind;
  sourceLabel?: string;
  sourceRef?: string;
  baseRevision?: string;
  writeback?: OrchestratorWorkspaceWriteback;
}

export type RunWorkspaceStorageKind = 'od-owned' | 'folder-backed';

export interface RunWorkspaceStorage {
  kind: RunWorkspaceStorageKind;
  baseDir: string | null;
}

export type RunWorkspaceProvenanceKind =
  | 'user-local'
  | 'orchestrator-scratch';

export type RunWorkspaceWriteback = 'in-place' | 'external';

export interface RunWorkspaceProvenance {
  kind: RunWorkspaceProvenanceKind;
  writeback: RunWorkspaceWriteback;
  sourceLabel?: string;
  sourceRef?: string;
  baseRevision?: string;
}

export interface RunWorkspace {
  storage: RunWorkspaceStorage;
  provenance: RunWorkspaceProvenance | null;
}
