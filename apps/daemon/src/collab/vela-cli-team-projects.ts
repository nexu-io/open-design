import { execFile } from 'node:child_process';
import type { TeamProject } from '@open-design/contracts';
import { amrVelaProfileEnv } from '../integrations/vela-profile.js';

const PROJECT_RESOURCE_PREFIX = 'project-';

export type RunVelaTeamProjects = (args: string[]) => Promise<string>;

export interface VelaTeamProjectCatalog {
  list(): Promise<TeamProject[]>;
  upsert(input: {
    projectId: string;
    displayName?: string | null;
    syncState?: 'pending_upload' | 'syncing' | 'synced' | 'failed';
    lastSyncedVersionId?: string | null;
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
  createdAt?: unknown;
  updatedAt?: unknown;
};

type TeamProjectsListWire = {
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
        projectResourceId(input.projectId),
      ];
      if (input.displayName?.trim()) args.push('--display-name', input.displayName.trim());
      if (input.syncState) args.push('--sync-state', input.syncState);
      if (input.lastSyncedVersionId?.trim()) {
        args.push('--last-synced-version-id', input.lastSyncedVersionId.trim());
      }
      await run(args);
    },

    async remove(projectId): Promise<void> {
      await run(['remove', projectId]);
    },
  };
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
  if (typeof record.updatedAt === 'string') {
    const updatedAt = Date.parse(record.updatedAt);
    if (Number.isFinite(updatedAt)) project.updatedAt = updatedAt;
  }
  const createdAt = Date.parse(record.createdAt);
  if (Number.isFinite(createdAt)) project.createdAt = createdAt;
  return project;
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
