import { afterEach, describe, expect, it, vi } from 'vitest';

import { listProjectRuns } from '../../src/providers/daemon';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listProjectRuns', () => {
  it('returns the run list on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () =>
        Response.json({ runs: [{ id: 'run-1', status: 'running' }] }),
      ),
    );
    await expect(listProjectRuns()).resolves.toEqual([{ id: 'run-1', status: 'running' }]);
  });

  it('returns [] on failure by default so legacy callers keep working', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => new Response(null, { status: 500 })),
    );
    await expect(listProjectRuns()).resolves.toEqual([]);
  });

  // DesktopPetSurface keeps last-good task-center data on a failed read —
  // that only works if the provider actually rejects instead of returning
  // an authoritative-looking empty list.
  it('rejects on non-ok responses when throwOnError is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => new Response(null, { status: 500 })),
    );
    await expect(listProjectRuns(undefined, { throwOnError: true })).rejects.toThrow(
      'list runs failed: 500',
    );
  });

  it('rejects on transport errors when throwOnError is set', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        throw new Error('connection refused');
      }),
    );
    await expect(listProjectRuns(undefined, { throwOnError: true })).rejects.toThrow(
      'connection refused',
    );
  });
});
