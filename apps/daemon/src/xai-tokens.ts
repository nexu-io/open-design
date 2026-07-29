// Persistent xAI OAuth token storage.
//
// Mirrors the pattern in `mcp-tokens.ts` (atomic write + per-dataDir
// in-memory mutex + chmod 0600), but simplified for the xAI single-token
// case: there's only ever one xAI account active per dataDir, so we
// don't need the per-server-id map. The on-disk layout is `{ token: ... }`
// to leave room for future multi-account or multi-account-id schemas
// without breaking existing files.
//
// File: `<dataDir>/xai-tokens.json`
// Permissions: chmod 0600 best-effort on POSIX.
// Lock: in-memory promise chain keyed by dataDir.

import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

/**
 * Stored xAI OAuth token. Mirrors the relevant subset of an OAuth 2.0
 * token-endpoint response (RFC 6749 §5.1). client_id, redirect_uri, and
 * issuer aren't persisted because they're constants in `xai-oauth.ts`.
 */
export interface StoredXAIToken {
  /** The bearer token to send as `Authorization: Bearer …`. */
  accessToken: string;
  /** Refresh token (RFC 6749 §6) if the auth server issued one. */
  refreshToken?: string;
  /** Absolute epoch ms at which `accessToken` expires. Optional — some
   * providers never expire. */
  expiresAt?: number;
  /** RFC 6749 §5.1 token_type. Almost always `Bearer`. */
  tokenType: string;
  /** Space-separated scopes granted (verbatim from the token response). */
  scope?: string;
  /** Wall-clock epoch ms when this record was first persisted. */
  savedAt: number;
}

export interface XAITokensFile {
  token?: StoredXAIToken;
}

const EMPTY: XAITokensFile = {};

function tokensFile(dataDir: string): string {
  return path.join(dataDir, 'xai-tokens.json');
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** Coerce a freeform JSON blob into the typed shape, dropping anything
 * that doesn't deserialize cleanly. Used both at read time and as a
 * defensive pass when third-party tooling has hand-edited the file. */
export function sanitizeTokensFile(raw: unknown): XAITokensFile {
  if (!isPlainObject(raw)) return {};
  const tok = sanitizeToken(raw.token);
  return tok ? { token: tok } : {};
}

function sanitizeToken(raw: unknown): StoredXAIToken | null {
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
  const expiresAt =
    typeof raw.expiresAt === 'number' && Number.isFinite(raw.expiresAt)
      ? raw.expiresAt
      : undefined;
  const savedAt =
    typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt)
      ? raw.savedAt
      : Date.now();
  const out: StoredXAIToken = { accessToken, tokenType, savedAt };
  if (refreshToken) out.refreshToken = refreshToken;
  if (scope) out.scope = scope;
  if (expiresAt !== undefined) out.expiresAt = expiresAt;
  return out;
}

export async function readTokensFile(dataDir: string): Promise<XAITokensFile> {
  try {
    const raw = await readFile(tokensFile(dataDir), 'utf8');
    return sanitizeTokensFile(JSON.parse(raw));
  } catch (err: unknown) {
    const e = err as { code?: string; name?: string; message?: string };
    if (e.code === 'ENOENT') return { ...EMPTY };
    if (e.name === 'SyntaxError') {
      console.error('[xai-tokens] Corrupted JSON, returning empty:', e.message);
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
  next: XAITokensFile,
): Promise<XAITokensFile> {
  const file = tokensFile(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.' + randomBytes(4).toString('hex') + '.tmp';
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, file);
  // Best-effort lockdown of file mode. Bearer tokens grant posting-as-you
  // against xAI APIs (and the user's X account scope), so we restrict to
  // owner-only read/write where the OS supports it.
  try {
    await chmod(file, 0o600);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code !== 'ENOTSUP' && e.code !== 'EPERM') {
      console.warn(
        '[xai-tokens] could not chmod 0600',
        file,
        e.message ?? err,
      );
    }
  }
  return next;
}

/** Get the current stored xAI token, or null when none is stored
 * (or the persisted entry is malformed). */
export async function getXAIToken(
  dataDir: string,
): Promise<StoredXAIToken | null> {
  const file = await readTokensFile(dataDir);
  return file.token ?? null;
}

/** Atomically replace the stored xAI token. */
export async function setXAIToken(
  dataDir: string,
  token: StoredXAIToken,
): Promise<void> {
  await withLock(dataDir, async () => {
    await writeTokensFile(dataDir, { token });
  });
}

/** Atomically delete the stored xAI token. No-op when absent. */
export async function clearXAIToken(dataDir: string): Promise<void> {
  await withLock(dataDir, async () => {
    const file = await readTokensFile(dataDir);
    if (!file.token) return;
    await writeTokensFile(dataDir, {});
  });
}

/** True when the stored token is past its `expiresAt` (or within `skew`
 * milliseconds of expiring). Returns false when no `expiresAt` is
 * recorded — some providers issue non-expiring tokens. */
export function isXAITokenExpired(
  token: StoredXAIToken,
  now: number = Date.now(),
  skew: number = 120_000,
): boolean {
  if (typeof token.expiresAt !== 'number') return false;
  return token.expiresAt - skew <= now;
}
