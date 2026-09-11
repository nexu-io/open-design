/** Preserve input order, stop scheduling on failure, and drain active writes
 * before returning so callers can safely release files and transports. */
export async function mapWithConcurrency<T, R>(
  values: readonly T[], concurrency: number, mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error("invalid concurrency limit");
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  let failure: { error: unknown } | undefined;
  async function worker(): Promise<void> {
    while (failure == null) {
      const index = nextIndex++;
      if (index >= values.length) return;
      try { results[index] = await mapper(values[index]!, index); }
      catch (error) { failure ??= { error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  if (failure != null) throw failure.error;
  return results;
}
