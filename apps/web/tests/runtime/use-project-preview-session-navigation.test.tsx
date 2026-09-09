// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectScopedPreviewNavigation } from '../../src/providers/registry';
import type { ProjectPreviewNavigationRequest } from '../../src/runtime/project-preview-navigation-cache';
import type { PreviewSessionNavigationPolicy } from '../../src/runtime/preview-session-navigation';
import { useProjectPreviewSessionNavigation } from '../../src/runtime/use-project-preview-session-navigation';

const normalPolicy: PreviewSessionNavigationPolicy = {
  sandboxProfile: 'normal',
  guards: { storage: false, focus: false, redirect: false },
  deck: false,
};

function navigation(sessionId: string, version: string, expiresAt = 20_000) {
  return {
    sessionId,
    normalUrl: `http://n-${sessionId}.localhost:17456/index.html`,
    poweredUrl: `http://p-${sessionId}.localhost:17456/index.html`,
    documentVersion: version,
    runtimeProtocol: 'universal',
    renewalScope: {
      href: `http://host/api/projects/project-1/preview/${sessionId}/`,
      expiresAt,
    },
  } satisfies ProjectScopedPreviewNavigation;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useProjectPreviewSessionNavigation', () => {
  it('retains last-good navigation while the same file revision is replaced', async () => {
    const replacement = deferred<ProjectScopedPreviewNavigation | null>();
    const get = vi.fn()
      .mockResolvedValueOnce(navigation('scope-0001', 'v1'))
      .mockReturnValueOnce(replacement.promise);
    const options = {
      projectId: 'project-1',
      fileName: 'index.html',
      authorizationKey: 'local',
      policy: normalPolicy,
      cache: { get },
      now: () => 1_000,
      refreshAheadMs: 1_000,
    };
    const hook = renderHook(
      ({ revisionKey }) => useProjectPreviewSessionNavigation({ ...options, revisionKey }),
      { initialProps: { revisionKey: 'v1' } },
    );
    await flushMicrotasks();
    expect(hook.result.current.navigation?.documentVersion).toBe('v1');

    hook.rerender({ revisionKey: 'v2' });
    expect(hook.result.current.loading).toBe(true);
    expect(hook.result.current.navigation?.documentVersion).toBe('v1');
    await act(async () => replacement.resolve(navigation('scope-0002', 'v2')));
    expect(hook.result.current.navigation?.documentVersion).toBe('v2');
  });

  it.each([
    ['an unavailable result', () => Promise.resolve(null)],
    ['a rejected request', () => Promise.reject(new Error('mint failed'))],
  ])('stops exposing the previous revision after %s', async (_label, replacement) => {
    const get = vi.fn()
      .mockResolvedValueOnce(navigation('scope-0001', 'v1'))
      .mockImplementationOnce(replacement);
    const options = {
      projectId: 'project-1',
      fileName: 'index.html',
      authorizationKey: 'local',
      policy: normalPolicy,
      cache: { get },
      now: () => 1_000,
      refreshAheadMs: 1_000,
    };
    const hook = renderHook(
      ({ revisionKey }) => useProjectPreviewSessionNavigation({ ...options, revisionKey }),
      { initialProps: { revisionKey: 'v1' } },
    );
    await flushMicrotasks();
    expect(hook.result.current.navigation?.documentVersion).toBe('v1');

    hook.rerender({ revisionKey: 'v2' });
    expect(hook.result.current.navigation?.documentVersion).toBe('v1');
    await flushMicrotasks();

    expect(hook.result.current.navigation).toBeNull();
    expect(hook.result.current.loading).toBe(false);
    expect(hook.result.current.unavailable).toBe(true);
  });

  it('hides a scoped URL immediately when project or authorization ownership changes', async () => {
    const next = deferred<ProjectScopedPreviewNavigation | null>();
    const get = vi.fn()
      .mockResolvedValueOnce(navigation('scope-0001', 'v1'))
      .mockReturnValueOnce(next.promise);
    const cache = { get };
    const hook = renderHook(
      ({ projectId, authorizationKey }) => useProjectPreviewSessionNavigation({
        projectId,
        fileName: 'index.html',
        revisionKey: 'v1',
        authorizationKey,
        policy: normalPolicy,
        cache,
        now: () => 1_000,
      }),
      { initialProps: { projectId: 'project-1', authorizationKey: 'member-1' } },
    );
    await flushMicrotasks();
    expect(hook.result.current.navigation).not.toBeNull();

    hook.rerender({ projectId: 'project-2', authorizationKey: 'member-2' });
    expect(hook.result.current.navigation).toBeNull();
    expect(hook.result.current.loading).toBe(true);
  });

  it('renews the same scope without changing the document navigation', async () => {
    const first = navigation('scope-0001', 'v1', 5_000);
    const renewed = navigation('scope-0001', 'v1', 20_000);
    const get = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(renewed);
    const cache = { get };
    const now = vi.fn(() => 1_000);
    const hook = renderHook(() => useProjectPreviewSessionNavigation({
      projectId: 'project-1',
      fileName: 'index.html',
      revisionKey: 'v1',
      authorizationKey: 'local',
      policy: normalPolicy,
      cache,
      now,
      refreshAheadMs: 1_000,
    }));
    await flushMicrotasks();
    expect(hook.result.current.navigation).not.toBeNull();
    const initialNavigation = hook.result.current.navigation;

    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(get).toHaveBeenCalledTimes(2);
    expect(hook.result.current.navigation).toBe(initialNavigation);
    expect(hook.result.current.expiresAt).toBe(20_000);
  });

  it('recomputes fallback document policy without requesting another scope', async () => {
    const scoped = navigation('scope-0001', 'v1');
    const get = vi.fn().mockResolvedValue(scoped);
    const cache = { get };
    const poweredPolicy: PreviewSessionNavigationPolicy = {
      sandboxProfile: 'powered',
      guards: { storage: false, focus: false, redirect: false },
      deck: false,
    };
    const hook = renderHook(
      ({ policy }) => useProjectPreviewSessionNavigation({
        projectId: 'project-1',
        fileName: 'index.html',
        revisionKey: 'v1',
        authorizationKey: 'local',
        policy,
        cache,
        now: () => 1_000,
      }),
      { initialProps: { policy: normalPolicy } },
    );
    await flushMicrotasks();
    expect(hook.result.current.navigation?.url).toBe(scoped.normalUrl);

    hook.rerender({ policy: poweredPolicy });
    await flushMicrotasks();

    expect(hook.result.current.navigation?.url).toBe(scoped.poweredUrl);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('keeps last-good visible and retries after a renewal failure', async () => {
    const first = navigation('scope-0001', 'v1', 5_000);
    const renewed = navigation('scope-0001', 'v1', 20_000);
    const get = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(renewed);
    const cache = { get };
    const hook = renderHook(() => useProjectPreviewSessionNavigation({
      projectId: 'project-1',
      fileName: 'index.html',
      revisionKey: 'v1',
      authorizationKey: 'local',
      policy: normalPolicy,
      cache,
      now: () => 1_000,
      refreshAheadMs: 1_000,
    }));
    await flushMicrotasks();
    const lastGood = hook.result.current.navigation;

    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(hook.result.current.navigation).toBe(lastGood);
    expect(hook.result.current.unavailable).toBe(true);

    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(get).toHaveBeenCalledTimes(3);
    expect(hook.result.current.navigation).toBe(lastGood);
    expect(hook.result.current.unavailable).toBe(false);
    expect(hook.result.current.expiresAt).toBe(20_000);
  });

  it('ignores a stale completion after switching files', async () => {
    const stale = deferred<ProjectScopedPreviewNavigation | null>();
    const get = vi.fn()
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(navigation('scope-0002', 'other-v1'));
    const cache = { get };
    const hook = renderHook(
      ({ fileName }) => useProjectPreviewSessionNavigation({
        projectId: 'project-1',
        fileName,
        revisionKey: 'v1',
        authorizationKey: 'local',
        policy: normalPolicy,
        cache,
        now: () => 1_000,
      }),
      { initialProps: { fileName: 'index.html' } },
    );

    hook.rerender({ fileName: 'other.html' });
    await flushMicrotasks();
    expect(hook.result.current.navigation?.sessionId).toBe('scope-0002');
    await act(async () => stale.resolve(navigation('scope-stale', 'v1')));
    expect(hook.result.current.navigation?.sessionId).toBe('scope-0002');
  });

  it('does not request a scope while disabled', () => {
    const get = vi.fn<(request: ProjectPreviewNavigationRequest) => Promise<null>>();
    const cache = { get };
    const hook = renderHook(() => useProjectPreviewSessionNavigation({
      projectId: 'project-1',
      fileName: 'index.html',
      revisionKey: 'v1',
      authorizationKey: 'local',
      policy: normalPolicy,
      cache,
      enabled: false,
    }));

    expect(get).not.toHaveBeenCalled();
    expect(hook.result.current).toMatchObject({ navigation: null, loading: false });
  });

  it('can retain the same owner last-good document while new minting is paused', async () => {
    const get = vi.fn().mockResolvedValue(navigation('scope-0001', 'v1'));
    const options = {
      projectId: 'project-1',
      fileName: 'index.html',
      revisionKey: 'v1',
      authorizationKey: 'local',
      policy: normalPolicy,
      cache: { get },
      now: () => 1_000,
      retainLastGoodWhenDisabled: true,
    };
    const hook = renderHook(
      ({ enabled }) => useProjectPreviewSessionNavigation({ ...options, enabled }),
      { initialProps: { enabled: true } },
    );
    await flushMicrotasks();
    const lastGood = hook.result.current.navigation;

    hook.rerender({ enabled: false });

    expect(hook.result.current.navigation).toBe(lastGood);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
