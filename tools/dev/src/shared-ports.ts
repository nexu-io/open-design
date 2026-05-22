import { allocatePort } from "@open-design/sidecar";
import { APP_KEYS } from "@open-design/sidecar-proto";

import { parsePortOption, type ToolDevAppName, type ToolDevOptions } from "./config.js";

type RunningUrlLookup = () => Promise<string | null | undefined>;
type AllocatePortFn = typeof allocatePort;

function portFromUrl(url: string | null | undefined): number | null {
  if (url == null) return null;
  const parsed = new URL(url);
  if (parsed.port.length > 0) return Number(parsed.port);
  return parsed.protocol === "https:" ? 443 : 80;
}

export async function ensureSharedPortsResolved(
  targets: readonly ToolDevAppName[],
  options: Pick<ToolDevOptions, "daemonPort" | "webPort">,
  runningWebUrl?: string | null,
  runningDaemonUrl?: string | null,
  allocate: AllocatePortFn = allocatePort,
): Promise<void> {
  if (!targets.includes(APP_KEYS.WEB)) return;
  const daemonRequested = targets.includes(APP_KEYS.DAEMON);
  const reserved = new Set<number>();
  const webPort = parsePortOption(options.webPort, "--web-port");
  if (webPort != null) reserved.add(webPort);
  let daemonPort = parsePortOption(options.daemonPort, "--daemon-port");
  if (daemonRequested && daemonPort == null) {
    daemonPort = portFromUrl(runningDaemonUrl);
    if (daemonPort != null) {
      options.daemonPort = String(daemonPort);
    }
  }
  if (daemonPort != null) reserved.add(daemonPort);
  if (daemonRequested && daemonPort == null) {
    const allocation = await allocate({
      host: "127.0.0.1",
      label: "daemon",
      reserved,
    });
    daemonPort = allocation.port;
    reserved.add(daemonPort);
    options.daemonPort = String(daemonPort);
  }
  if (webPort != null) return;
  if (runningWebUrl != null) {
    const url = new URL(runningWebUrl);
    options.webPort = String(url.port || (url.protocol === "https:" ? 443 : 80));
    return;
  }

  const { port } = await allocate({
    host: "127.0.0.1",
    label: "web",
    reserved,
  });
  options.webPort = String(port);
}

export async function resolveSharedPortsFromRunningState(
  targets: readonly ToolDevAppName[],
  options: Pick<ToolDevOptions, "daemonPort" | "webPort">,
  urls: { daemonUrl?: RunningUrlLookup; webUrl?: RunningUrlLookup },
): Promise<void> {
  const runningDaemonUrl = targets.includes(APP_KEYS.DAEMON) ? ((await urls.daemonUrl?.()) ?? null) : null;
  const runningWebUrl = targets.includes(APP_KEYS.WEB) ? ((await urls.webUrl?.()) ?? null) : null;
  await ensureSharedPortsResolved(targets, options, runningWebUrl, runningDaemonUrl);
}
