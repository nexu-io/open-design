// OrcaRouter credentials: the two adapters and the shared credential seam.
//
// The behavioural claim these tests defend is that a pasted API key and a PKCE
// login are two doors into ONE credential. Downstream code reads
// `credentialApiKey` and cannot tell which door was used, so a regression that
// makes one path behave differently from the other shows up here rather than in
// production as "works when I paste a key, breaks when I sign in".

import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `rename` is replaced by a passthrough that runs a test-supplied hook first.
// The permission guarantee this file asserts is about the window BETWEEN the
// secret's bytes reaching disk and the rename that publishes it, and no test
// can observe that window from outside the module — the hook is how the
// assertion lands inside it.
const renameHook = vi.hoisted(() => ({ impl: null as null | ((from: string, to: string) => Promise<void>) }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      if (renameHook.impl) await renameHook.impl(from, to);
      return actual.rename(from, to);
    },
  };
});

import {
  ORCAROUTER_SCOPE_API,
  OrcaRouterAttemptSupersededError,
  OrcaRouterAuthAttempts,
  OrcaRouterScopeDowngradeError,
  acquireApiKeyCredential,
  acquirePkceCredential,
  cleanOrcaRouterKey,
  clearOrcaRouterCredential,
  credentialApiKey,
  isCredentialUsable,
  isTerminalAuthFailure,
  looksLikeOrcaRouterKey,
  markOrcaRouterCredentialNeedsReauth,
  markCredentialNeedsReauth,
  nextCredentialGeneration,
  readOrcaRouterCredential,
  resolveOrcaRouterCredential,
  resolveOrcaRouterDataDir,
  sanitizeCredentialsFile,
  setOrcaRouterCredential,
  type OrcaRouterCredential,
} from '../src/integrations/orcarouter-credentials.js';
import { resolveDataDir } from '../src/daemon-paths.js';

// Never a real key. The `sk-orca-` prefix here exists only so the shape checks
// have something to match.
const FAKE_KEY = 'sk-orca-testnotarealkey000000000000000000000';
const FAKE_KEY_2 = 'sk-orca-testnotarealkey111111111111111111111';

describe('OrcaRouter credential adapters', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'orca-cred-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  describe('API-key adapter', () => {
    it('adopts a pasted key and produces the shared credential shape', () => {
      const credential = acquireApiKeyCredential({ apiKey: FAKE_KEY, now: 1_000 });
      expect(credential.source).toBe('api-key');
      expect(credential.apiKey).toBe(FAKE_KEY);
      expect(credential.authState).toBe('active');
      expect(credential.generation).toBe(1);
      expect(credential.savedAt).toBe(1_000);
      expect(isCredentialUsable(credential)).toBe(true);
      expect(credentialApiKey(credential)).toBe(FAKE_KEY);
    });

    it('strips paste noise that would otherwise reach the relay malformed', () => {
      // A key copied out of a web console often carries a trailing newline or a
      // zero-width joiner from the "copy" button.
      const credential = acquireApiKeyCredential({ apiKey: `  ${FAKE_KEY}\n​` });
      expect(credential.apiKey).toBe(FAKE_KEY);
      expect(cleanOrcaRouterKey(`﻿${FAKE_KEY} `)).toBe(FAKE_KEY);
    });

    it('rejects an empty key rather than storing a blank credential', () => {
      expect(() => acquireApiKeyCredential({ apiKey: '   ' })).toThrow(/empty/i);
    });

    it('is a shape check only — a wrong prefix is reported, not treated as invalid', () => {
      expect(looksLikeOrcaRouterKey(FAKE_KEY)).toBe(true);
      expect(looksLikeOrcaRouterKey('sk-something-else')).toBe(false);
    });

    it('advances the generation so a previous in-flight request is superseded', () => {
      const first = acquireApiKeyCredential({ apiKey: FAKE_KEY });
      const second = acquireApiKeyCredential({ apiKey: FAKE_KEY_2, previous: first });
      expect(second.generation).toBe(first.generation + 1);
      expect(second.generation).toBe(nextCredentialGeneration(first));
    });
  });

  describe('PKCE adapter', () => {
    it('produces the SAME credential shape as the API-key adapter', () => {
      const viaKey = acquireApiKeyCredential({ apiKey: FAKE_KEY, now: 5 });
      const viaPkce = acquirePkceCredential({
        exchange: { key: FAKE_KEY, user_id: '4242', scope: ORCAROUTER_SCOPE_API },
        now: 5,
      });
      // Downstream reads exactly these two things; everything else is bookkeeping.
      expect(credentialApiKey(viaPkce)).toBe(credentialApiKey(viaKey));
      expect(viaPkce.authState).toBe(viaKey.authState);
      expect(viaPkce.accountId).toBe('4242');
      expect(viaPkce.source).toBe('pkce');
      expect(viaPkce.scope).toBe(ORCAROUTER_SCOPE_API);
    });

    it('stores what was GRANTED, and accepts a wider grant', () => {
      const credential = acquirePkceCredential({
        exchange: { key: FAKE_KEY, user_id: '1', scope: 'api connector' },
      });
      expect(credential.scope).toBe('api connector');
      expect(isCredentialUsable(credential)).toBe(true);
    });

    it('fails loudly when the granted scope does not include api', () => {
      expect(() => acquirePkceCredential({
        exchange: { key: FAKE_KEY, user_id: '1', scope: 'connector' },
      })).toThrow(OrcaRouterScopeDowngradeError);
      // The message must explain the workspace-role cause, not just the code.
      try {
        acquirePkceCredential({ exchange: { key: FAKE_KEY, scope: '' } });
        throw new Error('expected a scope rejection');
      } catch (err) {
        expect(err).toBeInstanceOf(OrcaRouterScopeDowngradeError);
        expect((err as Error).message).toMatch(/workspace role/i);
      }
    });

    it('rejects a response with no key instead of storing an empty credential', () => {
      expect(() => acquirePkceCredential({
        exchange: { key: '', scope: ORCAROUTER_SCOPE_API },
      })).toThrow(/did not include a key/i);
    });

    it('never records a refresh token — an OrcaRouter grant is durable, not refreshable', () => {
      const credential = acquirePkceCredential({
        exchange: { key: FAKE_KEY, user_id: '1', scope: ORCAROUTER_SCOPE_API },
      });
      expect(Object.keys(credential)).not.toContain('refreshToken');
      expect(JSON.stringify(credential)).not.toMatch(/refresh/i);
    });
  });

  describe('storage', () => {
    it('round-trips a credential and locks the file down to the owner', async () => {
      const credential = acquireApiKeyCredential({ apiKey: FAKE_KEY });
      await setOrcaRouterCredential(dataDir, credential);

      const readBack = await readOrcaRouterCredential(dataDir);
      expect(readBack?.apiKey).toBe(FAKE_KEY);
      expect(readBack?.generation).toBe(credential.generation);

      const mode = (await stat(path.join(dataDir, 'orcarouter-credentials.json'))).mode & 0o777;
      // Best-effort on some filesystems, but on POSIX it must be owner-only.
      if (process.platform !== 'win32') expect(mode).toBe(0o600);
    });

    it('returns null when nothing is stored', async () => {
      expect(await readOrcaRouterCredential(dataDir)).toBeNull();
    });

    it('clears the credential, and leaving nothing behind is not an error', async () => {
      await setOrcaRouterCredential(dataDir, acquireApiKeyCredential({ apiKey: FAKE_KEY }));
      await clearOrcaRouterCredential(dataDir);
      expect(await readOrcaRouterCredential(dataDir)).toBeNull();
      await clearOrcaRouterCredential(dataDir);
    });

    it('survives a corrupted file by treating it as absent, not by crashing', async () => {
      await writeFile(path.join(dataDir, 'orcarouter-credentials.json'), '{not json', 'utf8');
      expect(await readOrcaRouterCredential(dataDir)).toBeNull();
    });

    it('drops malformed records instead of surfacing a half-credential', () => {
      expect(sanitizeCredentialsFile(null)).toEqual({});
      expect(sanitizeCredentialsFile({ credential: { apiKey: '' } })).toEqual({});
      expect(sanitizeCredentialsFile({ credential: { apiKey: 'x', source: 'nope' } }))
        .toEqual({ credential: { apiKey: 'x', source: 'api-key', accountId: 'orcarouter', generation: 1, authState: 'active', savedAt: expect.any(Number) } });
    });

    it('persists a needsReauth marker without deleting the key', async () => {
      const credential = acquirePkceCredential({
        exchange: { key: FAKE_KEY, user_id: 'acct-7', scope: ORCAROUTER_SCOPE_API },
      });
      await setOrcaRouterCredential(dataDir, credential);

      const changed = await markOrcaRouterCredentialNeedsReauth(dataDir, {
        accountId: 'acct-7',
        generation: credential.generation,
      });
      expect(changed).toBe(true);

      const after = await readOrcaRouterCredential(dataDir);
      expect(after?.authState).toBe('needsReauth');
      // The key is still on disk: a misclassified failure must not destroy the
      // only copy of a working credential.
      expect(after?.apiKey).toBe(FAKE_KEY);
      expect(isCredentialUsable(after)).toBe(false);
    });
  });

  describe('terminal 401 handling', () => {
    it('treats only 401 as a revoked credential', () => {
      expect(isTerminalAuthFailure(401)).toBe(true);
      expect(isTerminalAuthFailure(403)).toBe(false);
      expect(isTerminalAuthFailure(429)).toBe(false);
      expect(isTerminalAuthFailure(500)).toBe(false);
    });

    it('marks the exact account and generation that was rejected', () => {
      const credential: OrcaRouterCredential = {
        apiKey: FAKE_KEY, source: 'pkce', accountId: 'acct-1',
        generation: 3, authState: 'active', savedAt: 0,
      };
      const { credential: marked, changed } = markCredentialNeedsReauth(credential, {
        accountId: 'acct-1', generation: 3, reason: 'revoked',
      });
      expect(changed).toBe(true);
      expect(marked?.authState).toBe('needsReauth');
      expect(marked?.reauthReason).toBe('revoked');
      expect(marked?.apiKey).toBe(FAKE_KEY);
    });

    it('ignores a late 401 from a superseded generation', () => {
      // The user reconnected; a request issued before that must not be able to
      // mark the NEW credential broken.
      const reconnected: OrcaRouterCredential = {
        apiKey: FAKE_KEY_2, source: 'pkce', accountId: 'acct-1',
        generation: 4, authState: 'active', savedAt: 0,
      };
      const { credential: after, changed } = markCredentialNeedsReauth(reconnected, {
        accountId: 'acct-1', generation: 3, reason: 'revoked',
      });
      expect(changed).toBe(false);
      expect(after).toBe(reconnected);
      expect(after?.authState).toBe('active');
    });

    it('ignores a 401 aimed at a different account', () => {
      const current: OrcaRouterCredential = {
        apiKey: FAKE_KEY, source: 'api-key', accountId: 'acct-A',
        generation: 1, authState: 'active', savedAt: 0,
      };
      const { changed } = markCredentialNeedsReauth(current, {
        accountId: 'acct-B', generation: 1,
      });
      expect(changed).toBe(false);
    });

    it('never attempts a refresh: the same key stays on disk after a 401', async () => {
      const credential = acquirePkceCredential({
        exchange: { key: FAKE_KEY, user_id: 'acct-9', scope: ORCAROUTER_SCOPE_API },
      });
      const before = credential.generation;
      await setOrcaRouterCredential(dataDir, credential);
      await markOrcaRouterCredentialNeedsReauth(dataDir, {
        accountId: 'acct-9', generation: credential.generation,
      });
      const after = await readOrcaRouterCredential(dataDir);
      // Same key, same generation — nothing rotated, nothing refreshed.
      expect(after?.apiKey).toBe(FAKE_KEY);
      expect(after?.generation).toBe(before);
    });
  });

  describe('secrecy', () => {
    it('never puts the key in a thrown error message', () => {
      const attempts = [
        () => acquireApiKeyCredential({ apiKey: '   ' }),
        () => acquirePkceCredential({ exchange: { key: '', scope: 'api' } }),
        () => acquirePkceCredential({ exchange: { key: FAKE_KEY, scope: 'connector' } }),
      ];
      for (const attempt of attempts) {
        try {
          attempt();
        } catch (err) {
          expect((err as Error).message).not.toContain(FAKE_KEY);
        }
      }
    });

    it('keeps the key out of the serialized bookkeeping fields it does not need', () => {
      const credential = acquirePkceCredential({
        exchange: { key: FAKE_KEY, user_id: 'u1', scope: ORCAROUTER_SCOPE_API },
      });
      const { apiKey, ...rest } = credential;
      expect(JSON.stringify(rest)).not.toContain(FAKE_KEY);
    });

    it('stores only the credential it was given, with no verifier-shaped fields', async () => {
      const credential = acquirePkceCredential({
        exchange: { key: FAKE_KEY, user_id: 'u1', scope: ORCAROUTER_SCOPE_API },
      });
      await setOrcaRouterCredential(dataDir, credential);
      const raw = await readFile(path.join(dataDir, 'orcarouter-credentials.json'), 'utf8');
      expect(raw).not.toMatch(/verifier|code_challenge|challenge/i);
    });

    it('creates the temporary credential file owner-only, before it is renamed', async () => {
      // The interval that matters is between "bytes hit disk" and "chmod runs".
      // The hook lands the assertion inside it: with writeFile's default
      // 0666 & ~umask the temp file would be group/world readable here.
      const modes: number[] = [];
      renameHook.impl = async (from) => {
        modes.push((await stat(from)).mode & 0o777);
      };
      try {
        await setOrcaRouterCredential(dataDir, acquireApiKeyCredential({ apiKey: FAKE_KEY }));
      } finally {
        renameHook.impl = null;
      }

      expect(modes).toHaveLength(1);
      if (process.platform !== 'win32') expect(modes[0]).toBe(0o600);
    });

    it('leaves no temporary file behind when the rename fails', async () => {
      renameHook.impl = async () => {
        throw new Error('EXDEV: cross-device link not permitted');
      };
      try {
        await expect(
          setOrcaRouterCredential(dataDir, acquireApiKeyCredential({ apiKey: FAKE_KEY })),
        ).rejects.toThrow(/EXDEV/);
      } finally {
        renameHook.impl = null;
      }

      const leftovers = (await readdir(dataDir)).filter((name) => name.endsWith('.tmp'));
      expect(leftovers).toEqual([]);
      // The secret must not survive as an orphaned temp file either.
      expect(await readOrcaRouterCredential(dataDir)).toBeNull();
    });
  });

  describe('resolver', () => {
    const clearOrcaEnv = () => {
      for (const name of ['ORCA_API_KEY', 'OD_ORCAROUTER_API_KEY', 'ORCAROUTER_API_KEY']) {
        delete process.env[name];
      }
    };

    it('reads the credential the connect flow stored, not just the provider map', async () => {
      clearOrcaEnv();
      await setOrcaRouterCredential(
        dataDir,
        acquirePkceCredential({
          exchange: { key: FAKE_KEY, user_id: 'acct-1', scope: ORCAROUTER_SCOPE_API },
        }),
      );

      const resolved = await resolveOrcaRouterCredential(dataDir);
      // This is the blocking bug in one assertion: before the fix the resolver
      // never looked in this file, so a PKCE account reported Connected and
      // loaded models while every inference request went out unauthenticated.
      expect(resolved.apiKey).toBe(FAKE_KEY);
      expect(resolved.source).toBe('oauth-orcarouter-pkce');
      expect(resolved.authState).toBe('active');
    });

    it('lets the environment win over the stored credential', async () => {
      process.env.ORCA_API_KEY = 'sk-orca-from-the-environment';
      try {
        await setOrcaRouterCredential(dataDir, acquireApiKeyCredential({ apiKey: FAKE_KEY }));
        const resolved = await resolveOrcaRouterCredential(dataDir);
        expect(resolved.source).toBe('env');
        expect(resolved.apiKey).toBe('sk-orca-from-the-environment');
      } finally {
        clearOrcaEnv();
      }
    });

    it('returns no usable key — but keeps the record — while needsReauth', async () => {
      clearOrcaEnv();
      const credential = acquirePkceCredential({
        exchange: { key: FAKE_KEY, user_id: 'acct-2', scope: ORCAROUTER_SCOPE_API },
      });
      await setOrcaRouterCredential(dataDir, credential);
      await markOrcaRouterCredentialNeedsReauth(dataDir, {
        accountId: 'acct-2',
        generation: credential.generation,
        reason: 'revoked',
      });

      const resolved = await resolveOrcaRouterCredential(dataDir);
      // Terminal: no second request is issued with the rejected key.
      expect(resolved.apiKey).toBe('');
      expect(resolved.authState).toBe('needsReauth');
      expect(resolved.reauthReason).toBe('revoked');
      // The record survives so reconnecting can replace it.
      expect((await readOrcaRouterCredential(dataDir))?.apiKey).toBe(FAKE_KEY);
    });

    it('resolves an empty key when nothing is stored', async () => {
      clearOrcaEnv();
      const resolved = await resolveOrcaRouterCredential(dataDir);
      expect(resolved.apiKey).toBe('');
      expect(resolved.source).toBe('none');
    });

    it('derives its data root from OD_DATA_DIR, never from the media-config override', () => {
      // Two daemons sharing OD_MEDIA_CONFIG_DIR must not share one account.
      expect(resolveOrcaRouterDataDir('/workspace', { OD_DATA_DIR: '/srv/od-a' }))
        .toBe('/srv/od-a');
      expect(resolveOrcaRouterDataDir('/workspace', { OD_DATA_DIR: 'rel/od' }))
        .toBe('/workspace/rel/od');
      expect(resolveOrcaRouterDataDir('/workspace', {})).toBe('/workspace/.od');
    });

    it('resolves OD_DATA_DIR exactly as the daemon does, home shorthand included', () => {
      // The media resolver reaches this store through a project root, not
      // through RUNTIME_DATA_DIR, so its recomputation has to agree with
      // `resolveDataDir` for every accepted form — including the `~` / `$HOME`
      // launcher shorthand. A form only one of the two expands sends chat and
      // media to a different file than the connect flow wrote, which reads as
      // "connected" in the UI and "no credential" at generation time.
      const projectRoot = path.join(dataDir, 'project');
      const home = path.join(dataDir, 'home');
      const previousHome = process.env.HOME;
      process.env.HOME = home;
      try {
        for (const raw of [
          undefined,
          path.join(dataDir, 'od-abs'),
          'rel/od',
          '~/.open-design',
          '$HOME/.open-design',
          '${HOME}/.open-design',
        ]) {
          expect(resolveOrcaRouterDataDir(projectRoot, { OD_DATA_DIR: raw }))
            .toBe(resolveDataDir(raw, projectRoot));
        }
      } finally {
        if (previousHome === undefined) delete process.env.HOME;
        else process.env.HOME = previousHome;
      }
    });
  });

  describe('in-flight attempt fencing', () => {
    it('invalidates the attempt generation on every state change', () => {
      const attempts = new OrcaRouterAuthAttempts();
      const started = attempts.bump();
      expect(attempts.isCurrent(started)).toBe(true);
      attempts.bump();
      expect(attempts.isCurrent(started)).toBe(false);
    });

    it('refuses to commit an exchange whose attempt was superseded', () => {
      // Mirrors the route's fence: persistExchange captures the generation
      // before its await and re-checks it before writing.
      const attempts = new OrcaRouterAuthAttempts();
      const attempt = attempts.current();
      attempts.bump(); // a Cancel, Disconnect, or newer Start landed mid-exchange
      expect(attempts.isCurrent(attempt)).toBe(false);
      expect(() => {
        if (!attempts.isCurrent(attempt)) throw new OrcaRouterAttemptSupersededError();
      }).toThrow(OrcaRouterAttemptSupersededError);
    });

    it('rolls back a credential whose attempt ended while its bytes were being written', async () => {
      // The re-check before the write is not enough on its own: a Cancel that
      // lands *during* the write would still leave the abandoned credential on
      // disk. The commit has to re-read the fence once the bytes are down and
      // undo itself.
      const attempts = new OrcaRouterAuthAttempts();
      const attempt = attempts.current();
      let fired = false;
      renameHook.impl = async () => {
        if (fired) return; // the rollback's own rename must not re-trigger it
        fired = true;
        attempts.bump(); // the user abandoned the attempt mid-write
      };
      try {
        await expect(setOrcaRouterCredential(dataDir, acquireApiKeyCredential({ apiKey: FAKE_KEY }), {
          isCurrent: () => attempts.isCurrent(attempt),
        })).rejects.toThrow(OrcaRouterAttemptSupersededError);
      } finally {
        renameHook.impl = null;
      }
      expect(fired).toBe(true);
      // The abandoned credential is not on disk — and not merely overwritten
      // by a later write, which would race the undo.
      expect(await readOrcaRouterCredential(dataDir)).toBeNull();
    });

    it('still commits a credential whose attempt is intact', async () => {
      const attempts = new OrcaRouterAuthAttempts();
      const attempt = attempts.current();
      await setOrcaRouterCredential(dataDir, acquireApiKeyCredential({ apiKey: FAKE_KEY }), {
        isCurrent: () => attempts.isCurrent(attempt),
      });
      expect((await readOrcaRouterCredential(dataDir))?.apiKey).toBe(FAKE_KEY);
    });
  });
});
