/**
 * Unit tests for the OD_LEGACY_DATA_DIR one-shot migrator. Hermetic:
 * each test runs against a fresh pair of mkdtemp() directories so no
 * test ever touches a real OD install.
 *
 * The migrator's contract is "loud or correct": when OD_LEGACY_DATA_DIR
 * is set, either the daemon migrates cleanly or it throws a
 * LegacyMigrationError the launcher can surface. Silently launching
 * empty was the original #710 footgun.
 *
 * @see apps/daemon/src/legacy-data-migrator.ts
 * @see https://github.com/nexu-io/open-design/issues/710
 */
import * as fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import * as os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  LegacyMigrationError,
  dataDirHasExistingPayload,
  dataDirIsEmptyOrFresh,
  legacyDirHasPayload,
  migrateLegacyDataDirSync,
  promoteStaged,
} from '../src/legacy-data-migrator.js';

interface SilentLogger {
  info(message: string): void;
  warn(message: string): void;
  readonly entries: { level: 'info' | 'warn'; message: string }[];
}

function makeLogger(): SilentLogger {
  const entries: { level: 'info' | 'warn'; message: string }[] = [];
  return {
    entries,
    info: (m) => entries.push({ level: 'info', message: m }),
    warn: (m) => entries.push({ level: 'warn', message: m }),
  };
}

function writeFile(filePath: string, contents = 'x'): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

function seedLegacyDir(legacyDir: string): void {
  // A typical 0.3.x .od/ payload: SQLite, a project's CWD, an artifact,
  // and the media-config credentials file.
  writeFile(path.join(legacyDir, 'app.sqlite'), 'fake-sqlite');
  writeFile(path.join(legacyDir, 'app-config.json'), '{"v":1}');
  writeFile(path.join(legacyDir, 'media-config.json'), '{"providers":{}}');
  writeFile(path.join(legacyDir, 'projects', 'p1', 'index.html'), '<html>1</html>');
  writeFile(path.join(legacyDir, 'projects', 'p2', 'page.html'), '<html>2</html>');
  writeFile(path.join(legacyDir, 'artifacts', 'a1', 'final.html'), '<html>a</html>');
}

/**
 * Symlinks need elevated permission on stock Windows. Skip the test
 * cleanly there rather than failing the suite for an unrelated OS
 * limitation.
 */
function trySymlink(target: string, linkPath: string, type: 'dir' | 'file'): boolean {
  try {
    fs.symlinkSync(target, linkPath, type === 'dir' ? 'junction' : 'file');
    return true;
  } catch {
    return false;
  }
}

describe('migrateLegacyDataDirSync', () => {
  let legacyDir: string;
  let dataDir: string;

  beforeEach(() => {
    legacyDir = mkdtempSync(path.join(os.tmpdir(), 'od-legacy-'));
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-data-'));
  });

  afterEach(async () => {
    await rm(legacyDir, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  });

  it('returns noop when OD_LEGACY_DATA_DIR is not set', () => {
    const log = makeLogger();
    expect(
      migrateLegacyDataDirSync({ legacyDir: undefined, dataDir, logger: log }),
    ).toMatchObject({ status: 'noop' });
    expect(log.entries).toHaveLength(0);
  });

  it('returns noop when OD_LEGACY_DATA_DIR is the empty string', () => {
    expect(
      migrateLegacyDataDirSync({ legacyDir: '', dataDir, logger: makeLogger() }),
    ).toMatchObject({ status: 'noop' });
  });

  it('returns noop when legacyDir equals dataDir', () => {
    expect(
      migrateLegacyDataDirSync({ legacyDir: dataDir, dataDir, logger: makeLogger() }),
    ).toMatchObject({ status: 'noop' });
  });

  it('throws LegacyMigrationError when legacyDir has no app.sqlite', () => {
    // Failing loud here is the point of the contract: a typo in the env
    // var or a stale path used to silently skip and then drop the user
    // into an empty workspace, which is exactly the #710 footgun.
    writeFile(path.join(legacyDir, 'README.txt'), 'unrelated');
    expect(() =>
      migrateLegacyDataDirSync({ legacyDir, dataDir, logger: makeLogger() }),
    ).toThrowError(LegacyMigrationError);

    try {
      migrateLegacyDataDirSync({ legacyDir, dataDir, logger: makeLogger() });
    } catch (err) {
      expect(err).toBeInstanceOf(LegacyMigrationError);
      expect((err as LegacyMigrationError).code).toBe('legacy_dir_invalid');
    }
  });

  it('throws LegacyMigrationError when dataDir already has app.sqlite', () => {
    seedLegacyDir(legacyDir);
    writeFile(path.join(dataDir, 'app.sqlite'), 'NEW-DATA-DO-NOT-OVERWRITE');

    let captured: unknown;
    try {
      migrateLegacyDataDirSync({ legacyDir, dataDir, logger: makeLogger() });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(LegacyMigrationError);
    expect((captured as LegacyMigrationError).code).toBe('data_dir_not_empty');

    // The existing payload must be untouched.
    expect(fs.readFileSync(path.join(dataDir, 'app.sqlite'), 'utf8')).toBe(
      'NEW-DATA-DO-NOT-OVERWRITE',
    );
  });

  it('throws when dataDir already has a payload entry other than app.sqlite', () => {
    // A half-overlaid project tree is worse than no migration: cpSync
    // would merge directory contents and SQLite/WAL pairs cannot be
    // safely interleaved with foreign WAL pages.
    seedLegacyDir(legacyDir);
    writeFile(path.join(dataDir, 'projects', 'preexisting', 'index.html'), '<html/>');

    let captured: unknown;
    try {
      migrateLegacyDataDirSync({ legacyDir, dataDir, logger: makeLogger() });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(LegacyMigrationError);
    expect((captured as LegacyMigrationError).code).toBe('data_dir_not_empty');
    expect(
      fs.existsSync(path.join(dataDir, 'projects', 'preexisting', 'index.html')),
    ).toBe(true);
  });

  it('migrates payload to a fresh dataDir', () => {
    seedLegacyDir(legacyDir);
    const log = makeLogger();
    const result = migrateLegacyDataDirSync({ legacyDir, dataDir, logger: log });

    expect(result.status).toBe('migrated');
    expect(result.copied).toEqual(
      expect.arrayContaining([
        'app.sqlite',
        'app-config.json',
        'media-config.json',
        'projects',
        'artifacts',
      ]),
    );
    expect(fs.readFileSync(path.join(dataDir, 'app.sqlite'), 'utf8')).toBe('fake-sqlite');
    expect(
      fs.readFileSync(path.join(dataDir, 'projects', 'p1', 'index.html'), 'utf8'),
    ).toBe('<html>1</html>');
    expect(
      fs.readFileSync(path.join(dataDir, 'artifacts', 'a1', 'final.html'), 'utf8'),
    ).toBe('<html>a</html>');
    expect(log.entries.some((e) => e.message.includes('migrating legacy data'))).toBe(true);
    expect(log.entries.some((e) => e.message.includes('migration complete'))).toBe(true);
  });

  it('writes a .migrated-from marker after success', () => {
    seedLegacyDir(legacyDir);
    migrateLegacyDataDirSync({ legacyDir, dataDir, logger: makeLogger() });
    const marker = JSON.parse(
      fs.readFileSync(path.join(dataDir, '.migrated-from'), 'utf8'),
    );
    expect(marker.legacyDir).toBe(path.resolve(legacyDir));
    expect(typeof marker.migratedAt).toBe('string');
  });

  it('idempotent: a second call after success returns skipped without re-copying', () => {
    seedLegacyDir(legacyDir);
    migrateLegacyDataDirSync({ legacyDir, dataDir, logger: makeLogger() });

    // Drop the SQLite to simulate a developer wipe; the marker should
    // still cause the second call to skip so we don't keep dragging
    // legacy state back over a clean slate the user wanted.
    fs.rmSync(path.join(dataDir, 'app.sqlite'));

    const result = migrateLegacyDataDirSync({
      legacyDir,
      dataDir,
      logger: makeLogger(),
    });
    expect(result.status).toBe('skipped');
    expect(result.reason).toMatch(/marker/);
    expect(fs.existsSync(path.join(dataDir, 'app.sqlite'))).toBe(false);
  });

  it('marker beats a missing legacyDir on the next boot', async () => {
    // mrcfps round-6: the marker is the canonical "do not touch"
    // signal once a migration has succeeded. If the user leaves
    // OD_LEGACY_DATA_DIR set after success and then deletes or moves
    // the old `.od/` (which is the documented launchctl setenv path),
    // the next boot must still no-op via the marker rather than
    // throwing legacy_dir_invalid for re-validating a source the
    // marker contract says is no longer needed.
    seedLegacyDir(legacyDir);
    const first = migrateLegacyDataDirSync({
      legacyDir,
      dataDir,
      logger: makeLogger(),
    });
    expect(first.status).toBe('migrated');

    // Simulate the user removing the old repo `.od/` after the
    // successful migration but leaving OD_LEGACY_DATA_DIR set.
    await rm(legacyDir, { recursive: true, force: true });

    const second = migrateLegacyDataDirSync({
      legacyDir,
      dataDir,
      logger: makeLogger(),
    });
    expect(second.status).toBe('skipped');
    expect(second.reason).toMatch(/marker/);
  });

  it('migrates even when dataDir does not exist yet', async () => {
    seedLegacyDir(legacyDir);
    await rm(dataDir, { recursive: true, force: true });

    const result = migrateLegacyDataDirSync({
      legacyDir,
      dataDir,
      logger: makeLogger(),
    });
    expect(result.status).toBe('migrated');
    expect(fs.existsSync(path.join(dataDir, 'app.sqlite'))).toBe(true);
  });

  it('skips entries that are absent in the legacy dir', () => {
    // Only seed the SQLite + one project; no media-config, no artifacts.
    writeFile(path.join(legacyDir, 'app.sqlite'), 'fake');
    writeFile(path.join(legacyDir, 'projects', 'only', 'page.html'), '<x/>');

    const result = migrateLegacyDataDirSync({
      legacyDir,
      dataDir,
      logger: makeLogger(),
    });
    expect(result.status).toBe('migrated');
    expect(result.copied).toContain('app.sqlite');
    expect(result.copied).toContain('projects');
    expect(result.copied).not.toContain('media-config.json');
    expect(result.copied).not.toContain('artifacts');
  });

  it('refuses to migrate when a symlink is anywhere inside the legacy payload', () => {
    // Without this guard, fs.cpSync would preserve the link and
    // downstream readers (projects.ts) would follow it, escaping the
    // data root via a crafted .od/ tree.
    seedLegacyDir(legacyDir);

    const escapeTarget = mkdtempSync(path.join(os.tmpdir(), 'od-escape-'));
    writeFile(path.join(escapeTarget, 'secret.txt'), 'should not be reachable');
    const linkPath = path.join(legacyDir, 'projects', 'evil-link');

    if (!trySymlink(escapeTarget, linkPath, 'dir')) {
      // Stock Windows without elevation rejects symlink creation; skip
      // the assertion rather than failing for an unrelated reason.
      return;
    }

    let captured: unknown;
    try {
      migrateLegacyDataDirSync({ legacyDir, dataDir, logger: makeLogger() });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(LegacyMigrationError);
    expect((captured as LegacyMigrationError).code).toBe('symlink_in_payload');

    // dataDir must remain pristine so a follow-up cleanup-then-retry
    // works.
    expect(fs.existsSync(path.join(dataDir, '.migrated-from'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'app.sqlite'))).toBe(false);

    fs.rmSync(escapeTarget, { recursive: true, force: true });
  });

  it('cleans up the staging dir on staging failure (no half-copied state in dataDir)', () => {
    // Legacy dir has SQLite plus a symlink under projects/. Staging
    // copies SQLite first, then walks projects/ and rejects the symlink.
    // The staging dir must be removed so a retry does not see leftover
    // partial copies.
    seedLegacyDir(legacyDir);

    const escapeTarget = mkdtempSync(path.join(os.tmpdir(), 'od-stage-cleanup-'));
    const linkPath = path.join(legacyDir, 'projects', 'late-link');
    if (!trySymlink(escapeTarget, linkPath, 'dir')) {
      fs.rmSync(escapeTarget, { recursive: true, force: true });
      return;
    }

    expect(() =>
      migrateLegacyDataDirSync({ legacyDir, dataDir, logger: makeLogger() }),
    ).toThrowError(LegacyMigrationError);

    // No .od-migrate-* sibling left behind.
    const parent = path.dirname(dataDir);
    const base = path.basename(dataDir);
    const leftovers = fs
      .readdirSync(parent)
      .filter((entry) => entry.startsWith(`${base}.od-migrate-`));
    expect(leftovers).toEqual([]);

    fs.rmSync(escapeTarget, { recursive: true, force: true });
  });

  it('rolls back already-promoted entries when promotion fails mid-loop', () => {
    // Drives promoteStaged directly so we can inject a real filesystem
    // failure mid-loop without mocking the frozen node:fs namespace.
    // Without the rollback, the next boot would see a lone app.sqlite,
    // dataDirHasExistingPayload would return ['app.sqlite'], and the
    // migrator would refuse the retry under data_dir_not_empty, stranding
    // the user mid-migration.
    const stagingDir = path.join(
      path.dirname(dataDir),
      `${path.basename(dataDir)}.od-migrate-rollback-test`,
    );
    fs.mkdirSync(stagingDir, { recursive: true });
    writeFile(path.join(stagingDir, 'app.sqlite'), 'staged-sqlite');
    writeFile(path.join(stagingDir, 'app-config.json'), 'staged-config');

    // Pre-create dataDir/app-config.json as a non-empty directory.
    // renameSync of a regular file onto a non-empty directory fails
    // with EISDIR/ENOTEMPTY on POSIX and EPERM on Windows; the cpSync
    // fallback (file -> existing dir) likewise refuses to overlay.
    // That is a real failure injection, not a mock.
    fs.mkdirSync(path.join(dataDir, 'app-config.json'), { recursive: true });
    writeFile(path.join(dataDir, 'app-config.json', 'block.txt'), 'occupied');

    let captured: unknown;
    try {
      promoteStaged(stagingDir, dataDir, ['app.sqlite', 'app-config.json']);
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(Error);

    // app.sqlite was promoted on the first iteration. The rollback
    // must have removed it before rethrowing, so the user's retry
    // does not get blocked under data_dir_not_empty. Stronger check:
    // dataDir is free of *every* payload entry, which also catches
    // the cpSync-fallback partial-write scenario (rename throws,
    // cpSync starts writing dst, fails; the dst-cleanup inside
    // promoteStaged plus the outer rollback together must leave a
    // clean dataDir).
    expect(dataDirHasExistingPayload(dataDir)).toEqual([]);

    fs.rmSync(stagingDir, { recursive: true, force: true });
  });

  it('rolls back promoted payload when writeMarker fails after promotion', () => {
    // mrcfps round-4: writeMarker is the last step that can fail
    // (ENOSPC, read-only target, permissions). If it does, payload
    // entries are already in dataDir but no marker was written; the
    // next boot would hit dataDirHasExistingPayload and throw
    // data_dir_not_empty, making the migration un-retryable.
    seedLegacyDir(legacyDir);

    let captured: unknown;
    try {
      migrateLegacyDataDirSync({
        legacyDir,
        dataDir,
        logger: makeLogger(),
        // Simulate the worst case: writeMarker has already written a
        // partial .migrated-from file before the underlying syscall
        // fails. Without defensive cleanup the next boot's
        // fs.existsSync(markerPath) check would short-circuit as
        // `skipped` and the user would be stranded.
        writeMarker: (markerDataDir) => {
          fs.writeFileSync(
            path.join(markerDataDir, '.migrated-from'),
            'partial bytes before crash',
            'utf8',
          );
          const e = new Error('synthetic ENOSPC writing marker') as NodeJS.ErrnoException;
          e.code = 'ENOSPC';
          throw e;
        },
      });
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(Error);

    // Every payload entry that promoteStaged placed into dataDir must
    // be gone so the next boot is not refused under data_dir_not_empty.
    expect(dataDirHasExistingPayload(dataDir)).toEqual([]);
    // And the partial marker the seam wrote must have been cleaned up,
    // so the idempotency check on the next boot does not falsely
    // short-circuit and strand the user.
    expect(fs.existsSync(path.join(dataDir, '.migrated-from'))).toBe(false);

    // Once the underlying disk/permissions issue is fixed, a clean
    // retry without the failure injection actually succeeds.
    const result = migrateLegacyDataDirSync({
      legacyDir,
      dataDir,
      logger: makeLogger(),
    });
    expect(result.status).toBe('migrated');
    expect(fs.existsSync(path.join(dataDir, 'app.sqlite'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, '.migrated-from'))).toBe(true);
  });
});

describe('dataDirIsEmptyOrFresh', () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-fresh-'));
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('treats a missing directory as fresh', async () => {
    await rm(dataDir, { recursive: true, force: true });
    expect(dataDirIsEmptyOrFresh(dataDir)).toBe(true);
  });

  it('treats an empty directory as fresh', () => {
    expect(dataDirIsEmptyOrFresh(dataDir)).toBe(true);
  });

  it('treats a directory with arbitrary OS scratch but no app.sqlite as fresh', () => {
    writeFile(path.join(dataDir, 'lockfile'), '');
    expect(dataDirIsEmptyOrFresh(dataDir)).toBe(true);
  });

  it('treats a directory with app.sqlite as not fresh', () => {
    writeFile(path.join(dataDir, 'app.sqlite'), 'real-data');
    expect(dataDirIsEmptyOrFresh(dataDir)).toBe(false);
  });
});

describe('legacyDirHasPayload', () => {
  let legacyDir: string;
  beforeEach(() => {
    legacyDir = mkdtempSync(path.join(os.tmpdir(), 'od-legacy-prove-'));
  });
  afterEach(async () => {
    await rm(legacyDir, { recursive: true, force: true });
  });

  it('returns false when the directory is missing', async () => {
    await rm(legacyDir, { recursive: true, force: true });
    expect(legacyDirHasPayload(legacyDir)).toBe(false);
  });

  it('returns false when the directory exists but has no app.sqlite', () => {
    writeFile(path.join(legacyDir, 'README.md'), 'unrelated');
    expect(legacyDirHasPayload(legacyDir)).toBe(false);
  });

  it('returns true when the directory contains app.sqlite', () => {
    writeFile(path.join(legacyDir, 'app.sqlite'), 'real');
    expect(legacyDirHasPayload(legacyDir)).toBe(true);
  });
});

describe('dataDirHasExistingPayload', () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-payload-probe-'));
  });
  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('returns an empty list when the directory is missing', async () => {
    await rm(dataDir, { recursive: true, force: true });
    expect(dataDirHasExistingPayload(dataDir)).toEqual([]);
  });

  it('returns an empty list when the directory holds only foreign files', () => {
    writeFile(path.join(dataDir, 'unrelated.log'), 'logs');
    writeFile(path.join(dataDir, '.DS_Store'), '');
    expect(dataDirHasExistingPayload(dataDir)).toEqual([]);
  });

  it('detects app.sqlite alone', () => {
    writeFile(path.join(dataDir, 'app.sqlite'), 'real');
    expect(dataDirHasExistingPayload(dataDir)).toEqual(['app.sqlite']);
  });

  it('detects projects/ alone (a payload entry can be a directory)', () => {
    writeFile(path.join(dataDir, 'projects', 'p1', 'index.html'), '<x/>');
    expect(dataDirHasExistingPayload(dataDir)).toEqual(['projects']);
  });

  it('returns every payload entry that exists, in declared order', () => {
    writeFile(path.join(dataDir, 'app.sqlite'), 'real');
    writeFile(path.join(dataDir, 'media-config.json'), '{"providers":{}}');
    writeFile(path.join(dataDir, 'artifacts', 'a1', 'final.html'), '<x/>');
    expect(dataDirHasExistingPayload(dataDir)).toEqual([
      'app.sqlite',
      'media-config.json',
      'artifacts',
    ]);
  });
});
