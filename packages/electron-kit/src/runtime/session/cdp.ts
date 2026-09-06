import { readFileSync } from "node:fs";
import { join, sep } from "node:path";

export type ElectronCdpDiscovery =
  | Readonly<{ state: "disabled" }>
  | Readonly<{ state: "starting"; transport: "tcp" }>
  | Readonly<{
      state: "ready";
      transport: "tcp";
      address: string;
      port: number;
      discoveryUrl: string;
      browserWebSocketUrl: string | null;
    }>;

export type ElectronCdpApp = Readonly<{
  commandLine: Readonly<{
    getSwitchValue(name: string): string;
    hasSwitch(name: string): boolean;
  }>;
  getPath(name: "userData"): string;
}>;

function tcpUrl(address: string, port: number): string {
  const host = address.includes(":") && !address.startsWith("[") ? `[${address}]` : address;
  return `http://${host}:${port}`;
}

export function parseElectronCdpActivePort(value: string, address = "127.0.0.1"): ElectronCdpDiscovery {
  const [rawPort, rawBrowserPath] = value.trim().split(/\r?\n/u, 2);
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Electron CDP active port is invalid");
  const browserPath = rawBrowserPath?.trim();
  if (browserPath != null && browserPath.length > 0 && !browserPath.startsWith("/")) {
    throw new Error("Electron CDP browser path is invalid");
  }
  const discoveryUrl = tcpUrl(address, port);
  return Object.freeze({
    state: "ready",
    transport: "tcp",
    address,
    port,
    discoveryUrl,
    browserWebSocketUrl: browserPath == null || browserPath.length === 0
      ? null
      : `ws://${address.includes(":") && !address.startsWith("[") ? `[${address}]` : address}:${port}${browserPath}`,
  });
}

/** Project Electron's native remote-debugging switches without owning CDP. */
export function inspectElectronCdp(app: ElectronCdpApp, bootstrapUserDataRoot = app.getPath("userData")): ElectronCdpDiscovery {
  if (!app.commandLine.hasSwitch("remote-debugging-port")) return Object.freeze({ state: "disabled" });
  const address = app.commandLine.getSwitchValue("remote-debugging-address") || "127.0.0.1";
  const requested = app.commandLine.getSwitchValue("remote-debugging-port");
  if (requested !== "0") return parseElectronCdpActivePort(requested, address);
  const isolatedRoot = app.getPath("userData");
  const namespaceMarker = `${sep}exact${sep}channels${sep}`;
  const markerIndex = isolatedRoot.indexOf(namespaceMarker);
  // app.setName() may change Electron's bootstrap userData root before
  // app.whenReady(), so derive the pre-isolation root from the final
  // channel/namespace path first. The captured early root remains a fallback
  // for distributions whose product identity is already fixed at launch.
  const candidates = [
    ...(markerIndex < 0 ? [] : [isolatedRoot.slice(0, markerIndex)]),
    isolatedRoot,
    bootstrapUserDataRoot,
  ].filter((root, index, roots) => roots.indexOf(root) === index);
  for (const root of candidates) {
    try {
      return parseElectronCdpActivePort(readFileSync(join(root, "DevToolsActivePort"), "utf8"), address);
    } catch { /* Chromium may not have published this candidate yet. */ }
  }
  return Object.freeze({ state: "starting", transport: "tcp" });
}
