// Reserve an extra minute beyond start + web/daemon warmup + stop budgets so
// Playwright can finish fixture bookkeeping without cutting teardown short.
// Budgets: 180s start + 120s web warmup + 60s daemon warmup + 30s stop + 60s
// bookkeeping = 450s.
export const PLAYWRIGHT_TOOLS_DEV_FIXTURE_TIMEOUT_MS = 450_000;
export const PLAYWRIGHT_WEB_WARMUP_TIMEOUT_MS = 120_000;
export const PLAYWRIGHT_DAEMON_WARMUP_TIMEOUT_MS = 60_000;

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

/**
 * Block the Playwright worker until the daemon HTTP surface can serve
 * `/api/health`. The suite previously only warmed the web HTML shell, so the
 * first API-backed action in a worker (usually `POST /api/projects`) raced
 * daemon listen readiness and each call site invented its own retry loop.
 */
export async function warmPlaywrightDaemonRuntime(
  healthUrl: string,
  options: {
    fetch?: FetchLike;
    timeoutMs?: number;
    intervalMs?: number;
  } = {},
): Promise<void> {
  const fetchRuntime = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? PLAYWRIGHT_DAEMON_WARMUP_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetchRuntime(healthUrl, {
        signal: AbortSignal.timeout(Math.max(250, Math.min(2_000, deadline - Date.now()))),
      });
      if (response.ok) {
        // Drain the body so keep-alive sockets stay reusable under Node fetch.
        // Body-drain failures must retry — a truncated 2xx is not readiness.
        await response.arrayBuffer();
        return;
      }
      // Consume non-OK bodies so repeated 503 probes do not leave streams open.
      await response.arrayBuffer().catch(() => undefined);
      lastError = new Error(
        `Playwright daemon warmup failed with ${response.status} ${response.statusText}`,
      );
    } catch (error) {
      lastError = error;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }

  throw new Error(`Playwright daemon warmup timed out after ${timeoutMs}ms`, {
    cause: lastError,
  });
}
