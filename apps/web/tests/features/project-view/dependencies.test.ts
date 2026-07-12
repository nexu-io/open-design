// The slice's composition root binds the real transport adapters to the port.
// Mock the global `fetch` and drive the bound port to prove the wiring reaches
// the adapters (and their best-effort contracts) end to end.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { projectViewTransportPort } from '../../../src/features/project-view/dependencies';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('projectViewTransportPort', () => {
  it('readProjectRawText delegates to the raw-text adapter', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, text: async () => 'body' }) as unknown as Response) as unknown as typeof fetch;
    expect(await projectViewTransportPort.readProjectRawText('p', 'f.html')).toBe('body');
  });

  it('extractMemory delegates to the memory-extract adapter and never rejects', async () => {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true }) as unknown as Response);
    globalThis.fetch = fn as unknown as typeof fetch;
    await expect(projectViewTransportPort.extractMemory({ userMessage: 'hi' })).resolves.toBeUndefined();
    expect(String(fn.mock.calls[0]?.[0])).toBe('/api/memory/extract');
  });

  it('fetchAmrLoginStatus delegates to the daemon vela-status endpoint', async () => {
    const fn = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({ loggedIn: true, profile: 'default', user: null, configPath: '/tmp/amr' }),
    }) as unknown as Response);
    globalThis.fetch = fn as unknown as typeof fetch;
    await expect(projectViewTransportPort.fetchAmrLoginStatus()).resolves.toEqual(
      expect.objectContaining({ loggedIn: true }),
    );
    expect(String(fn.mock.calls[0]?.[0])).toBe('/api/integrations/vela/status');
  });

  it('fetchAmrLoginStatus resolves null on failure without rejecting', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false }) as unknown as Response) as unknown as typeof fetch;
    await expect(projectViewTransportPort.fetchAmrLoginStatus()).resolves.toBeNull();
  });
});
