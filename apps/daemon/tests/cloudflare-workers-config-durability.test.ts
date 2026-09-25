// Cloudflare Workers config file: durability of the atomic write and recovery
// from an unparsable file. The config gates every Workers route (config GET/
// PUT, capabilities, zones, deploy), so a corrupt file must degrade to the
// unconfigured default instead of bricking all of them.

import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE,
  CLOUDFLARE_WORKERS_PROVIDER_ID,
  configureCloudflareWorkersDataDir,
  deployConfigPath,
  getCloudflareAccessToken,
  publicCloudflareWorkersConfig,
  readCloudflareWorkersConfig,
  writeCloudflareWorkersConfig,
} from '../src/deploy.js';

async function withDataDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'od-workers-config-durability-'));
  const priorStateRoot = process.env.OD_USER_STATE_DIR;
  process.env.OD_USER_STATE_DIR = dir;
  configureCloudflareWorkersDataDir(dir);
  try {
    return await run(dir);
  } finally {
    if (priorStateRoot === undefined) delete process.env.OD_USER_STATE_DIR;
    else process.env.OD_USER_STATE_DIR = priorStateRoot;
    await rm(dir, { recursive: true, force: true });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Workers config write durability', () => {
  it('fsyncs the temp file before renaming it over the config', async () => {
    await withDataDir(async (dir) => {
      // Reach the FileHandle prototype through a real handle: fs/promises does
      // not export the class, and an ESM namespace cannot be spied directly.
      const probe = await open(path.join(dir, 'probe'), 'w');
      const proto = Object.getPrototypeOf(probe) as { sync: () => Promise<void> };
      await probe.close();
      let syncedBeforeRename = false;
      const syncSpy = vi.spyOn(proto, 'sync').mockImplementation(async function (this: unknown) {
        // The temp file must not yet have been renamed over the target when
        // the flush happens (the whole point of syncing first).
        syncedBeforeRename = !(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8').then(() => true, () => false));
      });
      await writeCloudflareWorkersConfig({ token: 'tok', accountId: 'acct_test' });
      expect(syncSpy).toHaveBeenCalledTimes(1);
      expect(syncedBeforeRename).toBe(true);
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8'))).toMatchObject({
        token: 'tok',
        accountId: 'acct_test',
      });
    });
  });
});

describe('Workers config corruption recovery', () => {
  it('degrades an unparsable config to the unconfigured default and flags CFW_CONFIG_CORRUPT instead of throwing', async () => {
    await withDataDir(async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await writeFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), '{"token": "tok", "accountId": ', 'utf8');
      const config = await readCloudflareWorkersConfig();
      expect(config).toMatchObject({ token: '', accountId: '', credentialMode: 'token', configError: CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE });
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE));
      // The marker reaches the public shape the settings UI reads …
      expect(publicCloudflareWorkersConfig(config)).toMatchObject({ configured: false, configError: CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE });
      // … and a healthy config never carries it.
      expect(publicCloudflareWorkersConfig({ token: 'tok', accountId: 'acct' })).not.toHaveProperty('configError');
      // The credential resolver degrades the same way (no token → a typed error, not a crash).
      await expect(getCloudflareAccessToken()).rejects.toMatchObject({ code: 'CFW_TOKEN_REQUIRED' });
    });
  });

  it('treats a JSON file that is not an object as corrupt', async () => {
    await withDataDir(async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await writeFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), '[1,2,3]', 'utf8');
      expect((await readCloudflareWorkersConfig()).configError).toBe(CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE);
    });
  });

  it('a settings save rewrites the corrupt file and clears the marker', async () => {
    await withDataDir(async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await writeFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'not json at all', 'utf8');
      const saved = await writeCloudflareWorkersConfig({ token: 'tok', accountId: 'acct_test' });
      expect(saved).toMatchObject({ configured: true });
      expect(saved).not.toHaveProperty('configError');
      const reread = await readCloudflareWorkersConfig();
      expect(reread).toMatchObject({ token: 'tok', accountId: 'acct_test' });
      expect(reread.configError).toBeUndefined();
      // The marker is never persisted.
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8'))).not.toHaveProperty('configError');
    });
  });

  it('still surfaces a non-syntax read failure', async () => {
    await withDataDir(async () => {
      // A directory in place of the file: EISDIR, which is not corruption.
      const { mkdir } = await import('node:fs/promises');
      await mkdir(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), { recursive: true });
      await expect(readCloudflareWorkersConfig()).rejects.toMatchObject({ code: 'EISDIR' });
    });
  });
});
