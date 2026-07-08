import { randomUUID } from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';

import type Database from 'better-sqlite3';
import type { ResourceDetailResponse } from '@open-design/contracts';

import {
  type ResourceHubClient,
  type ResourceHubPrincipal,
  type VersionRecord,
  createResourceHubClient,
  readResourceHubPrincipal,
} from '../integrations/resource-hub.js';
import { materializeRef, packTree, pushTree } from '../resource-drive.js';
import { findSkillById, listSkills } from '../skills.js';
import {
  ResourceAdapterError,
  type AdapterPaths,
  createAdapterRegistry,
} from './adapters.js';
import { getInstalledPlugin } from '../plugins/registry.js';
import {
  getSharedByHub,
  getSharedByLocal,
  listSharedForTeam,
  type SharedResource,
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

export async function readResourceDetail(
  client: ResourceHubClient,
  principal: ResourceHubPrincipal,
  hubResourceId: string,
): Promise<ResourceDetailResponse> {
  const resource = await client.getResource(principal, hubResourceId);
  const versions = await client.listVersions(principal, hubResourceId);
  const latest = await resolveLatestVersion(
    client,
    principal,
    hubResourceId,
    versions,
  );
  const manifest = latest
    ? await client.getManifest(principal, latest.manifestDigest)
    : null;
  return { resource, versions, manifest };
}

export function createSharingOrchestrator(deps: SharingDeps) {
  const adapters = createAdapterRegistry(deps.paths, {
    resolveSkillSourceDir: async (localId) =>
      findSkillById(await listSkills(deps.paths.SKILL_ROOTS), localId)?.dir ?? null,
    resolvePluginSourceDir: (localId) =>
      getInstalledPlugin(deps.db, localId)?.fsPath ?? null,
  });
  const client = createResourceHubClient();
  const shareLocks = new Map<string, Promise<void>>();

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
      const canonicalLocalId = canonicalizeLocalId(kind, localId);
      return withShareLock(principal.teamId, kind, canonicalLocalId, async () => {
        const adapter = adapterOrThrow(kind);
        const dir = await resolveAdapterPath(() =>
          adapter.resolveSourceDir(canonicalLocalId),
        );
        if (!dir) {
          throw new SharingError(404, 'local_resource_not_found', canonicalLocalId);
        }
        const existing = getSharedByLocal(
          deps.db,
          principal.teamId,
          kind,
          canonicalLocalId,
        );
        const rawExisting =
          canonicalLocalId === localId
            ? null
            : getSharedByLocal(deps.db, principal.teamId, kind, localId);
        if (existing?.role === 'consumer' || rawExisting?.role === 'consumer') {
          throw new SharingError(
            409,
            'consumer_mapping_conflict',
            'pulled resources cannot be promoted to owner mappings',
          );
        }
        const packed = await packTree(dir);
        let hubResourceId = existing?.hubResourceId;
        if (!hubResourceId) {
          hubResourceId = (await client.createResource(principal, { kind })).id;
          upsertShared(deps.db, {
            kind,
            localId: canonicalLocalId,
            hubResourceId,
            hubTeamId: principal.teamId,
            role: 'owner',
            lastSyncedVersion: null,
            updatedAt: new Date().toISOString(),
          });
        }
        const version = await pushTree(client, principal, hubResourceId, packed, {
          ref: 'latest',
        });
        upsertShared(deps.db, {
          kind,
          localId: canonicalLocalId,
          hubResourceId,
          hubTeamId: principal.teamId,
          role: 'owner',
          lastSyncedVersion: version.version,
          updatedAt: new Date().toISOString(),
        });
        return { hubResourceId, version: version.version };
      });
    },

    // Pull a shared team resource: materialize its latest tree into a read-only
    // team-copy dir, record the consumer mapping.
    async pull(kind: string, hubResourceId: string) {
      const principal = principalOrThrow();
      const adapter = adapterOrThrow(kind);
      const dir = await resolveAdapterPath(() => adapter.teamCopyDir(hubResourceId));
      const resource = await client.getResource(principal, hubResourceId);
      if (resource.kind !== kind) {
        throw new SharingError(
          409,
          'resource_kind_mismatch',
          `resource ${hubResourceId} is ${resource.kind}, not ${kind}`,
        );
      }
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
      const latest = await replaceWithMaterializedRef(
        principal,
        hubResourceId,
        dir,
      );
      // Idempotent: the namespaced consumer key updates the consumer row on
      // re-pull without occupying the editable local-id namespace.
      upsertShared(deps.db, {
        kind,
        localId: consumerLocalId(hubResourceId),
        hubResourceId,
        hubTeamId: principal.teamId,
        role: 'consumer',
        lastSyncedVersion: latest.version,
        updatedAt: new Date().toISOString(),
      });
      return { dir, version: latest.version, alreadyOwned: false };
    },

    // Full detail of one hub resource for inspection: the record, its version
    // history, and the latest version's manifest (paths -> blob digests). Makes
    // the content-addressed core model visible.
    async detail(hubResourceId: string) {
      const principal = principalOrThrow();
      return readResourceDetail(client, principal, hubResourceId);
    },

    // Team resources from the hub, joined with local mapping state (shared /
    // pulled / stale).
    async list() {
      const principal = principalOrThrow();
      const remote = await client.listResources(principal);
      const local = listSharedForTeam(deps.db, principal.teamId);
      const byHub = new Map(
        local.map((entry) => [
          entry.hubResourceId,
          externalizeSharedResource(entry),
        ]),
      );
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
  ): Promise<VersionRecord> {
    const parent = path.dirname(dir);
    const basename = path.basename(dir);
    await fsp.mkdir(parent, { recursive: true });
    const tempDir = path.join(parent, `.${basename}.tmp-${randomUUID()}`);
    const backupDir = path.join(parent, `.${basename}.previous-${randomUUID()}`);
    let movedExisting = false;
    let installed = false;
    try {
      const latest = await materializeRef(
        client,
        principal,
        hubResourceId,
        'latest',
        tempDir,
      );
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
      return latest;
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

  async function withShareLock<T>(
    teamId: string,
    kind: string,
    localId: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const key = `${teamId}\0${kind}\0${localId}`;
    const previous = shareLocks.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(run);
    const currentSettled = current.then(
      () => undefined,
      () => undefined,
    );
    shareLocks.set(key, currentSettled);
    try {
      return await current;
    } finally {
      if (shareLocks.get(key) === currentSettled) {
        shareLocks.delete(key);
      }
    }
  }
}

export type SharingOrchestrator = ReturnType<typeof createSharingOrchestrator>;

async function resolveAdapterPath<T>(resolve: () => T | Promise<T>): Promise<T> {
  try {
    return await resolve();
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

function canonicalizeLocalId(kind: string, localId: string): string {
  if (kind !== 'design_system' || localId.startsWith('user:')) {
    return localId;
  }
  return `user:${localId}`;
}

function consumerLocalId(hubResourceId: string): string {
  return `consumer:${hubResourceId}`;
}

function externalizeSharedResource(entry: SharedResource): SharedResource {
  if (entry.role !== 'consumer') {
    return entry;
  }
  return {
    ...entry,
    localId: externalConsumerLocalId(entry.localId),
  };
}

function externalConsumerLocalId(localId: string): string {
  const prefix = 'consumer:';
  return localId.startsWith(prefix) ? localId.slice(prefix.length) : localId;
}

async function resolveLatestVersion(
  client: ResourceHubClient,
  principal: ResourceHubPrincipal,
  hubResourceId: string,
  versions: VersionRecord[],
): Promise<VersionRecord | null> {
  if (versions.length === 0) {
    return null;
  }
  const refRecord = await client.getRef(principal, hubResourceId, 'latest');
  const latest = versions.find(
    (candidate) => candidate.id === refRecord.versionId,
  );
  if (!latest) {
    throw new Error(
      `ref latest points at unknown version ${refRecord.versionId}`,
    );
  }
  return latest;
}
