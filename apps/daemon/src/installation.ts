// Channel-root installation identity.
//
// `installationId` was historically stored in `<dataRoot>/app-config.json`,
// which lives at `<userData>/namespaces/<namespace>/data/app-config.json`
// in packaged builds. Two reinstall scenarios then silently rotated the
// id:
//
//   1. **Namespace churn.** If a packaged build bakes a different
//      `namespace` token than the previous version, the daemon writes to
//      a different `<namespace>/data/` subtree and the old installationId
//      is invisible. The user shows up in PostHog as a brand-new person.
//
//   2. **Clean reinstall.** Even when the namespace is stable, anything
//      that wipes `<userData>/namespaces/<ns>/data/` (a future installer
//      that resets per-namespace data, a manual `rm -rf`) takes the id
//      down with it.
//
// To preserve person continuity across both, we mirror the id into a
// stable file at the **channel root** — one level above the namespaces
// directory — and treat that file as authoritative on read. The legacy
// app-config.json field is still written so any code path that reads it
// directly (legacy / future fallbacks) keeps seeing the same value.
//
// Locations:
//
//   packaged (mac):    ~/Library/Application Support/Open Design Prerelease/installation.json
//   packaged (win):    %APPDATA%/Open Design Prerelease/installation.json
//   packaged (linux):  $XDG_CONFIG_HOME/Open Design Prerelease/installation.json
//   tools-dev / OSS:   <dataDir>/installation.json  (no namespace concept; fall back to dataDir)
//
// `OD_INSTALLATION_DIR` is the env override. Packaged sidecars.ts sets it
// to the channel root explicitly; everything else falls back to dataDir
// (where it sits next to app-config.json and behaves like the legacy
// path — fine for dev because dev doesn't have namespace churn).

import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Wire shape persisted at `<installationDir>/installation.json`.
 * Kept intentionally narrow: only fields that need to survive a
 * namespace-scoped data-dir wipe belong here.
 */
export interface InstallationFile {
  installationId?: string;
  pendingAttribution?: PendingAttribution;
  attributionClaimedAt?: string;
  attributionClaimResultAt?: string;
}

export interface PendingAttribution {
  token: string;
  source: string;
  capturedAt: string;
  rawUrl?: string;
  platform?: string;
}

export function resolveInstallationDir(dataDir: string): string {
  const env = process.env.OD_INSTALLATION_DIR;
  if (env && env.length > 0) return env;
  return dataDir;
}

function installationFilePath(installationDir: string): string {
  return join(installationDir, 'installation.json');
}

function parseInstallationFile(raw: string): InstallationFile {
  const parsed: unknown = JSON.parse(raw);
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const obj = parsed as Record<string, unknown>;
  const out: InstallationFile = {};
  if (typeof obj.installationId === 'string' && obj.installationId.length > 0) {
    out.installationId = obj.installationId;
  }
  const pending = parsePendingAttribution(obj.pendingAttribution);
  if (pending) out.pendingAttribution = pending;
  if (typeof obj.attributionClaimedAt === 'string' && obj.attributionClaimedAt.length > 0) {
    out.attributionClaimedAt = obj.attributionClaimedAt;
  }
  if (typeof obj.attributionClaimResultAt === 'string' && obj.attributionClaimResultAt.length > 0) {
    out.attributionClaimResultAt = obj.attributionClaimResultAt;
  }
  return out;
}

function parsePendingAttribution(raw: unknown): PendingAttribution | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.token !== 'string' || obj.token.length === 0) return null;
  if (typeof obj.source !== 'string' || obj.source.length === 0) return null;
  if (typeof obj.capturedAt !== 'string' || obj.capturedAt.length === 0) return null;
  const pending: PendingAttribution = {
    token: obj.token,
    source: obj.source,
    capturedAt: obj.capturedAt,
  };
  if (typeof obj.rawUrl === 'string' && obj.rawUrl.length > 0) pending.rawUrl = obj.rawUrl;
  if (typeof obj.platform === 'string' && obj.platform.length > 0) pending.platform = obj.platform;
  return pending;
}

export async function readInstallationFile(
  installationDir: string,
): Promise<InstallationFile> {
  try {
    return parseInstallationFile(
      await readFile(installationFilePath(installationDir), 'utf8'),
    );
  } catch {
    // ENOENT, malformed JSON, permission denied, EIO — treat as empty so the
    // fallback path through app-config.json keeps the daemon alive.
    return {};
  }
}

// Synchronous mirror of readInstallationFile for callers on a sync path (e.g.
// building the spawn env for the vela CLI). Same parse + same fail-soft.
export function readInstallationFileSync(
  installationDir: string,
): InstallationFile {
  try {
    return parseInstallationFile(
      readFileSync(installationFilePath(installationDir), 'utf8'),
    );
  } catch {
    return {};
  }
}

// Serialize writes to the same installationDir so concurrent persists
// can't truncate each other. Mirrors the writeAppConfig lock strategy.
const writeLocks = new Map<string, Promise<unknown>>();

/**
 * Patch shape for {@link writeInstallationFile}.
 *
 * Distinct from `Partial<InstallationFile>` because `exactOptionalPropertyTypes`
 * blocks `{ installationId: undefined }` and we explicitly need a way to
 * **clear** the id (Settings → "Delete my data", or an explicit null write
 * via `writeAppConfig`). The convention here:
 *
 *   - field present with a non-empty string  → assign the new value
 *   - field present with null / empty string → delete the field on disk
 *   - field absent                           → leave the existing value alone
 */
export type InstallationFilePatch = {
  installationId?: string | null;
  pendingAttribution?: PendingAttribution | null;
  attributionClaimedAt?: string | null;
  attributionClaimResultAt?: string | null;
};

export async function writeInstallationFile(
  installationDir: string,
  patch: InstallationFilePatch,
): Promise<InstallationFile> {
  const prev = writeLocks.get(installationDir) ?? Promise.resolve();
  const task = prev.catch(() => undefined).then(() => doWrite(installationDir, patch));
  writeLocks.set(installationDir, task);
  try {
    return await task;
  } finally {
    if (writeLocks.get(installationDir) === task) writeLocks.delete(installationDir);
  }
}

async function doWrite(
  installationDir: string,
  patch: InstallationFilePatch,
): Promise<InstallationFile> {
  const existing = await readInstallationFile(installationDir);
  const next: InstallationFile = { ...existing };
  if (Object.prototype.hasOwnProperty.call(patch, 'installationId')) {
    if (typeof patch.installationId === 'string' && patch.installationId.length > 0) {
      next.installationId = patch.installationId;
    } else {
      delete next.installationId;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'pendingAttribution')) {
    if (patch.pendingAttribution) {
      next.pendingAttribution = patch.pendingAttribution;
    } else {
      delete next.pendingAttribution;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'attributionClaimedAt')) {
    if (typeof patch.attributionClaimedAt === 'string' && patch.attributionClaimedAt.length > 0) {
      next.attributionClaimedAt = patch.attributionClaimedAt;
    } else {
      delete next.attributionClaimedAt;
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'attributionClaimResultAt')) {
    if (typeof patch.attributionClaimResultAt === 'string' && patch.attributionClaimResultAt.length > 0) {
      next.attributionClaimResultAt = patch.attributionClaimResultAt;
    } else {
      delete next.attributionClaimResultAt;
    }
  }
  await mkdir(dirname(installationFilePath(installationDir)), { recursive: true });
  // The file is small, the user only writes it on consent + delete-my-data
  // flows. We deliberately don't use a temp-file + rename dance: a partial
  // write here just means `readInstallationFile` falls back to app-config.json,
  // which is the same fallback we use when the file simply doesn't exist yet.
  await writeFile(
    installationFilePath(installationDir),
    JSON.stringify(next, null, 2) + '\n',
    'utf8',
  );
  return next;
}
