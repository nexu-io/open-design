import type { ProjectSyncState } from '@open-design/contracts';
import {
  buildResourceHubAuthHeaders,
  hasExplicitResourceHubConfig,
  readResourceHubConfig,
  readResourceHubPrincipal,
  ResourceHubError,
  type ResourceHubConfig,
  type ResourceHubPrincipal,
} from './resource-hub.js';

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

type FetchLike = typeof fetch;

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
  list(principal?: ResourceHubPrincipal | null): Promise<VelaTeamProjectRecord[]>;
  upsert(
    input: UpsertVelaTeamProjectInput,
    principal?: ResourceHubPrincipal | null,
  ): Promise<VelaTeamProjectRecord | null>;
}

interface VelaTeamProjectCatalogClientOptions {
  config?: ResourceHubConfig;
  env?: NodeJS.ProcessEnv;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export function projectResourceIdFor(projectId: string, principal?: ResourceHubPrincipal | null): string {
  if (!principal) return `project-${projectId}`;
  const scoped = Buffer.from(
    JSON.stringify([principal.teamId, principal.memberId, projectId]),
    'utf8',
  ).toString('base64url');
  return `project-${scoped}`;
}

export function projectSyncStateToVela(state: ProjectSyncState): VelaTeamProjectSyncState {
  if (state === 'synced') return 'synced';
  if (state === 'sync_failed') return 'failed';
  if (state === 'pending_upload') return 'pending_upload';
  return 'pending_upload';
}

export function velaProjectSyncStateToProject(state: VelaTeamProjectSyncState): ProjectSyncState {
  if (state === 'synced') return 'synced';
  if (state === 'failed') return 'sync_failed';
  return 'pending_upload';
}

export function createVelaTeamProjectCatalogClient(
  options: VelaTeamProjectCatalogClientOptions = {},
): VelaTeamProjectCatalogClient {
  const env = options.env ?? process.env;
  const explicitConfig = hasExplicitResourceHubConfig(env);
  const config = options.config ?? readResourceHubConfig(env);
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  async function request<T>(
    principal: ResourceHubPrincipal,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL(path, config.baseUrl), {
        method,
        headers: buildResourceHubAuthHeaders(principal, config),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok) {
        const code =
          typeof payload?.error === 'string' ? payload.error : 'unknown';
        throw new ResourceHubError(response.status, code, payload?.message);
      }
      return payload as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  function resolvePrincipal(principal?: ResourceHubPrincipal | null): ResourceHubPrincipal | null {
    return principal ?? readResourceHubPrincipal(env);
  }

  return {
    async list(principal) {
      if (!explicitConfig) return [];
      const resolved = resolvePrincipal(principal);
      if (!resolved) return [];
      const body = await request<{ projects: VelaTeamProjectRecord[] }>(
        resolved,
        'GET',
        '/api/v1/team-projects',
      );
      return body.projects ?? [];
    },

    async upsert(input, principal) {
      if (!explicitConfig) return null;
      const resolved = resolvePrincipal(principal);
      if (!resolved) return null;
      return request<VelaTeamProjectRecord>(
        resolved,
        'PUT',
        `/api/v1/team-projects/${encodeURIComponent(input.resourceId)}`,
        {
          projectId: input.projectId,
          resourceId: input.resourceId,
          displayName: input.displayName,
          syncState: input.syncState,
          lastSyncedVersionId: input.lastSyncedVersionId,
        },
      );
    },
  };
}

export const velaTeamProjectCatalogClient = createVelaTeamProjectCatalogClient();
