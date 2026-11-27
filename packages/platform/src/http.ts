/**
 * @module http
 *
 * HTTP readiness polling. Waits for a URL to return an OK response, used to
 * gate on a spawned service becoming reachable. Keeps a private `errorMessage`
 * copy so it owns no cross-module runtime surface.
 */
import { setTimeout as sleep } from "node:timers/promises";

export type HttpWaitOptions = {
  timeoutMs?: number;
};

/** @internal Extract a human-readable message from an unknown thrown value. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Poll a URL until it returns an OK (2xx) response or the timeout elapses,
 * retrying on both non-OK statuses and fetch errors.
 *
 * @param url - The URL to poll.
 * @param options - `timeoutMs` maximum wait in milliseconds (default 20000).
 * @returns `true` once an OK response is received.
 * @throws When the timeout elapses without an OK response (message includes the last error).
 */
export async function waitForHttpOk(url: string, { timeoutMs = 20000 }: HttpWaitOptions = {}): Promise<true> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  let lastError: Error | null = null;
  try {
    while (Date.now() - startedAt < timeoutMs && !controller.signal.aborted) {
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        // Readiness needs only the status. Release streaming bodies without
        // letting a slow or failed cancellation extend the readiness deadline.
        void response.body?.cancel().catch(() => undefined);
        if (controller.signal.aborted) break;
        if (response.ok) return true;
        lastError = new Error(`HTTP ${response.status} from ${url}`);
      } catch (error) {
        lastError = new Error(errorMessage(error));
      }
      const remaining = timeoutMs - (Date.now() - startedAt);
      if (remaining <= 0 || controller.signal.aborted) break;
      try {
        await sleep(Math.min(150, remaining), undefined, { signal: controller.signal });
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      }
    }
    throw new Error(`timed out waiting for ${url}${lastError ? ` (${lastError.message})` : ""}`);
  } finally {
    clearTimeout(deadline);
  }
}
