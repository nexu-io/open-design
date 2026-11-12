import type { SidecarConnection } from "@open-design/sidecar";
import {
  APP_KEYS,
  SIDECAR_MESSAGES,
  type RegisterDesktopAuthResult,
} from "@open-design/sidecar-proto";

/**
 * Startup registration runs before the window loads, and a missed startup
 * window self-heals through the lazy DESKTOP_AUTH_PENDING path, so it stays a
 * single short attempt.
 */
export const DESKTOP_AUTH_STARTUP_TIMEOUT_MS = 800;
/**
 * On-demand registration (folder picker / import). A freshly restarted or
 * busy daemon — and the native Windows picker (#8503, #8600) — can deliver a
 * valid acknowledgement well after 800 ms; it must not read as a rejection.
 */
export const DESKTOP_AUTH_TIMEOUT_MS = 5_000;
export const DESKTOP_AUTH_RETRY_DELAY_MS = 250;
const DESKTOP_AUTH_RETRY_ATTEMPTS = 2;

export type DesktopAuthLogger = {
  warn: (message: string, meta?: Record<string, unknown>) => void;
};

export type RegisterDesktopAuthOptions = {
  /** On-demand registration: longer deadline and one retry. */
  retry?: boolean;
  logger?: DesktopAuthLogger | null;
  retryDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Register the desktop-auth secret with the daemon. Resolves true only on a
 * positive acknowledgement; transport errors and rejections resolve false.
 * The final failure reason is logged; the secret never is.
 */
export async function registerDesktopAuthWithDaemon(
  client: Pick<SidecarConnection, "invoke">,
  secret: Buffer,
  options: RegisterDesktopAuthOptions = {},
): Promise<boolean> {
  const retry = options.retry === true;
  const attempts = retry ? DESKTOP_AUTH_RETRY_ATTEMPTS : 1;
  const timeoutMs = retry ? DESKTOP_AUTH_TIMEOUT_MS : DESKTOP_AUTH_STARTUP_TIMEOUT_MS;
  const sleep = options.sleep ?? defaultSleep;
  const logger = options.logger === undefined ? console : options.logger;
  let lastFailure = "not accepted";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await client.invoke<RegisterDesktopAuthResult>(
        APP_KEYS.DAEMON,
        SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH,
        { secret: secret.toString("base64") },
        { timeoutMs },
      );
      if (result.accepted === true) return true;
      lastFailure = "not accepted";
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    if (attempt < attempts) await sleep(options.retryDelayMs ?? DESKTOP_AUTH_RETRY_DELAY_MS);
  }
  logger?.warn("desktop auth handshake with the daemon failed", {
    attempts,
    reason: lastFailure,
    timeoutMs,
  });
  return false;
}
