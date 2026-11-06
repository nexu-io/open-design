import { expect } from '@playwright/test';

export async function expectStableCount(
  readCount: () => number | Promise<number>,
  expected: number,
  options: {
    timeout?: number;
    interval?: number;
    message?: string;
  } = {},
): Promise<void> {
  const observationMs = options.timeout ?? 1_000;
  const intervalMs = options.interval ?? 100;
  const stableToken = `stable:${expected}`;
  const deadline = Date.now() + observationMs;

  await expect
    .poll(async () => {
      const current = await readCount();
      if (current !== expected) return `changed:${current}`;
      return Date.now() >= deadline ? stableToken : `observing:${current}`;
    }, {
      timeout: observationMs + intervalMs + 500,
      intervals: [intervalMs],
      message: options.message ?? `expected count to remain ${expected}`,
    })
    .toBe(stableToken);
}
