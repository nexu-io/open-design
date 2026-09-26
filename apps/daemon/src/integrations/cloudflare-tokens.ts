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
//
// Concurrency contract: ONE daemon per data dir. The daemon already owns the
// data dir's SQLite database and IPC endpoint, so a second daemon on the same
// root is outside the supported topology. Nothing here (neither the in-memory
// lock nor the generation compare-and-set) coordinates across processes; the
// generation guards interleavings INSIDE this daemon — a disconnect or a
// reconnect that lands while a refresh is waiting on the token endpoint.

import { access, chmod, mkdir, open, readFile, rename, rm, type FileHandle } from 'node:fs/promises';
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
  /** Email of the Cloudflare user who authorized the token, captured at
   * connect time via `GET /user` (needs the `user-details.read` scope). The
   * Access "only me" rule resolves from this record so a deploy never depends
   * on a live user lookup succeeding after the assets are already uploaded. */
  email?: string;
  /** Monotonic counter bumped on every persist, used to detect a credential
   * that was cleared or replaced (disconnect, reconnect) underneath an
   * in-flight refresh in this daemon. */
  generation: number;
  /** Wall-clock epoch ms when this record was first persisted. */
  savedAt: number;
}

export interface CloudflareOAuthTokensFile {
  token?: StoredCloudflareOAuthToken;
  /** File-level monotonic counter bumped on EVERY write (including clear) so a
   * cleared credential's generation is never reused by a later connect — a
   * stale compare-and-set from before the clear can't match a brand-new token. */
  lastGeneration?: number;
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
  const out: CloudflareOAuthTokensFile = {};
  if (typeof raw.lastGeneration === 'number' && Number.isFinite(raw.lastGeneration)) {
    out.lastGeneration = raw.lastGeneration;
  }
  const tok = sanitizeToken(raw.token);
  if (tok) {
    out.token = tok;
    // A file written before `lastGeneration` existed (or hand-edited without
    // it) must still be refreshable: the compare-and-set persist matches on the
    // FILE generation, so seed it from the token or every refresh fails the
    // check and the expired access token is returned forever.
    if (out.lastGeneration === undefined) out.lastGeneration = tok.generation;
  }
  return out;
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
  const email =
    typeof raw.email === 'string' && raw.email.trim()
      ? raw.email.trim()
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
  if (email) out.email = email;
  if (expiresAt !== undefined) out.expiresAt = expiresAt;
  return out;
}

/** The file as BOTH the sanitized shape and the raw JSON behind it. A clear
 * needs the raw object: a record whose credential no longer sanitizes is still
 * a credential on disk, and only the bytes say which string it is. */
async function readCloudflareOAuthTokensFileWithRaw(
  dataDir: string,
): Promise<{ raw: unknown; file: CloudflareOAuthTokensFile }> {
  let text: string;
  try {
    text = await readFile(tokensFile(dataDir), 'utf8');
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'ENOENT') return { raw: undefined, file: { ...EMPTY } };
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    if (e.name !== 'SyntaxError') throw err;
    console.error(
      '[cloudflare-tokens] Corrupted JSON, returning empty:',
      e.message,
    );
    // An unparsable file can still carry a live refresh/access token in its
    // bytes; salvage those strings so a disconnect revokes the grant instead
    // of wiping the file and leaving the credential usable at Cloudflare.
    const field = (key: string): string | undefined => {
      const match = new RegExp('"' + key + '"\\s*:\\s*"([^"\\\\]+)"').exec(text);
      return match ? match[1] : undefined;
    };
    const salvaged = {
      token: {
        accessToken: field('accessToken'),
        refreshToken: field('refreshToken'),
        clientId: field('clientId'),
      },
    };
    return { raw: salvaged, file: { ...EMPTY } };
  }
  return { raw, file: sanitizeCloudflareOAuthTokensFile(raw) };
}

export async function readCloudflareOAuthTokensFile(
  dataDir: string,
): Promise<CloudflareOAuthTokensFile> {
  return (await readCloudflareOAuthTokensFileWithRaw(dataDir)).file;
}

const writeLocks = new Map<string, Promise<unknown>>();

function nextLastGeneration(file: CloudflareOAuthTokensFile): number {
  return (file.lastGeneration ?? 0) + 1;
}

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

/** Flush the directory entry a rename just landed. Syncing the temp file makes
 * its BYTES durable, but the rename itself is metadata of the parent directory,
 * and a power loss can still drop it — the old entry (or none) survives with
 * the new bytes orphaned.
 *
 * Fully best-effort BY CONSTRUCTION: the caller flushes the temp file's bytes
 * and commits the rename BEFORE this runs, so the credential is already on
 * disk. A directory that cannot be opened or synced — whether the platform
 * simply does not support directory fsync (EISDIR/EPERM/EINVAL/ENOTSUP) or the
 * filesystem answers a transient EIO — leaves the write exactly as durable as
 * that data-file flush made it. Re-throwing here would read downstream as "the
 * write failed" and trigger a destructive recovery (revoking a grant whose
 * token is already on disk). Log and continue instead. */
export async function fsyncDirectory(dir: string): Promise<void> {
  let handle: FileHandle;
  try {
    handle = await open(dir, 'r');
  } catch (err) {
    console.warn(`[cloudflare-tokens] directory fsync skipped for ${dir}: ${String((err as Error)?.message ?? err)}`);
    return;
  }
  try {
    await handle.sync();
  } catch (err) {
    console.warn(`[cloudflare-tokens] directory fsync failed for ${dir}: ${String((err as Error)?.message ?? err)}`);
  } finally {
    await handle.close();
  }
}

async function writeTokensFile(
  dataDir: string,
  next: CloudflareOAuthTokensFile,
): Promise<CloudflareOAuthTokensFile> {
  const file = tokensFile(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.' + randomBytes(8).toString('hex') + '.tmp';
  // The bearer credential must never exist on disk in a world-readable file,
  // not even briefly: create the temp file owner-only (`mode` applies at
  // creation, before any bytes land) with exclusive creation so a colliding
  // name can never be reused, then lock the mode down again (umask-proof) and
  // rename over the target. A crash before the rename leaves only a 0600 temp.
  //
  // fsync BEFORE the rename (same discipline as the Workers config writer in
  // deploy.ts): a rename is atomic only for the directory entry. Without
  // flushing the temp file's bytes first, a power loss after the rename can
  // leave the target pointing at an empty or truncated file — the credential
  // (and its refresh token) gone with the entry kept.
  try {
    const handle = await open(tmp, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(next, null, 2), 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await lockdownTokenFileMode(tmp);
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
  await lockdownTokenFileMode(file);
  // The rename is durable only once the directory entry is (see fsyncDirectory).
  await fsyncDirectory(path.dirname(file));
  return next;
}

// Best-effort lockdown of file mode. The access token grants posting-as-you
// against the user's Cloudflare account, so we restrict to owner-only
// read/write where the OS supports it.
async function lockdownTokenFileMode(file: string): Promise<void> {
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
    const file = await readCloudflareOAuthTokensFile(dataDir);
    const gen = nextLastGeneration(file);
    token.generation = gen;
    await writeTokensFile(dataDir, { token, lastGeneration: gen });
  });
}

/** Compare-and-set persist: write the token only if the store still holds a
 * token whose file generation equals expectedGeneration. Returns false when the
 * token was cleared (disconnect) or replaced (a reconnect in this daemon)
 * while the caller was computing its refresh - the caller must then treat the
 * credential as superseded rather than resurrect it. The check is in-process
 * only (see the contract at the top of this file). */
export async function setCloudflareOAuthTokenIfGenerationMatches(
  dataDir: string,
  token: StoredCloudflareOAuthToken,
  expectedGeneration: number,
): Promise<boolean> {
  return withLock(dataDir, async () => {
    const file = await readCloudflareOAuthTokensFile(dataDir);
    // Compare the FILE generation (not the token's): clear() bumps it without
    // leaving a token, so a stale refresh read before a disconnect can never
    // match a brand-new token written after a reconnect (ABA).
    if (!file.token || file.lastGeneration !== expectedGeneration) return false;
    const gen = nextLastGeneration(file);
    token.generation = gen;
    await writeTokensFile(dataDir, { token, lastGeneration: gen });
    return true;
  });
}

/** The outcome of a guarded write: whether it landed and, when it did, the
 * record it replaced. `displaced` is read INSIDE the store lock, in the same
 * critical section as the write, so it is exactly the credential the write
 * took off disk — a refresh whose compare-and-set landed just before the write
 * shows up here as the rotated record, and one that lands after it fails its
 * generation check. A caller that read the store before taking the lock could
 * see neither, and would revoke (or restore) a record the store no longer
 * holds while the rotated refresh token it does hold is orphaned. */
export type GuardedCloudflareOAuthTokenWrite =
  | { written: true; displaced: StoredCloudflareOAuthToken | null }
  | { written: false };

/** Guarded persist: write the token only if guard() still holds inside the
 * lock. Lets an OAuth attempt re-check its attempt generation at the last
 * instant so a concurrent cancel/disconnect (which bumps the generation)
 * aborts the write instead of leaving a stale credential behind. Returns the
 * record the write displaced (see GuardedCloudflareOAuthTokenWrite). */
export async function setCloudflareOAuthTokenGuarded(
  dataDir: string,
  token: StoredCloudflareOAuthToken,
  guard: () => boolean,
): Promise<GuardedCloudflareOAuthTokenWrite> {
  return withLock(dataDir, async () => {
    if (!guard()) return { written: false };
    const file = await readCloudflareOAuthTokensFile(dataDir);
    const gen = nextLastGeneration(file);
    token.generation = gen;
    await writeTokensFile(dataDir, { token, lastGeneration: gen });
    return { written: true, displaced: file.token ?? null };
  });
}

/** The credential a clear must still name when nothing sanitizes out of the
 * file. A record with a blank `accessToken` drops out of the typed shape, but
 * its refresh token is a live grant on disk; handing back null for it is what
 * let a disconnect skip the revoke and leave that grant usable.
 *
 * Whichever string the file still carries lands in the field the caller reads:
 * a refresh token in `refreshToken`, so the revoke's `token_type_hint` says
 * `refresh_token` and the grant (not just a copy of the access token) dies.
 * Null when the raw object yields neither string. */
function recoveredDisplacedCredential(raw: unknown): StoredCloudflareOAuthToken | null {
  if (!isPlainObject(raw) || !isPlainObject(raw.token)) return null;
  const tok = raw.token;
  const str = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;
  const accessToken = str(tok.accessToken);
  const refreshToken = str(tok.refreshToken);
  if (!refreshToken && !accessToken) return null;
  const clientId = str(tok.clientId);
  const generation = tok.generation;
  const savedAt = tok.savedAt;
  return {
    // Whichever half the file carried. The refresh token rides in its own
    // field so the caller's `refreshToken || accessToken` picks it first.
    accessToken: accessToken ?? '',
    ...(refreshToken ? { refreshToken } : {}),
    tokenType: str(tok.tokenType) ?? 'Bearer',
    ...(clientId ? { clientId } : {}),
    generation:
      typeof generation === 'number' && Number.isFinite(generation)
        ? generation
        : 0,
    savedAt:
      typeof savedAt === 'number' && Number.isFinite(savedAt)
        ? savedAt
        : Date.now(),
  };
}

/** Atomically delete the stored Cloudflare OAuth token. Bumps the file
 * generation so a cleared credential's generation is never reused. Returns
 * the record the clear took off disk, read inside the lock so a caller
 * revoking it at Cloudflare names the credential the store actually held —
 * not one a concurrent refresh has since rotated away (see
 * GuardedCloudflareOAuthTokenWrite).
 *
 * Keyed on the FILE existing, not on a token parsing out of it: a corrupt or
 * hand-edited file that no longer sanitizes to a token can still carry a
 * refresh token or an access token in its bytes, and a disconnect that
 * skipped it would leave that credential on disk. Such a file is recovered
 * from its raw object (see recoveredDisplacedCredential) rather than reported
 * as nothing to revoke. */
export async function clearCloudflareOAuthToken(dataDir: string): Promise<StoredCloudflareOAuthToken | null> {
  return withLock(dataDir, async () => {
    if (!(await tokensFileExists(dataDir))) return null;
    const { raw, file } = await readCloudflareOAuthTokensFileWithRaw(dataDir);
    const gen = nextLastGeneration(file);
    await writeTokensFile(dataDir, { lastGeneration: gen });
    return file.token ?? recoveredDisplacedCredential(raw);
  });
}

async function tokensFileExists(dataDir: string): Promise<boolean> {
  try {
    await access(tokensFile(dataDir));
    return true;
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'ENOENT') return false;
    throw err;
  }
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
