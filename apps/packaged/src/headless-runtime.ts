import { mkdir } from "node:fs/promises";

import {
  APP_KEYS,
  SIDECAR_SOURCES,
} from "@open-design/sidecar-proto";
import {
  getSidecarStatus,
  registerSidecarProcess,
  readCurrentSidecarStamp,
  SidecarFactory,
  type SidecarClient,
  type SidecarRuntimeContext,
  type SidecarStamp,
} from "@open-design/sidecar";
import { releaseChannelFromNamespace, releaseChannelFromVersion } from "@open-design/release";

import type { PackagedConfig } from "./config.js";
import { confirmPackagedLauncherRuntime, resolvePackagedLauncherRuntime } from "./launcher-runtime.js";
import { resolvePackagedNamespacePaths } from "./paths.js";
import type { PackagedSidecarHandle } from "./sidecars.js";
import { startPackagedSidecars } from "./sidecars.js";

const PACKAGED_SIDECAR_SOURCES = [SIDECAR_SOURCES.TOOLS_PACK, SIDECAR_SOURCES.PACKAGED] as const;

function colorize(text: string): string {
  if (process.stdout.isTTY !== true || process.env.NO_COLOR != null) return text;
  return `\x1b[36m\x1b[4m${text}\x1b[0m`;
}

export interface PackagedMcpBootstrapLaunch {
  args: string[];
  command: string;
}

export interface PackagedHeadlessRequest {
  headless: boolean;
  mcpInstallAgent: "codex" | null;
}

export interface RunPackagedHeadlessOptions {
  mcpBootstrapLaunch?: PackagedMcpBootstrapLaunch;
}

export async function runPackagedMcpActionAgainstExistingDaemon(
  request: PackagedHeadlessRequest,
  stamp: SidecarStamp,
  dependencies: {
    getStatus?: typeof getSidecarStatus;
    installMcp?: (daemonUrl: string | null) => Promise<void>;
  } = {},
): Promise<boolean> {
  if (request.mcpInstallAgent == null) return false;
  let status: { state?: unknown; url?: unknown } | null = null;
  for (const source of [stamp.source, ...PACKAGED_SIDECAR_SOURCES.filter((candidate) => candidate !== stamp.source)]) {
    status = await (dependencies.getStatus ?? getSidecarStatus)<{ state?: unknown; url?: unknown }>(
      { ...stamp, app: APP_KEYS.DAEMON, mode: stamp.mode, source },
      { timeoutMs: 350 },
    ).catch(() => null);
    if (status?.state === "running" && typeof status.url === "string" && status.url.length > 0) break;
  }
  if (status?.state !== "running" || typeof status.url !== "string" || status.url.length === 0) return false;
  await (dependencies.installMcp ?? installCodexMcp)(status.url);
  return true;
}

export interface PackagedHeadlessStartupDependencies {
  confirmRuntime(): Promise<void>;
  installMcp(daemonUrl: string | null): Promise<void>;
  startSidecars(): Promise<PackagedSidecarHandle>;
}

export interface PackagedHeadlessStartupHandle {
  shutdown(): Promise<void>;
  webUrl: string;
}

export async function acquirePackagedHeadlessStartup(
  dependencies: PackagedHeadlessStartupDependencies,
): Promise<PackagedHeadlessStartupHandle> {
  let sidecars: PackagedSidecarHandle | null = null;
  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await sidecars?.close().catch(() => undefined);
  };
  const shutdown = async (): Promise<void> => {
    await close();
  };

  try {
    sidecars = await dependencies.startSidecars();
    const webUrl = sidecars.web.url;
    if (!webUrl) {
      throw new Error(
        "web sidecar failed to produce URL — check logs/desktop/latest.log",
      );
    }
    await dependencies.installMcp(sidecars.daemon.url);
    await dependencies.confirmRuntime();
    return { shutdown, webUrl };
  } catch (error) {
    await close();
    throw error;
  }
}

export function parsePackagedHeadlessRequest(
  argv: readonly string[],
): PackagedHeadlessRequest {
  const headless = argv.includes("--headless");
  const installIndex = argv.indexOf("--mcp-install");
  if (installIndex === -1) return { headless, mcpInstallAgent: null };
  if (!headless) {
    throw new Error("--mcp-install requires --headless");
  }
  const agent = argv[installIndex + 1];
  if (agent !== "codex") {
    throw new Error(
      "Packaged headless MCP installation currently only supports codex.",
    );
  }
  return { headless: true, mcpInstallAgent: agent };
}

export function resolvePackagedMcpBootstrapLaunch(options: {
  currentExecutablePath?: string;
  installedLaunchPath: string | null;
  platform?: NodeJS.Platform;
}): PackagedMcpBootstrapLaunch {
  const platform = options.platform ?? process.platform;
  const currentExecutablePath =
    options.currentExecutablePath ?? process.execPath;
  if (
    platform === "darwin"
    && options.installedLaunchPath?.endsWith(".app")
  ) {
    return {
      command: "/usr/bin/open",
      args: [
        "-g",
        "-j",
        options.installedLaunchPath,
        "--args",
        "--headless",
      ],
    };
  }
  return {
    command: options.installedLaunchPath ?? currentExecutablePath,
    args: ["--headless"],
  };
}

export async function runPackagedHeadless(
  config: PackagedConfig,
  request: PackagedHeadlessRequest = {
    headless: true,
    mcpInstallAgent: null,
  },
  options: RunPackagedHeadlessOptions = {},
): Promise<void> {
  const initialPaths = resolvePackagedNamespacePaths(
    config,
    config.namespace,
    process.env,
  );
  const launcherRuntime = await resolvePackagedLauncherRuntime(config, initialPaths);
  const activeConfig = launcherRuntime.config;
  const paths = launcherRuntime.paths;
  const argvStamp = (() => {
    try { return readCurrentSidecarStamp(); } catch { return null; }
  })();
  const stamp = {
    app: APP_KEYS.DESKTOP,
    channel: argvStamp?.channel ?? releaseChannelFromVersion(activeConfig.appVersion)
      ?? releaseChannelFromNamespace(config.namespace, "default")
      ?? "stable",
    mode: "headless",
    namespace: config.namespace,
    source: argvStamp?.source ?? SIDECAR_SOURCES.PACKAGED,
  };
  const mcpBootstrap =
    options.mcpBootstrapLaunch
    ?? resolvePackagedMcpBootstrapLaunch({
      installedLaunchPath: launcherRuntime.installedLaunchPath,
    });

  await mkdir(paths.runtimeRoot, { recursive: true });
  registerSidecarProcess(stamp, {
    dataRoot: paths.dataRoot,
    ownerPid: null,
    port: 0,
    runtimeRoot: paths.runtimeRoot,
  });
  const runtime: SidecarRuntimeContext<SidecarStamp> = {
    app: APP_KEYS.DESKTOP,
    base: paths.runtimeRoot,
    mode: "headless",
    namespace: config.namespace,
    source: stamp.source,
  };

  type HeadlessRuntime = PackagedHeadlessStartupHandle;
  let client!: SidecarClient<HeadlessRuntime>;
  client = SidecarFactory.create<HeadlessRuntime>({
    lifecycle: {
      async start() {
        return await acquirePackagedHeadlessStartup({
    confirmRuntime: async () => await confirmPackagedLauncherRuntime(launcherRuntime),
    installMcp: async (daemonUrl) => {
      if (request.mcpInstallAgent === "codex") {
        await installCodexMcp(daemonUrl);
      }
    },
    startSidecars: async () =>
      await startPackagedSidecars(runtime, paths, {
        appVersion: activeConfig.appVersion,
        amrProfile: activeConfig.amrProfile,
        daemonCliEntry: activeConfig.daemonCliEntry,
        daemonSidecarEntry: activeConfig.daemonSidecarEntry,
        electronNodeCommand: launcherRuntime.electronNodeCommand,
        mcpBootstrapArgs: mcpBootstrap.args,
        mcpBootstrapCommand: mcpBootstrap.command,
        nodeCommand: activeConfig.nodeCommand,
        telemetryRelayUrl: activeConfig.telemetryRelayUrl,
        posthogKey: activeConfig.posthogKey,
        posthogHost: activeConfig.posthogHost,
        velaWebUrl: activeConfig.velaWebUrl,
        velaWebUrls: activeConfig.velaWebUrls,
        // PR #974 round-5 (lefarcen P2): headless packaged mode uses the signed
        // Electron entry as a lifecycle owner, but creates no BrowserWindow and
        // exposes no privileged shell.openPath surface.
        // Pinning OD_REQUIRE_DESKTOP_AUTH here would arm a gate no client
        // can ever satisfy (no desktop window/main bridge to register a secret),
        // so folder import would permanently return DESKTOP_AUTH_PENDING.
        // The Electron entry counterpart in `apps/packaged/src/index.ts`
        // passes `true` because it does start that desktop bridge.
        requireDesktopAuth: false,
        webSidecarEntry: activeConfig.webSidecarEntry,
        webStandaloneRoot: activeConfig.webStandaloneRoot,
        webOutputMode: activeConfig.webOutputMode,
      }),
        });
      },
      status: (started) => ({
        pid: process.pid,
        state: "running",
        updatedAt: new Date().toISOString(),
        url: started.webUrl,
        windowVisible: false,
      }),
      async stop(started) {
        await started.shutdown();
      },
    },
  });
  await client.start();
  const webUrl = (await client.status<{ url: string }>(APP_KEYS.DESKTOP)).url;

  process.stdout.write(`\n Open Design is running\n\n`);
  process.stdout.write(` ➜ ${colorize(webUrl)}\n\n`);
  process.stdout.write(` Press Ctrl+C to stop\n\n`);

}

async function installCodexMcp(daemonUrl: string | null): Promise<void> {
  if (daemonUrl == null || daemonUrl.length === 0) {
    throw new Error("daemon sidecar failed to produce a URL for MCP install");
  }
  const url = `${daemonUrl.replace(/\/$/u, "")}/api/mcp/install/codex`;
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(
      `Codex MCP install failed (${response.status}): ${detail}`,
    );
  }
  process.stdout.write(" Open Design MCP installed for Codex\n");
}
