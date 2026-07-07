import type Database from 'better-sqlite3';

import {
  type ResourceHubPrincipal,
  createResourceHubClient,
  readResourceHubPrincipal,
} from '../integrations/resource-hub.js';
import { materializeRef, packTree, pushTree } from '../resource-drive.js';
import { type AdapterPaths, createAdapterRegistry } from './adapters.js';
import {
  getSharedByHub,
  getSharedByLocal,
  listSharedForTeam,
  upsertShared,
} from './store.js';

type SqliteDb = Database.Database;

// Consumer-layer orchestration for team resource sharing. Composes a kind
// adapter (on-disk layout) + the neutral cloud-drive SDK (tree<->hub) + the
// local mapping store. Knows nothing about blob transport or wire shapes.

// Local (non-hub) failures surface as SharingError; hub failures propagate as
// ResourceHubError from the client. Routes map both onto HTTP.
export class SharingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'SharingError';
  }
}

export interface SharingDeps {
  db: SqliteDb;
  paths: AdapterPaths;
}

export function createSharingOrchestrator(deps: SharingDeps) {
  const adapters = createAdapterRegistry(deps.paths);
  const client = createResourceHubClient();

  function principalOrThrow(): ResourceHubPrincipal {
    const principal = readResourceHubPrincipal();
    if (!principal) {
      throw new SharingError(
        401,
        'workspace_principal_unavailable',
        'set OD_WORKSPACE_MEMBER_ID and OD_WORKSPACE_TEAM_ID',
      );
    }
    return principal;
  }

  function adapterOrThrow(kind: string) {
    const adapter = adapters.get(kind);
    if (!adapter) {
      throw new SharingError(400, 'unsupported_kind', `unknown kind: ${kind}`);
    }
    return adapter;
  }

  return {
    // Share a locally-owned resource: pack its dir, push a new version (reusing
    // the hub resource if already mapped), record the owner mapping.
    async share(kind: string, localId: string) {
      const principal = principalOrThrow();
      const adapter = adapterOrThrow(kind);
      const dir = adapter.resolveSourceDir(localId);
      if (!dir) {
        throw new SharingError(404, 'local_resource_not_found', localId);
      }
      const packed = await packTree(dir);
      const existing = getSharedByLocal(deps.db, kind, localId);
      const hubResourceId =
        existing?.hubResourceId ??
        (await client.createResource(principal, { kind })).id;
      const version = await pushTree(client, principal, hubResourceId, packed, {
        ref: 'latest',
      });
      upsertShared(deps.db, {
        kind,
        localId,
        hubResourceId,
        hubTeamId: principal.teamId,
        role: 'owner',
        lastSyncedVersion: version.version,
        updatedAt: new Date().toISOString(),
      });
      return { hubResourceId, version: version.version };
    },

    // Pull a shared team resource: materialize its latest tree into a read-only
    // team-copy dir, record the consumer mapping.
    async pull(kind: string, hubResourceId: string) {
      const principal = principalOrThrow();
      const adapter = adapterOrThrow(kind);
      const existing = getSharedByHub(deps.db, principal.teamId, hubResourceId);
      // You own this locally already; pulling would overwrite your editable
      // source, so it is a no-op.
      if (existing?.role === 'owner') {
        return {
          dir: null,
          version: existing.lastSyncedVersion,
          alreadyOwned: true,
        };
      }
      const dir = adapter.teamCopyDir(hubResourceId);
      await materializeRef(client, principal, hubResourceId, 'latest', dir);
      const versions = await client.listVersions(principal, hubResourceId);
      const latest = versions[0]?.version ?? null;
      // Idempotent: same PK (kind, hubResourceId) updates the consumer row on
      // re-pull, so the (hub_team_id, hub_resource_id) unique index never trips.
      upsertShared(deps.db, {
        kind,
        localId: hubResourceId,
        hubResourceId,
        hubTeamId: principal.teamId,
        role: 'consumer',
        lastSyncedVersion: latest,
        updatedAt: new Date().toISOString(),
      });
      return { dir, version: latest, alreadyOwned: false };
    },

    // Team resources from the hub, joined with local mapping state (shared /
    // pulled / stale).
    async list() {
      const principal = principalOrThrow();
      const remote = await client.listResources(principal);
      const local = listSharedForTeam(deps.db, principal.teamId);
      const byHub = new Map(local.map((entry) => [entry.hubResourceId, entry]));
      return remote.map((resource) => ({
        ...resource,
        local: byHub.get(resource.id) ?? null,
      }));
    },
  };
}

export type SharingOrchestrator = ReturnType<typeof createSharingOrchestrator>;
