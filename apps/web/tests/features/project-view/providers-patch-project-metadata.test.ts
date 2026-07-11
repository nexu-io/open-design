// The patch-project-metadata transport is a best-effort fire-and-forget
// `fetch` PATCH; mock the global `fetch` to pin the request shape and the
// swallow-on-error contract (mirrors providers-memory-extract.test.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  patchProjectMetadata,
  patchProjectName,
} from '../../../src/providers/project-view/patch-project-metadata';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('patchProjectMetadata transport', () => {
  it('PATCHes { metadata } as JSON to /api/projects/:id', async () => {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ project: {} }),
    }) as unknown as Response);
    globalThis.fetch = fn as unknown as typeof fetch;

    await patchProjectMetadata('p1', { kind: 'other', designSystemReview: {} });

    expect(fn).toHaveBeenCalledOnce();
    const call = fn.mock.calls[0]!;
    const init = call[1]!;
    expect(String(call[0])).toBe('/api/projects/p1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({
      metadata: { kind: 'other', designSystemReview: {} },
    });
  });

  it('URL-encodes the project id', async () => {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ project: {} }),
    }) as unknown as Response);
    globalThis.fetch = fn as unknown as typeof fetch;

    await patchProjectMetadata('p/1', { kind: 'other' });

    const call = fn.mock.calls[0]!;
    expect(String(call[0])).toBe('/api/projects/p%2F1');
  });

  it('never rejects when the fetch throws (best-effort contract)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(patchProjectMetadata('p1', { kind: 'other' })).resolves.toBeUndefined();
  });

  it('never rejects when the response is not ok (best-effort contract)', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false }) as unknown as Response);
    await expect(patchProjectMetadata('p1', { kind: 'other' })).resolves.toBeUndefined();
  });
});

describe('patchProjectName transport', () => {
  it('PATCHes { name, metadata } as JSON to /api/projects/:id', async () => {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ project: {} }),
    }) as unknown as Response);
    globalThis.fetch = fn as unknown as typeof fetch;

    await patchProjectName('p1', { name: 'New Name', metadata: { kind: 'other', nameSource: 'user' } });

    expect(fn).toHaveBeenCalledOnce();
    const call = fn.mock.calls[0]!;
    const init = call[1]!;
    expect(String(call[0])).toBe('/api/projects/p1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'New Name',
      metadata: { kind: 'other', nameSource: 'user' },
    });
  });

  it('omits metadata when not provided', async () => {
    const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ project: {} }),
    }) as unknown as Response);
    globalThis.fetch = fn as unknown as typeof fetch;

    await patchProjectName('p1', { name: 'New Name' });

    const call = fn.mock.calls[0]!;
    const init = call[1]!;
    expect(JSON.parse(String(init.body))).toEqual({ name: 'New Name' });
  });

  it('never rejects when the fetch throws (best-effort contract)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(patchProjectName('p1', { name: 'New Name' })).resolves.toBeUndefined();
  });

  it('never rejects when the response is not ok (best-effort contract)', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false }) as unknown as Response);
    await expect(patchProjectName('p1', { name: 'New Name' })).resolves.toBeUndefined();
  });
});
