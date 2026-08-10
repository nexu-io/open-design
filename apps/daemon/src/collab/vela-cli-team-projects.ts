import type { ProjectMetadata, TeamProject } from '@open-design/contracts';
import type {
  UpsertVelaTeamProjectInput,
  VelaTeamProjectCatalogClient,
  VelaTeamProjectRecord,
  VelaTeamProjectSyncState,
} from '../integrations/vela-team-projects.js';
import {
  runVelaCommand,
  velaWorkspaceCommandOptions,
} from '../integrations/vela-command.js';
import type { ResourceHubPrincipal } from './resource-principal.js';
import { createSwrCache, type SwrCache } from './swr-cache.js';

const PROJECT_RESOURCE_PREFIX = 'project-';

export type RunVelaTeamProjects = (
  args: string[],
  workspaceId?: string,
) => Promise<string>;
export type RunVelaResources = (
  args: string[],
  workspaceId?: string,
) => Promise<string>;

interface VelaCliTeamProjectCatalogOptions {
  run?: RunVelaTeamProjects;
  runResource?: RunVelaResources;
  supportsTeamProjects?: () => boolean | Promise<boolean>;
}

export interface VelaTeamProjectCatalog {
  list(workspaceId: string): Promise<TeamProject[]>;
  get(projectId: string, workspaceId: string): Promise<TeamProject | null>;
  upsert(input: {
    projectId: string;
    resourceId?: string;
    displayName?: string | null;
    syncState?: 'pending_upload' | 'syncing' | 'synced' | 'failed';
    lastSyncedVersionId?: string | null;
    metadata?: Record<string, unknown> | null;
  }, principal?: ResourceHubPrincipal | null): Promise<void>;
  remove(projectId: string, principal?: ResourceHubPrincipal | null): Promise<void>;
}

export interface ScopedVelaTeamProjectCatalogClientCache
  extends VelaTeamProjectCatalogClient {
  /**
   * Invalidate one verified principal, or every principal when a caller only
   * knows that the shared catalog changed (for example after an unshare or a
   * hub event).
   */
  invalidate(principal?: ResourceHubPrincipal): void;
  /** Invalidate every member-scoped entry for one exact Workspace. */
  invalidateWorkspace(workspaceId: string): void;
}

type TeamProjectWire = {
  projectId?: unknown;
  resourceId?: unknown;
  ownerMemberId?: unknown;
  displayName?: unknown;
  syncState?: unknown;
  lastSyncedVersionId?: unknown;
  metadata?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type TeamProjectsListWire = {
  workspaceId?: unknown;
  projects?: unknown;
};

type SharedResourceWire = {
  id: string;
  teamId: string;
  kind: 'project';
  ownerMemberId: string;
  metadata?: unknown;
  createdAt: string;
  deletedAt?: null;
};

type SharedResourcesListWire = {
  resources?: unknown;
};

export function projectResourceId(projectId: string): string {
  return `${PROJECT_RESOURCE_PREFIX}${projectId}`;
}

export function createVelaCliTeamProjectCatalog(
  options: VelaCliTeamProjectCatalogOptions = {},
): VelaTeamProjectCatalog {
  const run = options.run ?? defaultRunVelaTeamProjects;
  const runResource = options.runResource ?? defaultRunVelaResources;
  const supportsTeamProjects = createTeamProjectsCapabilityCheck(
    run,
    options.supportsTeamProjects,
  );

  async function runJson<T>(
    args: string[],
    workspaceId: string,
  ): Promise<T> {
    const stdout = await run(args, workspaceId);
    const trimmed = stdout.trim();
    if (!trimmed) return {} as T;
    return JSON.parse(trimmed) as T;
  }

  async function list(workspaceId: string): Promise<TeamProject[]> {
    const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
    if (!(await supportsTeamProjects(resolvedWorkspaceId))) {
      const resources = await listSharedProjectResources(
        runResource,
        resolvedWorkspaceId,
      );
      return resources.map(toFallbackTeamProject);
    }
    const stdout = await run(['list'], resolvedWorkspaceId);
    const payload = stdout.trim()
      ? JSON.parse(stdout.trim()) as TeamProjectsListWire
      : {};
    return Array.isArray(payload.projects)
      ? payload.projects.map(toTeamProject).filter((project): project is TeamProject => project != null)
      : [];
  }

  let exactLookupUnavailable = false;

  return {
    list,

    async get(projectId, workspaceId): Promise<TeamProject | null> {
      const resolvedWorkspaceId = requireWorkspaceId(workspaceId);
      if (exactLookupUnavailable) {
        return (await list(resolvedWorkspaceId))
          .find((project) => project.projectId === projectId) ?? null;
      }

      try {
        const payload = await runJson<TeamProjectWire>([
          'get',
          projectId,
          '--json',
        ], resolvedWorkspaceId);
        return toTeamProject(payload);
      } catch (error) {
        if (isAuthoritativeTeamProjectNotFound(error)) return null;
        if (!isExactTeamProjectLookupUnavailable(error)) throw error;
        exactLookupUnavailable = true;
        return (await list(resolvedWorkspaceId))
          .find((project) => project.projectId === projectId) ?? null;
      }
    },

    async upsert(input, principal): Promise<void> {
      const workspaceId = requirePrincipalWorkspaceId(principal);
      // Older packaged Vela builds expose only the resource index. The project
      // push writes the same discovery metadata there, so no second catalog
      // write is required in compatibility mode.
      if (!(await supportsTeamProjects(workspaceId))) return;
      const args = [
        'upsert',
        input.projectId,
        '--resource-id',
        input.resourceId ?? projectResourceId(input.projectId),
      ];
      if (input.displayName?.trim()) args.push('--display-name', input.displayName.trim());
      if (input.syncState) args.push('--sync-state', input.syncState);
      if (input.lastSyncedVersionId?.trim()) {
        args.push('--last-synced-version-id', input.lastSyncedVersionId.trim());
      }
      if (input.metadata && Object.keys(input.metadata).length > 0) {
        args.push('--metadata-json', JSON.stringify(input.metadata));
      }
      await run(args, workspaceId);
    },

    async remove(projectId, principal): Promise<void> {
      const workspaceId = requirePrincipalWorkspaceId(principal);
      // The resource adapter removes the resource-index row in compatibility
      // mode; there is no separate catalog row to delete.
      if (!(await supportsTeamProjects(workspaceId))) return;
      await run(['remove', projectId], workspaceId);
    },
  };
}

export function createVelaCliTeamProjectCatalogClient(
  options: VelaCliTeamProjectCatalogOptions = {},
): VelaTeamProjectCatalogClient {
  const run = options.run ?? defaultRunVelaTeamProjects;
  const runResource = options.runResource ?? defaultRunVelaResources;
  const supportsTeamProjects = createTeamProjectsCapabilityCheck(
    run,
    options.supportsTeamProjects,
  );

  async function runJson<T>(args: string[], workspaceId: string): Promise<T> {
    const stdout = await run(args, workspaceId);
    const trimmed = stdout.trim();
    if (!trimmed) return {} as T;
    return JSON.parse(trimmed) as T;
  }

  return {
    async list(principal): Promise<VelaTeamProjectRecord[]> {
      // Capture before the first await. Capability detection may itself await,
      // during which another tab can switch the daemon's active Workspace.
      const workspaceId = principal.teamId.trim();
      if (!workspaceId) throw new Error('explicit workspace scope is required');
      if (!(await supportsTeamProjects(workspaceId))) {
        const resources = await listSharedProjectResources(
          runResource,
          workspaceId,
        );
        const records = resources.map(toFallbackVelaTeamProjectRecord);
        if (records.some((record) => record.workspaceId !== workspaceId)) {
          throw new Error('incomplete team project catalog: workspace mismatch');
        }
        return records;
      }
      const payload = await runJson<TeamProjectsListWire>(['list'], workspaceId);
      if (!Array.isArray(payload.projects)) {
        throw new Error('incomplete team project catalog: projects are missing');
      }
      const records = payload.projects.map((project) =>
        toVelaTeamProjectRecord(project),
      );
      if (records.some((project) => project == null)) {
        throw new Error('incomplete team project catalog: invalid project row');
      }
      const completeRecords = records as VelaTeamProjectRecord[];
      if (completeRecords.some((project) => project.workspaceId !== workspaceId)) {
        throw new Error('incomplete team project catalog: workspace mismatch');
      }
      return completeRecords;
    },

    async upsert(
      input: UpsertVelaTeamProjectInput,
      principal,
    ): Promise<VelaTeamProjectRecord | null> {
      const workspaceId = principal.teamId.trim();
      if (!workspaceId) throw new Error('explicit workspace scope is required');
      // See the catalog adapter above: resource push owns the fallback index.
      if (!(await supportsTeamProjects(workspaceId))) return null;
      const args = [
        'upsert',
        input.projectId,
        '--resource-id',
        input.resourceId,
      ];
      if (input.displayName?.trim()) args.push('--display-name', input.displayName.trim());
      if (input.syncState) args.push('--sync-state', input.syncState);
      if (input.lastSyncedVersionId?.trim()) {
        args.push('--last-synced-version-id', input.lastSyncedVersionId.trim());
      }
      const stdout = await run(args, workspaceId);
      return toVelaTeamProjectRecord(JSON.parse(stdout.trim()) as unknown);
    },
  };
}

/**
 * Short-lived read cache for request-scoped project catalogs.
 *
 * One cache instance is created per complete principal identity. The fetcher
 * closes over that immutable principal, so a daemon-wide Workspace switch can
 * neither change the request sent to Vela nor place B's response in A's entry.
 */
export function createScopedVelaTeamProjectCatalogClientCache(
  client: VelaTeamProjectCatalogClient,
  freshMs = 3000,
): ScopedVelaTeamProjectCatalogClientCache {
  const lists = new Map<string, SwrCache<VelaTeamProjectRecord[]>>();
  const workspaceIds = new Map<string, string>();
  const scopeKey = (principal: ResourceHubPrincipal): string =>
    JSON.stringify([
      principal.teamId,
      principal.memberId,
      principal.role,
      principal.lifecycleState,
      principal.workspaceType ?? null,
    ]);

  const invalidate = (principal?: ResourceHubPrincipal): void => {
    if (principal) {
      const key = scopeKey(principal);
      lists.get(key)?.invalidate();
      lists.delete(key);
      workspaceIds.delete(key);
      return;
    }
    for (const list of lists.values()) list.invalidate();
    lists.clear();
    workspaceIds.clear();
  };

  const invalidateWorkspace = (workspaceIdInput: string): void => {
    const workspaceId = workspaceIdInput.trim();
    if (!workspaceId) return;
    for (const [key, cachedWorkspaceId] of workspaceIds) {
      if (cachedWorkspaceId !== workspaceId) continue;
      lists.get(key)?.invalidate();
      lists.delete(key);
      workspaceIds.delete(key);
    }
  };

  return {
    list(principal) {
      const key = scopeKey(principal);
      let list = lists.get(key);
      if (!list) {
        const capturedPrincipal = { ...principal };
        list = createSwrCache(
          () => client.list(capturedPrincipal),
          () => key,
          freshMs,
        );
        lists.set(key, list);
        workspaceIds.set(key, capturedPrincipal.teamId);
      }
      return list();
    },
    async upsert(input, principal) {
      const result = await client.upsert(input, principal);
      invalidate(principal);
      return result;
    },
    invalidate,
    invalidateWorkspace,
  };
}

export function createVelaCliTeamProjectCatalogClientFromEnv(
  options: VelaCliTeamProjectCatalogOptions = {},
): VelaTeamProjectCatalogClient | null {
  return shouldUseVelaCliTeamProjectCatalog()
    ? createVelaCliTeamProjectCatalogClient(options)
    : null;
}

export function createVelaCliTeamProjectCatalogFromEnv(
  options: VelaCliTeamProjectCatalogOptions = {},
): VelaTeamProjectCatalog | null {
  return shouldUseVelaCliTeamProjectCatalog()
    ? createVelaCliTeamProjectCatalog(options)
    : null;
}

export function shouldUseVelaCliTeamProjectCatalog(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.OD_WORKSPACE_CONTEXT_SOURCE?.trim() === 'vela') return true;
  const explicitTransport = env.OD_TEAM_PROJECTS_TRANSPORT?.trim();
  if (explicitTransport) return explicitTransport === 'vela-cli';
  return env.OD_RESOURCE_TRANSPORT?.trim() === 'vela-cli';
}

function toTeamProject(input: unknown): TeamProject | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as TeamProjectWire;
  // A catalog row is discoverable only after project bytes are durable in the
  // resource hub. Older local data may still contain pending rows from the
  // previous fire-and-forget share flow; hide them so teammates do not open
  // empty project shells.
  if (typeof record.syncState === 'string' && record.syncState !== 'synced') {
    return null;
  }
  if (
    typeof record.projectId !== 'string' ||
    typeof record.ownerMemberId !== 'string' ||
    typeof record.createdAt !== 'string'
  ) {
    return null;
  }
  const project: TeamProject = {
    projectId: record.projectId,
    ownerMemberId: record.ownerMemberId,
    sharedAt: record.createdAt,
  };
  if (typeof record.displayName === 'string' && record.displayName.trim()) {
    project.name = record.displayName.trim();
  }
  const metadata = recordObject(record.metadata);
  if (metadata) {
    if (typeof metadata.skillId === 'string') project.skillId = metadata.skillId;
    if (typeof metadata.designSystemId === 'string') project.designSystemId = metadata.designSystemId;
    const projectMetadata = recordObject(metadata.metadata);
    if (projectMetadata) project.metadata = projectMetadata as unknown as ProjectMetadata;
    if (typeof metadata.createdAt === 'number') project.createdAt = metadata.createdAt;
    if (typeof metadata.updatedAt === 'number') project.updatedAt = metadata.updatedAt;
  }
  if (typeof record.updatedAt === 'string') {
    const updatedAt = Date.parse(record.updatedAt);
    if (Number.isFinite(updatedAt) && project.updatedAt === undefined) project.updatedAt = updatedAt;
  }
  const createdAt = Date.parse(record.createdAt);
  if (Number.isFinite(createdAt) && project.createdAt === undefined) project.createdAt = createdAt;
  return project;
}

function toVelaTeamProjectRecord(input: unknown): VelaTeamProjectRecord | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as TeamProjectWire & {
    id?: unknown;
    workspaceId?: unknown;
    access?: unknown;
    lastSyncedVersionId?: unknown;
  };
  if (
    typeof record.id !== 'string' ||
    typeof record.workspaceId !== 'string' ||
    typeof record.projectId !== 'string' ||
    typeof record.resourceId !== 'string' ||
    typeof record.ownerMemberId !== 'string' ||
    typeof record.syncState !== 'string' ||
    typeof record.createdAt !== 'string' ||
    typeof record.updatedAt !== 'string'
  ) {
    return null;
  }
  const access = record.access && typeof record.access === 'object' && !Array.isArray(record.access)
    ? record.access as Partial<VelaTeamProjectRecord['access']>
    : {};
  const metadata = recordObject(record.metadata);
  const originProjectUpdatedAt = metadata?.updatedAt;
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    projectId: record.projectId,
    resourceId: record.resourceId,
    ownerMemberId: record.ownerMemberId,
    displayName: typeof record.displayName === 'string' ? record.displayName : null,
    syncState: toVelaSyncState(record.syncState),
    lastSyncedVersionId: typeof record.lastSyncedVersionId === 'string' ? record.lastSyncedVersionId : null,
    createdAt: record.createdAt,
    originProjectUpdatedAt:
      typeof originProjectUpdatedAt === 'number' && Number.isFinite(originProjectUpdatedAt)
        ? originProjectUpdatedAt
        : null,
    updatedAt: record.updatedAt,
    access: {
      canView: access.canView ?? true,
      canComment: access.canComment ?? true,
      canEdit: access.canEdit ?? false,
      frozen: access.frozen ?? false,
    },
  };
}

function toVelaSyncState(value: string): VelaTeamProjectSyncState {
  if (value === 'syncing' || value === 'synced' || value === 'failed') return value;
  return 'pending_upload';
}

function recordObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isAuthoritativeTeamProjectNotFound(error: unknown): boolean {
  return errorMessage(error).includes('team_project_not_found');
}

/**
 * Compatibility is deliberately narrow. Only a CLI that lacks `get` (or its
 * `--json` flag), or a pre-endpoint API returning an untyped 404, may fall back
 * to the full catalog. Auth, permission, server, and network failures remain
 * hard failures so a pull can never authorize itself from stale/partial data.
 */
function isExactTeamProjectLookupUnavailable(error: unknown): boolean {
  const message = errorMessage(error);
  if (isAuthoritativeTeamProjectNotFound(error)) return false;
  return /unknown command ["']?(?:get|team-projects)["']?/i.test(message) ||
    /unknown flag:\s*--json/i.test(message) ||
    /API request failed with status 404(?!\s*:)/i.test(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createTeamProjectsCapabilityCheck(
  run: RunVelaTeamProjects,
  injected?: () => boolean | Promise<boolean>,
): (workspaceId: string) => Promise<boolean> {
  // The packaged dependency can lag the source-built CLI. Probe once per
  // adapter so source builds use the richer catalog while older builds retain
  // resource-index discovery without a version pin.
  let result: Promise<boolean> | null = null;
  return (workspaceId) => {
    const exactWorkspaceId = requireWorkspaceId(workspaceId);
    if (!injected && run === defaultRunVelaTeamProjects) {
      defaultTeamProjectsCapability ??= run(
        ['--help'],
        exactWorkspaceId,
      ).then(
        () => true,
        () => false,
      );
      return defaultTeamProjectsCapability;
    }
    result ??= injected
      ? Promise.resolve().then(injected)
      : run(['--help'], exactWorkspaceId).then(
          () => true,
          () => false,
        );
    return result;
  };
}

let defaultTeamProjectsCapability: Promise<boolean> | null = null;

async function listSharedProjectResources(
  runResource: RunVelaResources,
  workspaceId: string,
): Promise<SharedResourceWire[]> {
  const stdout = await runResource(['shared', '--json'], workspaceId);
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('incomplete shared project catalog: empty response');
  }
  const payload = JSON.parse(trimmed) as SharedResourcesListWire;
  if (!Array.isArray(payload.resources)) {
    throw new Error('incomplete shared project catalog: resources are missing');
  }
  const projectRows = payload.resources.filter(
    (value) =>
      Boolean(value)
      && typeof value === 'object'
      && (value as Record<string, unknown>).kind === 'project',
  );
  if (projectRows.some((value) => !isSharedProjectResource(value))) {
    throw new Error('incomplete shared project catalog: invalid project row');
  }
  return projectRows as SharedResourceWire[];
}

function requireWorkspaceId(workspaceId: string): string {
  const exactWorkspaceId = workspaceId.trim();
  if (!exactWorkspaceId) {
    throw new Error('explicit workspace scope is required');
  }
  return exactWorkspaceId;
}

function requirePrincipalWorkspaceId(
  principal: ResourceHubPrincipal | null | undefined,
): string {
  return requireWorkspaceId(principal?.teamId ?? '');
}

function isSharedProjectResource(value: unknown): value is SharedResourceWire {
  if (!value || typeof value !== 'object') return false;
  const resource = value as Record<string, unknown>;
  return resource.kind === 'project' &&
    typeof resource.id === 'string' &&
    typeof resource.teamId === 'string' &&
    typeof resource.ownerMemberId === 'string' &&
    typeof resource.createdAt === 'string' &&
    (resource.deletedAt === null || resource.deletedAt === undefined);
}

function toFallbackTeamProject(resource: SharedResourceWire): TeamProject {
  const metadata = recordObject(resource.metadata) ?? {};
  const project: TeamProject = {
    projectId: fallbackProjectId(resource, metadata),
    ownerMemberId: resource.ownerMemberId,
    sharedAt: resource.createdAt,
  };
  if (typeof metadata.name === 'string' && metadata.name.trim()) {
    project.name = metadata.name.trim();
  }
  if (metadata.skillId === null || typeof metadata.skillId === 'string') {
    project.skillId = metadata.skillId;
  }
  if (metadata.designSystemId === null || typeof metadata.designSystemId === 'string') {
    project.designSystemId = metadata.designSystemId;
  }
  if (typeof metadata.createdAt === 'number') project.createdAt = metadata.createdAt;
  if (typeof metadata.updatedAt === 'number') project.updatedAt = metadata.updatedAt;
  const projectMetadata = recordObject(metadata.metadata);
  if (projectMetadata) project.metadata = projectMetadata as unknown as ProjectMetadata;
  return project;
}

function toFallbackVelaTeamProjectRecord(
  resource: SharedResourceWire,
): VelaTeamProjectRecord {
  const metadata = recordObject(resource.metadata) ?? {};
  const project = toFallbackTeamProject(resource);
  const createdAt = resource.createdAt;
  const updatedAt = typeof metadata.updatedAt === 'number' && Number.isFinite(metadata.updatedAt)
    ? new Date(metadata.updatedAt).toISOString()
    : createdAt;
  return {
    id: resource.id,
    workspaceId: resource.teamId,
    projectId: project.projectId,
    resourceId: resource.id,
    ownerMemberId: resource.ownerMemberId,
    displayName: project.name ?? null,
    syncState: 'synced',
    lastSyncedVersionId: null,
    createdAt,
    originProjectUpdatedAt:
      typeof metadata.updatedAt === 'number' && Number.isFinite(metadata.updatedAt)
        ? metadata.updatedAt
        : null,
    updatedAt,
    access: {
      canView: true,
      canComment: true,
      canEdit: false,
      frozen: false,
    },
  };
}

function fallbackProjectId(
  resource: SharedResourceWire,
  metadata: Record<string, unknown>,
): string {
  if (typeof metadata.projectId === 'string' && metadata.projectId.trim()) {
    return metadata.projectId.trim();
  }
  const resourceId = resource.id;
  const suffix = resourceId.startsWith(PROJECT_RESOURCE_PREFIX)
    ? resourceId.slice(PROJECT_RESOURCE_PREFIX.length)
    : resourceId;
  try {
    const decoded = JSON.parse(Buffer.from(suffix, 'base64url').toString('utf8')) as unknown;
    if (Array.isArray(decoded) && typeof decoded[2] === 'string' && decoded[2].trim()) {
      return decoded[2].trim();
    }
  } catch {
    // Legacy resource ids are simply `project-<projectId>`.
  }
  return suffix;
}

const defaultRunVelaTeamProjects: RunVelaTeamProjects = (args, workspaceId) =>
  runVelaCommand(
    ['team-projects', ...args],
    velaWorkspaceCommandOptions(workspaceId),
  );

const defaultRunVelaResources: RunVelaResources = (args, workspaceId) =>
  runVelaCommand(
    ['resource', ...args],
    velaWorkspaceCommandOptions(workspaceId),
  );
