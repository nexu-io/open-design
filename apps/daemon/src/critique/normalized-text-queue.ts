/** Small single-consumer queue for decoded assistant-text chunks. */
export class NormalizedTextQueue implements AsyncIterable<string> {
  private values: string[] = [];
  private bytes = 0;
  private waiter: {
    resolve: (result: IteratorResult<string>) => void;
    reject: (error: Error) => void;
  } | null = null;
  private ended = false;
  private failure: Error | null = null;

  push(value: string): boolean {
    if (this.ended || this.failure || value.length === 0) return false;
    const waiting = this.waiter;
    if (waiting) {
      this.waiter = null;
      waiting.resolve({ value, done: false });
      return true;
    }
    // Text chunks are UTF-16 strings here; the bound is intentionally on
    // retained characters, not transport bytes.
    if (this.bytes + value.length > 512 * 1024) {
      this.fail(new Error('Design Jury normalized-text queue exceeded its bounded capacity'));
      return false;
    }
    const last = this.values.length - 1;
    if (last >= 0 && this.values.length >= 128) {
      this.values[last] += value;
    } else {
      this.values.push(value);
    }
    this.bytes += value.length;
    return true;
  }

  close(): void {
    if (this.ended || this.failure) return;
    this.ended = true;
    if (this.waiter && this.values.length === 0) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter.resolve({ value: undefined, done: true });
    }
  }

  fail(error: Error): void {
    if (this.ended || this.failure) return;
    this.failure = error;
    if (this.waiter) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter.reject(error);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: async (): Promise<IteratorResult<string>> => {
        if (this.values.length > 0) {
          const value = this.values.shift()!;
          this.bytes -= value.length;
          return { value, done: false };
        }
        if (this.failure) throw this.failure;
        if (this.ended) return { value: undefined, done: true };
        return new Promise<IteratorResult<string>>((resolve, reject) => {
          this.waiter = { resolve, reject };
        });
      },
      return: async (): Promise<IteratorResult<string>> => {
        this.close();
        return { value: undefined, done: true };
      },
    };
  }
}
