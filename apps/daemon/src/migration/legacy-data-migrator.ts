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
 * is set on daemon boot, the migrator:
 *
 *   1. Refuses if the legacy dir doesn't have `app.sqlite` (typo / wrong
 *      path: throws so the daemon surfaces a visible error rather than
 *      silently launching into an empty workspace).
 *   2. Refuses if the new dataDir already has any payload entry
 *      (`app.sqlite`, `projects/`, `artifacts/`, ...): we never merge
 *      old and new state, since SQLite/WAL pairs and project trees are
 *      not safely interleavable.
 *   3. Refuses if a `.migrated-from` marker is already present
 *      (idempotent re-runs).
 *   4. Walks the legacy payload, rejecting any symlink (avoids escape
 *      out of the data root via crafted .od/ symlinks).
 *   5. Copies into a sibling staging directory first, then renames each
 *      payload entry into place atomically. On any error the staging
 *      directory is removed and no `.migrated-from` marker is written,
 *      so the next boot retries cleanly.
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
  /**
   * Test seam. The default writes the JSON `.migrated-from` marker
   * with fs.writeFileSync; tests inject a function that throws so the
   * rollback path (which removes already-promoted payload entries) can
   * be exercised without contriving real ENOSPC / read-only conditions.
   * Production callers should never pass this.
   * @internal
   */
  writeMarker?: (dataDir: string, legacyDir: string) => void;
}

export type MigrateStatus = 'noop' | 'migrated' | 'skipped';

export interface MigrateLegacyDataDirResult {
  status: MigrateStatus;
  reason: string;
  copied?: readonly string[];
}

/**
 * Daemon startup throws this when OD_LEGACY_DATA_DIR is explicitly set
 * but the path is not a usable legacy data dir, or the new dataDir is
 * already populated and would be merged into. Failing loud here is the
 * point: silent skips trained users to assume migration ran when it
 * didn't (#710 again).
 */
export class LegacyMigrationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'LegacyMigrationError';
  }
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
 * Returns the list of payload entries that already exist under `dataDir`.
 * We refuse to merge on top of any of them: SQLite/WAL pairs and project
 * trees are not safely interleavable, and a partial overlay would yield
 * a hybrid state SQLite cannot reason about.
 */
export function dataDirHasExistingPayload(dataDir: string): string[] {
  if (!isExistingDir(dataDir)) return [];
  const present: string[] = [];
  for (const entry of PAYLOAD_ENTRIES) {
    if (fs.existsSync(path.join(dataDir, entry))) present.push(entry);
  }
  return present;
}

/**
 * Walk a payload subtree and refuse to copy if any node is a symlink.
 * fs.cpSync would otherwise preserve the link and downstream readers
 * (projects.ts) would follow it, escaping the data root.
 */
function assertNoSymlinks(srcRoot: string, displayPath = srcRoot): void {
  const stat = fs.lstatSync(srcRoot);
  if (stat.isSymbolicLink()) {
    throw new LegacyMigrationError(
      'symlink_in_payload',
      `legacy payload contains a symlink at "${displayPath}"; refusing to migrate`,
    );
  }
  if (!stat.isDirectory()) return;
  for (const child of fs.readdirSync(srcRoot)) {
    assertNoSymlinks(path.join(srcRoot, child), path.join(displayPath, child));
  }
}

/**
 * Stage every present payload entry into `stagingDir`. Returns the list
 * of entries that were copied. We use cpSync with verbatimSymlinks not
 * set; the lstat walk above already rejected any symlink, so a non-link
 * tree is what cpSync sees.
 */
function stagePayload(legacyDir: string, stagingDir: string): string[] {
  fs.mkdirSync(stagingDir, { recursive: true });
  const copied: string[] = [];
  for (const entry of PAYLOAD_ENTRIES) {
    const src = path.join(legacyDir, entry);
    if (!fs.existsSync(src)) continue;
    assertNoSymlinks(src);
    const dst = path.join(stagingDir, entry);
    fs.cpSync(src, dst, {
      recursive: true,
      force: true,
      errorOnExist: false,
    });
    copied.push(entry);
  }
  return copied;
}

/**
 * Move staged payload entries into the final dataDir. Each entry is
 * moved with renameSync (atomic on the same filesystem); if rename
 * fails (cross-device, etc.) we fall back to copy + remove.
 *
 * Promotion is rollback-safe in two layers:
 *
 *   1. The cpSync fallback is wrapped in its own try/catch and removes
 *      whatever was partially written at dst before bubbling up. Without
 *      this, a partial dst would survive the outer rollback because the
 *      entry never makes it into the `promoted` array.
 *   2. The outer try/catch tracks every entry that has been fully moved
 *      into dataDir and removes them all before rethrowing. Without it,
 *      a mid-loop failure after app.sqlite was already promoted would
 *      leave the real dataDir with app.sqlite but no marker, and the
 *      next boot would refuse the retry under data_dir_not_empty,
 *      stranding the user mid-migration.
 *
 * Returns the list of entries that were placed into dataDir so the
 * caller can roll them back if a *subsequent* step (e.g. writing the
 * .migrated-from marker) fails after promotion has already succeeded.
 */
export function promoteStaged(
  stagingDir: string,
  dataDir: string,
  entries: readonly string[],
): readonly string[] {
  fs.mkdirSync(dataDir, { recursive: true });
  const promoted: string[] = [];
  try {
    for (const entry of entries) {
      const src = path.join(stagingDir, entry);
      const dst = path.join(dataDir, entry);
      try {
        fs.renameSync(src, dst);
      } catch {
        // EXDEV (cross-device) or similar: fall back to copy + remove.
        // The fallback is its own protected unit so a partial dst
        // (cpSync started writing then failed on ENOSPC, permissions,
        // an interrupted handle, etc.) does not survive into dataDir
        // unrecorded.
        try {
          fs.cpSync(src, dst, {
            recursive: true,
            force: true,
            errorOnExist: false,
          });
          fs.rmSync(src, { recursive: true, force: true });
        } catch (cpErr) {
          fs.rmSync(dst, { recursive: true, force: true });
          throw cpErr;
        }
      }
      promoted.push(entry);
    }
  } catch (err) {
    rollbackPromoted(dataDir, promoted);
    throw err;
  }
  return promoted;
}

function rollbackPromoted(dataDir: string, promoted: readonly string[]): void {
  for (const entry of promoted) {
    fs.rmSync(path.join(dataDir, entry), { recursive: true, force: true });
  }
}

function writeMarker(dataDir: string, legacyDir: string): void {
  const marker = path.join(dataDir, MARKER_FILE);
  // Write to a sibling tmp path then atomically rename into place.
  // Without this, a writeFileSync that gets partway through and then
  // fails (ENOSPC mid-write, EIO on flush, etc.) would leave a partial
  // .migrated-from at marker. The next boot's fs.existsSync(marker)
  // returns true, the migrator short-circuits as `skipped`, and the
  // user is stranded with an empty dataDir. Temp + rename guarantees
  // the marker either fully exists or does not.
  const temp = `${marker}.tmp-${process.pid}-${Date.now()}`;
  const payload = JSON.stringify({
    legacyDir: path.resolve(legacyDir),
    migratedAt: new Date().toISOString(),
  }, null, 2);
  try {
    fs.writeFileSync(temp, payload + '\n', 'utf8');
    fs.renameSync(temp, marker);
  } catch (err) {
    fs.rmSync(temp, { force: true });
    throw err;
  }
}

/**
 * One-shot, idempotent legacy data migrator. Synchronous so it can run
 * at module import time before SQLite opens. Throws LegacyMigrationError
 * on operator-actionable failures (env set but path invalid; dataDir
 * already populated; symlink in payload).
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

  // Marker check runs before legacyDirHasPayload on purpose: once a
  // migration has succeeded, the marker is the canonical "do not
  // touch" signal. The user may leave OD_LEGACY_DATA_DIR set and then
  // delete or move the old repo `.od/` later; without this ordering
  // the next boot would re-validate a source that is no longer needed
  // and throw legacy_dir_invalid, breaking the marker contract that
  // says "after success, future boots no-op."
  const markerPath = path.join(dataDir, MARKER_FILE);
  if (fs.existsSync(markerPath)) {
    return { status: 'skipped', reason: 'migration marker already present' };
  }

  if (!legacyDirHasPayload(legacyDir)) {
    // Loud: env was set but the path doesn't look like an OD data dir.
    // The user typo'd, deleted the source, or pointed at the wrong
    // directory; silently launching empty trained users to think the
    // migration ran when it hadn't (this is the original #710 footgun).
    throw new LegacyMigrationError(
      'legacy_dir_invalid',
      `OD_LEGACY_DATA_DIR="${legacyDir}" is not a usable legacy data dir (expected app.sqlite directly inside it). Quit Open Design, fix the path, and relaunch.`,
    );
  }

  // Refuse to merge on top of any existing payload entry. SQLite/WAL
  // pairs cannot be safely interleaved with foreign WAL pages, and a
  // half-overlaid project tree is worse than no migration.
  const existing = dataDirHasExistingPayload(dataDir);
  if (existing.length > 0) {
    throw new LegacyMigrationError(
      'data_dir_not_empty',
      `OD_DATA_DIR="${dataDir}" already contains payload entries (${existing.join(', ')}); refusing to merge legacy data on top. Move the existing data aside or pick a fresh data root before re-running with OD_LEGACY_DATA_DIR.`,
    );
  }

  log.info(`migrating legacy data from "${legacyDir}" to "${dataDir}"`);

  // Stage into a sibling tmp dir first, then promote with renameSync.
  // sibling-not-child so a partial copy never sits inside dataDir on
  // any error path. Random suffix avoids collisions on retry.
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  const stagingDir = path.join(
    path.dirname(dataDir),
    `${path.basename(dataDir)}.od-migrate-${process.pid}-${Date.now()}`,
  );

  let copied: string[];
  let promoted: readonly string[] = [];
  try {
    copied = stagePayload(legacyDir, stagingDir);
    promoted = promoteStaged(stagingDir, dataDir, copied);
    // writeMarker is the last step that can fail (ENOSPC, read-only
    // dataDir, permissions). If it does, the payload entries are
    // already in dataDir but no marker was written; the next boot
    // would hit dataDirHasExistingPayload() and throw data_dir_not_empty,
    // making the migration un-retryable. Rolling back the promoted
    // entries here keeps the failure as a unit with promotion.
    (options.writeMarker ?? writeMarker)(dataDir, legacyDir);
  } catch (err) {
    rollbackPromoted(dataDir, promoted);
    // Defensive marker cleanup: even though the production writeMarker
    // is atomic (temp + rename), a partial file at markerPath could
    // still exist if some non-atomic variant ran. Without this, the
    // next boot's fs.existsSync(markerPath) check would short-circuit
    // as `skipped` and the user would be stranded.
    fs.rmSync(markerPath, { force: true });
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw err;
  }
  // Whatever might be left of staging (already-promoted entries leave
  // empty parents): drop it.
  fs.rmSync(stagingDir, { recursive: true, force: true });

  log.info(
    `migration complete: copied ${copied.length} entr${copied.length === 1 ? 'y' : 'ies'} (${copied.join(', ')})`,
  );
  return { status: 'migrated', reason: 'copied legacy payload', copied };
}
