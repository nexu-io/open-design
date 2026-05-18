import { createHash, randomBytes } from 'node:crypto';

export const DEFAULT_TOOL_TOKEN_TTL_MS = 15 * 60 * 1000;

export const CHAT_TOOL_ENDPOINTS = [
  '/api/tools/live-artifacts/create',
  '/api/tools/live-artifacts/list',
  '/api/tools/live-artifacts/refresh',
  '/api/tools/live-artifacts/update',
  '/api/tools/connectors/list',
  '/api/tools/connectors/execute',
] as const;

export const CHAT_TOOL_OPERATIONS = [
  'live-artifacts:create',
  'live-artifacts:list',
  'live-artifacts:refresh',
  'live-artifacts:update',
  'connectors:list',
  'connectors:execute',
] as const;

export type ToolEndpoint = (typeof CHAT_TOOL_ENDPOINTS)[number] | (string & {});
export type ToolOperation = (typeof CHAT_TOOL_OPERATIONS)[number] | (string & {});
export type ToolTokenRevocationReason = 'child_exit' | 'sse_end' | 'ttl_expired' | 'manual';
export type ToolTokenErrorCode =
  | 'TOOL_TOKEN_MISSING'
  | 'TOOL_TOKEN_INVALID'
  | 'TOOL_TOKEN_EXPIRED'
  | 'TOOL_ENDPOINT_DENIED'
  | 'TOOL_OPERATION_DENIED';

export interface ToolTokenGrant {
  token: string;
  runId: string;
  projectId: string;
  allowedEndpoints: readonly ToolEndpoint[];
  allowedOperations: readonly ToolOperation[];
  issuedAt: string;
  expiresAt: string;
  // Plan §3.A3 / spec §9. When the run is plugin-driven, the snapshot id
  // and the cached trust tier ride alongside the token so
  // `/api/tools/connectors/execute` can re-validate per-call without
  // re-reading the SQLite row. `pluginSnapshotId` undefined means the
  // run is not plugin-driven; the connector gate is bypassed (legacy
  // behavior).
  pluginSnapshotId?: string;
  pluginTrust?: 'trusted' | 'restricted' | 'bundled';
  pluginCapabilitiesGranted?: readonly string[];
}

export interface MintToolTokenOptions {
  runId: string;
  projectId: string;
  allowedEndpoints?: readonly ToolEndpoint[];
  allowedOperations?: readonly ToolOperation[];
  ttlMs?: number;
  nowMs?: number;
  pluginSnapshotId?: string;
  pluginTrust?: 'trusted' | 'restricted' | 'bundled';
  pluginCapabilitiesGranted?: readonly string[];
}

export type ToolTokenValidationResult =
  | { ok: true; grant: ToolTokenGrant }
  | { ok: false; code: ToolTokenErrorCode; message: string };

interface StoredToolTokenGrant extends ToolTokenGrant {
  tokenHash: string;
  expiresAtMs: number;
  timer: NodeJS.Timeout;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createOpaqueToolToken(): string {
  return `odtt_${randomBytes(32).toString('base64url')}`;
}

function asPublicGrant(stored: StoredToolTokenGrant): ToolTokenGrant {
  const { tokenHash: _tokenHash, expiresAtMs: _expiresAtMs, timer: _timer, ...grant } = stored;
  return grant;
}

// Plan §3.A3 / spec §9: pure connector capability gate over a token grant.
// When the grant carries no plugin snapshot id, the call is from a
// non-plugin run and we let it through (back-compat). When the grant
// carries a snapshot id, we apply the §9 / §5.3 rule:
//
//   - trusted / bundled plugins implicitly carry connector:* — accept.
//   - restricted plugins must list `connector:<id>` in
//     pluginCapabilitiesGranted — otherwise reject with TOOL_OPERATION_DENIED.
//
// Used by `/api/tools/connectors/execute` (defense in depth, c). Phase 4
// extends this to `connector:*` glob support if the spec patches §5.3 to
// allow it; today we accept only the exact id form.
export function checkConnectorAccess(
  grant: ToolTokenGrant,
  connectorId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!grant.pluginSnapshotId) return { ok: true };
  const tier = grant.pluginTrust ?? 'restricted';
  if (tier !== 'restricted') return { ok: true };
  const granted = new Set(grant.pluginCapabilitiesGranted ?? []);
  if (granted.has(`connector:${connectorId}`) || granted.has('connector')) {
    return { ok: true };
  }
  return {
    ok: false,
    reason: `restricted plugin (snapshot ${grant.pluginSnapshotId}) lacks "connector:${connectorId}" — grant via /api/plugins/:id/trust before retrying`,
  };
}

export class ToolTokenRegistry {
  readonly #byTokenHash = new Map<string, StoredToolTokenGrant>();
  readonly #tokenHashesByRunId = new Map<string, Set<string>>();

  mint(options: MintToolTokenOptions): ToolTokenGrant {
    const nowMs = options.nowMs ?? Date.now();
    const ttlMs = options.ttlMs ?? DEFAULT_TOOL_TOKEN_TTL_MS;
    if (!options.runId) throw new Error('runId is required');
    if (!options.projectId) throw new Error('projectId is required');
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('ttlMs must be positive');

    const token = createOpaqueToolToken();
    const hash = tokenHash(token);
    const expiresAtMs = nowMs + ttlMs;
    const timer = setTimeout(() => {
      this.revokeToken(token, 'ttl_expired');
    }, ttlMs);
    timer.unref?.();

    const stored: StoredToolTokenGrant = {
      token,
      tokenHash: hash,
      runId: options.runId,
      projectId: options.projectId,
      allowedEndpoints: [...(options.allowedEndpoints ?? CHAT_TOOL_ENDPOINTS)],
      allowedOperations: [...(options.allowedOperations ?? CHAT_TOOL_OPERATIONS)],
      issuedAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
      timer,
      ...(options.pluginSnapshotId ? { pluginSnapshotId: options.pluginSnapshotId } : {}),
      ...(options.pluginTrust ? { pluginTrust: options.pluginTrust } : {}),
      ...(options.pluginCapabilitiesGranted
        ? { pluginCapabilitiesGranted: [...options.pluginCapabilitiesGranted] }
        : {}),
    };

    this.#byTokenHash.set(hash, stored);
    const runTokens = this.#tokenHashesByRunId.get(options.runId) ?? new Set<string>();
    runTokens.add(hash);
    this.#tokenHashesByRunId.set(options.runId, runTokens);

    return asPublicGrant(stored);
  }

  validate(
    token: string | null | undefined,
    options: { endpoint?: string; operation?: string; nowMs?: number } = {},
  ): ToolTokenValidationResult {
    if (!token) {
      return { ok: false, code: 'TOOL_TOKEN_MISSING', message: 'tool token is required' };
    }

    const stored = this.#byTokenHash.get(tokenHash(token));
    if (!stored) {
      return { ok: false, code: 'TOOL_TOKEN_INVALID', message: 'tool token is invalid or revoked' };
    }

    if ((options.nowMs ?? Date.now()) >= stored.expiresAtMs) {
      this.revokeToken(token, 'ttl_expired');
      return { ok: false, code: 'TOOL_TOKEN_EXPIRED', message: 'tool token expired' };
    }

    if (options.endpoint && !stored.allowedEndpoints.includes(options.endpoint)) {
      return { ok: false, code: 'TOOL_ENDPOINT_DENIED', message: 'tool endpoint is not allowed for this run' };
    }

    if (options.operation && !stored.allowedOperations.includes(options.operation)) {
      return { ok: false, code: 'TOOL_OPERATION_DENIED', message: 'tool operation is not allowed for this run' };
    }

    return { ok: true, grant: asPublicGrant(stored) };
  }

  revokeToken(token: string | null | undefined, _reason: ToolTokenRevocationReason = 'manual'): boolean {
    if (!token) return false;
    const hash = tokenHash(token);
    const stored = this.#byTokenHash.get(hash);
    if (!stored) return false;

    clearTimeout(stored.timer);
    this.#byTokenHash.delete(hash);
    const runTokens = this.#tokenHashesByRunId.get(stored.runId);
    if (runTokens) {
      runTokens.delete(hash);
      if (runTokens.size === 0) this.#tokenHashesByRunId.delete(stored.runId);
    }
    return true;
  }

  revokeRun(runId: string, reason: ToolTokenRevocationReason = 'manual'): number {
    const runTokens = this.#tokenHashesByRunId.get(runId);
    if (!runTokens) return 0;
    const hashes = [...runTokens];
    let revoked = 0;
    for (const hash of hashes) {
      const stored = this.#byTokenHash.get(hash);
      if (stored && this.revokeToken(stored.token, reason)) revoked += 1;
    }
    return revoked;
  }

  activeTokenCount(): number {
    return this.#byTokenHash.size;
  }

  activeRunTokenCount(runId: string): number {
    return this.#tokenHashesByRunId.get(runId)?.size ?? 0;
  }

  clear(): void {
    for (const stored of this.#byTokenHash.values()) {
      clearTimeout(stored.timer);
    }
    this.#byTokenHash.clear();
    this.#tokenHashesByRunId.clear();
  }
}

export const toolTokenRegistry = new ToolTokenRegistry();
