import {
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  type DaemonStatusSnapshot,
} from "@open-design/sidecar-proto";
import { requestJsonIpc } from "@open-design/sidecar";

export const DEFAULT_DAEMON_URL = "http://127.0.0.1:7456";

export interface ResolveDaemonUrlOptions {
  /** Value passed via `--daemon-url`. Empty string is treated as unset. */
  flagUrl?: string | null;
  /** Defaults to `process.env`; injected for tests. */
  env?: NodeJS.ProcessEnv;
  /** IPC discovery timeout. Short by default so an absent daemon does not stall CLI startup. */
  timeoutMs?: number;
}

/**
 * Resolve the daemon HTTP base URL for `od` client commands.
 *
 * Spawn order: explicit `--daemon-url` flag, `OD_DAEMON_URL` env, then
 * a STATUS roundtrip to the concrete sidecar IPC endpoint supplied by
 * the lifecycle owner in `OD_SIDECAR_IPC_PATH`. Falls back to the
 * legacy default for direct `od` launches that do not run as a sidecar.
 */
export async function resolveDaemonUrl(
  options: ResolveDaemonUrlOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const flagUrl = options.flagUrl ?? null;
  if (flagUrl != null && flagUrl.length > 0) return flagUrl;
  const envUrl = env.OD_DAEMON_URL;
  if (envUrl != null && envUrl.length > 0) return envUrl;
  const discovered = await discoverDaemonUrlFromIpc(env, options.timeoutMs ?? 800);
  if (discovered != null) return discovered;
  return DEFAULT_DAEMON_URL;
}

async function discoverDaemonUrlFromIpc(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<string | null> {
  const socketPath = env[SIDECAR_ENV.IPC_PATH];
  if (socketPath == null || socketPath.length === 0) return null;
  try {
    const status = await requestJsonIpc<DaemonStatusSnapshot>(
      socketPath,
      { type: SIDECAR_MESSAGES.STATUS },
      { timeoutMs },
    );
    return status?.url ?? null;
  } catch {
    return null;
  }
}
