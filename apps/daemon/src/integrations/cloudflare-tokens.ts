// Persistent Cloudflare OAuth token storage.
//
// Mirrors the pattern in `mcp-tokens.ts` and `xai-tokens.ts` (atomic write
// + per-dataDir in-memory mutex + chmod 0600), for the Cloudflare single-token
// case: there's only ever one Cloudflare account active per dataDir, so we
// don't need the per-server-id map. The on-disk layout is `{ token: ... }` to
// leave room for future multi-account schemas without breaking existing files.
//
// File: `<dataDir>/cloudflare-oauth-tokens.json`
// Permissions: chmod 0600 best-effort on POSIX.
// Lock: in-memory promise chain keyed by dataDir.

import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

/**
 * Stored Cloudflare OAuth token. Mirrors the relevant subset of an OAuth 2.0
 * token-endpoint response (RFC 6749 §5.1), plus the client/redirect identity
 * that issued it. `clientId` + `redirectUri` are persisted alongside the
 * token so a changed local OAuth client fails closed ("reconnect needed")
 * instead of silently refreshing with a mismatched registration.
 */
export interface StoredCloudflareOAuthToken {
  /** The bearer token to send as `Authorization: Bearer …`. */
  accessToken: string;
  /** Refresh token (RFC 6749 §6) if the auth server issued one. */
  refreshToken?: string;
  /** Absolute epoch ms at which `accessToken` expires. Optional — a token
   * may be non-expiring. */
  expiresAt?: number;
  /** RFC 6749 §5.1 token_type. Almost always `Bearer`. */
  tokenType: string;
  /** Space-separated scopes granted (verbatim from the token response). */
  scope?: string;
  /** Cloudflare account id the token was authorized against. */
  accountId?: string;
  /** client_id that authorized this token (PKCE public client; no secret). */
  clientId?: string;
  /** redirect_uri the token was issued for. */
  redirectUri?: string;
  /** Monotonic counter bumped on every persist, used to detect a credential
   * that a sibling process rotated underneath an in-flight refresh. */
  generation: number;
  /** Wall-clock epoch ms when this record was first persisted. */
  savedAt: number;
}

export interface CloudflareOAuthTokensFile {
  token?: StoredCloudflareOAuthToken;
}

const EMPTY: CloudflareOAuthTokensFile = {};

function tokensFile(dataDir: string): string {
  return path.join(dataDir, 'cloudflare-oauth-tokens.json');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Coerce a freeform JSON blob into the typed shape, dropping anything that
 * doesn't deserialize cleanly. Used both at read time and as a defensive pass
 * when third-party tooling has hand-edited the file. */
export function sanitizeCloudflareOAuthTokensFile(
  raw: unknown,
): CloudflareOAuthTokensFile {
  if (!isPlainObject(raw)) return {};
  const tok = sanitizeToken(raw.token);
  return tok ? { token: tok } : {};
}

function sanitizeToken(raw: unknown): StoredCloudflareOAuthToken | null {
  if (!isPlainObject(raw)) return null;
  const accessToken =
    typeof raw.accessToken === 'string' ? raw.accessToken.trim() : '';
  if (!accessToken) return null;
  const tokenType =
    typeof raw.tokenType === 'string' && raw.tokenType.trim()
      ? raw.tokenType.trim()
      : 'Bearer';
  const refreshToken =
    typeof raw.refreshToken === 'string' && raw.refreshToken.trim()
      ? raw.refreshToken.trim()
      : undefined;
  const scope =
    typeof raw.scope === 'string' && raw.scope.trim()
      ? raw.scope.trim()
      : undefined;
  const accountId =
    typeof raw.accountId === 'string' && raw.accountId.trim()
      ? raw.accountId.trim()
      : undefined;
  const clientId =
    typeof raw.clientId === 'string' && raw.clientId.trim()
      ? raw.clientId.trim()
      : undefined;
  const redirectUri =
    typeof raw.redirectUri === 'string' && raw.redirectUri.trim()
      ? raw.redirectUri.trim()
      : undefined;
  const generation =
    typeof raw.generation === 'number' && Number.isFinite(raw.generation)
      ? raw.generation
      : 0;
  const expiresAt =
    typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt)
      ? raw.expiresAt
      : undefined;
  const savedAt =
    typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt)
      ? raw.savedAt
      : Date.now();
  const out: StoredCloudflareOAuthToken = {
    accessToken,
    tokenType,
    generation,
    savedAt,
  };
  if (refreshToken) out.refreshToken = refreshToken;
  if (scope) out.scope = scope;
  if (accountId) out.accountId = accountId;
  if (clientId) out.clientId = clientId;
  if (redirectUri) out.redirectUri = redirectUri;
  if (expiresAt !== undefined) out.expiresAt = expiresAt;
  return out;
}

export async function readCloudflareOAuthTokensFile(
  dataDir: string,
): Promise<CloudflareOAuthTokensFile> {
  try {
    const raw = await readFile(tokensFile(dataDir), 'utf8');
    return sanitizeCloudflareOAuthTokensFile(JSON.parse(raw));
  } catch (err: unknown) {
    const e = err as { code?: string; name?: string; message?: string };
    if (e.code === 'ENOENT') return { ...EMPTY };
    if (e.name === 'SyntaxError') {
      console.error(
        '[cloudflare-tokens] Corrupted JSON, returning empty:',
        e.message,
      );
      return { ...EMPTY };
    }
    throw err;
  }
}

const writeLocks = new Map<string, Promise<unknown>>();

async function withLock<T>(dataDir: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeLocks.get(dataDir) ?? Promise.resolve();
  const task = prev.catch(() => {}).then(fn);
  writeLocks.set(dataDir, task);
  try {
    return await task;
  } finally {
    if (writeLocks.get(dataDir) === task) writeLocks.delete(dataDir);
  }
}

async function writeTokensFile(
  dataDir: string,
  next: CloudflareOAuthTokensFile,
): Promise<CloudflareOAuthTokensFile> {
  const file = tokensFile(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.' + randomBytes(4).toString('hex') + '.tmp';
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, file);
  // Best-effort lockdown of file mode. The access token grants posting-as-you
  // against the user's Cloudflare account, so we restrict to owner-only
  // read/write where the OS supports it.
  try {
    await chmod(file, 0o600);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code !== 'ENOTSUP' && e.code !== 'EPERM') {
      console.warn(
        '[cloudflare-tokens] could not chmod 0600',
        file,
        e.message ?? err,
      );
    }
  }
  return next;
}

/** Get the current stored Cloudflare OAuth token, or null when none is stored
 * (or the persisted entry is malformed). */
export async function getCloudflareOAuthToken(
  dataDir: string,
): Promise<StoredCloudflareOAuthToken | null> {
  const file = await readCloudflareOAuthTokensFile(dataDir);
  return file.token ?? null;
}

/** Atomically replace the stored Cloudflare OAuth token. */
export async function setCloudflareOAuthToken(
  dataDir: string,
  token: StoredCloudflareOAuthToken,
): Promise<void> {
  await withLock(dataDir, async () => {
    await writeTokensFile(dataDir, { token });
  });
}

/** Compare-and-set persist: write the token only if the store still holds a
 * token whose generation equals expectedGeneration. Returns false when the
 * token was cleared (disconnect) or replaced (another writer) while the caller
 * was computing its refresh - the caller must then treat the credential as
 * superseded rather than resurrect it. */
export async function setCloudflareOAuthTokenIfGenerationMatches(
  dataDir: string,
  token: StoredCloudflareOAuthToken,
  expectedGeneration: number,
): Promise<boolean> {
  return withLock(dataDir, async () => {
    const file = await readCloudflareOAuthTokensFile(dataDir);
    if (!file.token || file.token.generation !== expectedGeneration) return false;
    await writeTokensFile(dataDir, { token });
    return true;
  });
}

/** Guarded persist: write the token only if guard() still holds inside the
 * lock. Lets an OAuth attempt re-check its attempt generation at the last
 * instant so a concurrent cancel/disconnect (which bumps the generation)
 * aborts the write instead of leaving a stale credential behind. */
export async function setCloudflareOAuthTokenGuarded(
  dataDir: string,
  token: StoredCloudflareOAuthToken,
  guard: () => boolean,
): Promise<boolean> {
  return withLock(dataDir, async () => {
    if (!guard()) return false;
    await writeTokensFile(dataDir, { token });
    return true;
  });
}

/** Atomically delete the stored Cloudflare OAuth token. No-op when absent. */
export async function clearCloudflareOAuthToken(dataDir: string): Promise<void> {
  await withLock(dataDir, async () => {
    const file = await readCloudflareOAuthTokensFile(dataDir);
    if (!file.token) return;
    await writeTokensFile(dataDir, {});
  });
}

/** True when the stored token is past its `expiresAt` (or within `skew`
 * milliseconds of expiring). Returns false when no `expiresAt` is recorded —
 * some providers issue non-expiring tokens. */
export function isCloudflareOAuthTokenExpired(
  token: StoredCloudflareOAuthToken,
  now: number = Date.now(),
  skew: number = 120_000,
): boolean {
  if (typeof token.expiresAt !== 'number') return false;
  return token.expiresAt - skew <= now;
}
