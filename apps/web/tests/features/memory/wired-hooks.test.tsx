// @vitest-environment jsdom
//
// Coverage for the four `useWired*` composition-root wirers: thin one-line
// functions that bind the real transport port instead of a test fake. Every
// hook BEHAVIOR is already covered by the injected-fake-port tests in the
// sibling files; these tests exist only to prove each wirer actually
// delegates to its real port module (a real fetch call goes out) rather than
// silently binding the wrong thing.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWiredMemoryConfig } from '../../../src/features/memory/hooks/useMemoryConfig.hooks';
import { useWiredMemoryConnectors } from '../../../src/features/memory/hooks/useMemoryConnectors.hooks';
import { useWiredMemoryEntries } from '../../../src/features/memory/hooks/useMemoryEntries.hooks';
import { useWiredMemoryExtractions } from '../../../src/features/memory/hooks/useMemoryExtractions.hooks';

const originalFetch = globalThis.fetch;

function mockFetch(impl: (url: string) => { ok: boolean; status?: number; json?: () => Promise<unknown> }) {
  const fn = vi.fn(async (url: unknown) => impl(String(url)) as unknown as Response);
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('wired hooks — composition-root delegation to the real transport', () => {
  it('useWiredMemoryConfig delegates PATCH /api/memory/config to the real port', async () => {
    const fetchMock = mockFetch(() => ({ ok: true }));
    const { result } = renderHook(() => useWiredMemoryConfig());
    await act(async () => {
      await result.current.onToggleEnabled(false);
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/memory/config', expect.objectContaining({ method: 'PATCH' }));
  });

  it('useWiredMemoryEntries delegates its reload to the real /api/memory port', async () => {
    const fetchMock = mockFetch((url) =>
      url.includes('/api/memory/tree')
        ? { ok: true, json: async () => ({ tree: [] }) }
        : { ok: true, json: async () => ({ entries: [], enabled: true }) },
    );
    const { result } = renderHook(() =>
      useWiredMemoryEntries({
        fireFlash: vi.fn(),
        captureConfigHydrationRevision: () => 0,
        hydrateConfig: vi.fn(),
        openEditor: vi.fn(),
        closeEditor: vi.fn(),
      }),
    );
    await act(async () => {
      await result.current.reload();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/memory');
  });

  it('useWiredMemoryConnectors delegates connector discovery to the real port', async () => {
    const fetchMock = mockFetch(() => ({ ok: true, json: async () => ({ connectors: [] }) }));
    const { result } = renderHook(() =>
      useWiredMemoryConnectors({
        reload: vi.fn(async () => {}),
        reloadExtractions: vi.fn(async () => []),
        chatAgentId: null,
        chatModel: null,
      }),
    );
    await act(async () => {
      await result.current.reloadConnectors();
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('useWiredMemoryExtractions delegates its reload to the real /api/memory/extractions port', async () => {
    const fetchMock = mockFetch(() => ({ ok: true, json: async () => ({ extractions: [] }) }));
    const { result } = renderHook(() => useWiredMemoryExtractions());
    await act(async () => {
      await result.current.reloadExtractions();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/memory/extractions');
  });
});
