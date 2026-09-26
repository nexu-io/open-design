// Cloudflare Workers config file: durability of the atomic write and recovery
// from an unparsable file. The config gates every Workers route (config GET/
// PUT, capabilities, zones, deploy), so a corrupt file must degrade to the
// unconfigured default instead of bricking all of them.

import fs from 'node:fs';
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
  it('fsyncs the temp file before the rename and the parent directory after it', async () => {
    await withDataDir(async (dir) => {
      // Reach the FileHandle prototype through a real handle: fs/promises does
      // not export the class, and an ESM namespace cannot be spied directly.
      const probe = await open(path.join(dir, 'probe'), 'w');
      const proto = Object.getPrototypeOf(probe) as { sync: () => Promise<void> };
      await probe.close();
      // Every flush, in order: what was synced (the temp file, or the parent
      // directory) and whether the config entry existed at that moment.
      const syncs: Array<{ directory: boolean; targetExisted: boolean }> = [];
      vi.spyOn(proto, 'sync').mockImplementation(async function (this: unknown) {
        syncs.push({
          directory: fs.fstatSync((this as { fd: number }).fd).isDirectory(),
          targetExisted: await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8').then(() => true, () => false),
        });
      });
      await writeCloudflareWorkersConfig({ token: 'tok', accountId: 'acct_test' });
      // The temp file's bytes are flushed before the rename lands the entry,
      // then the directory entry itself — a rename is durable only once the
      // parent directory's metadata is.
      expect(syncs).toEqual([
        { directory: false, targetExisted: false },
        { directory: true, targetExisted: true },
      ]);
      expect(JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8'))).toMatchObject({
        token: 'tok',
        accountId: 'acct_test',
      });
    });
  });

  it('a directory the platform refuses to fsync (EPERM) does not fail the config write', async () => {
    await withDataDir(async (dir) => {
      const probe = await open(path.join(dir, 'probe'), 'w');
      const proto = Object.getPrototypeOf(probe) as { sync: () => Promise<void> };
      await probe.close();
      let directorySyncAttempted = false;
      vi.spyOn(proto, 'sync').mockImplementation(async function (this: unknown) {
        if (fs.fstatSync((this as { fd: number }).fd).isDirectory()) {
          directorySyncAttempted = true;
          throw Object.assign(new Error('EPERM: operation not permitted, fsync'), { code: 'EPERM' });
        }
      });
      // Best-effort: the rename has landed and the temp-file flush already
      // made the bytes durable, so the refusal must not surface as a failure.
      await expect(writeCloudflareWorkersConfig({ token: 'tok', accountId: 'acct_test' })).resolves.toMatchObject({ configured: true });
      expect(directorySyncAttempted).toBe(true);
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

describe('credential mode is derived from a live OAuth grant', () => {
  it('reads oauth mode when a crash left a live grant behind a config that still says token', async () => {
    await withDataDir(async () => {
      // The OAuth commit writes the token first and the credential mode second
      // (commitCloudflareOAuthMode), so a crash between the two leaves a live
      // grant on disk while the config still says 'token'.
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      // The token is the authoritative record, so its presence decides the
      // mode — without this the deploys would ignore the grant and fall back
      // to the static token.
      const config = await readCloudflareWorkersConfig();
      expect(config).toMatchObject({ credentialMode: 'oauth', clientId: 'client-abc', token: 'static-token' });
      // The settings surface reports the mode the deploys will actually use …
      expect(publicCloudflareWorkersConfig(config)).toMatchObject({ credentialMode: 'oauth', configured: true });
      // … and the credential resolver hands out the grant, not the static token.
      await expect(getCloudflareAccessToken()).resolves.toBe('oauth-access');
    });
  });

  it('an expired grant leaves the config in token mode and the static token in use', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'stale-access',
        tokenType: 'Bearer',
        refreshToken: 'ref-1',
        clientId: 'client-abc',
        expiresAt: Date.now() - 1000,
        generation: 1,
        savedAt: Date.now(),
      });
      // A grant the resolver would have to refresh is not authority to change
      // the mode: the refresh needs an identity the config may not carry yet.
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');
      await expect(getCloudflareAccessToken()).resolves.toBe('static-token');
    });
  });

  it('a corrupt config still reads as token mode, even with a live grant on disk', async () => {
    await withDataDir(async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await writeFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'not json at all', 'utf8');
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      // A corrupt file is its own degraded state — its recovery is a settings
      // save, and it must not gain a mode the file does not carry.
      expect(await readCloudflareWorkersConfig()).toMatchObject({
        credentialMode: 'token',
        configError: CLOUDFLARE_WORKERS_CONFIG_CORRUPT_CODE,
      });
    });
  });
});
