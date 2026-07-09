// Client for the Vela resource hub (Spec E cloud storage). Mirrors the
// vela-wallet integration shape: a factory with injectable fetch/env/timeout,
// env-scoped config (so this file — not app-config.ts — owns OD_RESOURCE_HUB_*),
// and a default singleton.
//
// The index surface (resources / versions / refs / manifests) and blob byte
// transfer (presigned client-direct: pushBlob/pullBlob) are both wired for real.
// One deliberate seam remains: auth — how the daemon proves the workspace
// principal is an open topology decision (services/api authenticates the daemon
// and resolves the principal, vs internal-token forwarding). It currently
// attaches whatever env-configured credentials it has; swapping schemes changes
// only buildAuthHeaders. Hub-only request shapes stay local until the platform
// publishes canonical resource contracts.

import type {
  PublicSnapshotResponse,
  ResourceSnapshotRecord,
} from '@open-design/contracts';

const DEFAULT_RESOURCE_HUB_URL = 'http://127.0.0.1:18080';
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

type FetchLike = typeof fetch;

export type ResourceKind = 'design_system' | 'plugin' | 'skill' | 'project';

// Provisional — to be replaced by the platform's canonical workspace principal
// (地基 contracts). The daemon does not yet own a member table (link B), so the
// principal is sourced from env for now (see readResourceHubPrincipal).
export interface ResourceHubPrincipal {
  memberId: string;
  teamId: string;
  role: 'owner' | 'admin' | 'member';
  lifecycleState: string | null;
}

export interface ResourceRecord {
  id: string;
  teamId: string;
  kind: string;
  ownerMemberId: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface VersionRecord {
  id: string;
  resourceId: string;
  version: number;
  manifestDigest: string;
  createdByMemberId: string;
  createdAt: string;
}

export interface RefRecord {
  resourceId: string;
  name: string;
  versionId: string;
  updatedAt: string;
  updatedByMemberId: string;
}

export interface ManifestEntryInput {
  path: string;
  type: 'file' | 'dir' | 'symlink';
  executable?: boolean;
  blobDigest?: string | null;
  symlinkTarget?: string | null;
}

export interface ManifestEntry {
  path: string;
  type: 'file' | 'dir' | 'symlink';
  executable: boolean;
  blobDigest: string | null;
  symlinkTarget: string | null;
}

export interface Manifest {
  digest: string;
  entries: ManifestEntry[];
}

export interface PublishVersionInput {
  manifestDigest: string;
  entries: ManifestEntryInput[];
  ref?: string;
  expectedVersionId?: string | null;
}

export interface BlobDescriptor {
  digest: string;
  size: number;
}

export interface PreparedUpload {
  digest: string;
  url: string;
  method: string;
  expiresInSeconds: number;
}

export interface PrepareUploadResult {
  uploads: PreparedUpload[];
  present: string[];
  storeLive: boolean;
}

export class ResourceHubError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? `resource hub error ${status} (${code})`);
    this.name = 'ResourceHubError';
  }
}

export interface ResourceHubConfig {
  baseUrl: string;
  internalToken: string | null;
}

export function readResourceHubConfig(
  env: NodeJS.ProcessEnv = process.env,
): ResourceHubConfig {
  const baseUrl = env.OD_RESOURCE_HUB_URL?.trim() || DEFAULT_RESOURCE_HUB_URL;
  const internalToken = env.OD_RESOURCE_HUB_TOKEN?.trim() || null;
  return { baseUrl, internalToken };
}

export function hasExplicitResourceHubConfig(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env.OD_RESOURCE_HUB_URL?.trim());
}

// Provisional principal source. Real sourcing joins the signed-in Vela identity
// (integrations/vela.ts) with the workspace membership from link B; until that
// lands, dev/local reads it from env so the loop is drivable.
export function readResourceHubPrincipal(
  env: NodeJS.ProcessEnv = process.env,
): ResourceHubPrincipal | null {
  const memberId = env.OD_WORKSPACE_MEMBER_ID?.trim();
  const teamId = env.OD_WORKSPACE_TEAM_ID?.trim();
  if (!memberId || !teamId) return null;
  const rawRole = env.OD_WORKSPACE_ROLE?.trim();
  const role =
    rawRole === 'owner' || rawRole === 'admin' || rawRole === 'member'
      ? rawRole
      : 'member';
  return {
    memberId,
    teamId,
    role,
    lifecycleState: env.OD_WORKSPACE_LIFECYCLE_STATE?.trim() || null,
  };
}

export function buildResourceHubAuthHeaders(
  principal: ResourceHubPrincipal,
  config: ResourceHubConfig,
): Record<string, string> {
  // Seam: the final scheme (services/api-issued scoped token vs internal-token
  // forwarding) is undecided. For now forward the principal under the header
  // contract the hub's auth seam consumes, gated by the internal token.
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-workspace-member-id': principal.memberId,
    'x-workspace-team-id': principal.teamId,
    'x-workspace-role': principal.role,
  };
  if (principal.lifecycleState) {
    headers['x-workspace-lifecycle-state'] = principal.lifecycleState;
  }
  if (config.internalToken) {
    headers['x-internal-token'] = config.internalToken;
  }
  return headers;
}

interface ResourceHubClientOptions {
  config?: ResourceHubConfig;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export function createResourceHubClient(options: ResourceHubClientOptions = {}) {
  const config = options.config ?? readResourceHubConfig();
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

  return {
    isConfigured(): boolean {
      return Boolean(config.baseUrl);
    },

    async listResources(
      principal: ResourceHubPrincipal,
    ): Promise<ResourceRecord[]> {
      const body = await request<{ resources: ResourceRecord[] }>(
        principal,
        'GET',
        '/api/v1/resources',
      );
      return body.resources ?? [];
    },

    async getResource(
      principal: ResourceHubPrincipal,
      resourceId: string,
    ): Promise<ResourceRecord> {
      return request<ResourceRecord>(
        principal,
        'GET',
        `/api/v1/resources/${encodeURIComponent(resourceId)}`,
      );
    },

    async createResource(
      principal: ResourceHubPrincipal,
      input: { kind: string; resourceId?: string },
    ): Promise<ResourceRecord> {
      return request<ResourceRecord>(
        principal,
        'POST',
        '/api/v1/resources',
        input,
      );
    },

    async findMissingBlobs(
      principal: ResourceHubPrincipal,
      digests: string[],
    ): Promise<string[]> {
      const body = await request<{ missing: string[] }>(
        principal,
        'POST',
        '/api/v1/resources/blobs/find-missing',
        { digests },
      );
      return body.missing ?? [];
    },

    async publishVersion(
      principal: ResourceHubPrincipal,
      resourceId: string,
      input: PublishVersionInput,
    ): Promise<VersionRecord> {
      return request<VersionRecord>(
        principal,
        'POST',
        `/api/v1/resources/${encodeURIComponent(resourceId)}/versions`,
        input,
      );
    },

    async listVersions(
      principal: ResourceHubPrincipal,
      resourceId: string,
    ): Promise<VersionRecord[]> {
      const body = await request<{ versions: VersionRecord[] }>(
        principal,
        'GET',
        `/api/v1/resources/${encodeURIComponent(resourceId)}/versions`,
      );
      return body.versions ?? [];
    },

    async getManifest(
      principal: ResourceHubPrincipal,
      digest: string,
    ): Promise<Manifest> {
      return request<Manifest>(
        principal,
        'GET',
        `/api/v1/resources/manifests/${encodeURIComponent(digest)}`,
      );
    },

    async getRef(
      principal: ResourceHubPrincipal,
      resourceId: string,
      ref: string,
    ): Promise<RefRecord> {
      return request<RefRecord>(
        principal,
        'GET',
        `/api/v1/resources/${encodeURIComponent(resourceId)}/refs/${encodeURIComponent(ref)}`,
      );
    },

    async setRef(
      principal: ResourceHubPrincipal,
      resourceId: string,
      ref: string,
      input: { versionId: string; expectedVersionId?: string | null },
    ): Promise<RefRecord> {
      return request<RefRecord>(
        principal,
        'PUT',
        `/api/v1/resources/${encodeURIComponent(resourceId)}/refs/${encodeURIComponent(ref)}`,
        input,
      );
    },

    // Blob byte transfer: presigned + client-direct (transport decision
    // 2026-07-07). The hub issues short-TTL URLs; bytes flow daemon<->store
    // without passing through the hub.
    async prepareUpload(
      principal: ResourceHubPrincipal,
      blobs: BlobDescriptor[],
    ): Promise<PrepareUploadResult> {
      return request<PrepareUploadResult>(
        principal,
        'POST',
        '/api/v1/resources/blobs/uploads',
        { blobs },
      );
    },

    async commitUpload(
      principal: ResourceHubPrincipal,
      blobs: BlobDescriptor[],
    ): Promise<void> {
      await request(principal, 'POST', '/api/v1/resources/blobs/uploads/commit', {
        blobs,
      });
    },

    // Push one blob: prepare (skips if the store already has it), PUT the bytes
    // straight to the presigned URL, then commit so the hub verifies + indexes.
    async pushBlob(
      principal: ResourceHubPrincipal,
      input: { digest: string; bytes: Uint8Array },
    ): Promise<void> {
      const descriptor: BlobDescriptor = {
        digest: input.digest,
        size: input.bytes.byteLength,
      };
      const prepared = await this.prepareUpload(principal, [descriptor]);
      const upload = prepared.uploads.find(
        (candidate) => candidate.digest === input.digest,
      );
      if (upload) {
        const response = await fetchImpl(upload.url, {
          method: upload.method,
          body: input.bytes,
        });
        if (!response.ok) {
          throw new ResourceHubError(
            response.status,
            'blob_upload_failed',
            `PUT to object store failed (${response.status})`,
          );
        }
      }
      await this.commitUpload(principal, [descriptor]);
    },

    // Pull one blob: resolve a presigned GET from the hub, then read bytes
    // straight from the store.
    async pullBlob(
      principal: ResourceHubPrincipal,
      digest: string,
    ): Promise<Uint8Array> {
      const signed = await request<{ url: string; method: string }>(
        principal,
        'GET',
        `/api/v1/resources/blobs/${encodeURIComponent(digest)}/download`,
      );
      const response = await fetchImpl(signed.url, { method: signed.method });
      if (!response.ok) {
        throw new ResourceHubError(
          response.status,
          'blob_download_failed',
          `GET from object store failed (${response.status})`,
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },

    // Publish a version as a public snapshot (authed; owner-gating is enforced
    // server-side by the hub). Returns the opaque public slug.
    async publishSnapshot(
      principal: ResourceHubPrincipal,
      resourceId: string,
      input: { name: string; ref?: string; versionId?: string },
    ): Promise<ResourceSnapshotRecord> {
      return request<ResourceSnapshotRecord>(
        principal,
        'POST',
        `/api/v1/resources/${encodeURIComponent(resourceId)}/snapshots`,
        input,
      );
    },

    // Read a public snapshot by slug. Carries NO principal/token — this
    // faithfully exercises the hub's unauthenticated public plane.
    async getPublicSnapshot(slug: string): Promise<PublicSnapshotResponse> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(
          new URL(
            `/api/v1/public/snapshots/${encodeURIComponent(slug)}`,
            config.baseUrl,
          ),
          { method: 'GET', signal: controller.signal },
        );
        const text = await response.text();
        const payload = text ? JSON.parse(text) : {};
        if (!response.ok) {
          const code =
            typeof payload?.error === 'string' ? payload.error : 'unknown';
          throw new ResourceHubError(response.status, code, payload?.message);
        }
        return payload as PublicSnapshotResponse;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export type ResourceHubClient = ReturnType<typeof createResourceHubClient>;

export const resourceHubClient = createResourceHubClient();
