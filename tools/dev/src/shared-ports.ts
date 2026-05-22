import { allocatePort } from "@open-design/sidecar";
import { APP_KEYS } from "@open-design/sidecar-proto";

import { parsePortOption, type ToolDevAppName, type ToolDevOptions } from "./config.js";

export async function ensureSharedPortsResolved(
  targets: readonly ToolDevAppName[],
  options: Pick<ToolDevOptions, "daemonPort" | "webPort">,
  runningWebUrl?: string | null,
): Promise<void> {
  if (!targets.includes(APP_KEYS.WEB)) return;
  const daemonRequested = targets.includes(APP_KEYS.DAEMON);
  const reserved = new Set<number>();
  const daemonPort = parsePortOption(options.daemonPort, "--daemon-port");
  if (daemonPort != null) reserved.add(daemonPort);
  if (daemonRequested && daemonPort == null) {
    const allocation = await allocatePort({
      host: "127.0.0.1",
      label: "daemon",
      reserved,
    });
    options.daemonPort = String(allocation.port);
  }
  if (parsePortOption(options.webPort, "--web-port") != null) return;
  if (runningWebUrl != null) {
    const url = new URL(runningWebUrl);
    options.webPort = String(url.port || (url.protocol === "https:" ? 443 : 80));
    return;
  }

  const { port } = await allocatePort({
    host: "127.0.0.1",
    label: "web",
    reserved,
  });
  options.webPort = String(port);
}
