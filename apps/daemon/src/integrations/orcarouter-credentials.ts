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

import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

import { mediaConfigDir, resolveProviderConfig } from '../media/config.js';
import {
  ORCAROUTER_ENV_API_BASE,
  ORCAROUTER_ENV_SHARED_BASE,
  ORCAROUTER_KEY_PREFIX,
  ORCAROUTER_PROVIDER_ID,
  resolveOrcaRouterApiBase,
} from './orcarouter.js';

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

/** The only accessor downstream code should use to get a usable key. */
export function credentialApiKey(credential: OrcaRouterCredential | null): string {
  return credential?.apiKey ?? '';
}

export function isCredentialUsable(credential: OrcaRouterCredential | null): boolean {
  return Boolean(credential && credential.apiKey && credential.authState === 'active');
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

function credentialsFile(dataDir: string): string {
  return path.join(dataDir, 'orcarouter-credentials.json');
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
  await writeFile(tmp, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmp, file);
  // Owner-only, best-effort. This file holds a live bearer key.
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
  source: string;
  authState: OrcaRouterAuthState;
  accountId?: string;
  generation?: number;
  scope?: string;
  reauthReason?: string;
}

/**
 * Resolve the credential the daemon should use for OrcaRouter inference, in
 * precedence order:
 *
 *   1. `ORCA_API_KEY` / `OD_ORCAROUTER_API_KEY` / `ORCAROUTER_API_KEY`
 *   2. the `orcarouter` entry in the provider secret store
 *   3. the PKCE credential issued by the in-app connect flow
 *
 * Mirrors `resolveXAIOAuthCredential` so OrcaRouter lights up the same way
 * every other gateway with a browser flow does.
 */
export async function resolveOrcaRouterCredential(
  projectRoot: string,
  env: Record<string, string | undefined> = process.env,
): Promise<ResolvedOrcaRouterCredential> {
  const apiBase = resolveOrcaRouterApiBase(env);
  const fromEnv = cleanOrcaRouterKey(
    env.ORCA_API_KEY ?? env.OD_ORCAROUTER_API_KEY ?? env.ORCAROUTER_API_KEY ?? '',
  );
  if (fromEnv) {
    return { apiKey: fromEnv, baseUrl: apiBase, source: 'env', authState: 'active' };
  }

  const stored = await resolveProviderConfig(projectRoot, ORCAROUTER_PROVIDER_ID);
  if (stored.apiKey) {
    return {
      apiKey: stored.apiKey,
      baseUrl: stored.baseUrl || apiBase,
      source: 'stored',
      authState: 'active',
    };
  }

  const credential = await readOrcaRouterCredential(mediaConfigDir(projectRoot));
  if (credential?.apiKey) {
    const out: ResolvedOrcaRouterCredential = {
      apiKey: credentialApiKey(credential),
      baseUrl: apiBase,
      source: `oauth-orcarouter-${credential.source}`,
      authState: credential.authState,
      accountId: credential.accountId,
      generation: credential.generation,
    };
    if (credential.scope) out.scope = credential.scope;
    if (credential.reauthReason) out.reauthReason = credential.reauthReason;
    return out;
  }

  return { apiKey: '', baseUrl: apiBase, source: 'none', authState: 'active' };
}

/** Base URL for a media/BYOK call, honouring an explicit provider override. */
export function orcaRouterBaseUrlFor(override: string | undefined, env = process.env): string {
  const trimmed = (override ?? '').trim();
  return trimmed || resolveOrcaRouterApiBase(env);
}

export { ORCAROUTER_ENV_API_BASE, ORCAROUTER_ENV_SHARED_BASE };
