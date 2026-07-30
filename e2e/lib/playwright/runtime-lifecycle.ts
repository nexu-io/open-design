// Reserve an extra minute beyond start + warmup + stop command budgets so
// Playwright can finish fixture bookkeeping without cutting teardown short.
export const PLAYWRIGHT_TOOLS_DEV_FIXTURE_TIMEOUT_MS = 390_000;
export const PLAYWRIGHT_WEB_WARMUP_TIMEOUT_MS = 120_000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function warmPlaywrightWebRuntime(
  url: string,
  options: {
    fetch?: FetchLike;
    timeoutMs?: number;
  } = {},
): Promise<void> {
  const fetchRuntime = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? PLAYWRIGHT_WEB_WARMUP_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeoutMs);

  let response: Response;
  try {
    response = await fetchRuntime(url, { signal });
  } catch (error) {
    if (signal.aborted) {
      throw new Error(`Playwright web warmup timed out after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Playwright web warmup failed with ${response.status} ${response.statusText}`);
  }
  await response.arrayBuffer();
}
