// @vitest-environment jsdom
//
// Unit tests for the config hook (master switch + the four per-hook flags). The
// wire-body rules are already characterized in rules.test / config-provider.test;
// this pins the hook's OWN behavior: optimistic toggle, rollback on a failed
// PATCH, and hydration off the shared memory-list GET.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MemoryListResponse } from '@open-design/contracts';

import { useMemoryConfig } from '../../../src/features/memory/hooks/useMemoryConfig.hooks';
import type { MemoryConfigPort } from '../../../src/features/memory/ports';

function makePort(patchConfig = vi.fn(async () => true)): MemoryConfigPort {
  return { patchConfig };
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

  it('keeps a per-hook flag flipped when the PATCH succeeds', async () => {
    const { result } = renderHook(() => useMemoryConfig(makePort(vi.fn(async () => true))));
    await act(async () => {
      await result.current.onToggleHook('verifyEnabled', false);
    });
    expect(result.current.hookFlags.verifyEnabled).toBe(false);
  });

  it('hydrate maps a list response onto every flag (missing => true)', () => {
    const { result } = renderHook(() => useMemoryConfig(makePort()));
    act(() =>
      result.current.hydrate(
        listResponse({ enabled: false, profileEnabled: false }),
      ),
    );

    expect(result.current.enabled).toBe(false);
    expect(result.current.hookFlags.profileEnabled).toBe(false);
    expect(result.current.hookFlags.verifyEnabled).toBe(true);
  });
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
