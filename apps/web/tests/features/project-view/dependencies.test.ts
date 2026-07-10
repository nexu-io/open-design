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
});
