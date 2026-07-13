// Transport adapters for creating and updating a routine from the automation
// modal.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CreateRoutineRequest, UpdateRoutineRequest } from '@open-design/contracts';

import { createRoutine, updateRoutine } from '../../../src/providers/routines/submit';

const originalFetch = globalThis.fetch;

const createBody: CreateRoutineRequest = {
  name: 'Daily digest',
  prompt: 'Summarize the day.',
  schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
  target: { mode: 'create_each_run' },
  skillId: null,
  context: {},
  enabled: true,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('createRoutine', () => {
  it('POSTs the body and returns the created routine', async () => {
    const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe('/api/routines');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual(createBody);
      return { ok: true, json: async () => ({ routine: { id: 'r1' } }) } as unknown as Response;
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    expect(await createRoutine(createBody)).toEqual({ id: 'r1' });
  });

  it('throws the daemon error message on failure', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'create boom' }),
    })) as unknown as typeof fetch;
    await expect(createRoutine(createBody)).rejects.toThrow('create boom');
  });

  it('falls back to a generic message when the error body is unparsable', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('bad json');
      },
    })) as unknown as typeof fetch;
    await expect(createRoutine(createBody)).rejects.toThrow('create failed: 500');
  });
});

describe('updateRoutine', () => {
  const updateBody: UpdateRoutineRequest = { name: 'Renamed' };

  it('PATCHes the routine by id and returns the updated routine', async () => {
    const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe('/api/routines/r1');
      expect(init?.method).toBe('PATCH');
      expect(JSON.parse(String(init?.body))).toEqual(updateBody);
      return { ok: true, json: async () => ({ routine: { id: 'r1', name: 'Renamed' } }) } as unknown as Response;
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    expect(await updateRoutine('r1', updateBody)).toEqual({ id: 'r1', name: 'Renamed' });
  });

  it('throws the daemon error message on failure', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: 'update boom' }),
    })) as unknown as typeof fetch;
    await expect(updateRoutine('r1', updateBody)).rejects.toThrow('update boom');
  });

  it('falls back to a generic message when the error body is unparsable', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => {
        throw new Error('bad json');
      },
    })) as unknown as typeof fetch;
    await expect(updateRoutine('r1', updateBody)).rejects.toThrow('update failed: 404');
  });

  it('URL-encodes the routine id', async () => {
    const fn = vi.fn(async (input: RequestInfo | URL) => {
      expect(input.toString()).toBe('/api/routines/r%2F1');
      return { ok: true, json: async () => ({ routine: { id: 'r/1' } }) } as unknown as Response;
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    await updateRoutine('r/1', updateBody);
  });
});
