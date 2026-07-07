import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type Database from 'better-sqlite3';

import {
  type ResourceHubPrincipal,
  createResourceHubClient,
  readResourceHubPrincipal,
} from '../integrations/resource-hub.js';
import { materializeRef, packTree, pushTree } from '../resource-drive.js';
import {
  ResourceAdapterError,
  type AdapterPaths,
  createAdapterRegistry,
} from './adapters.js';
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
      const dir = resolveAdapterPath(() => adapter.resolveSourceDir(localId));
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
      const dir = resolveAdapterPath(() => adapter.teamCopyDir(hubResourceId));
      await replaceWithMaterializedRef(principal, hubResourceId, dir);
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

    // Full detail of one hub resource for inspection: the record, its version
    // history, and the latest version's manifest (paths -> blob digests). Makes
    // the content-addressed core model visible.
    async detail(hubResourceId: string) {
      const principal = principalOrThrow();
      const resource = await client.getResource(principal, hubResourceId);
      const versions = await client.listVersions(principal, hubResourceId);
      const latest = versions[0];
      const manifest = latest
        ? await client.getManifest(principal, latest.manifestDigest)
        : null;
      return { resource, versions, manifest };
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

  async function replaceWithMaterializedRef(
    principal: ResourceHubPrincipal,
    hubResourceId: string,
    dir: string,
  ): Promise<void> {
    const parent = path.dirname(dir);
    const basename = path.basename(dir);
    await fsp.mkdir(parent, { recursive: true });
    const tempDir = path.join(parent, `.${basename}.tmp-${randomUUID()}`);
    const backupDir = path.join(parent, `.${basename}.previous-${randomUUID()}`);
    let movedExisting = false;
    let installed = false;
    try {
      await materializeRef(client, principal, hubResourceId, 'latest', tempDir);
      try {
        await fsp.rename(dir, backupDir);
        movedExisting = true;
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
      await fsp.rename(tempDir, dir);
      installed = true;
      if (movedExisting) {
        await fsp.rm(backupDir, { recursive: true, force: true });
      }
    } catch (error) {
      await fsp.rm(tempDir, { recursive: true, force: true });
      if (movedExisting && !installed) {
        await fsp.rename(backupDir, dir).catch(async () => {
          await fsp.rm(backupDir, { recursive: true, force: true });
        });
      } else {
        await fsp.rm(backupDir, { recursive: true, force: true });
      }
      throw error;
    }
  }
}

export type SharingOrchestrator = ReturnType<typeof createSharingOrchestrator>;

function resolveAdapterPath<T>(resolve: () => T): T {
  try {
    return resolve();
  } catch (error) {
    if (error instanceof ResourceAdapterError) {
      throw new SharingError(error.status, error.code, error.message);
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
