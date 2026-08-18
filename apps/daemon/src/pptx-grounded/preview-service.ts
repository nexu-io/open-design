import { GroundedPptxOverloadError, GroundedPptxPayloadTooLargeError } from './errors.js';
import { renderGroundedSlide } from './office-kit-adapter.js';
import { readGroundedPptxRevision, type GroundedPptxStorageLocation } from './storage.js';

interface PreviewServiceDependencies {
  loadRevision?: (projectDir: string | GroundedPptxStorageLocation, revisionId: string) => Promise<Uint8Array>;
  render?: (bytes: Uint8Array, index: number, options: { width: number }) => Promise<{ png: Uint8Array }>;
  maxConcurrency?: number;
  maxQueue?: number;
  cacheEntries?: number;
  maxCacheBytes?: number;
  maxResultBytes?: number;
}

export interface GroundedPptxPreviewService {
  preview(projectDir: string | GroundedPptxStorageLocation, revisionId: string, slideIndex: number): Promise<Uint8Array>;
}

export function createGroundedPptxPreviewService(
  dependencies: PreviewServiceDependencies = {},
): GroundedPptxPreviewService {
  const loadRevision = dependencies.loadRevision ?? readGroundedPptxRevision;
  const render = dependencies.render ?? renderGroundedSlide;
  const maxConcurrency = dependencies.maxConcurrency ?? 2;
  const maxQueue = dependencies.maxQueue ?? 32;
  const cacheEntries = dependencies.cacheEntries ?? 64;
  const maxCacheBytes = dependencies.maxCacheBytes ?? 64 * 1024 * 1024;
  const maxResultBytes = dependencies.maxResultBytes ?? 16 * 1024 * 1024;
  let active = 0;
  let cacheBytes = 0;
  const waiters: Array<() => void> = [];
  const pending = new Map<string, Promise<Uint8Array>>();
  const cache = new Map<string, Uint8Array>();

  const withPermit = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (active >= maxConcurrency) {
      if (waiters.length >= maxQueue) throw new GroundedPptxOverloadError('grounded PPTX preview queue is full');
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    active += 1;
    try {
      return await operation();
    } finally {
      active -= 1;
      waiters.shift()?.();
    }
  };

  const cacheResult = (key: string, bytes: Uint8Array) => {
    cache.set(key, bytes);
    cacheBytes += bytes.byteLength;
    while (cache.size > cacheEntries || cacheBytes > maxCacheBytes) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      const removed = cache.get(oldest)!;
      cache.delete(oldest);
      cacheBytes -= removed.byteLength;
    }
  };

  return {
    preview(projectDir, revisionId, slideIndex) {
      const projectKey = typeof projectDir === 'string' ? projectDir : `${projectDir.dataRoot}\0${projectDir.projectId}`;
      const key = `${projectKey}\0${revisionId}\0${slideIndex}`;
      const existing = pending.get(key);
      if (existing) return existing;
      const cached = cache.get(key);
      if (cached) {
        cache.delete(key);
        cache.set(key, cached);
        return Promise.resolve(cached);
      }
      if (active >= maxConcurrency && waiters.length >= maxQueue) {
        return Promise.reject(new GroundedPptxOverloadError('grounded PPTX preview queue is full'));
      }
      const work = withPermit(async () => {
        const bytes = await loadRevision(projectDir, revisionId);
        const preview = await render(bytes, slideIndex, { width: 1_280 });
        if (preview.png.byteLength > maxResultBytes) {
          throw new GroundedPptxPayloadTooLargeError('grounded PPTX preview PNG size exceeds limit');
        }
        cacheResult(key, preview.png);
        return preview.png;
      });
      pending.set(key, work);
      void work.then(
        () => { if (pending.get(key) === work) pending.delete(key); },
        () => { if (pending.get(key) === work) pending.delete(key); },
      );
      return work;
    },
  };
}
