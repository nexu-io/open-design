// Client for the collab cloud (C-lane §D4): the cross-daemon comment relay +
// member directory. Mirrors the resource-hub integration shape — a factory with
// injectable fetch/config/timeout, env-scoped config (this file, not
// app-config.ts, owns OD_COLLAB_CLOUD_*), and a from-env constructor.
//
// DEGRADE: unlike the resource-hub client, this factory returns `null` when
// OD_COLLAB_CLOUD_URL is unset, so every caller is a plain `client?.method()`
// no-op off-team / unconfigured. Auth is a single bearer token (§D4.4); the real
// hub verifies B's signed token, this stub presents a shared local token.

import type {
  CollabCloudComment,
  CollabCloudMemberDirectoryEntry,
  CollabMemberRole,
} from '@open-design/contracts';

const DEFAULT_FETCH_TIMEOUT_MS = 8_000;

type FetchLike = typeof fetch;

export interface CollabCloudConfig {
  baseUrl: string;
  token: string | null;
}

/** Read the collab-cloud config from env, or null when no URL is configured
 *  (the single "is collab cloud on?" gate — everything degrades to no-op). */
export function readCollabCloudConfig(
  env: NodeJS.ProcessEnv = process.env,
): CollabCloudConfig | null {
  const baseUrl = env.OD_COLLAB_CLOUD_URL?.trim();
  if (!baseUrl) return null;
  return { baseUrl, token: env.OD_COLLAB_CLOUD_TOKEN?.trim() || null };
}

export function hasExplicitCollabCloudConfig(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.OD_COLLAB_CLOUD_URL?.trim());
}

export class CollabCloudError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? `collab cloud error ${status} (${code})`);
    this.name = 'CollabCloudError';
  }
}

export interface CollabCloudMemberRegistration {
  displayName: string;
  role: CollabMemberRole;
}

export interface CollabCloudPullResult {
  comments: CollabCloudComment[];
  latestSeq: number;
}

interface CollabCloudClientOptions {
  config?: CollabCloudConfig;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export function createCollabCloudClient(options: CollabCloudClientOptions = {}) {
  const config = options.config ?? readCollabCloudConfig();
  if (!config) {
    throw new Error('collab cloud is not configured (OD_COLLAB_CLOUD_URL is unset)');
  }
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  function authHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json', ...extra };
    if (config!.token) headers.authorization = `Bearer ${config!.token}`;
    return headers;
  }

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<{ status: number; payload: T; etag: string | null }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL(path, config!.baseUrl), {
        method,
        headers: authHeaders(extraHeaders),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      const etag = response.headers.get('etag');
      if (response.status === 304) {
        return { status: 304, payload: {} as T, etag };
      }
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      if (!response.ok) {
        const code = typeof payload?.error === 'string' ? payload.error : 'unknown';
        throw new CollabCloudError(response.status, code, payload?.message);
      }
      return { status: response.status, payload: payload as T, etag };
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    isConfigured(): boolean {
      return true;
    },

    /** Register (idempotently upsert) a member's directory entry. */
    async registerMember(
      teamId: string,
      memberId: string,
      input: CollabCloudMemberRegistration,
    ): Promise<CollabCloudMemberDirectoryEntry> {
      const { payload } = await request<{ member: CollabCloudMemberDirectoryEntry }>(
        'PUT',
        `/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(memberId)}`,
        input,
      );
      return payload.member;
    },

    /** List the team's member directory (memberId → {displayName, role}). */
    async listMembers(teamId: string): Promise<CollabCloudMemberDirectoryEntry[]> {
      const { payload } = await request<{ members: CollabCloudMemberDirectoryEntry[] }>(
        'GET',
        `/teams/${encodeURIComponent(teamId)}/members`,
      );
      return payload.members ?? [];
    },

    /** Append a comment to a project's stream; returns the assigned seq. */
    async pushComment(
      teamId: string,
      projectId: string,
      comment: CollabCloudComment,
    ): Promise<{ seq: number }> {
      const { payload } = await request<{ seq: number }>(
        'POST',
        `/teams/${encodeURIComponent(teamId)}/projects/${encodeURIComponent(projectId)}/comments`,
        { comment },
      );
      return { seq: payload.seq };
    },

    /**
     * Pull comments with `seq > sinceSeq`. `etag` (from a prior pull) enables a
     * 304 short-circuit: on 304 the result echoes back `sinceSeq` as `latestSeq`
     * with no comments, and `notModified` is true.
     */
    async pullComments(
      teamId: string,
      projectId: string,
      sinceSeq: number,
      etag?: string | null,
    ): Promise<CollabCloudPullResult & { notModified: boolean; etag: string | null }> {
      const query = `?sinceSeq=${encodeURIComponent(String(sinceSeq))}`;
      const { status, payload, etag: nextEtag } = await request<CollabCloudPullResult>(
        'GET',
        `/teams/${encodeURIComponent(teamId)}/projects/${encodeURIComponent(projectId)}/comments${query}`,
        undefined,
        etag ? { 'if-none-match': etag } : undefined,
      );
      if (status === 304) {
        return { comments: [], latestSeq: sinceSeq, notModified: true, etag: nextEtag };
      }
      return {
        comments: payload.comments ?? [],
        latestSeq: typeof payload.latestSeq === 'number' ? payload.latestSeq : sinceSeq,
        notModified: false,
        etag: nextEtag,
      };
    },
  };
}

export type CollabCloudClient = ReturnType<typeof createCollabCloudClient>;

/** Build the client from env, or null when the collab cloud is not configured. */
export function createCollabCloudClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): CollabCloudClient | null {
  const config = readCollabCloudConfig(env);
  if (!config) return null;
  return createCollabCloudClient({ config });
}
