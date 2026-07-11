// Transport adapters for a routine's run history and the crystallize action.
import { afterEach, describe, expect, it, vi } from 'vitest';

import { crystallizeRoutineRun, fetchRoutineRuns } from '../../../src/providers/routines/runs';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('fetchRoutineRuns', () => {
  it('fetches the limited run list and defaults to [] when the field is absent', async () => {
    const fn = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe('/api/routines/r1/runs?limit=10');
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    expect(await fetchRoutineRuns('r1', 10)).toEqual([]);
  });

  it('returns the parsed run list on success', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ runs: [{ id: 'run1' }] }),
    })) as unknown as typeof fetch;
    expect(await fetchRoutineRuns('r1', 5)).toEqual([{ id: 'run1' }]);
  });

  it('throws on a non-ok response', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
    await expect(fetchRoutineRuns('r1', 5)).rejects.toThrow('runs: 500');
  });

  it('URL-encodes the routine id', async () => {
    const fn = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe('/api/routines/r%2F1/runs?limit=5');
      return { ok: true, json: async () => ({ runs: [] }) } as unknown as Response;
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    await fetchRoutineRuns('r/1', 5);
  });
});

describe('crystallizeRoutineRun', () => {
  it('POSTs to the crystallize endpoint and returns the parsed body', async () => {
    const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe('/api/routines/r1/runs/run1/crystallize');
      expect(init?.method).toBe('POST');
      return { ok: true, json: async () => ({ routineId: 'r1', runId: 'run1', proposals: [] }) } as unknown as Response;
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    const result = await crystallizeRoutineRun('r1', 'run1');
    expect(result).toMatchObject({ routineId: 'r1', runId: 'run1' });
  });

  it('throws the daemon error message on failure', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'crystallize boom' }),
    })) as unknown as typeof fetch;
    await expect(crystallizeRoutineRun('r1', 'run1')).rejects.toThrow('crystallize boom');
  });

  it('falls back to a generic message when the error body is unparsable', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('bad json');
      },
    })) as unknown as typeof fetch;
    await expect(crystallizeRoutineRun('r1', 'run1')).rejects.toThrow('crystallize failed: 500');
  });
});
