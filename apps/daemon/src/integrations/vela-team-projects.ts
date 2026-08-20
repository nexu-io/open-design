import type { ProjectSyncState } from '@open-design/contracts';
import type { ResourceHubPrincipal } from '../collab/resource-principal.js';

export type VelaTeamProjectSyncState =
  | 'pending_upload'
  | 'syncing'
  | 'synced'
  | 'failed';

export interface VelaTeamProjectRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  resourceId: string;
  ownerMemberId: string;
  displayName: string | null;
  syncState: VelaTeamProjectSyncState;
  lastSyncedVersionId: string | null;
  createdAt: string;
  /** Owner-origin project timestamp from the catalog row's metadata. This is
   * distinct from `updatedAt`, which is the catalog row revision time and may
   * be restamped by a delayed retry. */
  originProjectUpdatedAt: number | null;
  updatedAt: string;
  access: {
    canView: boolean;
    canComment: boolean;
    canEdit: boolean;
    frozen: boolean;
  };
}

export interface UpsertVelaTeamProjectInput {
  projectId: string;
  resourceId: string;
  displayName?: string | null;
  syncState?: VelaTeamProjectSyncState;
  lastSyncedVersionId?: string | null;
}

export interface VelaTeamProjectCatalogClient {
  list(principal: ResourceHubPrincipal): Promise<VelaTeamProjectRecord[]>;
  upsert(
    input: UpsertVelaTeamProjectInput,
    principal: ResourceHubPrincipal,
  ): Promise<VelaTeamProjectRecord | null>;
}

export function projectResourceIdFor(
  projectId: string,
  principal?: ResourceHubPrincipal | null,
): string {
  if (!principal) return `project-${projectId}`;
  const scoped = Buffer.from(
    JSON.stringify([principal.teamId, principal.memberId, projectId]),
    'utf8',
  ).toString('base64url');
  return `project-${scoped}`;
}

export function projectSyncStateToVela(
  state: ProjectSyncState,
): VelaTeamProjectSyncState {
  if (state === 'synced') return 'synced';
  if (state === 'sync_failed') return 'failed';
  return 'pending_upload';
}

export function velaProjectSyncStateToProject(
  state: VelaTeamProjectSyncState,
): ProjectSyncState {
  if (state === 'synced') return 'synced';
  if (state === 'failed') return 'sync_failed';
  return 'pending_upload';
}
