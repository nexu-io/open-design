/**
 * Unit tests for the OD_LEGACY_DATA_DIR one-shot migrator. Hermetic:
 * each test runs against a fresh pair of mkdtemp() directories so no
 * test ever touches a real OD install.
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
  migrateLegacyDataDirSync,
  dataDirIsEmptyOrFresh,
  legacyDirHasPayload,
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

  it('skips with warn when legacyDir has no app.sqlite', () => {
    // Create the dir but leave it empty (or with non-OD junk).
    writeFile(path.join(legacyDir, 'README.txt'), 'unrelated');
    const log = makeLogger();
    const result = migrateLegacyDataDirSync({ legacyDir, dataDir, logger: log });
    expect(result.status).toBe('skipped');
    expect(result.reason).toMatch(/no app\.sqlite/);
    expect(log.entries.some((e) => e.level === 'warn')).toBe(true);
  });

  it('skips when dataDir already has app.sqlite (never overwrites real data)', () => {
    seedLegacyDir(legacyDir);
    writeFile(path.join(dataDir, 'app.sqlite'), 'NEW-DATA-DO-NOT-OVERWRITE');

    const result = migrateLegacyDataDirSync({
      legacyDir,
      dataDir,
      logger: makeLogger(),
    });
    expect(result.status).toBe('skipped');
    expect(fs.readFileSync(path.join(dataDir, 'app.sqlite'), 'utf8')).toBe(
      'NEW-DATA-DO-NOT-OVERWRITE',
    );
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
