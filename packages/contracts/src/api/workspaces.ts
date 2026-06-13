import type { ArtifactManifest } from './artifacts.js';

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

export const RUN_RESULT_PACKAGE_SCHEMA = 'open-design.run-result-package.v1' as const;

export interface RunResultPackageRun {
  id: string;
  status: string;
  projectId: string | null;
  conversationId: string | null;
  assistantMessageId: string | null;
  agentId: string | null;
  createdAt: number;
  updatedAt: number;
  cancelRequested?: boolean;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
  errorCode?: string | null;
}

export interface RunResultPackageArtifact {
  file: string;
  kind: string | null;
  renderer: string | null;
  title: string;
  status: string | null;
  manifest: ArtifactManifest;
}

export interface RunResultPackageResponse {
  schema: typeof RUN_RESULT_PACKAGE_SCHEMA;
  run: RunResultPackageRun;
  workspace: RunWorkspace;
  events: {
    logPath: string | null;
  };
  project: {
    id: string;
    name: string;
    fileCount: number;
  } | null;
  artifacts: RunResultPackageArtifact[];
}
