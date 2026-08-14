import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let desktopAuthSecret: Buffer | null = null;
let desktopAuthEverRegistered = process.env.OD_REQUIRE_DESKTOP_AUTH === '1';
export const consumedImportNonces = new Map<string, number>();
const DESKTOP_IMPORT_TOKEN_TTL_MS = 60_000;
const DESKTOP_IMPORT_TOKEN_FIELD_SEP = '~';
const EPHEMERAL_SECRET_FILENAME = 'import-secret';
let ephemeralSecretDir: string | null = null;

export function setDesktopAuthSecret(secret: Buffer | null): void {
  desktopAuthSecret = secret;
  if (secret != null) {
    desktopAuthEverRegistered = true;
  }
  consumedImportNonces.clear();
}

export function getDesktopAuthSecret(): Buffer | null {
  if (desktopAuthSecret !== null) return desktopAuthSecret;
  // Lazy-load ephemeral secret from file (set up at daemon startup for
  // non-desktop mode). This also covers the case where
  // resetDesktopAuthForTests() cleared the in-memory value between tests.
  if (ephemeralSecretDir !== null) {
    try {
      desktopAuthSecret = fs.readFileSync(path.join(ephemeralSecretDir, EPHEMERAL_SECRET_FILENAME));
    } catch {
      // File doesn't exist yet
    }
  }
  return desktopAuthSecret;
}

export function isDesktopAuthRegistered(): boolean {
  return desktopAuthSecret != null;
}

export function isDesktopAuthGateActive(): boolean {
  return desktopAuthEverRegistered;
}

export function resetDesktopAuthForTests(): void {
  desktopAuthSecret = null;
  desktopAuthEverRegistered = process.env.OD_REQUIRE_DESKTOP_AUTH === '1';
  consumedImportNonces.clear();
}

/**
 * Configure the directory where an ephemeral import secret is stored.
 * Called once at daemon startup with RUNTIME_DATA_DIR. The secret file
 * is mode 0600 — only the daemon user can read it, which means the CLI
 * (running as the same user) can mint HMAC import tokens locally without
 * sidecar IPC, while other local users cannot.
 */
export function configureEphemeralImportSecretDir(dataDir: string): void {
  ephemeralSecretDir = dataDir;
}

/**
 * Ensure an import secret exists. If one is already in memory or on disk,
 * load it. Otherwise generate a new random secret, persist it to the
 * ephemeral secret file, and set it in memory. Called at daemon startup.
 */
export function ensureEphemeralImportSecret(): void {
  if (desktopAuthSecret !== null) return;
  if (ephemeralSecretDir === null) return;
  const secretPath = path.join(ephemeralSecretDir, EPHEMERAL_SECRET_FILENAME);
  try {
    desktopAuthSecret = fs.readFileSync(secretPath);
    return;
  } catch {
    // File doesn't exist — generate new
  }
  const newSecret = randomBytes(32);
  try {
    fs.mkdirSync(ephemeralSecretDir, { recursive: true });
    fs.writeFileSync(secretPath, newSecret, { mode: 0o600 });
    desktopAuthSecret = newSecret;
  } catch {
    // Best-effort — if we can't persist, the in-memory secret still works
    // for this process lifetime.
    desktopAuthSecret = newSecret;
  }
}

export function pruneExpiredImportNonces(now: number): void {
  for (const [nonce, exp] of consumedImportNonces) {
    if (exp <= now) consumedImportNonces.delete(nonce);
  }
}

function timingSafeStringEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function signDesktopImportToken(
  secret: Buffer,
  baseDir: string,
  options: { nonce: string; exp: string },
): string {
  const signature = createHmac('sha256', secret)
    .update(`${baseDir}\n${options.nonce}\n${options.exp}`)
    .digest('base64url');
  return [options.nonce, options.exp, signature].join(DESKTOP_IMPORT_TOKEN_FIELD_SEP);
}

export type DesktopImportTokenVerification =
  | { ok: true; nonce: string; exp: number }
  | { ok: false; reason: string };

export function verifyDesktopImportToken(
  secret: Buffer,
  baseDir: string,
  token: string,
  now: number,
  consumedNonces: Map<string, number>,
): DesktopImportTokenVerification {
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'token missing' };
  }
  const parts = token.split(DESKTOP_IMPORT_TOKEN_FIELD_SEP);
  if (parts.length !== 3) {
    return { ok: false, reason: 'token shape invalid' };
  }
  const nonce = parts[0]!;
  const expISO = parts[1]!;
  const signature = parts[2]!;
  if (nonce.length === 0 || expISO.length === 0 || signature.length === 0) {
    return { ok: false, reason: 'token shape invalid' };
  }
  const expMs = Date.parse(expISO);
  if (!Number.isFinite(expMs)) {
    return { ok: false, reason: 'token expiry invalid' };
  }
  if (expMs <= now) {
    return { ok: false, reason: 'token expired' };
  }
  if (expMs - now > DESKTOP_IMPORT_TOKEN_TTL_MS * 2) {
    return { ok: false, reason: 'token expiry exceeds permitted window' };
  }
  const expected = createHmac('sha256', secret)
    .update(`${baseDir}\n${nonce}\n${expISO}`)
    .digest('base64url');
  if (!timingSafeStringEquals(expected, signature)) {
    return { ok: false, reason: 'token signature invalid' };
  }
  if (consumedNonces.has(nonce)) {
    return { ok: false, reason: 'token nonce already used' };
  }
  return { ok: true, nonce, exp: expMs };
}
