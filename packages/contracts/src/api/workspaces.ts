export type OrchestratorWorkspaceKind = 'scratch';
export type OrchestratorWorkspaceWriteback = 'external';

export interface OrchestratorWorkspace {
  kind: OrchestratorWorkspaceKind;
  sourceLabel?: string;
  sourceRef?: string;
  baseRevision?: string;
  writeback?: OrchestratorWorkspaceWriteback;
}
