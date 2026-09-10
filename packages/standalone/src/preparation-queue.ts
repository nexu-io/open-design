/** One preparation owns its queues and drains started work before releasing
 * maintenance ownership. Cancellation never exposes a partial generation. */
export function preparationQueue(limit: number, signal: AbortSignal) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    if (active >= limit) await new Promise<void>(resolve => waiting.push(resolve));
    else active++;
    try {
      signal.throwIfAborted();
      return await operation();
    } finally {
      const next = waiting.shift();
      if (next) next(); else active--;
    }
  };
}
