// OrcaRouter credentials — one interface, two acquisition paths.
//
// A user can arrive at OrcaRouter either by pasting an existing `sk-orca-…`
// key or by signing in through OAuth 2.0 + PKCE. Both paths end at the same
// place: a plain OrcaRouter API key. That equality is the point of this file.
//
// Everything downstream — the chat proxy, the media dispatcher, model
// discovery — reads credentials through `credentialApiKey` and never learns
// which adapter produced them. Adding a third acquisition path means adding an
// adapter here, not editing five call sites.
//
// Generation safety. OrcaRouter keys are durable: the relay issues one long
// lived key and there is no refresh grant to call. A `401` therefore means
// "this exact credential was revoked", not "retry". We record a monotonic
// generation on every successful acquisition and only mark the credential
// `needsReauth` when the rejected generation is still the stored one — a late
// failure from a request issued before a re-login must not poison the fresh
// credential.

import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

import {
  ORCAROUTER_ENV_API_KEY,
  ORCAROUTER_ENV_API_KEY_LEGACY,
  ORCAROUTER_ENV_API_KEY_PREFIXED,
  ORCAROUTER_KEY_PREFIX,
  ORCAROUTER_PROVIDER_ID,
  resolveOrcaRouterApiBase,
} from './orcarouter.js';
import type { ByokChatProviderConfig } from '@open-design/contracts';

type Env = Record<string, string | undefined>;

/** Re-exported so consumers of the credential seam need one import, not two. */
export { ORCAROUTER_PROVIDER_ID };

/** Which adapter produced a credential. Downstream code must not branch on it. */
export type OrcaRouterCredentialSource = 'api-key' | 'pkce';

/**
 * `active` is usable. `needsReauth` means the relay rejected this exact
 * credential; it stays unusable until a new acquisition succeeds, and it is
 * never silently deleted — a transient misclassification must not become
 * irreversible account loss.
 */
export type OrcaRouterAuthState = 'active' | 'needsReauth';

export interface OrcaRouterCredential {
  apiKey: string;
  source: OrcaRouterCredentialSource;
  /** Stable account identity; `orcarouter` when the account is not yet known. */
  accountId: string;
  /** Increments on every successful acquisition. */
  generation: number;
  authState: OrcaRouterAuthState;
  /** Scope the auth server actually granted (PKCE path only). */
  scope?: string;
  /** OrcaRouter `user_id` from the exchange response (PKCE path only). */
  userId?: string;
  savedAt: number;
  /** Why the credential needs re-authentication, for the UI to surface. */
  reauthReason?: string;
}

export interface OrcaRouterCredentialsFile {
  credential?: OrcaRouterCredential;
}

export const ORCAROUTER_SCOPE_API = 'api';

export const ORCAROUTER_CREDENTIALS_FILENAME = 'orcarouter-credentials.json';

/**
 * The key the environment hands this provider, or an empty string.
 *
 * Exported so `resolveProviderConfig` can fold it into the single provider
 * chain every other consumer reads, instead of each surface calling this
 * directly and drifting. The variable names are declared in `orcarouter.ts`,
 * the module that owns OrcaRouter's configuration surface.
 */
export function orcaRouterEnvApiKey(env: Env = process.env): string {
  return cleanOrcaRouterKey(
    env[ORCAROUTER_ENV_API_KEY]
    ?? env[ORCAROUTER_ENV_API_KEY_PREFIXED]
    ?? env[ORCAROUTER_ENV_API_KEY_LEGACY]
    ?? '',
  );
}

/**
 * The only accessor downstream code should use to get a usable key.
 *
 * A `needsReauth` credential is terminal: the relay rejected this exact key, so
 * returning it would make every consumer replay a request the provider has
 * already refused, and would make catalogue discovery re-issue the rejected
 * credential on each poll. The record stays on disk (and is reported through
 * status) with its key intact so reconnection can replace it — it simply
 * resolves to no usable key in the meantime.
 */
export function credentialApiKey(credential: OrcaRouterCredential | null): string {
  if (!isCredentialUsable(credential)) return '';
  return credential!.apiKey;
}

export function isCredentialUsable(credential: OrcaRouterCredential | null): boolean {
  return Boolean(credential && credential.apiKey && credential.authState === 'active');
}

// ───────────────────────────────────────────────────────────────────────
// In-flight authorization attempts.
// ───────────────────────────────────────────────────────────────────────

/**
 * A monotonic counter over authorization attempts, shared by the route that
 * owns the loopback listener and the exchange that runs off it.
 *
 * Cancel and Disconnect must be able to say "the attempt that was running is
 * over". The listener alone cannot carry that: `stopActiveListener()` releases
 * the port, but the PKCE state stays valid in `PendingAuthCache`, so a paste-back
 * with that state would still exchange and store a credential the user just
 * abandoned — and an exchange already awaiting the provider would finish after
 * a Disconnect and restore the account.
 *
 * Every state-changing entry point (start, cancel, disconnect, and a successful
 * persistence) bumps the generation. An exchange captures it before its first
 * await and refuses to commit unless the generation is unchanged, so a
 * superseded attempt becomes a no-op instead of a race.
 */
export class OrcaRouterAuthAttempts {
  private generation = 0;

  /** Invalidate every attempt that came before; returns the new generation. */
  bump(): number {
    this.generation += 1;
    return this.generation;
  }

  current(): number {
    return this.generation;
  }

  /** False once any newer attempt has superseded `generation`. */
  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }
}

/** Thrown when an exchange loses the race against a cancel, disconnect, or newer login. */
export class OrcaRouterAttemptSupersededError extends Error {
  constructor() {
    super('OrcaRouter authorization was cancelled or replaced before it completed.');
    this.name = 'OrcaRouterAttemptSupersededError';
  }
}

/** Next generation for a replacement credential. */
export function nextCredentialGeneration(
  previous: OrcaRouterCredential | null | undefined,
): number {
  return (previous?.generation ?? 0) + 1;
}

/**
 * Lightweight shape check only. A well-formed prefix proves nothing about
 * validity, so this catches paste mistakes and stops there — the first real
 * request establishes whether the credential actually works.
 */
export function looksLikeOrcaRouterKey(value: string): boolean {
  return value.trim().startsWith(ORCAROUTER_KEY_PREFIX);
}

/**
 * Strip the whitespace and zero-width characters a paste can smuggle in. A key
 * like `sk-orca-…\n` would otherwise travel to the relay malformed and fail
 * with an error that looks like a server problem.
 *
 * The zero-width strip runs FIRST: `trim()` only removes characters it agrees
 * are whitespace, so a newline sitting behind a zero-width joiner survives a
 * trim-then-strip order and reaches the relay intact.
 */
export function cleanOrcaRouterKey(value: string): string {
  return value.replace(/[\u200b-\u200d\ufeff]/gu, '').trim();
}

// ───────────────────────────────────────────────────────────────────────
// Adapter 1 — an existing API key.
// ───────────────────────────────────────────────────────────────────────

export interface ApiKeyAdapterInput {
  apiKey: string;
  previous?: OrcaRouterCredential | null;
  now?: number;
}

/**
 * Wrap a user-supplied key as a credential. The key is adopted verbatim; the
 * generation advances so any in-flight request holding the previous credential
 * can no longer mark the store dirty.
 */
export function acquireApiKeyCredential(input: ApiKeyAdapterInput): OrcaRouterCredential {
  const apiKey = cleanOrcaRouterKey(input.apiKey);
  if (!apiKey) throw new Error('OrcaRouter API key is empty.');
  const previous = input.previous ?? null;
  return {
    apiKey,
    source: 'api-key',
    // A pasted key carries no account identity yet; reuse the previous one when
    // the user is re-pasting over the same account so the reauth bookkeeping
    // stays attached to the right account.
    accountId: previous?.accountId ?? ORCAROUTER_PROVIDER_ID,
    generation: nextCredentialGeneration(previous),
    authState: 'active',
    savedAt: input.now ?? Date.now(),
  };
}

// ───────────────────────────────────────────────────────────────────────
// Adapter 2 — OAuth 2.0 + PKCE.
// ───────────────────────────────────────────────────────────────────────

/** The subset of the exchange response (`POST {auth}/api/v1/auth/keys`) we use. */
export interface PkceExchangeResult {
  key: string;
  user_id?: string;
  scope?: string;
}

export interface PkceAdapterInput {
  exchange: PkceExchangeResult;
  previous?: OrcaRouterCredential | null;
  now?: number;
}

/** Thrown when the auth server granted less than this integration needs. */
export class OrcaRouterScopeDowngradeError extends Error {
  constructor(readonly grantedScope: string) {
    super(
      `OrcaRouter granted scope "${grantedScope}", which does not include "${ORCAROUTER_SCOPE_API}". `
      + 'Your workspace role may not permit this grant — re-authorize with an account that can, '
      + 'or paste an API key with the right permissions.',
    );
    this.name = 'OrcaRouterScopeDowngradeError';
  }
}

/**
 * Wrap a PKCE exchange result as a credential.
 *
 * The response's `scope` is what was *granted*, not what we asked for, so it is
 * checked rather than assumed. A workspace that downgraded the grant is
 * surfaced as a typed error instead of being stored as if it were usable.
 *
 * There is no refresh token here and none is invented: OrcaRouter returns a
 * durable key, so this record is simply reused until the relay rejects it.
 */
export function acquirePkceCredential(input: PkceAdapterInput): OrcaRouterCredential {
  const exchange = input.exchange;
  const apiKey = cleanOrcaRouterKey(exchange?.key ?? '');
  if (!apiKey) {
    throw new Error('OrcaRouter authorization response did not include a key.');
  }
  const grantedScope = typeof exchange.scope === 'string' ? exchange.scope.trim() : '';
  const granted = grantedScope.split(/\s+/).filter(Boolean);
  if (!granted.includes(ORCAROUTER_SCOPE_API)) {
    throw new OrcaRouterScopeDowngradeError(grantedScope || '(none)');
  }
  const previous = input.previous ?? null;
  const userId = typeof exchange.user_id === 'string' ? exchange.user_id.trim() : '';
  const out: OrcaRouterCredential = {
    apiKey,
    source: 'pkce',
    accountId: userId || ORCAROUTER_PROVIDER_ID,
    generation: nextCredentialGeneration(previous),
    authState: 'active',
    scope: grantedScope,
    savedAt: input.now ?? Date.now(),
  };
  if (userId) out.userId = userId;
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// Terminal 401 handling.
// ───────────────────────────────────────────────────────────────────────

export interface RejectedCredential {
  accountId: string;
  generation: number;
  reason?: string;
}

/**
 * Mark the credential that made a rejected request.
 *
 * Returns the record unchanged when the rejection belongs to a superseded
 * generation or a different account, so a late `401` cannot take down a
 * credential the user just reconnected. The stored key is never removed here —
 * reauthorization replaces it, and only a successful replacement clears the
 * state.
 */
export function markCredentialNeedsReauth(
  current: OrcaRouterCredential | null,
  rejected: RejectedCredential,
): { credential: OrcaRouterCredential | null; changed: boolean } {
  if (!current) return { credential: current, changed: false };
  if (current.accountId !== rejected.accountId) return { credential: current, changed: false };
  if (current.generation !== rejected.generation) return { credential: current, changed: false };
  if (current.authState === 'needsReauth') return { credential: current, changed: false };
  return {
    credential: {
      ...current,
      authState: 'needsReauth',
      reauthReason: rejected.reason
        ?? 'OrcaRouter rejected this credential. Sign in again or paste a new API key.',
    },
    changed: true,
  };
}

/**
 * True when a relay response should be treated as a revoked credential rather
 * than a retryable error. Only a `401` qualifies; a `403` is an authorization
 * decision about the request, and `429` is backpressure.
 */
export function isTerminalAuthFailure(status: number): boolean {
  return status === 401;
}

// ───────────────────────────────────────────────────────────────────────
// Storage — the daemon's existing owner-only JSON store pattern.
// ───────────────────────────────────────────────────────────────────────

/**
 * The one file holding the OrcaRouter account, under an explicit daemon data
 * root.
 *
 * The root is passed in rather than recomputed: `OD_MEDIA_CONFIG_DIR` is a
 * narrow override for `media-config.json` only, so deriving this path from the
 * media-config directory would let two daemons that share a media config also
 * share — and overwrite — one account. A caller that only holds a project root
 * passes `resolveOrcaRouterDataDir(projectRoot)`.
 */
function credentialsFile(dataDir: string): string {
  return path.join(dataDir, ORCAROUTER_CREDENTIALS_FILENAME);
}

/**
 * The daemon data root for a caller that was not handed `RUNTIME_DATA_DIR`.
 *
 * Mirrors `resolveDataDir` (daemon-paths.ts) closely enough for a workspace-root
 * caller: an `OD_DATA_DIR` override wins, otherwise `<projectRoot>/.od`. The
 * daemon itself passes its already-resolved root explicitly; this is the
 * fallback for the media resolver, which reaches OrcaRouter through
 * `resolveProviderConfig(projectRoot, …)`.
 */
export function resolveOrcaRouterDataDir(
  projectRoot: string,
  env: Env = process.env,
): string {
  const raw = (env.OD_DATA_DIR ?? '').trim();
  if (!raw) return path.join(projectRoot, '.od');
  return path.isAbsolute(raw) ? raw : path.resolve(projectRoot, raw);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function sanitizeCredential(raw: unknown): OrcaRouterCredential | null {
  if (!isPlainObject(raw)) return null;
  const apiKey = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
  if (!apiKey) return null;
  const source: OrcaRouterCredentialSource =
    raw.source === 'pkce' ? 'pkce' : 'api-key';
  const authState: OrcaRouterAuthState =
    raw.authState === 'needsReauth' ? 'needsReauth' : 'active';
  const accountId =
    typeof raw.accountId === 'string' && raw.accountId.trim()
      ? raw.accountId.trim()
      : ORCAROUTER_PROVIDER_ID;
  const generation =
    typeof raw.generation === 'number' && Number.isFinite(raw.generation) && raw.generation >= 0
      ? Math.floor(raw.generation)
      : 1;
  const savedAt =
    typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) ? raw.savedAt : Date.now();
  const out: OrcaRouterCredential = { apiKey, source, accountId, generation, authState, savedAt };
  if (typeof raw.scope === 'string' && raw.scope.trim()) out.scope = raw.scope.trim();
  if (typeof raw.userId === 'string' && raw.userId.trim()) out.userId = raw.userId.trim();
  if (typeof raw.reauthReason === 'string' && raw.reauthReason.trim()) {
    out.reauthReason = raw.reauthReason.trim();
  }
  return out;
}

export function sanitizeCredentialsFile(raw: unknown): OrcaRouterCredentialsFile {
  if (!isPlainObject(raw)) return {};
  const credential = sanitizeCredential(raw.credential);
  return credential ? { credential } : {};
}

export async function readOrcaRouterCredential(
  dataDir: string,
): Promise<OrcaRouterCredential | null> {
  try {
    const raw = await readFile(credentialsFile(dataDir), 'utf8');
    return sanitizeCredentialsFile(JSON.parse(raw)).credential ?? null;
  } catch (err: unknown) {
    const e = err as { code?: string; name?: string; message?: string };
    if (e.code === 'ENOENT') return null;
    if (e.name === 'SyntaxError') {
      console.error('[orcarouter] Corrupted credentials JSON, treating as absent:', e.message);
      return null;
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

async function writeCredentialsFile(
  dataDir: string,
  next: OrcaRouterCredentialsFile,
): Promise<void> {
  const file = credentialsFile(dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  // Owner-only from the moment the bytes exist. `writeFile`'s default creation
  // mode is 0666 & ~umask, so a normal 022 umask would leave the temporary file
  // — and the renamed file, until the chmod below lands — readable by every OS
  // user. The mode is set at open() so there is no window in which the live
  // bearer key is group/world readable, and the rename does not widen it.
  try {
    await writeFile(tmp, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, file);
  } catch (err) {
    // A failed write or rename must not leave a half-written secret behind for
    // the next reader to trip over.
    await unlink(tmp).catch(() => {});
    throw err;
  }
  // Belt-and-braces for a pre-existing file whose mode the rename could not
  // narrow (rename keeps the temp file's mode, but an exotic filesystem may not
  // honour the creation mode).
  try {
    await chmod(file, 0o600);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code !== 'ENOTSUP' && e.code !== 'EPERM') {
      console.warn('[orcarouter] could not chmod 0600', file, e.message ?? err);
    }
  }
}

/** Persist a credential, replacing any previous record for this account. */
export async function setOrcaRouterCredential(
  dataDir: string,
  credential: OrcaRouterCredential,
): Promise<void> {
  await withLock(dataDir, async () => {
    await writeCredentialsFile(dataDir, { credential });
  });
}

/**
 * Apply a `401` to the stored credential. Generation-guarded, so a rejection
 * from a request issued before a re-login is a no-op.
 */
export async function markOrcaRouterCredentialNeedsReauth(
  dataDir: string,
  rejected: RejectedCredential,
): Promise<boolean> {
  return withLock(dataDir, async () => {
    const current = await readOrcaRouterCredential(dataDir);
    const { credential, changed } = markCredentialNeedsReauth(current, rejected);
    if (changed && credential) await writeCredentialsFile(dataDir, { credential });
    return changed;
  });
}

/**
 * Remove the stored credential. Only the user's explicit Disconnect reaches
 * this — a terminal auth failure marks state instead, so a misclassified
 * error can never destroy the only copy of a working key.
 */
export async function clearOrcaRouterCredential(dataDir: string): Promise<void> {
  await withLock(dataDir, async () => {
    await writeCredentialsFile(dataDir, {});
  });
}

// ───────────────────────────────────────────────────────────────────────
// Provider chain.
// ───────────────────────────────────────────────────────────────────────

export interface ResolvedOrcaRouterCredential {
  apiKey: string;
  baseUrl: string;
  source: 'env' | 'oauth-orcarouter-api-key' | 'oauth-orcarouter-pkce' | 'none';
  authState: OrcaRouterAuthState;
  accountId?: string;
  generation?: number;
  scope?: string;
  reauthReason?: string;
}

/**
 * The credential the daemon would use right now for OrcaRouter inference.
 *
 * `resolveOrcaRouterCredential` already checks the environment first and the
 * connect-flow store second, and reports `needsReauth` as an empty key. This
 * wrapper adds nothing but the `OAuthCredential` shape `resolveProviderConfig`
 * already returns, so a PKCE login and a pasted key reach the renderer and the
 * media dispatcher through one code path rather than two that can disagree.
 */
export async function resolveOrcaRouterOAuthCredential(
  dataDir: string,
  env: Env = process.env,
): Promise<{ apiKey: string; source: string } | null> {
  const resolved = await resolveOrcaRouterCredential(dataDir, env);
  if (!resolved.apiKey) return null;
  return { apiKey: resolved.apiKey, source: resolved.source };
}

/**
 * Fill in the daemon-held credential for a run whose provider config arrived
 * without one.
 *
 * The browser never receives the key — a PKCE account never puts one in the
 * form at all — so a run started from the named OrcaRouter provider reaches the
 * daemon with an empty `apiKey`. The daemon owns the credential; this is the
 * single place it hands it to a runtime. Every other field, including
 * `requiresApiKey`, is preserved, so the runtime still sends the key as a
 * bearer token rather than treating the provider as credential-free.
 *
 * A provider for any other protocol, or one that already carries a key, is
 * returned untouched.
 */
export async function attachOrcaRouterDaemonCredential(
  provider: ByokChatProviderConfig | null | undefined,
  dataDir: string,
): Promise<ByokChatProviderConfig | null | undefined> {
  if (!provider || provider.protocol !== ORCAROUTER_PROVIDER_ID) return provider;
  if (typeof provider.apiKey === 'string' && provider.apiKey.trim()) return provider;
  const resolved = await resolveOrcaRouterCredential(dataDir).catch(() => null);
  if (!resolved?.apiKey) return provider;
  return {
    ...provider,
    apiKey: resolved.apiKey,
    baseUrl: (provider.baseUrl ?? '').trim() || resolved.baseUrl,
  };
}

/**
 * Resolve the credential the daemon should use for OrcaRouter inference, in
 * precedence order:
 *
 *   1. `ORCA_API_KEY` / `OD_ORCAROUTER_API_KEY` / `ORCAROUTER_API_KEY`
 *   2. the `orcarouter` entry in the provider secret store
 *   3. the credential issued by the in-app connect flow (PKCE or pasted key)
 *
 * The third step is why this exists as a separate function: the connect flow
 * writes `orcarouter-credentials.json`, not the provider map, so a caller that
 * only read `resolveProviderConfig` would report the account connected and load
 * its catalogue while every inference request went out with no credential.
 *
 * A credential the relay has rejected (`needsReauth`) resolves to an empty
 * `apiKey` — see `credentialApiKey`. Its account/generation/reason are still
 * reported so the UI can offer a reconnect.
 *
 * `dataDir` is the resolved daemon data root (`RUNTIME_DATA_DIR`); callers that
 * only hold a project root pass `resolveOrcaRouterDataDir(projectRoot)`.
 */
export async function resolveOrcaRouterCredential(
  dataDir: string,
  env: Env = process.env,
): Promise<ResolvedOrcaRouterCredential> {
  const apiBase = resolveOrcaRouterApiBase(env);
  const fromEnv = orcaRouterEnvApiKey(env);
  if (fromEnv) {
    return { apiKey: fromEnv, baseUrl: apiBase, source: 'env', authState: 'active' };
  }

  const credential = await readOrcaRouterCredential(dataDir);
  if (credential) {
    const usableKey = credentialApiKey(credential);
    return {
      apiKey: usableKey,
      baseUrl: apiBase,
      source: `oauth-orcarouter-${credential.source}`,
      authState: credential.authState,
      accountId: credential.accountId,
      generation: credential.generation,
      ...(credential.scope ? { scope: credential.scope } : {}),
      ...(credential.reauthReason ? { reauthReason: credential.reauthReason } : {}),
    };
  }

  return { apiKey: '', baseUrl: apiBase, source: 'none', authState: 'active' };
}
