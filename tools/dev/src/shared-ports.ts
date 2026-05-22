import { allocatePort } from "@open-design/sidecar";
import { APP_KEYS } from "@open-design/sidecar-proto";

import { parsePortOption, type ToolDevAppName, type ToolDevOptions } from "./config.js";

export async function ensureSharedPortsResolved(
  targets: readonly ToolDevAppName[],
  options: Pick<ToolDevOptions, "daemonPort" | "webPort">,
  runningWebUrl?: string | null,
): Promise<void> {
  if (!targets.includes(APP_KEYS.WEB)) return;
  const daemonPort = parsePortOption(options.daemonPort, "--daemon-port");
  if (parsePortOption(options.webPort, "--web-port") != null) return;
  if (runningWebUrl != null) {
    const url = new URL(runningWebUrl);
    options.webPort = String(url.port || (url.protocol === "https:" ? 443 : 80));
    return;
  }

  const { port } = await allocatePort({
    host: "127.0.0.1",
    label: "web",
    reserved: daemonPort == null ? new Set<number>() : new Set([daemonPort]),
  });
  options.webPort = String(port);
}
