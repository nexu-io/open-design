import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readAppConfig, writeAppConfig } from '../src/app-config.js';
import {
  readInstallationFile,
  writeInstallationFile,
} from '../src/installation.js';

/**
 * The contract these tests pin down is the **0.7.x → 0.8.0 person
 * continuity guarantee**: an existing user upgrading from a daemon that
 * only wrote to `app-config.json` must not produce a new PostHog person
 * after the upgrade. They also pin the "namespace churn / clean
 * reinstall" survival path: when `<dataDir>/app-config.json` disappears
 * but `<installationDir>/installation.json` still has the id, reads must
 * return that id so the next event ships with the same distinct_id.
 *
 * Two directories per test:
 *   - `dataDir`     — simulates `<namespace>/data/`
 *   - `installDir`  — simulates the channel root (`<userData>/`)
 * They live as siblings so we can independently reset either side.
 */

let rootDir: string;
let dataDir: string;
let installDir: string;
const SAVED_INSTALL_ENV = process.env.OD_INSTALLATION_DIR;

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), 'od-install-test-'));
  dataDir = join(rootDir, 'namespace', 'data');
  installDir = join(rootDir, 'channel-root');
  await mkdir(dataDir, { recursive: true });
  await mkdir(installDir, { recursive: true });
  process.env.OD_INSTALLATION_DIR = installDir;
});

afterEach(async () => {
  if (SAVED_INSTALL_ENV == null) {
    delete process.env.OD_INSTALLATION_DIR;
  } else {
    process.env.OD_INSTALLATION_DIR = SAVED_INSTALL_ENV;
  }
  if (rootDir != null) {
    await rm(rootDir, { recursive: true, force: true });
  }
});

describe('installation.json migration', () => {
  it('reads installationId from app-config when installation.json is absent (0.7.x state)', async () => {
    await writeFile(
      join(dataDir, 'app-config.json'),
      JSON.stringify({ installationId: 'legacy-id-7' }),
      'utf8',
    );
    const cfg = await readAppConfig(dataDir);
    expect(cfg.installationId).toBe('legacy-id-7');
  });

  it('mirrors a legacy app-config installationId into installation.json on first read (0.7.x → 0.8.0)', async () => {
    await writeFile(
      join(dataDir, 'app-config.json'),
      JSON.stringify({ installationId: 'legacy-id-8' }),
      'utf8',
    );
    // No installation.json yet — readAppConfig should backfill it.
    await readAppConfig(dataDir);
    const persisted = await readInstallationFile(installDir);
    expect(persisted.installationId).toBe('legacy-id-8');
  });

  it('serves installation.json even when app-config.json was wiped (namespace churn / clean reinstall)', async () => {
    await writeInstallationFile(installDir, { installationId: 'stable-id' });
    // dataDir is empty — no app-config.json
    const cfg = await readAppConfig(dataDir);
    expect(cfg.installationId).toBe('stable-id');
  });

  it('prefers installation.json over a divergent value in app-config.json (post-migration writes win)', async () => {
    await writeInstallationFile(installDir, { installationId: 'new-id' });
    await writeFile(
      join(dataDir, 'app-config.json'),
      JSON.stringify({ installationId: 'old-id' }),
      'utf8',
    );
    const cfg = await readAppConfig(dataDir);
    expect(cfg.installationId).toBe('new-id');
  });

  it('mirrors installationId from writeAppConfig into installation.json so reinstalls survive', async () => {
    await writeAppConfig(dataDir, { installationId: 'fresh-id', telemetry: { metrics: true } });
    const installContents = JSON.parse(
      await readFile(join(installDir, 'installation.json'), 'utf8'),
    ) as { installationId: string };
    expect(installContents.installationId).toBe('fresh-id');
    // Legacy app-config is also kept current so any code path that reads
    // it directly (or a downgrade to 0.7.x) still sees the same id.
    const appConfigContents = JSON.parse(
      await readFile(join(dataDir, 'app-config.json'), 'utf8'),
    ) as { installationId: string };
    expect(appConfigContents.installationId).toBe('fresh-id');
  });

  it('does not touch installation.json on an unrelated writeAppConfig (no churn)', async () => {
    await writeInstallationFile(installDir, { installationId: 'untouched' });
    await writeAppConfig(dataDir, { telemetry: { metrics: true } });
    const persisted = await readInstallationFile(installDir);
    expect(persisted.installationId).toBe('untouched');
  });

  it('falls back to dataDir when OD_INSTALLATION_DIR is unset (dev / OSS / tools-dev paths)', async () => {
    delete process.env.OD_INSTALLATION_DIR;
    await writeAppConfig(dataDir, { installationId: 'devmode-id' });
    // With no override, the install file should land next to app-config.json.
    const persisted = JSON.parse(
      await readFile(join(dataDir, 'installation.json'), 'utf8'),
    ) as { installationId: string };
    expect(persisted.installationId).toBe('devmode-id');
  });

  it('returns an empty object when neither file exists (cold first boot)', async () => {
    const cfg = await readAppConfig(dataDir);
    expect(cfg.installationId).toBeUndefined();
    const persisted = await readInstallationFile(installDir);
    expect(persisted.installationId).toBeUndefined();
  });

  it('clears installation.json when "Delete my data" sets installationId to null', async () => {
    // First write a real id — both files now hold it.
    await writeAppConfig(dataDir, { installationId: 'before-delete' });
    expect((await readInstallationFile(installDir)).installationId).toBe('before-delete');
    // "Delete my data" path: PUT /api/app-config with installationId: null.
    // Without the mirror-on-clear in writeAppConfig, the next readAppConfig
    // would still serve `before-delete` from installation.json and the
    // user's reset action would silently no-op.
    await writeAppConfig(dataDir, { installationId: null });
    const persisted = await readInstallationFile(installDir);
    expect(persisted.installationId).toBeUndefined();
    const cfg = await readAppConfig(dataDir);
    expect(cfg.installationId).toBeNull();
  });

  it('overwrites installation.json when "Delete my data" rotates to a fresh id', async () => {
    await writeAppConfig(dataDir, { installationId: 'old' });
    await writeAppConfig(dataDir, { installationId: 'new' });
    const persisted = await readInstallationFile(installDir);
    expect(persisted.installationId).toBe('new');
  });
});
