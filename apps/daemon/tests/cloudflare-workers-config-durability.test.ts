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
  clearPendingCloudflareOAuthGrant,
  cloudflareOAuthTokensDir,
  commitCloudflareOAuthMode,
  configureCloudflareWorkersDataDir,
  deployConfigPath,
  getCloudflareAccessToken,
  markCloudflareOAuthGrantPending,
  publicCloudflareWorkersConfig,
  readCloudflareWorkersConfig,
  resetCloudflareCredentialMode,
  writeCloudflareWorkersConfig,
} from '../src/deploy.js';
import {
  clearCloudflareOAuthToken,
  clearCloudflareOAuthTokenForRevoke,
  dropPendingCloudflareOAuthRevokes,
  getCloudflareOAuthToken,
  getPendingCloudflareOAuthRevokes,
  restoreCloudflareOAuthTokenAndDropRevokes,
  setCloudflareOAuthToken,
  setCloudflareOAuthTokenIfGenerationMatches,
} from '../src/integrations/cloudflare-tokens.js';

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
  vi.unstubAllGlobals();
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

  // The partial mutations (pending-grant marker, mode commit, disconnect reset)
  // spread the current config. After a corrupt read that is the EMPTY default
  // plus the marker, so writing it would replace the user's recoverable file
  // with nothing — and persist the marker. Only the explicit settings PUT heals.
  describe('partial mutations on a corrupt file', () => {
    const CORRUPT = '{"token": "tok", "accountId": "acct_test", "scriptName": "keep-me", "bindings": [';

    it('the pending-grant marker write refuses with CFW_CONFIG_CORRUPT and leaves the file byte-for-byte intact', async () => {
      await withDataDir(async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const file = deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID);
        await writeFile(file, CORRUPT, 'utf8');
        await expect(markCloudflareOAuthGrantPending())
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
        await markCloudflareOAuthGrantPending();
        await commitCloudflareOAuthMode({ clientId: 'client-1', redirectUri: 'http://127.0.0.1:1/cb' });
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
  it('reads oauth mode when a crash left a live grant behind a config with no usable static token', async () => {
    await withDataDir(async () => {
      // The OAuth commit writes the token first and the credential mode second
      // (commitCloudflareOAuthMode), so a crash between the two leaves a live
      // grant on disk while the config still says 'token'. The config is written
      // by hand because a connect-only user never had a static token, and the
      // settings PUT (rightly) refuses to persist an empty one.
      await writeFile(
        deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID),
        JSON.stringify({ accountId: 'acct_test', credentialMode: 'token' }),
        'utf8',
      );
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      // With no static credential to prefer, the grant is the only authority
      // there is. Without this the deploys would sign with an empty token while
      // the grant sat unused, with nothing left that knows it is there.
      const config = await readCloudflareWorkersConfig();
      expect(config).toMatchObject({ credentialMode: 'oauth', clientId: 'client-abc', token: '' });
      // The settings surface reports the mode the deploys will actually use ...
      expect(publicCloudflareWorkersConfig(config)).toMatchObject({ credentialMode: 'oauth', configured: true });
      // ... and the credential resolver hands out the grant.
      await expect(getCloudflareAccessToken()).resolves.toBe('oauth-access');
    });
  });

  it('an explicit static token keeps the config in token mode while a live grant exists', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      // The user's own choice of authority outranks the grant beside it.
      // Deriving oauth from any live grant made 'token' unreachable for as long
      // as one existed: the selector flipped straight back on every read, so a
      // user could not leave OAuth mode at all. Leaving is what disconnect does,
      // and it clears the grant before resetting the mode, so nothing stale is
      // left here to re-assert oauth.
      const config = await readCloudflareWorkersConfig();
      expect(config).toMatchObject({ credentialMode: 'token', token: 'static-token' });
      expect(publicCloudflareWorkersConfig(config)).toMatchObject({ credentialMode: 'token' });
      // The deploy signs with the token the user chose, not the grant.
      await expect(getCloudflareAccessToken()).resolves.toBe('static-token');
    });
  });

  it('an expired grant does not outrank the static token the user saved', async () => {
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
      // The static token the user saved outranks the grant beside it whether or
      // not the grant is expired — expiry never gets a vote here. What expiry
      // decides is whether a grant can be authority at all when there is no
      // static token to prefer (see the refreshable-grant case below).
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');
      await expect(getCloudflareAccessToken()).resolves.toBe('static-token');
    });
  });

  it('an expired but refreshable grant still decides the mode when the config has no static token', async () => {
    await withDataDir(async () => {
      // The crash window again, one hour later: the config still says 'token'
      // and still holds no static token, so the grant on disk is the only
      // authority there is. Expiry must not read as "no grant" — this user never
      // had a static token to fall back on, so leaving the mode at 'token' made
      // every deploy fail CFW_TOKEN_REQUIRED while /auth/status went on
      // reporting a connected profile.
      await writeFile(
        deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID),
        JSON.stringify({ accountId: 'acct_test', credentialMode: 'token' }),
        'utf8',
      );
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'stale-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() - 1000,
        generation: 1,
        savedAt: Date.now(),
      });
      const config = await readCloudflareWorkersConfig();
      expect(config).toMatchObject({ credentialMode: 'oauth', clientId: 'client-abc', token: '' });
      expect(publicCloudflareWorkersConfig(config)).toMatchObject({ credentialMode: 'oauth', configured: true });
      // The refresh needs nothing from the config: the record's own clientId is
      // what the token endpoint is bound to, and the resolver spends the grant
      // before it signs anything.
      const refreshes: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        refreshes.push(url + ' ' + String(init?.body ?? ''));
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 'oauth-fresh', token_type: 'Bearer', refresh_token: 'ref-2' }),
        } as unknown as Response;
      }));
      await expect(getCloudflareAccessToken()).resolves.toBe('oauth-fresh');
      expect(refreshes).toHaveLength(1);
      expect(refreshes[0]).toContain('refresh_token=ref-1');
      expect(refreshes[0]).toContain('client_id=client-abc');
    });
  });

  it('an expired grant that cannot refresh stays token mode, so the reconnect it needs is visible', async () => {
    await withDataDir(async () => {
      // Nothing can refresh this one, so the resolver would refuse it outright
      // (CFW_OAUTH_RECONNECT_REQUIRED). Deriving oauth from it would report a
      // mode whose every deploy spends a grant that cannot be renewed, instead
      // of the token-mode state whose failure names the reconnect the user
      // actually has to perform.
      await writeFile(
        deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID),
        JSON.stringify({ accountId: 'acct_test', credentialMode: 'token' }),
        'utf8',
      );
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'stale-access',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() - 1000,
        generation: 1,
        savedAt: Date.now(),
      });
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');
      await expect(getCloudflareAccessToken()).rejects.toMatchObject({ code: 'CFW_TOKEN_REQUIRED' });
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

  it('a token-mode switch clears and revokes the grant the config is leaving behind', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await commitCloudflareOAuthMode();
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('oauth');

      const revokes: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        revokes.push(url + ' ' + String(init?.body ?? ''));
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }));

      const saved = await writeCloudflareWorkersConfig({ credentialMode: 'token' });
      expect(saved.credentialMode).toBe('token');
      // The grant is off disk — so /auth/status stops reporting a connected
      // profile the deploys no longer sign with ...
      expect(await getCloudflareOAuthToken(cloudflareOAuthTokensDir())).toBeNull();
      // ... and revoked at Cloudflare, so its refresh token cannot be replayed.
      expect(revokes).toHaveLength(1);
      expect(revokes[0]).toContain('token=ref-1');
      expect(revokes[0]).toContain('client_id=client-abc');
    });
  });

  it('a refused token-mode switch revokes nothing', async () => {
    await withDataDir(async () => {
      // A connect-only profile has no static token to switch to, so the save
      // itself is refused (CFW_TOKEN_REQUIRED). The grant must survive that: the
      // user has not left OAuth, and revoking would break the connection their
      // config still names.
      await writeFile(
        deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID),
        JSON.stringify({ accountId: 'acct_test', credentialMode: 'oauth', clientId: 'client-abc' }),
        'utf8',
      );
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      const fetchSpy = vi.fn(async () => {
        throw new Error('a refused save must not reach the revoke endpoint');
      });
      vi.stubGlobal('fetch', fetchSpy);

      await expect(writeCloudflareWorkersConfig({ credentialMode: 'token' })).rejects.toMatchObject({
        code: 'CFW_TOKEN_REQUIRED',
      });
      expect(await getCloudflareOAuthToken(cloudflareOAuthTokensDir())).not.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  it('the oauth mode commit refuses when the store holds no credential', async () => {
    await withDataDir(async () => {
      // A config a connect is midway through committing: the identity write has
      // landed and the token write has not (or something cleared it). Recording
      // 'oauth' there names a mode with nothing behind it — configured:true on the
      // settings surface while /auth/status reports disconnected, and every deploy
      // failing CFW_OAUTH_RECONNECT_REQUIRED — so the commit refuses and leaves the
      // connect route's rollback to own the outcome.
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await expect(commitCloudflareOAuthMode({ clientId: 'client-1', redirectUri: 'http://127.0.0.1:1/cb' }))
        .rejects.toMatchObject({ status: 400, code: 'CFW_OAUTH_RECONNECT_REQUIRED' });

      const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
      // Neither the mode nor the identity it would have carried reached the file.
      expect(persisted.credentialMode).toBe('token');
      expect(persisted.clientId).not.toBe('client-1');
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');
    });
  });

  it('a settings PUT in the connect window cannot leave oauth mode with no credential behind it', async () => {
    await withDataDir(async () => {
      // The window the connect route cannot close on its own: persistCredential has
      // written the grant and commitCloudflareOAuthMode has not yet recorded the
      // mode, so the config on disk still says 'token' while readCloudflareWorkersConfig
      // derives 'oauth' from the grant beside it. A settings PUT landing here takes
      // the oauth->token transition branch and clears + revokes the grant the connect
      // just minted. The commit that follows must then refuse rather than record a
      // mode whose credential no longer exists.
      await writeFile(
        deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID),
        JSON.stringify({ accountId: 'acct_test', credentialMode: 'token' }),
        'utf8',
      );
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      const revokes: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        revokes.push(url);
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }));

      // The user saves settings with their own static token, choosing token
      // authority — the save that takes the transition branch.
      const saved = await writeCloudflareWorkersConfig({ credentialMode: 'token', token: 'static-token' });
      expect(saved.credentialMode).toBe('token');
      expect(await getCloudflareOAuthToken(cloudflareOAuthTokensDir())).toBeNull();
      expect(revokes).toHaveLength(1);

      // The connect's commit runs with the credential it was the second half of
      // already gone.
      await expect(commitCloudflareOAuthMode({ clientId: 'client-abc', redirectUri: 'http://127.0.0.1:1/cb' }))
        .rejects.toMatchObject({ status: 400, code: 'CFW_OAUTH_RECONNECT_REQUIRED' });
      const raw = await readCloudflareWorkersConfig();
      expect(raw.credentialMode).toBe('token');
      expect(publicCloudflareWorkersConfig(raw).credentialMode).toBe('token');
    });
  });

  it('a connect that crashed between the grant write and the mode commit signs with the grant it stored, not the static token beside it', async () => {
    await withDataDir(async () => {
      // A profile that has both a static token and (mid-connect) a live grant:
      // the config on disk still says 'token' because the commit is the second
      // half of the connect. Without a durable intent, the static token wins
      // the read, every deploy silently keeps signing with it, and the grant
      // stays valid with nobody holding it while /auth/status reports connected.
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      const attemptId = await markCloudflareOAuthGrantPending();

      const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
      // The marker carries the attempt's id: it is an IDENTITY, not a flag, so
      // the commit half of this connect can tell its own marker from one a
      // later attempt wrote over it.
      expect(persisted.pendingOAuthGrant).toBe(attemptId);
      // The stored mode flag is untouched — the marker is what decides.
      expect(persisted.credentialMode).toBe('token');

      const config = await readCloudflareWorkersConfig();
      expect(config.credentialMode).toBe('oauth');
      expect(await getCloudflareAccessToken()).toBe('oauth-access');
    });
  });

  it('a pending marker with no grant behind it decides nothing, so no read answers oauth with nothing there', async () => {
    await withDataDir(async () => {
      // markCloudflareOAuthGrantPending writes the marker BEFORE the token, so a
      // crash — or a token write that simply failed — leaves it durable with no
      // grant on disk. Honoring it unconditionally answered 'oauth' for every
      // later read, which in turn let a settings PUT carrying credentialMode
      // 'oauth' skip its token check (the current mode already read as oauth)
      // and persist a mode with nothing behind it.
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await markCloudflareOAuthGrantPending();
      expect(await getCloudflareOAuthToken(cloudflareOAuthTokensDir())).toBeNull();

      // The stale marker is inert: the mode the file carries is the answer, and
      // the static credential beside it is what every deploy signs with.
      const config = await readCloudflareWorkersConfig();
      expect(config).toMatchObject({ credentialMode: 'token', token: 'static-token' });
      expect(publicCloudflareWorkersConfig(config)).toMatchObject({ credentialMode: 'token', configured: true });
      await expect(getCloudflareAccessToken()).resolves.toBe('static-token');
      // And the settings PUT that would flip the authority is refused, because
      // there is no grant to flip it to.
      await expect(writeCloudflareWorkersConfig({ credentialMode: 'oauth' })).rejects.toMatchObject({
        status: 400,
        code: 'CFW_OAUTH_RECONNECT_REQUIRED',
      });
      const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
      expect(persisted.credentialMode).toBe('token');
      expect(persisted.pendingOAuthGrant).toEqual(expect.any(String));
    });
  });

  it('a stale marker on a connect-only profile reads token mode, not oauth with nothing behind it', async () => {
    await withDataDir(async () => {
      // The same crash, on the profile a connect-only user has: there is no
      // static token to fall back on. The marker must not invent an authority
      // the store cannot back up — that read is what made the settings surface
      // report configured:true while every deploy failed on a mode whose
      // credential had never been written.
      await writeFile(
        deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID),
        JSON.stringify({ accountId: 'acct_test', credentialMode: 'token' }),
        'utf8',
      );
      await markCloudflareOAuthGrantPending();
      const config = await readCloudflareWorkersConfig();
      expect(config).toMatchObject({ credentialMode: 'token', token: '' });
      expect(publicCloudflareWorkersConfig(config)).toMatchObject({ credentialMode: 'token', configured: false });
      await expect(getCloudflareAccessToken()).rejects.toMatchObject({ code: 'CFW_TOKEN_REQUIRED' });
    });
  });

  it('the commit that lands oauth mode drops the pending marker', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await markCloudflareOAuthGrantPending();
      await commitCloudflareOAuthMode({ clientId: 'client-abc', redirectUri: 'http://127.0.0.1:1/cb' });

      const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
      // The mode itself is now the durable statement, so the marker goes.
      expect(persisted.credentialMode).toBe('oauth');
      expect(persisted.pendingOAuthGrant).toBeUndefined();
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('oauth');
    });
  });

  it('an abandoned attempt drops the marker and leaves the mode as it found it', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await markCloudflareOAuthGrantPending();
      // The marker stands with no grant behind it — the attempt it recorded
      // never stored a credential — so it decides nothing and the mode is the
      // file's own. Every path that abandons an attempt still clears it: a
      // marker left behind is what a LATER attempt's grant would be read
      // through, and the durable intent has to belong to the attempt that is
      // actually running.
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');

      await clearPendingCloudflareOAuthGrant();
      const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
      expect(persisted.pendingOAuthGrant).toBeUndefined();
      expect(persisted.credentialMode).toBe('token');
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');
      expect(await getCloudflareAccessToken()).toBe('static-token');
    });
  });

  it('lands the token-mode config BEFORE revoking the grant it displaced', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await commitCloudflareOAuthMode();

      // Read both files at the instant the revoke goes out: the config must
      // already read token mode with no pending marker, and the credential must
      // already be off disk. A save that failed before that point must never
      // have revoked a grant its config still named.
      const atRevoke: Array<{ mode: unknown; pending: unknown; stored: boolean }> = [];
      vi.stubGlobal('fetch', vi.fn(async () => {
        const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
        atRevoke.push({
          mode: persisted.credentialMode,
          pending: persisted.pendingOAuthGrantClear,
          stored: (await getCloudflareOAuthToken(cloudflareOAuthTokensDir())) !== null,
        });
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }));

      const saved = await writeCloudflareWorkersConfig({ credentialMode: 'token' });
      expect(saved.credentialMode).toBe('token');
      expect(atRevoke).toEqual([{ mode: 'token', pending: undefined, stored: false }]);
    });
  });

  it('the disconnect reset lands the token-mode config BEFORE revoking the grant it displaced', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await commitCloudflareOAuthMode();

      // Read both files at the instant the revoke goes out. Disconnect used to
      // take the credential off disk in the ROUTE, before the reset recorded that
      // the config was leaving oauth — so for the whole revoke round trip the
      // stored mode was still 'oauth' beside an empty store, with nothing on disk
      // marking the transition in flight. A crash, a SIGKILL, or a daemon stop in
      // that window made it durable: the settings surface reporting
      // configured:true, /auth/status reporting disconnected, and every deploy
      // failing CFW_OAUTH_RECONNECT_REQUIRED with no button left to press. The
      // revoke may only go out once the transition has landed.
      const atRevoke: Array<{ mode: unknown; pending: unknown; stored: boolean }> = [];
      vi.stubGlobal('fetch', vi.fn(async () => {
        const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
        atRevoke.push({
          mode: persisted.credentialMode,
          pending: persisted.pendingOAuthGrantClear,
          stored: (await getCloudflareOAuthToken(cloudflareOAuthTokensDir())) !== null,
        });
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }));

      await resetCloudflareCredentialMode();
      expect(atRevoke).toEqual([{ mode: 'token', pending: undefined, stored: false }]);
    });
  });

  it('the disconnect reset records the token-mode intent while the credential is still on disk', async () => {
    await withDataDir(async (dir) => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await commitCloudflareOAuthMode();

      const probe = await open(path.join(dir, 'probe-disconnect-intent'), 'w');
      const proto = Object.getPrototypeOf(probe) as { writeFile: (data: unknown, enc?: string) => Promise<void> };
      await probe.close();
      const realWrite = proto.writeFile;
      // The token store's write IS the destructive half: it takes the record off
      // disk and records the revoke handle in the same locked write. The intent
      // has to be durable by then — it is the only thing on disk that says the
      // config is leaving oauth, and the whole span it covers is a state a crash
      // would otherwise freeze as 'oauth' over an empty store.
      const atStoreWrite: Array<{ mode: unknown; pending: unknown }> = [];
      vi.spyOn(proto, 'writeFile').mockImplementation(async function (this: unknown, data: unknown, enc?: string) {
        if (typeof data === 'string' && data.includes('"lastGeneration"')) {
          const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
          atStoreWrite.push({ mode: persisted.credentialMode, pending: persisted.pendingOAuthGrantClear });
        }
        return realWrite.call(this, data, enc);
      });
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) } as unknown as Response)));

      await resetCloudflareCredentialMode();
      // The reset's FIRST write to the token store is the clear, and the intent
      // is already on disk behind it. The stored mode is still 'oauth' — the
      // marker is what makes every read answer token mode from here on, which is
      // exactly what it is written before the destructive half for.
      expect(atStoreWrite[0]).toEqual({ mode: 'oauth', pending: true });
    });
  });

  it('a save whose intent write fails destroys nothing and revokes nothing', async () => {
    await withDataDir(async (dir) => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await commitCloudflareOAuthMode();

      const revokes = vi.fn();
      vi.stubGlobal('fetch', revokes);
      // The intent write is the failing one: nothing after it may have run.
      const probe = await open(path.join(dir, 'probe-intent'), 'w');
      const proto = Object.getPrototypeOf(probe) as { writeFile: (data: unknown, enc?: string) => Promise<void> };
      await probe.close();
      const realWrite = proto.writeFile;
      vi.spyOn(proto, 'writeFile').mockImplementation(async function (this: unknown, data: unknown, enc?: string) {
        if (typeof data === 'string' && data.includes('"pendingOAuthGrantClear": true')) {
          throw new Error('ENOSPC: no space left on device');
        }
        return realWrite.call(this, data, enc);
      });

      await expect(writeCloudflareWorkersConfig({ credentialMode: 'token' })).rejects.toThrow('ENOSPC');
      // The credential the config still names is untouched, and Cloudflare was
      // never told to kill it.
      expect(await getCloudflareOAuthToken(cloudflareOAuthTokensDir())).not.toBeNull();
      expect(revokes).not.toHaveBeenCalled();
      const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
      expect(persisted.credentialMode).toBe('oauth');
      expect(persisted.pendingOAuthGrantClear).toBeUndefined();
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('oauth');
    });
  });

  it('a save whose mode write fails rolls back: the displaced grant and the pre-transition config both come back', async () => {
    await withDataDir(async (dir) => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await commitCloudflareOAuthMode();

      const revokes: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        revokes.push(url + ' ' + String(init?.body ?? ''));
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }));
      // The REPLACEMENT write is the failing one: the intent landed and the
      // credential was taken off disk, but the mode the user chose never
      // reached the file.
      const probe = await open(path.join(dir, 'probe-mode'), 'w');
      const proto = Object.getPrototypeOf(probe) as { writeFile: (data: unknown, enc?: string) => Promise<void> };
      await probe.close();
      const realWrite = proto.writeFile;
      vi.spyOn(proto, 'writeFile').mockImplementation(async function (this: unknown, data: unknown, enc?: string) {
        if (typeof data === 'string' && data.includes('"credentialMode": "token"')) {
          throw new Error('EACCES: permission denied');
        }
        return realWrite.call(this, data, enc);
      });

      await expect(writeCloudflareWorkersConfig({ credentialMode: 'token' })).rejects.toThrow('EACCES');
      // The save failed, so nothing it would have destroyed is destroyed: the
      // grant is back on disk — refresh token and client identity intact — and
      // the connection the config still names is still usable …
      const restored = await getCloudflareOAuthToken(cloudflareOAuthTokensDir());
      expect(restored).toMatchObject({ accessToken: 'oauth-access', refreshToken: 'ref-1', clientId: 'client-abc' });
      // … the file is the record the transition started from, with the marker
      // this transition added dropped (left behind, it would keep the config
      // reading token mode over the credential that is now there) …
      const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
      expect(persisted).toMatchObject({ credentialMode: 'oauth', token: 'static-token' });
      expect(persisted.pendingOAuthGrantClear).toBeUndefined();
      expect(persisted.pendingOAuthGrant).toBeUndefined();
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('oauth');
      // … and nothing was revoked: the grant is held by the config again, and
      // revoking it left the user with NEITHER credential, with the static
      // token they typed existing only in the discarded record.
      expect(revokes).toEqual([]);
    });
  });

  it('a rollback that itself fails revokes the grant it can no longer hand back', async () => {
    await withDataDir(async (dir) => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await commitCloudflareOAuthMode();

      const revokes: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        revokes.push(url + ' ' + String(init?.body ?? ''));
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Only the intent write lands. The replacement write fails, and so does
      // the config write the rollback would restore the pre-transition record
      // with: there is no state left to hand the grant back to.
      const probe = await open(path.join(dir, 'probe-rollback-failure'), 'w');
      const proto = Object.getPrototypeOf(probe) as { writeFile: (data: unknown, enc?: string) => Promise<void> };
      await probe.close();
      const realWrite = proto.writeFile;
      vi.spyOn(proto, 'writeFile').mockImplementation(async function (this: unknown, data: unknown, enc?: string) {
        const text = typeof data === 'string' ? data : '';
        // The token store writes through the same prototype; only the config
        // file's non-intent writes are the ones that fail here.
        if (text.includes('"lastGeneration"')) return realWrite.call(this, data, enc);
        if (text.includes('"pendingOAuthGrantClear": true')) return realWrite.call(this, data, enc);
        throw new Error('EIO: I/O error');
      });

      await expect(writeCloudflareWorkersConfig({ credentialMode: 'token' })).rejects.toThrow('EIO');
      // The intent record is what survives the failed save, so the mode its
      // marker settles is the one the reads answer …
      const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
      expect(persisted.pendingOAuthGrantClear).toBe(true);
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');
      // … the credential is off disk — a store the restored config no longer
      // names must not keep reporting a connected profile — and revoked,
      // rather than left valid with nobody holding it.
      expect(await getCloudflareOAuthToken(cloudflareOAuthTokensDir())).toBeNull();
      expect(revokes).toHaveLength(1);
      expect(revokes[0]).toContain('token=ref-1');
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('rolling back the failed Cloudflare credential transition'));
    });
  });

  it('a settings save completes a transition whose intent wrote but whose clear never ran (crash between intent and clear)', async () => {
    await withDataDir(async () => {
      // The earlier crash window: the intent marker landed, the grant is still on
      // disk, and no revoke handle was ever recorded — the clear (step 2) never
      // ran. The derived mode reads token, so without re-entering the transition
      // branch the clear + revoke half would never execute and the grant would
      // stay live with nothing naming it.
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        generation: 1,
        savedAt: Date.now(),
      });
      await writeFile(
        deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID),
        JSON.stringify({ token: 'static-token', accountId: 'acct_test', credentialMode: 'oauth', pendingOAuthGrantClear: true }),
        'utf8',
      );
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');
      expect(await getCloudflareOAuthToken(cloudflareOAuthTokensDir())).not.toBeNull();
      expect(await getPendingCloudflareOAuthRevokes(cloudflareOAuthTokensDir())).toHaveLength(0);

      const revokes: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
        revokes.push(String(init?.body ?? ''));
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }));

      // A later save to token mode re-enters the transition and finishes the
      // clear + revoke the crash interrupted.
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test', credentialMode: 'token' });

      expect(await getCloudflareOAuthToken(cloudflareOAuthTokensDir())).toBeNull();
      expect(await getPendingCloudflareOAuthRevokes(cloudflareOAuthTokensDir())).toEqual([]);
      expect(revokes).toHaveLength(1);
      expect(revokes[0]).toContain('token=ref-1');
      expect(revokes[0]).toContain('client_id=client-abc');
      const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8'));
      expect(persisted.pendingOAuthGrantClear).toBeUndefined();
      expect(persisted.credentialMode).toBe('token');
    });
  });

  it('a crash between the clear and the revoke leaves the grant named on disk, and the next OAuth mutation revokes it', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      // The crash window, reproduced with the primitives the save itself uses:
      // the clear (which records the revoke handle in the SAME write) landed,
      // the mode write never did, and the process died before the revoke went
      // out. What survives is exactly what a crash leaves: no credential in the
      // store, a config that reads token mode, and one grant still valid at
      // Cloudflare that only the handle names.
      await clearCloudflareOAuthTokenForRevoke(cloudflareOAuthTokensDir());
      await writeFile(
        deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID),
        JSON.stringify({ token: 'static-token', accountId: 'acct_test', credentialMode: 'oauth', pendingOAuthGrantClear: true }),
        'utf8',
      );
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');
      expect(await getCloudflareOAuthToken(cloudflareOAuthTokensDir())).toBeNull();
      expect(await getPendingCloudflareOAuthRevokes(cloudflareOAuthTokensDir())).toHaveLength(1);

      const revokes: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        revokes.push(String(init?.body ?? ''));
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }));
      // The debt is durable, not urgent: nothing reaches Cloudflare until
      // something runs.
      expect(revokes).toEqual([]);

      // The next OAuth mutation finishes what the crash interrupted …
      await resetCloudflareCredentialMode();
      expect(revokes).toHaveLength(1);
      expect(revokes[0]).toContain('token=ref-1');
      expect(revokes[0]).toContain('client_id=client-abc');
      // … and the handle goes with the confirmed revoke, so the next mutation
      // does not repeat it.
      expect(await getPendingCloudflareOAuthRevokes(cloudflareOAuthTokensDir())).toEqual([]);
      await resetCloudflareCredentialMode();
      expect(revokes).toHaveLength(1);
    });
  });

  it('a revoke Cloudflare never answered keeps its handle for the next mutation to retry', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        generation: 1,
        savedAt: Date.now(),
      });
      await clearCloudflareOAuthTokenForRevoke(cloudflareOAuthTokensDir());

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // A transport failure is not an answer: the grant is not known to be dead,
      // so a handle that was dropped here would be a grant leaked for good.
      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new Error('fetch failed');
      }));
      await resetCloudflareCredentialMode();
      expect(warnSpy).toHaveBeenCalled();
      expect(await getPendingCloudflareOAuthRevokes(cloudflareOAuthTokensDir())).toHaveLength(1);

      const revokes: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        revokes.push(String(init?.body ?? ''));
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }));
      await resetCloudflareCredentialMode();
      expect(revokes).toHaveLength(1);
      expect(revokes[0]).toContain('token=ref-1');
      expect(await getPendingCloudflareOAuthRevokes(cloudflareOAuthTokensDir())).toEqual([]);
    });
  });

  it('a settle that drops a handle keeps the file and record generations in step, so the next refresh still matches', async () => {
    await withDataDir(async () => {
      const tokens = cloudflareOAuthTokensDir();
      const credential = (access: string, refresh: string) => ({
        accessToken: access,
        refreshToken: refresh,
        tokenType: 'Bearer',
        generation: 1,
        savedAt: Date.now(),
      });
      // A credential a transition took off disk leaves its grant as a handle;
      // the reconnect that follows carries that handle forward beside the new
      // credential, which is the only state where a settle write has BOTH.
      await setCloudflareOAuthToken(tokens, credential('access-1', 'ref-1'));
      await clearCloudflareOAuthTokenForRevoke(tokens);
      await setCloudflareOAuthToken(tokens, credential('access-2', 'ref-2'));
      await dropPendingCloudflareOAuthRevokes(tokens, ['ref-1']);
      expect(await getPendingCloudflareOAuthRevokes(tokens)).toEqual([]);
      // The refresh compare-and-set matches the FILE generation against the
      // caller's TOKEN generation. A carried record left at its old generation
      // fails that check from then on: every refresh reads itself as
      // superseded, revokes the token it just minted, and reports
      // CFW_OAUTH_RECONNECT_REQUIRED.
      const stored = await getCloudflareOAuthToken(tokens);
      expect(stored).not.toBeNull();
      const landed = await setCloudflareOAuthTokenIfGenerationMatches(tokens, credential('access-3', 'ref-3'), stored!.generation);
      expect(landed).toBe(true);
      expect((await getCloudflareOAuthToken(tokens))?.accessToken).toBe('access-3');
    });
  });

  it('a settle that drops a handle never lands a credential with no access token, and keeps its grant named for the next settle', async () => {
    await withDataDir(async () => {
      const tokens = cloudflareOAuthTokensDir();
      const tokensFile = path.join(tokens, 'cloudflare-oauth-tokens.json');
      await setCloudflareOAuthToken(tokens, {
        accessToken: 'access-1',
        refreshToken: 'ref-real',
        tokenType: 'Bearer',
        generation: 1,
        savedAt: Date.now(),
      });
      // The credential leaves the store as a revoke handle …
      await clearCloudflareOAuthTokenForRevoke(tokens);
      // … and the reconnect that follows writes a record whose accessToken no
      // longer sanitizes while its refresh token stays a live grant on disk —
      // the shape recoveredDisplacedCredential exists for. It reads as no
      // credential at all.
      await setCloudflareOAuthToken(tokens, {
        accessToken: '',
        refreshToken: 'ref-blank',
        clientId: 'client-abc',
        tokenType: 'Bearer',
        generation: 1,
        savedAt: Date.now(),
      });
      expect(await getCloudflareOAuthToken(tokens)).toBeNull();
      expect(await getPendingCloudflareOAuthRevokes(tokens)).toHaveLength(1);
      const before = JSON.parse(await readFile(tokensFile, 'utf8')) as { lastGeneration: number };

      // Settling the unrelated handle writes the file. That write may NOT land
      // the recovered record as the credential: a blank accessToken in `token`
      // reads as an empty store — connected:false,
      // CFW_OAUTH_RECONNECT_REQUIRED — over a file that still names a live
      // grant, stamped at a generation the record's own value can never match,
      // so the refresh compare-and-set is dead for good.
      await dropPendingCloudflareOAuthRevokes(tokens, ['ref-real']);
      const after = JSON.parse(await readFile(tokensFile, 'utf8')) as {
        lastGeneration: number;
        token?: { accessToken?: string };
        pendingRevokes?: Array<{ refreshToken?: string; accessToken?: string }>;
      };
      expect(await getCloudflareOAuthToken(tokens)).toBeNull();
      expect(after.token).toBeUndefined();
      // Landing no credential moves no generation.
      expect(after.lastGeneration).toBe(before.lastGeneration);
      // The grant is not forgotten either: it stays NAMED, so the next settle
      // revokes it instead of leaving it live at Cloudflare forever.
      expect(after.pendingRevokes?.map((handle) => handle.refreshToken)).toEqual(['ref-blank']);

      // The next settle names the recovered grant and clears the file.
      await dropPendingCloudflareOAuthRevokes(tokens, ['ref-blank']);
      expect(await getPendingCloudflareOAuthRevokes(tokens)).toEqual([]);
      expect(await getCloudflareOAuthToken(tokens)).toBeNull();
    });
  });

  it('a transition that lands settles the handle its own clear recorded, and settles it once', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await commitCloudflareOAuthMode();

      const revokes: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        revokes.push(String(init?.body ?? ''));
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }));
      await writeCloudflareWorkersConfig({ credentialMode: 'token' });
      expect(revokes).toHaveLength(1);
      expect(revokes[0]).toContain('token=ref-1');
      // The handle the clear recorded in the same write as the clear itself is
      // retired by the revoke it was recorded for — never left for a later
      // mutation to repeat.
      expect(await getPendingCloudflareOAuthRevokes(cloudflareOAuthTokensDir())).toEqual([]);
      expect(await getCloudflareOAuthToken(cloudflareOAuthTokensDir())).toBeNull();
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');
    });
  });

  it('a revoke answer that is not a 2xx keeps its handle; only a 2xx retires it', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        generation: 1,
        savedAt: Date.now(),
      });
      await clearCloudflareOAuthTokenForRevoke(cloudflareOAuthTokensDir());

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      let answer = 503;
      let revokeCalls = 0;
      vi.stubGlobal('fetch', vi.fn(async () => {
        revokeCalls += 1;
        return new Response(null, { status: answer });
      }));

      // A 503/429 is the endpoint failing, and a 400 is Cloudflare declining to
      // revoke a token it does not recognize — which includes one that is still
      // live. Neither is an answer that the grant is dead, so neither may retire
      // the only record that still names it: that is exactly how a transient
      // 503 leaked a refresh token nobody could find again.
      for (const status of [503, 429, 400]) {
        answer = status;
        await resetCloudflareCredentialMode();
        expect(await getPendingCloudflareOAuthRevokes(cloudflareOAuthTokensDir())).toHaveLength(1);
      }
      expect(revokeCalls).toBe(3);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('refused by Cloudflare (HTTP 400)'));

      answer = 200;
      await resetCloudflareCredentialMode();
      expect(revokeCalls).toBe(4);
      expect(await getPendingCloudflareOAuthRevokes(cloudflareOAuthTokensDir())).toEqual([]);
      // Retired by the revoke it was recorded for, so nothing repeats it.
      await resetCloudflareCredentialMode();
      expect(revokeCalls).toBe(4);
    });
  });

  it('the oauth mode commit refuses an attempt whose marker is gone, even with a credential in the store', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      const attemptId = await markCloudflareOAuthGrantPending();
      // The connect's guarded token write lands AFTER something took the
      // credential away and dropped the marker — the shape of the window the
      // config lock cannot close, because that write runs outside it. A store
      // holding a credential again is not this attempt's authority to record:
      // the marker id is what says whether the intent still stands.
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        generation: 1,
        savedAt: Date.now(),
      });
      await clearPendingCloudflareOAuthGrant();
      expect(await getCloudflareOAuthToken(cloudflareOAuthTokensDir())).not.toBeNull();

      await expect(commitCloudflareOAuthMode({ clientId: 'client-abc', redirectUri: 'http://127.0.0.1:1/cb' }, attemptId))
        .rejects.toMatchObject({ status: 400, code: 'CFW_OAUTH_RECONNECT_REQUIRED' });

      const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
      // Neither the mode nor the identity reached the file: the authority the
      // save chose stands.
      expect(persisted.credentialMode).toBe('token');
      expect(persisted.clientId).not.toBe('client-abc');
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');
    });
  });

  it('a settings save that is not a transition carries the pending marker forward, so its connect can still commit', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      const attemptId = await markCloudflareOAuthGrantPending();
      const afterMark = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
      expect(afterMark.pendingOAuthGrant).toBe(attemptId);

      // The user edits their settings while the connect is still storing its
      // grant. The record a PUT writes REPLACES the one on disk, so the marker
      // has to ride along: erasing it would make the connect's commit read as
      // abandoned and refuse a connect that is still perfectly alive, over
      // nothing more than the user renaming their script.
      await writeCloudflareWorkersConfig({ accountId: 'acct_test', scriptName: 'renamed' });
      const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
      expect(persisted.pendingOAuthGrant).toBe(attemptId);
      expect(persisted.scriptName).toBe('renamed');

      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        generation: 1,
        savedAt: Date.now(),
      });
      await commitCloudflareOAuthMode({ clientId: 'client-abc', redirectUri: 'http://127.0.0.1:1/cb' }, attemptId);
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('oauth');
    });
  });

  it('a commit carrying an older attempt id refuses once a newer connect re-marked the config', async () => {
    await withDataDir(async () => {
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      const first = await markCloudflareOAuthGrantPending();
      const second = await markCloudflareOAuthGrantPending();
      expect(second).not.toBe(first);
      await setCloudflareOAuthToken(cloudflareOAuthTokensDir(), {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        generation: 1,
        savedAt: Date.now(),
      });

      // The newer attempt's token write and commit are the authority now, so the
      // older one must not land its own mode over the credential it no longer
      // owns — nor may it take the marker with it.
      await expect(commitCloudflareOAuthMode(undefined, first))
        .rejects.toMatchObject({ status: 400, code: 'CFW_OAUTH_RECONNECT_REQUIRED' });
      const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
      expect(persisted.pendingOAuthGrant).toBe(second);

      await commitCloudflareOAuthMode({ clientId: 'client-abc', redirectUri: 'http://127.0.0.1:1/cb' }, second);
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('oauth');
    });
  });
});


// The store's writers, from the one direction that is NOT a credential
// transition: a write that retires a revoke handle, and the rollback that puts a
// credential back. Neither may leave a credential and a handle describing
// different states of the world.
describe('credential writes that are not credential transitions', () => {
  it('a settle that only retires a revoke handle leaves the generation a refresh in flight already read', async () => {
    await withDataDir(async () => {
      const tokens = cloudflareOAuthTokensDir();
      const credential = (access: string, refresh: string) => ({
        accessToken: access,
        refreshToken: refresh,
        tokenType: 'Bearer',
        generation: 1,
        savedAt: Date.now(),
      });
      await setCloudflareOAuthToken(tokens, credential('access-1', 'ref-1'));
      // A transition takes one grant off disk and records it as a handle …
      await clearCloudflareOAuthTokenForRevoke(tokens);
      // … and a reconnect stores a new credential beside that handle.
      await setCloudflareOAuthToken(tokens, credential('access-2', 'ref-2'));

      // A refresh reads the generation BEFORE it calls the token endpoint; the
      // settle below is the write that lands while it is waiting on the answer.
      const readBeforeTheRoundTrip = (await getCloudflareOAuthToken(tokens))!.generation;
      const before = await getCloudflareOAuthToken(tokens);
      await dropPendingCloudflareOAuthRevokes(tokens, ['ref-1']);
      expect(await getPendingCloudflareOAuthRevokes(tokens)).toEqual([]);

      // The credential this settle carried back is byte-identical: retiring a
      // handle replaces no credential, so re-stamping the record at a new
      // generation is what made a mid-flight refresh read itself as superseded,
      // revoke the grant it had just minted, and report
      // CFW_OAUTH_RECONNECT_REQUIRED over a credential nobody had replaced.
      const stored = await getCloudflareOAuthToken(tokens);
      expect(stored).toEqual(before);
      expect(stored!.generation).toBe(readBeforeTheRoundTrip);
      const landed = await setCloudflareOAuthTokenIfGenerationMatches(
        tokens,
        credential('access-3', 'ref-3'),
        readBeforeTheRoundTrip,
      );
      expect(landed).toBe(true);
      expect((await getCloudflareOAuthToken(tokens))?.accessToken).toBe('access-3');
    });
  });

  it('the rollback restores the grant and drops its revoke handle in ONE write', async () => {
    await withDataDir(async (dir) => {
      const tokens = cloudflareOAuthTokensDir();
      const tokensFile = path.join(tokens, 'cloudflare-oauth-tokens.json');
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(tokens, {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await commitCloudflareOAuthMode();
      const before = (JSON.parse(await readFile(tokensFile, 'utf8')) as { lastGeneration: number }).lastGeneration;

      // The same fault the rollback tests above inject: only the REPLACEMENT
      // config write fails, so the transition clears the credential and then has
      // to put it back.
      const probe = await open(path.join(dir, 'probe-rollback-one-write'), 'w');
      const proto = Object.getPrototypeOf(probe) as { writeFile: (data: unknown, enc?: string) => Promise<void> };
      await probe.close();
      const realWrite = proto.writeFile;
      vi.spyOn(proto, 'writeFile').mockImplementation(async function (this: unknown, data: unknown, enc?: string) {
        if (typeof data === 'string' && data.includes('"credentialMode": "token"')) {
          throw new Error('EACCES: permission denied');
        }
        return realWrite.call(this, data, enc);
      });

      await expect(writeCloudflareWorkersConfig({ credentialMode: 'token' })).rejects.toThrow('EACCES');
      // Two bumps: the clear that took the grant off disk, and the single write
      // that puts it back and retires the handle together. A rollback split
      // across two writes moved the counter twice, and a crash — or a drop that
      // failed and was swallowed — between them left a live credential on disk
      // that a pending handle still named.
      const after = JSON.parse(await readFile(tokensFile, 'utf8')) as { lastGeneration: number };
      expect(after.lastGeneration).toBe(before + 2);
      const restored = await getCloudflareOAuthToken(tokens);
      expect(restored).toMatchObject({ accessToken: 'oauth-access', refreshToken: 'ref-1', clientId: 'client-abc' });
      // … and in step with the file, the way every writer leaves them.
      expect(restored!.generation).toBe(after.lastGeneration);
      expect(await getPendingCloudflareOAuthRevokes(tokens)).toEqual([]);
    });
  });

  it('a rollback whose restore write fails leaves the pair all-or-nothing', async () => {
    await withDataDir(async (dir) => {
      const tokens = cloudflareOAuthTokensDir();
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(tokens, {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await commitCloudflareOAuthMode();

      let replacementFailed = false;
      let tokenStoreWrites = 0;
      const probe = await open(path.join(dir, 'probe-rollback-second-write'), 'w');
      const proto = Object.getPrototypeOf(probe) as { writeFile: (data: unknown, enc?: string) => Promise<void> };
      await probe.close();
      const realWrite = proto.writeFile;
      vi.spyOn(proto, 'writeFile').mockImplementation(async function (this: unknown, data: unknown, enc?: string) {
        const text = typeof data === 'string' ? data : '';
        if (text.includes('"credentialMode": "token"')) {
          replacementFailed = true;
          throw new Error('EACCES: permission denied');
        }
        if (replacementFailed && text.includes('"lastGeneration"')) {
          tokenStoreWrites += 1;
          // The SECOND half of the rollback's pair is the one that fails — which
          // is exactly the write a two-statement restore/drop split needed, and
          // the one whose loss used to be swallowed.
          if (tokenStoreWrites === 2) throw new Error('EIO: I/O error');
        }
        return realWrite.call(this, data, enc);
      });

      await expect(writeCloudflareWorkersConfig({ credentialMode: 'token' })).rejects.toThrow('EACCES');
      void warnSpy;
      const restored = await getCloudflareOAuthToken(tokens);
      const handles = await getPendingCloudflareOAuthRevokes(tokens);
      // The invariant: a credential on disk is never one a pending handle names.
      if (restored) {
        expect(handles.map((handle) => handle.refreshToken || handle.accessToken)).not.toContain(
          restored.refreshToken || restored.accessToken,
        );
      }
      // One write means the pair cannot half-land: the rollback completed, so the
      // grant is back with nothing naming it.
      expect(restored).toMatchObject({ accessToken: 'oauth-access', refreshToken: 'ref-1' });
      expect(handles).toEqual([]);
    });
  });

  it('a rollback handed a record with no access token lands nothing and keeps its grant named', async () => {
    await withDataDir(async () => {
      const tokens = cloudflareOAuthTokensDir();
      const tokensFile = path.join(tokens, 'cloudflare-oauth-tokens.json');
      await setCloudflareOAuthToken(tokens, {
        accessToken: 'access-1',
        refreshToken: 'ref-real',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        generation: 1,
        savedAt: Date.now(),
      });
      // A transition takes the grant off disk as a revoke handle …
      await clearCloudflareOAuthTokenForRevoke(tokens);
      // … and the guarded write that follows reports a record whose accessToken
      // no longer sanitizes. That is the shape a rollback is handed — never a
      // credential a reader could serve.
      const unservable = {
        accessToken: '',
        refreshToken: 'ref-blank',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        generation: 1,
        savedAt: Date.now(),
      };
      await setCloudflareOAuthToken(tokens, { ...unservable });
      expect(await getCloudflareOAuthToken(tokens)).toBeNull();
      const before = JSON.parse(await readFile(tokensFile, 'utf8')) as { lastGeneration: number };

      await restoreCloudflareOAuthTokenAndDropRevokes(tokens, { ...unservable });

      const after = JSON.parse(await readFile(tokensFile, 'utf8')) as {
        lastGeneration: number;
        token?: { accessToken?: string };
        pendingRevokes?: Array<{ refreshToken?: string; accessToken?: string }>;
      };
      // Nothing landed: a blank accessToken in `token` reads as an empty store
      // — connected:false, CFW_OAUTH_RECONNECT_REQUIRED — over a file that
      // names a live grant, and the generation it would be stamped at can never
      // match the record's own, so the refresh compare-and-set is dead for good.
      expect(after.token).toBeUndefined();
      expect(await getCloudflareOAuthToken(tokens)).toBeNull();
      // Landing no credential moves no generation.
      expect(after.lastGeneration).toBe(before.lastGeneration);
      // The grant is not dropped along with the handle this write was going to
      // retire: it is NAMED, and the grant the earlier transition displaced stays
      // named beside it, so the next settle revokes both instead of leaking them.
      expect(after.pendingRevokes?.map((handle) => handle.refreshToken ?? handle.accessToken)).toEqual([
        'ref-blank',
        'ref-real',
      ]);
    });
  });
});

// Every settle runs under the Workers-config mutation lock. A settle that ran
// AHEAD of the lock read the store while a transition inside the lock was
// between its clear and its rollback: the grant was off disk and named by the
// handle the clear recorded, so the settle revoked it — and then the rollback
// put a grant Cloudflare had just killed back as the live credential.
describe('settles run under the config mutation lock', () => {
  it('a mutation that queues behind a failing transition cannot revoke the grant that transition rolls back', async () => {
    await withDataDir(async (dir) => {
      const tokens = cloudflareOAuthTokensDir();
      await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test' });
      await setCloudflareOAuthToken(tokens, {
        accessToken: 'oauth-access',
        refreshToken: 'ref-1',
        tokenType: 'Bearer',
        clientId: 'client-abc',
        expiresAt: Date.now() + 3600_000,
        generation: 1,
        savedAt: Date.now(),
      });
      await commitCloudflareOAuthMode();

      const revokes: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('oauth2/revoke')) revokes.push(new URLSearchParams(String(init?.body ?? '')).get('token') ?? '');
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }));
      const probe = await open(path.join(dir, 'probe-settle-race'), 'w');
      const proto = Object.getPrototypeOf(probe) as { writeFile: (data: unknown, enc?: string) => Promise<void> };
      await probe.close();
      const realWrite = proto.writeFile;
      let concurrent = null as Promise<string> | null;
      vi.spyOn(proto, 'writeFile').mockImplementation(async function (this: unknown, data: unknown, enc?: string) {
        if (typeof data === 'string' && data.includes('"credentialMode": "token"')) {
          // The other request arrives exactly here: the grant is off disk and
          // named by its handle, the mode write is about to fail, and the
          // rollback has not put the grant back yet. A settle that did not wait
          // for the lock would read the handle now and revoke it.
          concurrent = markCloudflareOAuthGrantPending();
          await new Promise((resolve) => setTimeout(resolve, 50));
          throw new Error('EACCES: permission denied');
        }
        return realWrite.call(this, data, enc);
      });

      await expect(writeCloudflareWorkersConfig({ credentialMode: 'token' })).rejects.toThrow('EACCES');
      await expect(concurrent!).resolves.toEqual(expect.any(String));
      // The queued mutation settled AFTER the rollback, and found nothing owed:
      // the grant it would have revoked is the live credential again.
      expect(revokes).toEqual([]);
      expect(await getCloudflareOAuthToken(tokens)).toMatchObject({ accessToken: 'oauth-access', refreshToken: 'ref-1' });
      expect(await getPendingCloudflareOAuthRevokes(tokens)).toEqual([]);
      const persisted = JSON.parse(await readFile(deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID), 'utf8')) as Record<string, unknown>;
      expect(persisted.credentialMode).toBe('oauth');
      expect(persisted.pendingOAuthGrant).toEqual(expect.any(String));
      expect(persisted.pendingOAuthGrantClear).toBeUndefined();
    });
  });
});

// A settings PUT carrying credentialMode 'oauth' while pendingOAuthGrantClear is
// set used to carry the marker forward: the response said oauth, the persisted
// record read token mode (the marker decides every read), and the settings
// surface reported configured:true over a config no deploy would sign OAuth with.
describe('a save that chooses oauth over a half-finished exit from oauth', () => {
  async function seedInterruptedExit(): Promise<string> {
    const tokens = cloudflareOAuthTokensDir();
    await writeCloudflareWorkersConfig({ token: 'static-token', accountId: 'acct_test', clientId: 'client-abc' });
    await setCloudflareOAuthToken(tokens, {
      accessToken: 'oauth-access',
      refreshToken: 'ref-1',
      tokenType: 'Bearer',
      clientId: 'client-abc',
      expiresAt: Date.now() + 3600_000,
      generation: 1,
      savedAt: Date.now(),
    });
    await commitCloudflareOAuthMode();
    // A token-mode save crashed between its intent write and its clear: the
    // marker is durable, and every read answers token mode.
    const file = deployConfigPath(CLOUDFLARE_WORKERS_PROVIDER_ID);
    const onDisk = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    await writeFile(file, JSON.stringify({ ...onDisk, pendingOAuthGrantClear: true }, null, 2), 'utf8');
    expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');
    return file;
  }

  it('drops pendingOAuthGrantClear, so the persisted config reads the mode the response reports', async () => {
    await withDataDir(async () => {
      const file = await seedInterruptedExit();
      const response = await writeCloudflareWorkersConfig({ credentialMode: 'oauth' });
      expect(response).toMatchObject({ credentialMode: 'oauth', configured: true });
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('oauth');
      const persisted = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
      expect(persisted.credentialMode).toBe('oauth');
      expect(persisted.pendingOAuthGrantClear).toBeUndefined();
      // The grant the interrupted exit was going to take off disk is the
      // authority this save named; nothing revokes it.
      expect(await getCloudflareOAuthToken(cloudflareOAuthTokensDir())).toMatchObject({ refreshToken: 'ref-1' });
    });
  });

  it('still refuses, marker intact, once the exit has taken the grant off disk', async () => {
    await withDataDir(async () => {
      const file = await seedInterruptedExit();
      // The exit got as far as its clear: the store holds only the handle, and
      // Cloudflare is not answering the settle.
      await clearCloudflareOAuthTokenForRevoke(cloudflareOAuthTokensDir());
      vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
      await expect(writeCloudflareWorkersConfig({ credentialMode: 'oauth' })).rejects.toMatchObject({
        status: 400,
        code: 'CFW_OAUTH_RECONNECT_REQUIRED',
      });
      const persisted = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
      expect(persisted.pendingOAuthGrantClear).toBe(true);
      expect((await readCloudflareWorkersConfig()).credentialMode).toBe('token');
      expect((await getPendingCloudflareOAuthRevokes(cloudflareOAuthTokensDir())).map((handle) => handle.refreshToken)).toEqual(['ref-1']);
    });
  });
});
