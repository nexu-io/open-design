import { GroundedPptxOverloadError } from './errors.js';

interface WorkLimiterOptions { maxConcurrency: number; maxQueue: number }

export interface GroundedPptxWorkLimiter {
  acquire(): Promise<() => void>;
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export function createGroundedPptxWorkLimiter(options: WorkLimiterOptions): GroundedPptxWorkLimiter {
  if (!Number.isSafeInteger(options.maxConcurrency) || options.maxConcurrency < 1 ||
      !Number.isSafeInteger(options.maxQueue) || options.maxQueue < 0) {
    throw new Error('invalid grounded PPTX work limits');
  }
  let active = 0;
  const queue: Array<() => void> = [];
  const acquire = async (): Promise<() => void> => {
      if (active >= options.maxConcurrency) {
        if (queue.length >= options.maxQueue) throw new GroundedPptxOverloadError();
        await new Promise<void>((resolve) => queue.push(resolve));
      }
      active += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active -= 1;
        queue.shift()?.();
      };
  };
  return {
    acquire,
    async run<T>(operation: () => Promise<T>): Promise<T> {
      const release = await acquire();
      try {
        return await operation();
      } finally {
        release();
      }
    },
  };
}

/** One limiter is shared by import, inspect, apply, and preview parse/render work. */
export const groundedPptxProcessWork = createGroundedPptxWorkLimiter({
  maxConcurrency: 2,
  maxQueue: 16,
});

/** Admission is separate from adapter permits so admitted routes cannot deadlock on nested work. */
export const groundedPptxAdmission = createGroundedPptxWorkLimiter({
  maxConcurrency: 2,
  maxQueue: 16,
});
