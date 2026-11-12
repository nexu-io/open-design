import type { PackagedDesktopLogger } from "./logging.js";

export const DESKTOP_AUTH_TIMEOUT_MS = 3000;
export const DESKTOP_AUTH_RETRY_DELAY_MS = 250;
const DESKTOP_AUTH_ATTEMPTS = 2;

export type RegisterDesktopAuthOptions = {
  /** Resolves true when the daemon accepted the secret; rejects on transport failure. */
  attempt: () => Promise<boolean>;
  logger?: Pick<PackagedDesktopLogger, "warn"> | null;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Register the desktop-auth secret with the daemon, retrying once. A freshly
 * restarted daemon can be busy loading plugins and miss a single short
 * handshake, which otherwise fails the folder picker. The secret is never
 * logged; only the error message of the final failure is recorded.
 */
export async function registerDesktopAuthWithRetry(options: RegisterDesktopAuthOptions): Promise<boolean> {
  const sleep = options.sleep ?? defaultSleep;
  const retryDelayMs = options.retryDelayMs ?? DESKTOP_AUTH_RETRY_DELAY_MS;
  let lastFailure = "not accepted";
  for (let attempt = 1; attempt <= DESKTOP_AUTH_ATTEMPTS; attempt += 1) {
    try {
      if (await options.attempt()) return true;
      lastFailure = "not accepted";
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    if (attempt < DESKTOP_AUTH_ATTEMPTS) await sleep(retryDelayMs);
  }
  options.logger?.warn("desktop auth handshake with the daemon failed", {
    attempts: DESKTOP_AUTH_ATTEMPTS,
    reason: lastFailure,
  });
  return false;
}
