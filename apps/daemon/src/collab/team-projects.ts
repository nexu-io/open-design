// Team-wide shared-project discovery. A member with an empty local project list
// still needs to SEE the projects the owner (or any teammate) shared to the
// team. The authoritative team-space directory is Vela's team-project catalog,
// accessed through the Vela CLI so the daemon never holds Vela backend
// credentials. The resource-hub derived read is retained only as a local/test
// fallback; project bytes still live in the resource hub.

import { execFile } from 'node:child_process';
import type { ProjectMetadata, TeamProject } from '@open-design/contracts';
import {
  createResourceHubClient,
  readResourceHubConfig,
  type ResourceHubClient,
  type ResourceRecord,
} from '../integrations/resource-hub.js';
import { contextToResourceHubPrincipal } from './resource-hub-publish-adapter.js';
import {
  buildVelaResourceEnv,
  shouldUseVelaCliResourceTransport,
} from './vela-cli-resource-adapter.js';
import {
  createVelaCliTeamProjectCatalog,
  shouldUseVelaCliTeamProjectCatalog,
  type VelaTeamProjectCatalog,
} from './vela-cli-team-projects.js';
import type { WorkspaceContextProvider } from './workspace-context.js';

const PROJECT_KIND = 'project';
const PROJECT_ID_PREFIX = /^project-/;

// TODO(D-lane): when this read proxies vela over the CLI (a slower cross-network
// call), the web poll should first probe a cheap change tag — vela's version /
// last-modified on the team project list — and only pull the full list when it
// moved. While the read is daemon-local (the hub stub below), that probe would
// save nothing, so the client just refetches the whole list on its interval.

/** Map a `kind: 'project'` hub resource to the team-project discovery DTO. The
 *  hub id namespaces projects under a `project-` prefix; strip it back to the
 *  local projectId a member pulls then opens. */
export function toTeamProject(record: ResourceRecord): TeamProject {
  const metadata = objectMetadata(record.metadata) ?? {};
  const projectMetadata = objectMetadata(metadata.metadata);
  const createdAt = numberMetadata(metadata.createdAt);
  const updatedAt = numberMetadata(metadata.updatedAt);
  const project: TeamProject = {
    projectId: record.id.replace(PROJECT_ID_PREFIX, ''),
    ownerMemberId: record.ownerMemberId,
    sharedAt: record.createdAt,
  };
  const name = stringMetadata(metadata.name);
  if (name) project.name = name;
  const skillId = stringMetadata(metadata.skillId);
  if (metadata.skillId === null || skillId) project.skillId = skillId ?? null;
  const designSystemId = stringMetadata(metadata.designSystemId);
  if (metadata.designSystemId === null || designSystemId) {
    project.designSystemId = designSystemId ?? null;
  }
  if (createdAt != null) project.createdAt = createdAt;
  if (updatedAt != null) project.updatedAt = updatedAt;
  if (projectMetadata) project.metadata = projectMetadata as unknown as ProjectMetadata;
  return project;
}

function objectMetadata(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringMetadata(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberMetadata(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

export interface CreateTeamProjectsListerOptions {
  /** The one workspace context the collab surface reads; the principal derives
   *  from it so a single signed-in identity drives discovery + share + pull. */
  workspaceContext: WorkspaceContextProvider;
  /** Injectable client for tests; built from env (OD_RESOURCE_HUB_URL) otherwise. */
  client?: ResourceHubClient;
  /** Injectable CLI runner for tests; defaults to spawning `vela resource`. */
  runVelaResource?: (args: string[]) => Promise<string>;
  /** Injectable Vela team-project catalog; defaults to `vela team-projects`. */
  teamProjectCatalog?: VelaTeamProjectCatalog;
  env?: NodeJS.ProcessEnv;
}

/**
 * Build a lister that returns every project shared to the caller's team, read
 * from the resource hub. Filters the hub's resource index to live
 * `kind: 'project'` records and strips the `project-` id prefix. Returns [] when
 * there is no team principal (off-team / signed out) or the hub is not configured.
 */
export function createTeamProjectsLister(
  options: CreateTeamProjectsListerOptions,
): () => Promise<TeamProject[]> {
  const env = options.env ?? process.env;
  const runVelaResource = options.runVelaResource ?? defaultRunVelaResource(env);
  return async () => {
    const principal = contextToResourceHubPrincipal(
      await options.workspaceContext.current({}),
    );
    if (!principal) return [];

    if (shouldUseVelaCliTeamProjectCatalog(env)) {
      const catalog =
        options.teamProjectCatalog ??
        createVelaCliTeamProjectCatalog();
      return catalog.list();
    }

    if (shouldUseVelaCliResourceTransport(env)) {
      const stdout = await runVelaResource(['shared', '--json']);
      return parseVelaSharedResources(stdout)
        .filter((record) => record.kind === PROJECT_KIND && record.deletedAt == null)
        .map(toTeamProject);
    }

    const client =
      options.client ??
      (env.OD_RESOURCE_HUB_URL?.trim()
        ? createResourceHubClient({ config: readResourceHubConfig(env) })
        : null);
    if (!client) return [];
    const resources = await client.listResources(principal);
    return resources
      .filter((record) => record.kind === PROJECT_KIND && record.deletedAt == null)
      .map(toTeamProject);
  };
}

function parseVelaSharedResources(stdout: string): ResourceRecord[] {
  const trimmed = stdout.trim();
  if (!trimmed) return [];
  const payload = JSON.parse(trimmed) as { resources?: unknown };
  if (!Array.isArray(payload.resources)) return [];
  return payload.resources.filter(isResourceRecord);
}

function isResourceRecord(value: unknown): value is ResourceRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ResourceRecord>;
  return (
    typeof record.id === 'string' &&
    typeof record.teamId === 'string' &&
    typeof record.kind === 'string' &&
    typeof record.ownerMemberId === 'string' &&
    typeof record.createdAt === 'string' &&
    (record.metadata === undefined || (record.metadata != null && typeof record.metadata === 'object' && !Array.isArray(record.metadata))) &&
    (typeof record.deletedAt === 'string' || record.deletedAt === null || record.deletedAt === undefined)
  );
}

const defaultRunVelaResource = (env: NodeJS.ProcessEnv) => (args: string[]): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const bin = env.OD_VELA_BIN?.trim() || 'vela';
    execFile(
      bin,
      ['resource', ...args],
      { env: buildVelaResourceEnv(env), maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
