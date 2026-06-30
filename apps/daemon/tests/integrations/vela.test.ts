/**
 * Coverage for `apps/daemon/src/integrations/vela.ts` — the read-side of
 * the AMR (vela) login integration. The spawn path is exercised by
 * `tests/amr-acp-integration.test.ts` (which uses the fake-vela stub); here
 * we focus on the status reader that drives the Settings UI.
 *
 * `~/.amr/config.json` is the source of truth — vela CLI writes it on
 * successful `vela login` and Open Design just surfaces a small projection.
 * Tests redirect HOME via env so we never touch the real user file.
 */

import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyVelaLiveAccount,
  clearAllVelaLiveAccounts,
  forgetVelaLogin,
  peekVelaLiveAccount,
  readVelaCredentialRevision,
  readVelaLoginStatus,
  resolveAmrProfile,
  setVelaLiveAccount,
  spawnVelaLogin,
  velaLiveAccountCacheKey,
  amrConfigPath,
  type VelaCredentialRevision,
  type VelaLoginStatus,
} from '../../src/integrations/vela.js';

let originalHome: string | undefined;
let tmpHome: string;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FAKE_VELA = path.resolve(HERE, '..', 'fixtures', 'fake-vela.mjs');

function writeConfig(payload: unknown): string {
  const dir = path.join(tmpHome, '.amr');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'config.json');
  writeFileSync(file, JSON.stringify(payload), 'utf8');
  return file;
}

function writeLegacyVelaConfig(payload: unknown): string {
  const dir = path.join(tmpHome, '.vela');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'config.json');
  writeFileSync(file, JSON.stringify(payload), 'utf8');
  return file;
}

beforeEach(() => {
  originalHome = process.env.HOME;
  tmpHome = mkdtempSync(path.join(tmpdir(), 'od-vela-test-'));
  process.env.HOME = tmpHome;
  delete process.env.OPEN_DESIGN_AMR_PROFILE;
  delete process.env.VELA_PROFILE;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe('resolveAmrProfile', () => {
  it('defaults to "prod" when OPEN_DESIGN_AMR_PROFILE is unset or empty', () => {
    expect(resolveAmrProfile({})).toBe('prod');
    expect(resolveAmrProfile({ OPEN_DESIGN_AMR_PROFILE: '   ' })).toBe('prod');
  });

  it('honors OPEN_DESIGN_AMR_PROFILE when set to a known profile', () => {
    expect(resolveAmrProfile({ OPEN_DESIGN_AMR_PROFILE: 'prod' })).toBe('prod');
    expect(resolveAmrProfile({ OPEN_DESIGN_AMR_PROFILE: 'local' })).toBe('local');
    expect(resolveAmrProfile({ OPEN_DESIGN_AMR_PROFILE: 'test' })).toBe('test');
  });

  it('ignores lower-priority VELA_PROFILE values', () => {
    expect(resolveAmrProfile({ VELA_PROFILE: 'local' })).toBe('prod');
    expect(
      resolveAmrProfile({
        OPEN_DESIGN_AMR_PROFILE: 'test',
        VELA_PROFILE: 'local',
      }),
    ).toBe('test');
  });

  it('warns for unknown OPEN_DESIGN_AMR_PROFILE values and falls back to prod', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveAmrProfile({ OPEN_DESIGN_AMR_PROFILE: 'evil' })).toBe('prod');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('OPEN_DESIGN_AMR_PROFILE'),
    );
    warn.mockRestore();
  });
});

describe('readVelaLoginStatus', () => {
  it('returns loggedIn=false when ~/.amr/config.json is absent', () => {
    const status = readVelaLoginStatus({ OPEN_DESIGN_AMR_PROFILE: 'local' });
    expect(status.loggedIn).toBe(false);
    expect(status.user).toBeNull();
    expect(status.profile).toBe('local');
    expect(status.configPath).toBe(amrConfigPath());
  });

  it('ignores legacy ~/.vela/config.json when ~/.amr/config.json is absent', () => {
    writeLegacyVelaConfig({
      profiles: {
        local: {
          runtimeKey: 'rt-legacy',
          user: { id: 'legacy-user', email: 'legacy@example.com' },
        },
      },
    });
    const status = readVelaLoginStatus({ OPEN_DESIGN_AMR_PROFILE: 'local' });
    expect(status.loggedIn).toBe(false);
    expect(status.user).toBeNull();
    expect(status.configPath).toBe(amrConfigPath());
  });

  it('treats configured AMR env credentials as logged in without an AMR config file', () => {
    const status = readVelaLoginStatus(
      { OPEN_DESIGN_AMR_PROFILE: 'local' },
      {
        VELA_RUNTIME_KEY: 'rt-env-secret',
        VELA_LINK_URL: 'https://openrouter.example/v1',
      },
    );
    expect(status.loggedIn).toBe(true);
    expect(status.user).toBeNull();
    expect(status.profile).toBe('local');
    expect(JSON.stringify(status)).not.toContain('rt-env-secret');
  });

  it('prefers configured AMR env credentials over an incomplete ~/.amr active profile', () => {
    writeConfig({
      profiles: {
        local: {
          apiUrl: 'http://localhost:18080',
          user: { id: 'stale-user', email: 'stale@example.com' },
        },
      },
    });
    const status = readVelaLoginStatus(
      { OPEN_DESIGN_AMR_PROFILE: 'local' },
      {
        VELA_RUNTIME_KEY: 'rt-env-secret',
        VELA_LINK_URL: 'https://openrouter.example/v1',
      },
    );
    expect(status.loggedIn).toBe(true);
    expect(status.profile).toBe('local');
    expect(status.user).toBeNull();
    expect(JSON.stringify(status)).not.toContain('rt-env-secret');
    expect(JSON.stringify(status)).not.toContain('stale@example.com');
  });

  it('uses the Settings-configured AMR profile when reading status', () => {
    writeConfig({
      profiles: {
        prod: {},
        local: { runtimeKey: 'rt-local', user: { id: 'u', email: 'local@example.com' } },
      },
    });
    const status = readVelaLoginStatus(
      { OPEN_DESIGN_AMR_PROFILE: 'prod' },
      { OPEN_DESIGN_AMR_PROFILE: 'local' },
    );
    expect(status.loggedIn).toBe(true);
    expect(status.profile).toBe('local');
    expect(status.user?.email).toBe('local@example.com');
  });

  it('treats daemon process AMR env credentials as logged in without an AMR config file', () => {
    const status = readVelaLoginStatus({
      OPEN_DESIGN_AMR_PROFILE: 'local',
      VELA_RUNTIME_KEY: 'rt-process-secret',
      VELA_LINK_URL: 'https://openrouter.example/v1',
    });
    expect(status.loggedIn).toBe(true);
    expect(status.user).toBeNull();
    expect(status.profile).toBe('local');
    expect(JSON.stringify(status)).not.toContain('rt-process-secret');
  });

  it('requires both env runtime key and link URL before reporting env-only login', () => {
    expect(
      readVelaLoginStatus(
        { OPEN_DESIGN_AMR_PROFILE: 'local' },
        { VELA_RUNTIME_KEY: 'rt-env-secret' },
      ).loggedIn,
    ).toBe(false);
    expect(
      readVelaLoginStatus(
        { OPEN_DESIGN_AMR_PROFILE: 'local' },
        { VELA_LINK_URL: 'https://openrouter.example/v1' },
      ).loggedIn,
    ).toBe(false);
  });

  it('returns loggedIn=true with user info when the active profile has a runtimeKey', () => {
    writeConfig({
      profiles: {
        local: {
          runtimeKey: 'rt-secret-abc',
          controlKey: 'ck-secret',
          apiUrl: 'http://localhost:18080',
          linkUrl: 'http://localhost:18081',
          user: {
            id: 'user_1',
            email: 'leaf@example.com',
            name: '杨瑾龙',
            image: 'https://example.com/avatar.png',
            plan: 'free',
          },
        },
      },
    });
    const status = readVelaLoginStatus({ OPEN_DESIGN_AMR_PROFILE: 'local' });
    expect(status.loggedIn).toBe(true);
    expect(status.profile).toBe('local');
    expect(status.user?.email).toBe('leaf@example.com');
    expect(status.user?.plan).toBe('free');
    // The secrets in the file are intentionally NOT surfaced through the
    // status projection — the UI never needs them and we don't want them
    // showing up in HTTP responses to the local web.
    expect(JSON.stringify(status)).not.toContain('rt-secret-abc');
    expect(JSON.stringify(status)).not.toContain('ck-secret');
  });

  it('returns loggedIn=false when the active profile is present but lacks runtimeKey', () => {
    writeConfig({
      profiles: {
        local: { apiUrl: 'http://localhost:18080', user: { id: 'u', email: 'e' } },
      },
    });
    const status = readVelaLoginStatus({ OPEN_DESIGN_AMR_PROFILE: 'local' });
    expect(status.loggedIn).toBe(false);
  });

  it('isolates profiles — a logged-in "local" does not imply logged-in "prod"', () => {
    writeConfig({
      profiles: {
        local: { runtimeKey: 'rt-local', user: { id: 'u', email: 'leaf@example.com' } },
      },
    });
    expect(readVelaLoginStatus({ OPEN_DESIGN_AMR_PROFILE: 'local' }).loggedIn).toBe(true);
    expect(readVelaLoginStatus({ OPEN_DESIGN_AMR_PROFILE: 'prod' }).loggedIn).toBe(false);
  });

  it('does not let VELA_PROFILE select the active status profile', () => {
    writeConfig({
      profiles: {
        local: { runtimeKey: 'rt-local', user: { id: 'u', email: 'leaf@example.com' } },
      },
    });
    expect(
      readVelaLoginStatus({
        OPEN_DESIGN_AMR_PROFILE: 'prod',
        VELA_PROFILE: 'local',
      }).loggedIn,
    ).toBe(false);
  });

  it('treats malformed JSON as logged-out rather than crashing', () => {
    const file = path.join(tmpHome, '.amr', 'config.json');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '{not json', 'utf8');
    expect(readVelaLoginStatus({ OPEN_DESIGN_AMR_PROFILE: 'local' }).loggedIn).toBe(false);
  });

  it('treats the local runtimeKey as the source of truth even when user fields are missing', () => {
    writeConfig({
      profiles: {
        local: {
          runtimeKey: 'rt-local',
          user: { email: 42, plan: ['pro'] },
        },
      },
    });
    const status = readVelaLoginStatus({ OPEN_DESIGN_AMR_PROFILE: 'local' });
    expect(status.loggedIn).toBe(true);
    expect(status.user?.id).toBe('');
    expect(status.user?.email).toBe('');
    expect(status.user?.plan).toBeUndefined();
  });
});

describe('readVelaCredentialRevision', () => {
  it('changes when file-backed logout clears the active profile credentials', async () => {
    writeConfig({
      profiles: {
        local: {
          runtimeKey: 'rt-local',
          user: { id: 'u-local', email: 'local@example.com' },
        },
      },
    });
    const before = readVelaCredentialRevision({ OPEN_DESIGN_AMR_PROFILE: 'local' });
    expect(before).toMatchObject({
      authSource: 'file',
      loggedIn: true,
      userId: 'u-local',
      userEmail: 'local@example.com',
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    forgetVelaLogin({ OPEN_DESIGN_AMR_PROFILE: 'local' });

    const after = readVelaCredentialRevision({ OPEN_DESIGN_AMR_PROFILE: 'local' });
    expect(after).toMatchObject({
      authSource: 'none',
      loggedIn: false,
      userId: '',
      userEmail: '',
    });
    expect(after.configMtimeMs).not.toBe(before.configMtimeMs);
  });
});

describe('forgetVelaLogin', () => {
  it('removes only the resolved profile credentials and preserves the rest of the config', () => {
    const file = writeConfig({
      version: 1,
      profiles: {
        local: {
          runtimeKey: 'rt',
          controlKey: 'ck',
          apiUrl: 'http://localhost:18080',
          linkUrl: 'http://localhost:18081',
          user: { id: 'u', email: 'e' },
        },
        prod: { runtimeKey: 'rt-prod', user: { id: 'p', email: 'prod@example.com' } },
      },
      otherTopLevel: true,
    });
    expect(readVelaLoginStatus({ OPEN_DESIGN_AMR_PROFILE: 'local' }).loggedIn).toBe(true);
    forgetVelaLogin({ OPEN_DESIGN_AMR_PROFILE: 'local' });
    expect(readVelaLoginStatus({ OPEN_DESIGN_AMR_PROFILE: 'local' }).loggedIn).toBe(false);
    expect(readVelaLoginStatus({ OPEN_DESIGN_AMR_PROFILE: 'prod' }).loggedIn).toBe(true);

    const next = JSON.parse(readFileSync(file, 'utf8'));
    expect(next.otherTopLevel).toBe(true);
    expect(next.profiles.local.runtimeKey).toBeUndefined();
    expect(next.profiles.local.controlKey).toBeUndefined();
    expect(next.profiles.local.user).toBeUndefined();
    expect(next.profiles.local.apiUrl).toBe('http://localhost:18080');
    expect(next.profiles.local.linkUrl).toBe('http://localhost:18081');
    expect(next.profiles.prod.runtimeKey).toBe('rt-prod');
  });

  it('is a no-op when the resolved profile does not exist', () => {
    const file = writeConfig({
      profiles: {
        prod: { runtimeKey: 'rt-prod', user: { id: 'p', email: 'prod@example.com' } },
      },
    });
    expect(() => forgetVelaLogin({ OPEN_DESIGN_AMR_PROFILE: 'local' })).not.toThrow();
    const next = JSON.parse(readFileSync(file, 'utf8'));
    expect(next.profiles.prod.runtimeKey).toBe('rt-prod');
  });

  it('is a no-op when the config file does not exist (idempotent)', () => {
    expect(() => forgetVelaLogin()).not.toThrow();
  });
});

describe('spawnVelaLogin', () => {
  it('returns an actionable error when no vela binary can be resolved', async () => {
    const originalPath = process.env.PATH;
    const originalResourceRoot = process.env.OD_RESOURCE_ROOT;
    try {
      process.env.PATH = '';
      delete process.env.OD_RESOURCE_ROOT;
      await expect(
        spawnVelaLogin({
          baseEnv: { ...process.env, HOME: tmpHome },
          configuredEnv: {},
        }),
      ).rejects.toThrow('vela binary not found');
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      if (originalResourceRoot === undefined) delete process.env.OD_RESOURCE_ROOT;
      else process.env.OD_RESOURCE_ROOT = originalResourceRoot;
    }
  });

  it('spawns the configured vela binary and writes only the resolved AMR profile', async () => {
    const result = await spawnVelaLogin({
      baseEnv: {
        ...process.env,
        HOME: tmpHome,
        OPEN_DESIGN_AMR_PROFILE: 'test',
        VELA_PROFILE: 'prod',
        FAKE_VELA_LOGIN_USER_EMAIL: 'spawn-login@example.com',
      },
      configuredEnv: {
        VELA_BIN: FAKE_VELA,
      },
    });

    expect(result.pid).toBeGreaterThan(0);
    expect(result.profile).toBe('test');

    const file = path.join(tmpHome, '.amr', 'config.json');
    for (let i = 0; i < 20; i += 1) {
      if (existsSync(file)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    const next = JSON.parse(readFileSync(file, 'utf8'));
    expect(next.profiles.test.user.email).toBe('spawn-login@example.com');
    expect(next.profiles.prod).toBeUndefined();
  });

  it('spawns login with the Settings-configured AMR profile over daemon env', async () => {
    const result = await spawnVelaLogin({
      baseEnv: {
        ...process.env,
        HOME: tmpHome,
        OPEN_DESIGN_AMR_PROFILE: 'prod',
        VELA_PROFILE: 'prod',
        FAKE_VELA_LOGIN_USER_EMAIL: 'settings-profile@example.com',
      },
      configuredEnv: {
        VELA_BIN: FAKE_VELA,
        OPEN_DESIGN_AMR_PROFILE: 'local',
      },
    });

    expect(result.pid).toBeGreaterThan(0);
    expect(result.profile).toBe('local');

    const file = path.join(tmpHome, '.amr', 'config.json');
    for (let i = 0; i < 20; i += 1) {
      if (existsSync(file)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    const next = JSON.parse(readFileSync(file, 'utf8'));
    expect(next.profiles.local.user.email).toBe('settings-profile@example.com');
    expect(next.profiles.prod).toBeUndefined();
  });
});

describe('applyVelaLiveAccount', () => {
  const signedIn = (user: VelaLoginStatus['user']): VelaLoginStatus => ({
    loggedIn: true,
    loginInFlight: false,
    profile: 'prod',
    user,
    configPath: '/tmp/x',
  });

  it('surfaces plan + balance on a separate field without fabricating a user', () => {
    // VELA_RUNTIME_KEY / VELA_LINK_URL auth → readVelaLoginStatus returns
    // loggedIn:true, user:null; the live billing data rides on `account` so the
    // null identity (and the analytics `user.id` signal) is preserved.
    const status = signedIn(null);
    applyVelaLiveAccount(status, { plan: 'max', balanceUsd: '204.35' });
    expect(status.user).toBeNull();
    expect(status.account).toEqual({ plan: 'max', balanceUsd: '204.35' });
  });

  it('leaves an existing config-backed user identity untouched', () => {
    const status = signedIn({ id: 'u1', email: 'a@b.c', plan: 'free' });
    applyVelaLiveAccount(status, { plan: 'plus', balanceUsd: '10.00' });
    expect(status.user).toEqual({ id: 'u1', email: 'a@b.c', plan: 'free' });
    expect(status.account).toEqual({ plan: 'plus', balanceUsd: '10.00' });
  });

  it('is a no-op when signed out or when there is no account', () => {
    const out: VelaLoginStatus = { ...signedIn(null), loggedIn: false };
    applyVelaLiveAccount(out, { plan: 'max', balanceUsd: '1' });
    expect(out.account).toBeUndefined();

    const noAccount = signedIn(null);
    applyVelaLiveAccount(noAccount, null);
    expect(noAccount.account).toBeUndefined();
  });
});

describe('velaLiveAccountCacheKey + clearAllVelaLiveAccounts', () => {
  const rev = (
    over: Partial<VelaCredentialRevision> = {},
  ): VelaCredentialRevision => ({
    authSource: 'file',
    profile: 'prod',
    loggedIn: true,
    userId: 'u1',
    userEmail: 'a@b.c',
    configMtimeMs: 100,
    credentialFingerprint: '',
    ...over,
  });

  it('changes key after logout / account switch on the same profile', () => {
    const signedInKey = velaLiveAccountCacheKey(rev());
    const loggedOutKey = velaLiveAccountCacheKey(
      rev({ loggedIn: false, userId: '', configMtimeMs: 200 }),
    );
    const otherUserKey = velaLiveAccountCacheKey(
      rev({ userId: 'u2', configMtimeMs: 300 }),
    );
    expect(signedInKey).not.toBe(loggedOutKey);
    expect(signedInKey).not.toBe(otherUserKey);
  });

  it('invalidates an env-backed key when the config account changes', () => {
    // Env-backed auth (VELA_RUNTIME_KEY) has userId='' (user:null), so the
    // config mtime is the ONLY signal that the underlying billing account
    // changed — it must be part of the key or a switch leaks the prior
    // account's plan/balance. readVelaCredentialRevision now keeps configMtimeMs
    // for env auth so these differ.
    const env = (mtime: number) =>
      velaLiveAccountCacheKey(
        rev({ authSource: 'env', userId: '', userEmail: '', configMtimeMs: mtime }),
      );
    expect(env(100)).not.toBe(env(200));
  });

  it('invalidates an env-backed key when the configured AMR credential changes', () => {
    // Settings-backed VELA_RUNTIME_KEY can switch accounts without touching
    // ~/.amr/config.json (same configMtimeMs, user:null), so the credential
    // fingerprint is the only thing distinguishing account A from account B.
    const base = {
      authSource: 'env' as const,
      userId: '',
      userEmail: '',
      configMtimeMs: 100,
    };
    const keyA = velaLiveAccountCacheKey(
      rev({ ...base, credentialFingerprint: 'aaaaaaaaaaaaaaaa' }),
    );
    const keyB = velaLiveAccountCacheKey(
      rev({ ...base, credentialFingerprint: 'bbbbbbbbbbbbbbbb' }),
    );
    expect(keyA).not.toBe(keyB);
  });

  it('never serves the previous account billing data after a switch', () => {
    clearAllVelaLiveAccounts();
    const oldKey = velaLiveAccountCacheKey(rev({ userId: 'u1' }));
    setVelaLiveAccount(oldKey, { plan: 'max', balanceUsd: '999.00' });

    // A different account logging in (rewritten config) gets a fresh key.
    const newKey = velaLiveAccountCacheKey(
      rev({ userId: 'u2', configMtimeMs: 999 }),
    );
    expect(peekVelaLiveAccount(newKey)).toBeNull();
    expect(peekVelaLiveAccount(oldKey)).toEqual({
      plan: 'max',
      balanceUsd: '999.00',
    });

    // Logout wipes everything.
    clearAllVelaLiveAccounts();
    expect(peekVelaLiveAccount(oldKey)).toBeNull();
  });
});
