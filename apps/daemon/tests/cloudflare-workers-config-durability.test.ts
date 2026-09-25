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
  cloudflareOAuthTokensDir,
  commitCloudflareOAuthMode,
  configureCloudflareWorkersDataDir,
  deployConfigPath,
  getCloudflareAccessToken,
  publicCloudflareWorkersConfig,
  readCloudflareWorkersConfig,
  resetCloudflareCredentialMode,
  writeCloudflareOAuthIdentity,
  writeCloudflareWorkersConfig,
} from '../src/deploy.js';
import { setCloudflareOAuthToken } from '../src/integrations/cloudflare-tokens.js';

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

  // The partial mutations (OAuth identity, mode commit, disconnect reset) spread
  // the current config. After a corrupt read that is the EMPTY default plus the
  // marker, so writing it would replace the user's recoverable file with
  // nothing — and persist the marker. Only the explicit settings PUT above heals.
  describe('partial mutations on a corrupt file', () => {
    const CORRUPT = '{"token": "tok", "accountId": "acct_test", "scriptName": "keep-me", "bindings": [';

    it('the OAuth identity write refuses with CFW_CONFIG_CORRUPT and leaves the file byte-for-byte intact', async () => {
      await withDataDir(async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const file = deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID);
        await writeFile(file, CORRUPT, 'utf8');
        await expect(writeCloudflareOAuthIdentity({ clientId: 'client-1', redirectUri: 'http://127.0.0.1:1/cb' }))
          .rejects.toMatchObject({ status: 409, code: CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE });
        expect(await readFile(file, 'utf8')).toBe(CORRUPT);
      });
    });

    it('the oauth mode commit refuses with CFW_CONFIG_CORRUPT and leaves the file intact', async () => {
      await withDataDir(async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const file = deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID);
        await writeFile(file, CORRUPT, 'utf8');
        await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), { accessToken: 'acc', tokenType: 'Bearer', generation: 0, savedAt: Date.now() });
        await expect(commitCloudflareOAuthMode({ clientId: 'client-1', redirectUri: 'http://127.0.0.1:1/cb' }))
          .rejects.toMatchObject({ status: 409, code: CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE });
        expect(await readFile(file, 'utf8')).toBe(CORRUPT);
      });
    });

    it('the disconnect reset skips the write (a corrupt file already reads as token mode) and leaves the file intact', async () => {
      await withDataDir(async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const file = deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID);
        await writeFile(file, CORRUPT, 'utf8');
        await expect(resetCloudflareCredentialMode()).resolves.toBeUndefined();
        expect(await readFile(file, 'utf8')).toBe(CORRUPT);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE));
        expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');
      });
    });

    it('a settings PUT still heals the file, after which the partial mutations work and never persist the marker', async () => {
      await withDataDir(async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const file = deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID);
        await writeFile(file, CORRUPT, 'utf8');
        await writeCloudflareWorkersConfig({ token: 'tok', accountId: 'acct_test', scriptName: 'healed' });
        await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), { accessToken: 'acc', tokenType: 'Bearer', generation: 0, savedAt: Date.now() });
        await writeCloudflareOAuthIdentity({ clientId: 'client-1', redirectUri: 'http://127.0.0.1:1/cb' });
        await commitCloudflareOAuthMode();
        expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({ scriptName: 'healed', clientId: 'client-1', credentialMode: 'oauth' });
        await resetCloudflareCredentialMode();
        const persisted = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
        expect(persisted).toMatchObject({ scriptName: 'healed', clientId: 'client-1', credentialMode: 'token' });
        expect(persisted).not.toHaveProperty('configError');
      });
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
