// @vitest-environment jsdom
//
// Unit tests for the config hook (master switch + the four per-hook flags). The
// wire-body rules are already characterized in rules.test / config-provider.test;
// this pins the hook's OWN behavior: optimistic toggle, rollback on a failed
// PATCH, and hydration off the shared memory-list GET.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MemoryListResponse, MemoryTreeNode } from '@open-design/contracts';

import { useMemoryConfig } from '../../../src/features/memory/hooks/useMemoryConfig.hooks';
import { useMemoryEntries } from '../../../src/features/memory/hooks/useMemoryEntries.hooks';
import type { MemoryConfigPort, MemoryEntriesPort } from '../../../src/features/memory/ports';
import type { MemoryConfigFlagKey } from '../../../src/features/memory/rules';

function makePort(patchConfig = vi.fn(async () => true)): MemoryConfigPort {
  return { patchConfig };
}

/** A promise plus its own resolve, so a test can control exactly when a PATCH settles. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function listResponse(over: Partial<MemoryListResponse> = {}): MemoryListResponse {
  return {
    enabled: true,
    chatExtractionEnabled: true,
    profileEnabled: true,
    rewriteEnabled: true,
    verifyEnabled: true,
    rootDir: '',
    index: '',
    entries: [],
    extraction: null,
    ...over,
  };
}

describe('useMemoryConfig', () => {
  it('toggles the master switch optimistically and PATCHes', async () => {
    const patchConfig = vi.fn(async () => true);
    const { result } = renderHook(() => useMemoryConfig(makePort(patchConfig)));

    await act(async () => {
      await result.current.onToggleEnabled(false);
    });

    expect(result.current.enabled).toBe(false);
    expect(patchConfig).toHaveBeenCalledWith({ enabled: false });
  });

  it('rolls the master switch back when the PATCH is rejected (non-2xx => false)', async () => {
    const patchConfig = vi.fn(async () => false);
    const { result } = renderHook(() => useMemoryConfig(makePort(patchConfig)));

    expect(result.current.enabled).toBe(true);
    await act(async () => {
      await result.current.onToggleEnabled(false);
    });

    // Optimistic flip reverted because the daemon kept the old value.
    expect(result.current.enabled).toBe(true);
    expect(patchConfig).toHaveBeenCalledWith({ enabled: false });
  });

  it('rolls the master switch back and rethrows when the PATCH throws', async () => {
    const patchConfig = vi.fn(async () => {
      throw new Error('network down');
    });
    const { result } = renderHook(() => useMemoryConfig(makePort(patchConfig)));

    await act(async () => {
      await expect(result.current.onToggleEnabled(false)).rejects.toThrow('network down');
    });

    expect(result.current.enabled).toBe(true);
  });

  it('rolls a per-hook flag back when the PATCH fails', async () => {
    const patchConfig = vi.fn(async () => false);
    const { result } = renderHook(() => useMemoryConfig(makePort(patchConfig)));

    expect(result.current.hookFlags.profileEnabled).toBe(true);
    await act(async () => {
      await result.current.onToggleHook('profileEnabled', false);
    });

    // Optimistic set was reverted because the server rejected it.
    expect(result.current.hookFlags.profileEnabled).toBe(true);
    expect(patchConfig).toHaveBeenCalledWith({ profileEnabled: false });
  });

  it('rolls a per-hook flag back and rethrows when the PATCH throws', async () => {
    const patchConfig = vi.fn(async () => {
      throw new Error('network down');
    });
    const { result } = renderHook(() => useMemoryConfig(makePort(patchConfig)));

    expect(result.current.hookFlags.profileEnabled).toBe(true);
    await act(async () => {
      await expect(result.current.onToggleHook('profileEnabled', false)).rejects.toThrow(
        'network down',
      );
    });

    // Optimistic set reverted even though the transport rejected instead of
    // returning false, so the UI does not diverge from the daemon.
    expect(result.current.hookFlags.profileEnabled).toBe(true);
  });

  it('keeps a per-hook flag flipped when the PATCH succeeds', async () => {
    const { result } = renderHook(() => useMemoryConfig(makePort(vi.fn(async () => true))));
    await act(async () => {
      await result.current.onToggleHook('verifyEnabled', false);
    });
    expect(result.current.hookFlags.verifyEnabled).toBe(false);
  });

  it('settles the master switch at true when two overlapping PATCHes both fail, regardless of resolution order', async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const patchConfig = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useMemoryConfig(makePort(patchConfig)));

    // true -> false (request A), then immediately false -> true (request B),
    // before either PATCH has settled.
    let toggleA!: Promise<void>;
    let toggleB!: Promise<void>;
    act(() => {
      toggleA = result.current.onToggleEnabled(false);
    });
    act(() => {
      toggleB = result.current.onToggleEnabled(true);
    });
    expect(result.current.enabled).toBe(true);

    // Request A (the stale one) settles first and fails.
    await act(async () => {
      first.resolve(false);
      await toggleA;
    });
    // A must not clobber B's still-pending optimistic value.
    expect(result.current.enabled).toBe(true);

    // Request B (the latest one) settles last and also fails.
    await act(async () => {
      second.resolve(false);
      await toggleB;
    });
    // Neither PATCH was ever accepted by the server, so the switch must land
    // back on the original confirmed value, not on request A's own guess.
    expect(result.current.enabled).toBe(true);
  });

  it('settles a per-hook flag at its confirmed value when two overlapping PATCHes both fail, regardless of resolution order', async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const patchConfig = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useMemoryConfig(makePort(patchConfig)));

    let toggleA!: Promise<void>;
    let toggleB!: Promise<void>;
    act(() => {
      toggleA = result.current.onToggleHook('profileEnabled', false);
    });
    act(() => {
      toggleB = result.current.onToggleHook('profileEnabled', true);
    });
    expect(result.current.hookFlags.profileEnabled).toBe(true);

    await act(async () => {
      first.resolve(false);
      await toggleA;
    });
    expect(result.current.hookFlags.profileEnabled).toBe(true);

    await act(async () => {
      second.resolve(false);
      await toggleB;
    });
    expect(result.current.hookFlags.profileEnabled).toBe(true);
  });

  it('serializes a fast master true -> false -> true sequence so the last PATCH on the wire carries the latest intent, even when the earlier request settles last', async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const patchConfig = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useMemoryConfig(makePort(patchConfig)));

    // true -> false (request A, slow), then false -> true (request B) while A
    // is still in flight. B's PATCH must NOT race A on the wire.
    let toggleA!: Promise<void>;
    let toggleB!: Promise<void>;
    act(() => {
      toggleA = result.current.onToggleEnabled(false);
    });
    act(() => {
      toggleB = result.current.onToggleEnabled(true);
    });
    expect(patchConfig).toHaveBeenCalledTimes(1);
    expect(patchConfig).toHaveBeenCalledWith({ enabled: false });

    // B's response is "ready" before A even settles — the reverse-completion
    // order that used to let the server persist the stale `false`.
    second.resolve(true);
    await act(async () => {
      first.resolve(true);
      await toggleA;
      await toggleB;
    });

    // The latest intent was the LAST write the server saw, so the persisted
    // value matches the latest user action.
    expect(patchConfig).toHaveBeenCalledTimes(2);
    expect(patchConfig).toHaveBeenLastCalledWith({ enabled: true });
    expect(result.current.enabled).toBe(true);
  });

  it('serializes a fast per-hook toggle sequence the same way', async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const patchConfig = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useMemoryConfig(makePort(patchConfig)));

    let toggleA!: Promise<void>;
    let toggleB!: Promise<void>;
    act(() => {
      toggleA = result.current.onToggleHook('profileEnabled', false);
    });
    act(() => {
      toggleB = result.current.onToggleHook('profileEnabled', true);
    });
    expect(patchConfig).toHaveBeenCalledTimes(1);
    expect(patchConfig).toHaveBeenCalledWith({ profileEnabled: false });

    second.resolve(true);
    await act(async () => {
      first.resolve(true);
      await toggleA;
      await toggleB;
    });

    expect(patchConfig).toHaveBeenCalledTimes(2);
    expect(patchConfig).toHaveBeenLastCalledWith({ profileEnabled: true });
    expect(result.current.hookFlags.profileEnabled).toBe(true);
  });

  it('coalesces toggles queued behind an in-flight PATCH down to the latest intent', async () => {
    const first = deferred<boolean>();
    const second = deferred<boolean>();
    const patchConfig = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useMemoryConfig(makePort(patchConfig)));

    // Three rapid flips: the two issued while the first PATCH is in flight
    // collapse into ONE follow-up write carrying only the final value.
    let toggleA!: Promise<void>;
    let toggleB!: Promise<void>;
    let toggleC!: Promise<void>;
    act(() => {
      toggleA = result.current.onToggleEnabled(false);
    });
    act(() => {
      toggleB = result.current.onToggleEnabled(true);
    });
    act(() => {
      toggleC = result.current.onToggleEnabled(false);
    });
    expect(patchConfig).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(true);
      second.resolve(true);
      await Promise.all([toggleA, toggleB, toggleC]);
    });

    expect(patchConfig).toHaveBeenCalledTimes(2);
    expect(patchConfig).toHaveBeenLastCalledWith({ enabled: false });
    expect(result.current.enabled).toBe(false);
  });

  it('does not let hydration overwrite an in-flight optimistic master toggle', async () => {
    const patch = deferred<boolean>();
    const patchConfig = vi.fn().mockReturnValueOnce(patch.promise);
    const { result } = renderHook(() => useMemoryConfig(makePort(patchConfig)));

    let toggle!: Promise<void>;
    act(() => {
      toggle = result.current.onToggleEnabled(false);
    });
    expect(result.current.enabled).toBe(false);

    // This represents a list GET that observed the old server state before
    // the PATCH above was applied.
    act(() => {
      result.current.hydrate(
        listResponse({ enabled: true }),
        result.current.captureHydrationRevision(),
      );
    });
    expect(result.current.enabled).toBe(false);

    await act(async () => {
      patch.resolve(true);
      await toggle;
    });
    expect(result.current.enabled).toBe(false);
  });

  it('does not let hydration overwrite an in-flight optimistic hook toggle', async () => {
    const patch = deferred<boolean>();
    const patchConfig = vi.fn().mockReturnValueOnce(patch.promise);
    const { result } = renderHook(() => useMemoryConfig(makePort(patchConfig)));

    let toggle!: Promise<void>;
    act(() => {
      toggle = result.current.onToggleHook('profileEnabled', false);
    });
    expect(result.current.hookFlags.profileEnabled).toBe(false);

    // The stale list must not replace this flag's optimistic state (or its
    // rollback baseline) while the matching PATCH is still outstanding.
    act(() => {
      result.current.hydrate(
        listResponse({ profileEnabled: true }),
        result.current.captureHydrationRevision(),
      );
    });
    expect(result.current.hookFlags.profileEnabled).toBe(false);

    await act(async () => {
      patch.resolve(true);
      await toggle;
    });
    expect(result.current.hookFlags.profileEnabled).toBe(false);
  });

  it('does not let a reload begun before a successful toggle hydrate its stale server snapshot afterward', async () => {
    const list = deferred<MemoryListResponse>();
    const patch = deferred<boolean>();
    const configPort = makePort(vi.fn().mockReturnValueOnce(patch.promise));
    const entriesPort: MemoryEntriesPort = {
      fetchMemoryList: vi.fn().mockReturnValueOnce(list.promise),
      fetchMemoryTree: vi.fn(async () => [] as MemoryTreeNode[]),
      fetchMemoryEntry: vi.fn(async () => null),
      saveMemoryEntry: vi.fn(async () => null),
      deleteMemoryEntry: vi.fn(async () => true),
      saveMemoryIndex: vi.fn(async () => true),
    };
    const { result } = renderHook(() => {
      const config = useMemoryConfig(configPort);
      const entries = useMemoryEntries(entriesPort, {
        fireFlash: vi.fn(),
        captureConfigHydrationRevision: config.captureHydrationRevision,
        hydrateConfig: config.hydrate,
        openEditor: vi.fn(),
        closeEditor: vi.fn(),
      });
      return { config, entries };
    });

    let reload!: Promise<void>;
    act(() => {
      reload = result.current.entries.reload();
    });

    let toggle!: Promise<void>;
    act(() => {
      toggle = result.current.config.onToggleEnabled(false);
    });
    await act(async () => {
      patch.resolve(true);
      await toggle;
    });
    expect(result.current.config.enabled).toBe(false);

    // The list request started first and observed the old value. Its response
    // must not regress the now-confirmed toggle merely because the PATCH has
    // already settled by the time it arrives.
    await act(async () => {
      list.resolve(listResponse({ enabled: true }));
      await reload;
    });
    expect(result.current.config.enabled).toBe(false);
  });

  it('does not let a reload begun during an in-flight toggle hydrate its stale server snapshot after the toggle succeeds', async () => {
    const list = deferred<MemoryListResponse>();
    const patch = deferred<boolean>();
    const configPort = makePort(vi.fn().mockReturnValueOnce(patch.promise));
    const entriesPort: MemoryEntriesPort = {
      fetchMemoryList: vi.fn().mockReturnValueOnce(list.promise),
      fetchMemoryTree: vi.fn(async () => [] as MemoryTreeNode[]),
      fetchMemoryEntry: vi.fn(async () => null),
      saveMemoryEntry: vi.fn(async () => null),
      deleteMemoryEntry: vi.fn(async () => true),
      saveMemoryIndex: vi.fn(async () => true),
    };
    const { result } = renderHook(() => {
      const config = useMemoryConfig(configPort);
      const entries = useMemoryEntries(entriesPort, {
        fireFlash: vi.fn(),
        captureConfigHydrationRevision: config.captureHydrationRevision,
        hydrateConfig: config.hydrate,
        openEditor: vi.fn(),
        closeEditor: vi.fn(),
      });
      return { config, entries };
    });

    // The toggle starts first...
    let toggle!: Promise<void>;
    act(() => {
      toggle = result.current.config.onToggleEnabled(false);
    });
    // ...then the reload starts WHILE the PATCH is still in flight, capturing
    // the guard's revision from during that in-flight window (not before the
    // toggle began).
    let reload!: Promise<void>;
    act(() => {
      reload = result.current.entries.reload();
    });

    await act(async () => {
      patch.resolve(true);
      await toggle;
    });
    expect(result.current.config.enabled).toBe(false);

    // The reload's own read resolves AFTER the toggle settled, but with
    // stale, pre-write server data — its GET raced ahead of the PATCH.
    await act(async () => {
      list.resolve(listResponse({ enabled: true }));
      await reload;
    });
    expect(result.current.config.enabled).toBe(false);
  });

  it('hydrate maps a list response onto every flag (missing => true)', () => {
    const { result } = renderHook(() => useMemoryConfig(makePort()));
    act(() =>
      result.current.hydrate(
        listResponse({ enabled: false, profileEnabled: false }),
        result.current.captureHydrationRevision(),
      ),
    );

    expect(result.current.enabled).toBe(false);
    expect(result.current.hookFlags.profileEnabled).toBe(false);
    expect(result.current.hookFlags.verifyEnabled).toBe(true);
  });

  const hookFlagKeys: MemoryConfigFlagKey[] = [
    'chatExtractionEnabled',
    'profileEnabled',
    'rewriteEnabled',
    'verifyEnabled',
  ];

  it.each(hookFlagKeys)(
    'a hydrate arriving while %s has an unsettled write skips only that flag',
    async (flagKey) => {
      const list = deferred<MemoryListResponse>();
      const patch = deferred<boolean>();
      const configPort = makePort(vi.fn().mockReturnValueOnce(patch.promise));
      const entriesPort: MemoryEntriesPort = {
        fetchMemoryList: vi.fn().mockReturnValueOnce(list.promise),
        fetchMemoryTree: vi.fn(async () => [] as MemoryTreeNode[]),
        fetchMemoryEntry: vi.fn(async () => null),
        saveMemoryEntry: vi.fn(async () => null),
        deleteMemoryEntry: vi.fn(async () => true),
        saveMemoryIndex: vi.fn(async () => true),
      };
      const { result } = renderHook(() => {
        const config = useMemoryConfig(configPort);
        const entries = useMemoryEntries(entriesPort, {
          fireFlash: vi.fn(),
          captureConfigHydrationRevision: config.captureHydrationRevision,
          hydrateConfig: config.hydrate,
          openEditor: vi.fn(),
          closeEditor: vi.fn(),
        });
        return { config, entries };
      });

      // The toggle starts FIRST. reload() then captures its hydration
      // revision AFTER that start-time invalidate, so the coarse
      // `hydrationGuardRef` check at the top of hydrate() does not
      // short-circuit it — hydrate() reaches the per-flag
      // `hasUnsettledConfigWrite()` checks below, with this flag's write
      // still genuinely unsettled (the PATCH has not resolved yet).
      let toggle!: Promise<void>;
      act(() => {
        toggle = result.current.config.onToggleHook(flagKey, false);
      });

      let reload!: Promise<void>;
      act(() => {
        reload = result.current.entries.reload();
      });

      // The list response arrives while the toggle's PATCH is still pending.
      await act(async () => {
        list.resolve(listResponse({ [flagKey]: true, enabled: false }));
        await reload;
      });

      // This flag's optimistic value survives the hydrate (its write hasn't
      // settled), but an unrelated flag DOES get hydrated normally — proving
      // the skip is scoped to just this flag's own queue.
      expect(result.current.config.hookFlags[flagKey]).toBe(false);
      expect(result.current.config.enabled).toBe(false);

      await act(async () => {
        patch.resolve(true);
        await toggle;
      });
      expect(result.current.config.hookFlags[flagKey]).toBe(false);
    },
  );
});

describe('useMemoryFlash', () => {
  it('fires a pill then auto-clears it after ~1.8s', async () => {
    vi.useFakeTimers();
    try {
      // Imported lazily so the fake timers are installed before the effect.
      const { useMemoryFlash } = await import(
        '../../../src/features/memory/hooks/useMemoryFlash.hooks'
      );
      const { result } = renderHook(() => useMemoryFlash());

      act(() => result.current.fireFlash('created'));
      expect(result.current.flash?.kind).toBe('created');

      act(() => vi.advanceTimersByTime(1800));
      expect(result.current.flash).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
