import { allocatePort } from "@open-design/sidecar";
import { APP_KEYS } from "@open-design/sidecar-proto";

import { parsePortOption, type ToolDevAppName } from "./config.js";

/**
 * Pre-resolve any port that more than one app needs to know up-front.
 *
 * Today this only matters for the web port: the daemon's CORS allow-list is
 * built once at startup from `OD_WEB_PORT`, so it must know the web port
 * BEFORE it spawns. When the web is launched after the daemon (the normal
 * order, since the web depends on the daemon), an unspecified `--web-port`
 * leaves the daemon blind and every browser POST gets rejected with 403.
 *
 * Allocate a free loopback port up-front when the user didn't pin one, and
 * stash it back on `options.webPort` so both `spawnDaemonRuntime` and
 * `spawnWebRuntime` see the same value.
 */
export async function ensureSharedPortsResolved(
  targets: readonly ToolDevAppName[],
  options: { webPort?: number | string | null },
): Promise<void> {
  if (!targets.includes(APP_KEYS.WEB)) return;
  if (parsePortOption(options.webPort, "--web-port") != null) return;
  const allocation = await allocatePort({ label: "web" });
  options.webPort = allocation.port;
}
