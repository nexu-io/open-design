/**
 * One-shot legacy `.od/` data migrator.
 *
 * Open Design 0.3.x ran from the repo and wrote runtime state to
 * `<repo>/.od/` (SQLite at `app.sqlite`, agent CWDs under `projects/`,
 * saved renders under `artifacts/`, credentials at `media-config.json`).
 * The 0.4.x packaged Desktop app moved the data root to a per-namespace
 * directory under the OS user-data location (Electron's `userData`).
 *
 * Users upgrading from 0.3.x to the packaged 0.4.x app pointed the new
 * binary at a fresh, empty data root and watched their chats and designs
 * disappear. The data was never lost (the 0.3.x `.od/` folder is still
 * on disk wherever they used to run from), but the new daemon had no
 * way to know about it. See https://github.com/nexu-io/open-design/issues/710.
 *
 * This module gives operators a recovery path. When `OD_LEGACY_DATA_DIR`
 * is set, the daemon checks on boot whether the new data root is empty
 * AND whether the legacy directory contains a real OD payload (a
 * `app.sqlite` is the proof). If both hold, content is copied across.
 * The migration writes a `.migrated-from` marker so subsequent boots
 * skip the work even if the user clears the new directory; if they
 * really want to re-migrate they can delete the marker.
 *
 * Sync by design: this runs at module import time in server.ts, before
 * `openDatabase` opens SQLite. Doing it async would race the DB open
 * and either silently lose the migration or corrupt the new file.
 *
 * @see specs/current/spec.md (storage section)
 * @see https://github.com/nexu-io/open-design/issues/710
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface MigrateLegacyDataDirOptions {
  /** Path to the legacy `.od/` directory (typically OD_LEGACY_DATA_DIR). */
  legacyDir: string | undefined;
  /** Resolved current data root (RUNTIME_DATA_DIR). */
  dataDir: string;
  /** Optional logger. Defaults to console.log/console.warn. */
  logger?: {
    info(message: string): void;
    warn(message: string): void;
  };
}

export interface MigrateLegacyDataDirResult {
  status: 'noop' | 'migrated' | 'skipped';
  reason: string;
  copied?: readonly string[];
}

const MARKER_FILE = '.migrated-from';
// Directories and files that are part of the OD runtime payload. Anything
// outside this list (logs, sockets, lockfiles, OS scratch) is intentionally
// left behind so we don't drag in legacy state the new release wouldn't
// recognize.
const PAYLOAD_ENTRIES: readonly string[] = [
  'app.sqlite',
  'app.sqlite-shm',
  'app.sqlite-wal',
  'app-config.json',
  'media-config.json',
  'projects',
  'artifacts',
  'connectors',
  'composio',
];

function isExistingDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isExistingFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Returns true when `dataDir` looks like a fresh / never-used data root:
 * either the directory does not exist, or it exists but does not contain
 * a real OD SQLite database. We deliberately do NOT just check for an
 * empty directory: a packaged install creates an empty `dataDir` before
 * the daemon ever boots, so emptiness is the common case rather than a
 * proof of "no prior data."
 */
export function dataDirIsEmptyOrFresh(dataDir: string): boolean {
  if (!isExistingDir(dataDir)) return true;
  return !isExistingFile(path.join(dataDir, 'app.sqlite'));
}

/**
 * Returns true when `legacyDir` contains a payload worth migrating. The
 * presence of `app.sqlite` is treated as proof: every 0.3.x install that
 * shipped chat history wrote one, and a stray empty `.od/` folder won't
 * have it.
 */
export function legacyDirHasPayload(legacyDir: string): boolean {
  if (!isExistingDir(legacyDir)) return false;
  return isExistingFile(path.join(legacyDir, 'app.sqlite'));
}

/**
 * Copy each known OD payload entry from `legacyDir` to `dataDir`. Missing
 * entries are skipped silently (e.g. an install that never ran the media
 * surface won't have `media-config.json`). Returns the list of entries
 * that were actually copied.
 */
function copyPayload(legacyDir: string, dataDir: string): string[] {
  fs.mkdirSync(dataDir, { recursive: true });
  const copied: string[] = [];
  for (const entry of PAYLOAD_ENTRIES) {
    const src = path.join(legacyDir, entry);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(dataDir, entry);
    // cpSync recursively copies directories; for plain files it copies
    // the byte contents. errorOnExist=false because re-running over a
    // partially populated dataDir should still succeed.
    fs.cpSync(src, dst, {
      recursive: true,
      force: false,
      errorOnExist: false,
    });
    copied.push(entry);
  }
  return copied;
}

function writeMarker(dataDir: string, legacyDir: string): void {
  const marker = path.join(dataDir, MARKER_FILE);
  const payload = JSON.stringify({
    legacyDir: path.resolve(legacyDir),
    migratedAt: new Date().toISOString(),
  }, null, 2);
  fs.writeFileSync(marker, payload + '\n', 'utf8');
}

/**
 * One-shot, idempotent legacy data migrator. Synchronous so it can run
 * at module import time before SQLite opens.
 */
export function migrateLegacyDataDirSync(
  options: MigrateLegacyDataDirOptions,
): MigrateLegacyDataDirResult {
  const log = options.logger ?? {
    info: (m) => console.log(`[od-migrate] ${m}`),
    warn: (m) => console.warn(`[od-migrate] ${m}`),
  };

  const raw = options.legacyDir;
  if (raw === undefined || raw.length === 0) {
    return { status: 'noop', reason: 'OD_LEGACY_DATA_DIR not set' };
  }
  const legacyDir = path.resolve(raw);
  const dataDir = path.resolve(options.dataDir);

  if (legacyDir === dataDir) {
    return { status: 'noop', reason: 'OD_LEGACY_DATA_DIR equals OD_DATA_DIR' };
  }

  if (!legacyDirHasPayload(legacyDir)) {
    log.warn(
      `OD_LEGACY_DATA_DIR="${legacyDir}" does not contain app.sqlite; skipping migration`,
    );
    return { status: 'skipped', reason: 'legacy dir has no app.sqlite' };
  }

  if (!dataDirIsEmptyOrFresh(dataDir)) {
    return {
      status: 'skipped',
      reason: 'dataDir already has app.sqlite, not overwriting',
    };
  }

  const markerPath = path.join(dataDir, MARKER_FILE);
  if (fs.existsSync(markerPath)) {
    return { status: 'skipped', reason: 'migration marker already present' };
  }

  log.info(`migrating legacy data from "${legacyDir}" to "${dataDir}"`);
  const copied = copyPayload(legacyDir, dataDir);
  writeMarker(dataDir, legacyDir);
  log.info(
    `migration complete: copied ${copied.length} entr${copied.length === 1 ? 'y' : 'ies'} (${copied.join(', ')})`,
  );
  return { status: 'migrated', reason: 'copied legacy payload', copied };
}
