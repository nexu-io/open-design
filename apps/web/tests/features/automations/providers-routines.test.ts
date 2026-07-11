// Transport adapters for the automations dashboard's routine/project/template/
// proposal snapshot plus the run/pause/delete mutations. These mock the
// global `fetch` to pin the ok/non-ok branches and the soft-fail fallbacks.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  deleteRoutine,
  fetchAutomationsSnapshot,
  runRoutineNow,
  toggleRoutinePaused,
} from '../../../src/providers/routines/routines';

const originalFetch = globalThis.fetch;

function mockFetch(byUrl: Record<string, () => { ok: boolean; status?: number; json?: () => Promise<unknown> }>) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    const impl = byUrl[url];
    if (!impl) throw new Error(`unexpected fetch: ${url}`);
    const result = impl();
    return {
      ok: result.ok,
      status: result.status ?? (result.ok ? 200 : 500),
      json: result.json ?? (async () => ({})),
    } as unknown as Response;
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('fetchAutomationsSnapshot', () => {
  it('resolves routines/projects/templates/proposals together on success', async () => {
    mockFetch({
      '/api/routines': () => ({ ok: true, json: async () => ({ routines: [{ id: 'r1' }] }) }),
      '/api/projects': () => ({ ok: true, json: async () => ({ projects: [{ id: 'p1', name: 'Proj' }] }) }),
      '/api/automation-templates': () => ({ ok: true, json: async () => ({ templates: [{ id: 't1' }] }) }),
      '/api/automation-proposals?status=pending-review': () => ({ ok: true, json: async () => ({ proposals: [{ id: 'pr1' }] }) }),
    });
    const snapshot = await fetchAutomationsSnapshot();
    expect(snapshot.routines).toEqual([{ id: 'r1' }]);
    expect(snapshot.projects).toEqual([{ id: 'p1', name: 'Proj' }]);
    expect(snapshot.automationCatalog).toEqual([{ id: 't1' }]);
    expect(snapshot.proposals).toEqual([{ id: 'pr1' }]);
    expect(snapshot.proposalRefreshFailed).toBe(false);
  });

  it('throws when the routines fetch itself fails', async () => {
    mockFetch({
      '/api/routines': () => ({ ok: false, status: 500 }),
      '/api/projects': () => ({ ok: true, json: async () => ({ projects: [] }) }),
      '/api/automation-templates': () => ({ ok: true, json: async () => ({ templates: [] }) }),
      '/api/automation-proposals?status=pending-review': () => ({ ok: true, json: async () => ({ proposals: [] }) }),
    });
    await expect(fetchAutomationsSnapshot()).rejects.toThrow('routines: 500');
  });

  it('leaves projects null when the projects fetch fails, without failing the whole snapshot', async () => {
    mockFetch({
      '/api/routines': () => ({ ok: true, json: async () => ({ routines: [] }) }),
      '/api/projects': () => ({ ok: false, status: 500 }),
      '/api/automation-templates': () => ({ ok: true, json: async () => ({ templates: [] }) }),
      '/api/automation-proposals?status=pending-review': () => ({ ok: true, json: async () => ({ proposals: [] }) }),
    });
    const snapshot = await fetchAutomationsSnapshot();
    expect(snapshot.projects).toBeNull();
  });

  it('marks templates/proposals as null on non-ok, and reports proposalRefreshFailed', async () => {
    mockFetch({
      '/api/routines': () => ({ ok: true, json: async () => ({ routines: [] }) }),
      '/api/projects': () => ({ ok: true, json: async () => ({ projects: [] }) }),
      '/api/automation-templates': () => ({ ok: false, status: 500 }),
      '/api/automation-proposals?status=pending-review': () => ({ ok: false, status: 500 }),
    });
    const snapshot = await fetchAutomationsSnapshot();
    expect(snapshot.automationCatalog).toBeNull();
    expect(snapshot.proposals).toBeNull();
    expect(snapshot.proposalRefreshFailed).toBe(true);
  });

  it('marks proposalRefreshFailed when the proposals request itself throws', async () => {
    const fn = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/automation-proposals?status=pending-review') throw new TypeError('network down');
      if (url === '/api/routines') return { ok: true, json: async () => ({ routines: [] }) } as unknown as Response;
      if (url === '/api/projects') return { ok: true, json: async () => ({ projects: [] }) } as unknown as Response;
      if (url === '/api/automation-templates') return { ok: true, json: async () => ({ templates: [] }) } as unknown as Response;
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    const snapshot = await fetchAutomationsSnapshot();
    expect(snapshot.proposals).toBeNull();
    expect(snapshot.proposalRefreshFailed).toBe(true);
  });

  it('defaults automationCatalog/proposals to [] when the response omits the array field', async () => {
    mockFetch({
      '/api/routines': () => ({ ok: true, json: async () => ({ routines: [] }) }),
      '/api/projects': () => ({ ok: true, json: async () => ({ projects: [] }) }),
      '/api/automation-templates': () => ({ ok: true, json: async () => ({}) }),
      '/api/automation-proposals?status=pending-review': () => ({ ok: true, json: async () => ({}) }),
    });
    const snapshot = await fetchAutomationsSnapshot();
    expect(snapshot.automationCatalog).toEqual([]);
    expect(snapshot.proposals).toEqual([]);
  });

  it('defaults routines to [] when the response omits the array field', async () => {
    mockFetch({
      '/api/routines': () => ({ ok: true, json: async () => ({}) }),
      '/api/projects': () => ({ ok: true, json: async () => ({ projects: [] }) }),
      '/api/automation-templates': () => ({ ok: true, json: async () => ({ templates: [] }) }),
      '/api/automation-proposals?status=pending-review': () => ({ ok: true, json: async () => ({ proposals: [] }) }),
    });
    expect((await fetchAutomationsSnapshot()).routines).toEqual([]);
  });

  it('marks automationCatalog null (without proposalRefreshFailed) when the templates request itself throws', async () => {
    const fn = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/automation-templates') throw new TypeError('network down');
      if (url === '/api/routines') return { ok: true, json: async () => ({ routines: [] }) } as unknown as Response;
      if (url === '/api/projects') return { ok: true, json: async () => ({ projects: [] }) } as unknown as Response;
      if (url === '/api/automation-proposals?status=pending-review') {
        return { ok: true, json: async () => ({ proposals: [] }) } as unknown as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    const snapshot = await fetchAutomationsSnapshot();
    expect(snapshot.automationCatalog).toBeNull();
    expect(snapshot.proposalRefreshFailed).toBe(false);
  });

  it('defaults an ok projects response with no `projects` field to []', async () => {
    mockFetch({
      '/api/routines': () => ({ ok: true, json: async () => ({ routines: [] }) }),
      '/api/projects': () => ({ ok: true, json: async () => ({}) }),
      '/api/automation-templates': () => ({ ok: true, json: async () => ({ templates: [] }) }),
      '/api/automation-proposals?status=pending-review': () => ({ ok: true, json: async () => ({ proposals: [] }) }),
    });
    expect((await fetchAutomationsSnapshot()).projects).toEqual([]);
  });
});

describe('runRoutineNow', () => {
  it('returns the parsed body on a 200', async () => {
    mockFetch({
      '/api/routines/r1/run': () => ({ ok: true, json: async () => ({ projectId: 'p1', conversationId: 'c1' }) }),
    });
    expect(await runRoutineNow('r1')).toEqual({ projectId: 'p1', conversationId: 'c1' });
  });

  it('treats a 202 (queued) as success even without a body', async () => {
    mockFetch({ '/api/routines/r1/run': () => ({ ok: false, status: 202, json: async () => null }) });
    expect(await runRoutineNow('r1')).toBeNull();
  });

  it('throws the daemon error message on a real failure status', async () => {
    mockFetch({ '/api/routines/r1/run': () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) }) });
    await expect(runRoutineNow('r1')).rejects.toThrow('boom');
  });

  it('falls back to a generic message when the error body is unparsable', async () => {
    mockFetch({
      '/api/routines/r1/run': () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('bad json');
        },
      }),
    });
    await expect(runRoutineNow('r1')).rejects.toThrow('run failed: 500');
  });

  it('returns null when the success response body is unparsable', async () => {
    mockFetch({
      '/api/routines/r1/run': () => ({
        ok: true,
        json: async () => {
          throw new Error('bad json');
        },
      }),
    });
    expect(await runRoutineNow('r1')).toBeNull();
  });
});

describe('toggleRoutinePaused', () => {
  it('PATCHes the inverse of the current enabled flag', async () => {
    const fn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ enabled: false });
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    await toggleRoutinePaused({ id: 'r1', enabled: true } as never);
    expect(fn).toHaveBeenCalledWith('/api/routines/r1', expect.objectContaining({ method: 'PATCH' }));
  });

  it('throws the daemon error message on failure', async () => {
    mockFetch({ '/api/routines/r1': () => ({ ok: false, status: 500, json: async () => ({ error: 'update boom' }) }) });
    await expect(toggleRoutinePaused({ id: 'r1', enabled: true } as never)).rejects.toThrow('update boom');
  });

  it('falls back to a generic message when the error body has no `error` field', async () => {
    mockFetch({ '/api/routines/r1': () => ({ ok: false, status: 500, json: async () => ({}) }) });
    await expect(toggleRoutinePaused({ id: 'r1', enabled: true } as never)).rejects.toThrow('update failed: 500');
  });

  it('falls back to a generic message when the error body is unparsable', async () => {
    mockFetch({
      '/api/routines/r1': () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('bad json');
        },
      }),
    });
    await expect(toggleRoutinePaused({ id: 'r1', enabled: true } as never)).rejects.toThrow('update failed: 500');
  });
});

describe('deleteRoutine', () => {
  it('DELETEs the routine and resolves on success', async () => {
    mockFetch({ '/api/routines/r1': () => ({ ok: true }) });
    await expect(deleteRoutine('r1')).resolves.toBeUndefined();
  });

  it('throws the daemon error message on failure', async () => {
    mockFetch({ '/api/routines/r1': () => ({ ok: false, status: 500, json: async () => ({ error: 'delete boom' }) }) });
    await expect(deleteRoutine('r1')).rejects.toThrow('delete boom');
  });

  it('falls back to a generic message when the error body is unparsable', async () => {
    mockFetch({
      '/api/routines/r1': () => ({
        ok: false,
        status: 404,
        json: async () => {
          throw new Error('bad json');
        },
      }),
    });
    await expect(deleteRoutine('r1')).rejects.toThrow('delete failed: 404');
  });
});
