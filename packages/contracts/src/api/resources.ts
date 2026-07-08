export type ResourceKind = 'design_system' | 'plugin' | 'skill' | 'project';

export interface ResourceRecord {
  id: string;
  teamId: string;
  kind: string;
  ownerMemberId: string;
  createdAt: string;
  deletedAt: string | null;
}

export type ResourceLocalRole = 'owner' | 'consumer';

export interface ResourceLocalMapping {
  kind: string;
  localId: string;
  hubResourceId: string;
  hubTeamId: string;
  role: ResourceLocalRole;
  lastSyncedVersion: number | null;
  updatedAt: string;
}

export interface ResourceSummary extends ResourceRecord {
  local: ResourceLocalMapping | null;
}

export interface ResourceVersionRecord {
  id: string;
  resourceId: string;
  version: number;
  manifestDigest: string;
  createdByMemberId: string;
  createdAt: string;
}

export interface ResourceManifestEntry {
  path: string;
  type: 'file' | 'dir' | 'symlink';
  executable: boolean;
  blobDigest: string | null;
  symlinkTarget: string | null;
}

export interface ResourceManifest {
  digest: string;
  entries: ResourceManifestEntry[];
}

export interface ResourceSnapshotRecord {
  slug: string;
  name: string;
  kind: string;
  versionId: string;
  createdAt: string;
}

export interface PublicSnapshotResponse {
  slug: string;
  name: string;
  kind: string;
  createdAt: string;
  manifest: ResourceManifest | null;
}

export interface ResourceListResponse {
  resources: ResourceSummary[];
}

export interface ResourceDetailResponse {
  resource: ResourceRecord;
  versions: ResourceVersionRecord[];
  manifest: ResourceManifest | null;
}
