import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_DEFAULTS,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  type DaemonStatusSnapshot,
} from "@open-design/sidecar-proto";
import { requestJsonIpc, resolveAppIpcPath } from "@open-design/sidecar";

export const MCP_DEFAULT_DAEMON_URL = "http://127.0.0.1:7456";

export interface ResolveMcpDaemonUrlOptions {
  /** Value passed via `--daemon-url`. Empty string is treated as unset. */
  flagUrl?: string | null;
  /** Defaults to `process.env`; injected for tests. */
  env?: NodeJS.ProcessEnv;
  /** IPC discovery timeout. Short by default so an absent daemon does not stall MCP startup. */
  timeoutMs?: number;
}

/**
 * Resolve the daemon HTTP base URL for `od mcp`.
 *
 * Spawn order: explicit `--daemon-url` flag, `OD_DAEMON_URL` env, then
 * a STATUS roundtrip to the sidecar IPC socket the running daemon
 * already publishes (`/tmp/open-design/ipc/<namespace>/daemon.sock`).
 * Falls back to the legacy default for direct `od` launches that do
 * not run as a sidecar. Discovery means the install snippet never has
 * to bake a port: every spawn rediscovers the live URL, so an
 * ephemeral daemon port (tools-dev, packaged) cannot invalidate a
 * previously-installed MCP client config.
 */
export async function resolveMcpDaemonUrl(
  options: ResolveMcpDaemonUrlOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const flagUrl = options.flagUrl ?? null;
  if (flagUrl != null && flagUrl.length > 0) return flagUrl;
  const envUrl = env.OD_DAEMON_URL;
  if (envUrl != null && envUrl.length > 0) return envUrl;
  const discovered = await discoverDaemonUrlFromIpc(env, options.timeoutMs ?? 800);
  if (discovered != null) return discovered;
  return MCP_DEFAULT_DAEMON_URL;
}

async function discoverDaemonUrlFromIpc(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<string | null> {
  try {
    const socketPath = resolveAppIpcPath({
      app: APP_KEYS.DAEMON,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      env,
      namespace: env[SIDECAR_ENV.NAMESPACE] ?? SIDECAR_DEFAULTS.namespace,
    });
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
