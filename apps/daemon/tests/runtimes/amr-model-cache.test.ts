import { afterEach, describe, expect, it, vi } from 'vitest';

import { amrModelScope, buildAmrModelCacheKey } from '../../src/runtimes/amr-model-probe.js';
import { resetLiveModelsForTests } from '../../src/runtimes/models.js';
import { amrRunModels, AmrModelLoadingCache } from '../../src/runtimes/amr-model-cache.js';

const preset = [{ id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' }];

describe('AmrModelLoadingCache.get', () => {
  it('reuses a remote result that completes while another caller awaits its preset', async () => {
    const cache = new AmrModelLoadingCache();
    const remote = [{ id: 'kimi-k2', label: 'Kimi K2' }];
    let releasePreset: (() => void) | undefined;
    let releaseRemote: (() => void) | undefined;
    let presetReads = 0;
    const fetchRemote = vi.fn(() => new Promise<typeof remote>((resolve) => {
      releaseRemote = () => resolve(remote);
    }));
    const fetchPreset = vi.fn(() => {
      presetReads += 1;
      return presetReads === 1
        ? Promise.resolve(preset)
        : new Promise<typeof preset>((resolve) => { releasePreset = () => resolve(preset); });
    });

    await expect(cache.get('workspace-a', { fetchPreset, fetchRemote })).resolves.toMatchObject({ source: 'preset' });
    const waiting = cache.get('workspace-a', { fetchPreset, fetchRemote });
    expect(releasePreset).toBeTypeOf('function');
    releaseRemote?.();
    await Promise.resolve();
    await Promise.resolve();
    releasePreset?.();
    await expect(waiting).resolves.toMatchObject({ source: 'remote', models: remote, refreshing: false });
    expect(fetchRemote).toHaveBeenCalledTimes(1);
  });
});

describe('AmrModelLoadingCache.getAuthoritative', () => {
  afterEach(() => { vi.useRealTimers(); });

  // One run asks twice (the resume probe and the run itself). A remote catalog
  // that never answers must cost that run at most one wait, not one per call.
  it('bounds the wait per remote refresh, not per call', async () => {
    vi.useFakeTimers();
    const cache = new AmrModelLoadingCache();
    const fetchers = {
      fetchPreset: async () => preset,
      fetchRemote: () => new Promise<never>(() => {}),
    };
    const startedAt = Date.now();
    const first = cache.getAuthoritative('k', fetchers, 1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(first).resolves.toMatchObject({ source: 'preset' });
    const second = cache.getAuthoritative('k', fetchers, 1_000);
    let settled = false;
    void second.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    expect(Date.now() - startedAt).toBe(1_000);
  });

  // When the caller's catalog just failed, waiting again only delays the run.
  it('does not wait after the last remote refresh failed', async () => {
    vi.useFakeTimers();
    const cache = new AmrModelLoadingCache();
    let calls = 0;
    const fetchers = {
      fetchPreset: async () => preset,
      fetchRemote: () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('list Link models: 401')) : new Promise<never>(() => {});
      },
    };
    await expect(cache.getAuthoritative('k', fetchers, 1_000)).resolves.toMatchObject({ source: 'preset' });
    const again = cache.getAuthoritative('k', fetchers, 1_000);
    let settled = false;
    void again.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
    await expect(again).resolves.toMatchObject({ source: 'preset', remoteError: expect.stringContaining('401') });
  });

  it('still returns the caller catalog when it arrives within the wait', async () => {
    vi.useFakeTimers();
    const cache = new AmrModelLoadingCache();
    const remote = [{ id: 'kimi-k2', label: 'Kimi K2' }];
    const fetchers = {
      fetchPreset: async () => preset,
      fetchRemote: () => new Promise<typeof remote>((resolve) => setTimeout(() => resolve(remote), 300)),
    };
    const pending = cache.getAuthoritative('k', fetchers, 1_000);
    await vi.advanceTimersByTimeAsync(300);
    await expect(pending).resolves.toMatchObject({ source: 'remote', models: remote });
  });
});

// A remote catalog's enabled flags are workspace entitlements, even when two
// workspaces share the same account, credentials and installed CLI binary.
describe('AMR model catalog workspace partition', () => {
  afterEach(() => resetLiveModelsForTests());

  it('never falls back to another workspace or credential revision remembered catalog', () => {
    const revision = {
      authSource: 'file' as const, profile: 'local', loggedIn: true,
      userId: 'user', userEmail: 'same@example.test', configMtimeMs: 1,
      credentialFingerprint: 'credential-a',
    };
    const env = { VELA_PROFILE: 'local', VELA_WORKSPACE_ID: 'go-b', VELA_RUNTIME_KEY: 'secret-not-for-scope' };
    const goScope = amrModelScope(env, revision);
    amrRunModels('amr', goScope, { source: 'remote', models: [{ id: 'pro', label: 'Pro', enabled: true }] });
    const freeScope = amrModelScope({ ...env, VELA_WORKSPACE_ID: 'free-a' }, revision);
    const otherCredential = amrModelScope(env, { ...revision, credentialFingerprint: 'credential-b' });

    expect(amrRunModels('amr', freeScope, { source: 'preset', models: preset })).toEqual(preset);
    expect(amrRunModels('amr', otherCredential, { source: 'preset', models: preset })).toEqual(preset);
    expect(goScope).not.toContain('secret-not-for-scope');
  });

  it('never reuses one workspace entitlement catalog for another workspace', () => {
    const shared = {
      launchPath: '/fixture/vela',
      credentialRevision: {
        authSource: 'file' as const,
        profile: 'local',
        loggedIn: true,
        userId: 'same-user',
        userEmail: 'same@example.test',
        configMtimeMs: 1,
        credentialFingerprint: 'same-credential',
      },
    };
    const keyFor = (workspaceId: string) => buildAmrModelCacheKey({
      ...shared,
      env: { VELA_WORKSPACE_ID: workspaceId },
    });

    expect(keyFor('free-a')).not.toBe(keyFor('go-b'));
    expect(keyFor('free-a')).toBe(keyFor('free-a'));
  });
});
