import { describe, expect, it, vi } from 'vitest';

import { createGroundedPptxPreviewService } from '../../src/pptx-grounded/preview-service.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('grounded PPTX preview service', () => {
  it('coalesces identical requests and caches the rendered preview', async () => {
    const gate = deferred<{ png: Uint8Array }>();
    const loadRevision = vi.fn(async () => new Uint8Array([1]));
    const render = vi.fn(() => gate.promise);
    const service = createGroundedPptxPreviewService({ loadRevision, render, maxConcurrency: 2, cacheEntries: 8 });

    const first = service.preview('/project', 'r0001', 0);
    const second = service.preview('/project', 'r0001', 0);
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    gate.resolve({ png: new Uint8Array([9]) });
    expect(await first).toEqual(new Uint8Array([9]));
    expect(await second).toEqual(new Uint8Array([9]));
    expect(await service.preview('/project', 'r0001', 0)).toEqual(new Uint8Array([9]));
    expect(loadRevision).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('bounds peak native render concurrency', async () => {
    let active = 0;
    let peak = 0;
    const gates = Array.from({ length: 6 }, () => deferred<{ png: Uint8Array }>());
    const render = vi.fn(async (_bytes: Uint8Array, index: number) => {
      active += 1;
      peak = Math.max(peak, active);
      const result = await gates[index]!.promise;
      active -= 1;
      return result;
    });
    const service = createGroundedPptxPreviewService({
      loadRevision: async () => new Uint8Array([1]), render, maxConcurrency: 2, cacheEntries: 8,
    });
    const requests = gates.map((_, index) => service.preview('/project', 'r0001', index));
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
    for (let index = 0; index < gates.length; index += 1) {
      gates[index]!.resolve({ png: new Uint8Array([index]) });
      if (index < gates.length - 2) await vi.waitFor(() => expect(render.mock.calls.length).toBeGreaterThan(index + 2));
    }
    await Promise.all(requests);
    expect(peak).toBe(2);
  });

  it('retains unresolved work for coalescing and rejects queue overload', async () => {
    const gates = Array.from({ length: 3 }, () => deferred<{ png: Uint8Array }>());
    const render = vi.fn((_bytes: Uint8Array, index: number) => gates[index]!.promise);
    const service = createGroundedPptxPreviewService({
      loadRevision: async () => new Uint8Array([1]), render,
      maxConcurrency: 1, maxQueue: 1, cacheEntries: 1,
    });
    const active = service.preview('/project', 'r0001', 0);
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    const queued = service.preview('/project', 'r0001', 1);
    expect(service.preview('/project', 'r0001', 1)).toBe(queued);
    await expect(service.preview('/project', 'r0001', 2)).rejects.toMatchObject({ status: 429 });
    gates[0]!.resolve({ png: new Uint8Array([0]) });
    await active;
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2));
    gates[1]!.resolve({ png: new Uint8Array([1]) });
    await queued;
  });

  it('bounds each result and the completed cache by bytes', async () => {
    const render = vi.fn(async (_bytes: Uint8Array, index: number) => ({
      png: new Uint8Array(index === 2 ? 5 : 3).fill(index),
    }));
    const service = createGroundedPptxPreviewService({
      loadRevision: async () => new Uint8Array([1]), render,
      maxResultBytes: 4, maxCacheBytes: 4, cacheEntries: 8,
    });
    await service.preview('/project', 'r0001', 0);
    await service.preview('/project', 'r0001', 1);
    await service.preview('/project', 'r0001', 0);
    expect(render).toHaveBeenCalledTimes(3);
    await expect(service.preview('/project', 'r0001', 2)).rejects.toMatchObject({ status: 413 });
  });
});
