import { execFile } from 'node:child_process';
import type { ProjectMetadata, TeamProject } from '@open-design/contracts';
import type {
  UpsertVelaTeamProjectInput,
  VelaTeamProjectCatalogClient,
  VelaTeamProjectRecord,
  VelaTeamProjectSyncState,
} from '../integrations/vela-team-projects.js';
import { amrVelaProfileEnv } from '../integrations/vela-profile.js';

const PROJECT_RESOURCE_PREFIX = 'project-';

export type RunVelaTeamProjects = (args: string[]) => Promise<string>;

export interface VelaTeamProjectCatalog {
  list(): Promise<TeamProject[]>;
  upsert(input: {
    projectId: string;
    resourceId?: string;
    displayName?: string | null;
    syncState?: 'pending_upload' | 'syncing' | 'synced' | 'failed';
    lastSyncedVersionId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<void>;
  remove(projectId: string): Promise<void>;
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

export function projectResourceId(projectId: string): string {
  return `${PROJECT_RESOURCE_PREFIX}${projectId}`;
}

export function createVelaCliTeamProjectCatalog(
  options: { run?: RunVelaTeamProjects } = {},
): VelaTeamProjectCatalog {
  const run = options.run ?? defaultRunVelaTeamProjects;

  async function runJson<T>(args: string[]): Promise<T> {
    const stdout = await run(args);
    const trimmed = stdout.trim();
    if (!trimmed) return {} as T;
    return JSON.parse(trimmed) as T;
  }

  return {
    async list(): Promise<TeamProject[]> {
      const payload = await runJson<TeamProjectsListWire>(['list']);
      return Array.isArray(payload.projects)
        ? payload.projects.map(toTeamProject).filter((project): project is TeamProject => project != null)
        : [];
    },

    async upsert(input): Promise<void> {
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
      await run(args);
    },

    async remove(projectId): Promise<void> {
      await run(['remove', projectId]);
    },
  };
}

export function createVelaCliTeamProjectCatalogClient(
  options: { run?: RunVelaTeamProjects } = {},
): VelaTeamProjectCatalogClient {
  const run = options.run ?? defaultRunVelaTeamProjects;

  async function runJson<T>(args: string[]): Promise<T> {
    const stdout = await run(args);
    const trimmed = stdout.trim();
    if (!trimmed) return {} as T;
    return JSON.parse(trimmed) as T;
  }

  return {
    async list(): Promise<VelaTeamProjectRecord[]> {
      const payload = await runJson<TeamProjectsListWire>(['list']);
      return Array.isArray(payload.projects)
        ? payload.projects
            .map((project) => toVelaTeamProjectRecord(project))
            .filter((project): project is VelaTeamProjectRecord => project != null)
        : [];
    },

    async upsert(input: UpsertVelaTeamProjectInput): Promise<VelaTeamProjectRecord | null> {
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
      const stdout = await run(args);
      return toVelaTeamProjectRecord(JSON.parse(stdout.trim()) as unknown);
    },
  };
}

export function createVelaCliTeamProjectCatalogClientFromEnv(): VelaTeamProjectCatalogClient | null {
  return shouldUseVelaCliTeamProjectCatalog() ? createVelaCliTeamProjectCatalogClient() : null;
}

export function createVelaCliTeamProjectCatalogFromEnv(): VelaTeamProjectCatalog | null {
  return shouldUseVelaCliTeamProjectCatalog() ? createVelaCliTeamProjectCatalog() : null;
}

export function shouldUseVelaCliTeamProjectCatalog(env: NodeJS.ProcessEnv = process.env): boolean {
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

const defaultRunVelaTeamProjects: RunVelaTeamProjects = (args) =>
  new Promise<string>((resolve, reject) => {
    const bin = process.env.OD_VELA_BIN?.trim() || 'vela';
    execFile(
      bin,
      ['team-projects', ...args],
      { env: buildVelaTeamProjectsEnv(), maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });

export function buildVelaTeamProjectsEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return { ...amrVelaProfileEnv(env), ...env };
}
