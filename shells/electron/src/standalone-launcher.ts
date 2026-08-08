import { mkdir } from "node:fs/promises";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  normalizeDesktopSidecarMessage,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import { createJsonIpcServer, resolveAppIpcPath, type JsonIpcServerHandle } from "@open-design/sidecar";
import type {
  StandaloneHandle,
  StandaloneRuntimeRunningStatus,
  StandaloneRuntimeStatus,
} from "@open-design/standalone-proto";

import type { PackagedConfig } from "./config.js";
import {
  ensurePackagedClosureAvailable,
  resolvePackagedClosureInstallerRequiredVersion,
} from "./closure-update.js";
import {
  createElectronStandaloneRuntimeIdentity,
  writePackagedDesktopIdentity,
  writePackagedWebIdentity,
  type PackagedDesktopIdentityHandle,
} from "./identity.js";
import { confirmPackagedLauncherRuntime, resolvePackagedLauncherRuntime } from "./launcher-runtime.js";
import { resolvePackagedMcpBootstrapLaunch, type PackagedMcpBootstrapLaunch } from "./mcp-bootstrap.js";
import { resolvePackagedNamespacePaths } from "./paths.js";
import {
  digestElectronShellEntry,
  resolveElectronStandaloneBinding,
} from "./standalone-binding.js";
import { withStandaloneBootstrapEnvironment } from "./standalone-environment.js";
import { createElectronStandaloneLauncher } from "./standalone-handoff.js";

export {
  resolvePackagedMcpBootstrapLaunch,
  type PackagedMcpBootstrapLaunch,
} from "./mcp-bootstrap.js";

function createStandaloneStamp(namespace: string): SidecarStamp {
  return {
    app: APP_KEYS.DESKTOP,
    ipc: resolveAppIpcPath({
      app: APP_KEYS.DESKTOP,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace,
    }),
    mode: SIDECAR_MODES.RUNTIME,
    namespace,
    source: SIDECAR_SOURCES.PACKAGED,
  };
}

function colorize(text: string): string {
  if (process.stdout.isTTY !== true || process.env.NO_COLOR != null) return text;
  return `\x1b[36m\x1b[4m${text}\x1b[0m`;
}

export interface PackagedStandaloneRequest {
  standalone: boolean;
  mcpInstallAgent: "codex" | null;
}

export interface RunPackagedStandaloneOptions {
  mcpBootstrapLaunch?: PackagedMcpBootstrapLaunch;
  shellEntryUrl?: string;
}

export interface PackagedStandaloneStartupDependencies {
  confirmRuntime(): Promise<void>;
  createIpcServer(options: {
    readStandaloneStatus(): Promise<StandaloneRuntimeStatus>;
    shutdown(): Promise<void>;
    webUrl: string;
  }): Promise<JsonIpcServerHandle>;
  exit(code: number): void;
  installMcp(daemonUrl: string): Promise<void>;
  startStandalone(): Promise<StandaloneHandle>;
  writeIdentity(status: StandaloneRuntimeRunningStatus): Promise<PackagedDesktopIdentityHandle>;
  writeWebIdentity(webUrl: string): Promise<void>;
}

export interface PackagedStandaloneStartupHandle {
  shutdown(): Promise<void>;
  webUrl: string;
}

/**
 * Acquire the compatibility control surface around one protocol-owned
 * Standalone. The Shell does not know Web/daemon process shape; it only
 * publishes the running endpoints and forwards shutdown to the handle.
 */
export async function acquirePackagedStandaloneStartup(
  dependencies: PackagedStandaloneStartupDependencies,
): Promise<PackagedStandaloneStartupHandle> {
  let identity: PackagedDesktopIdentityHandle | null = null;
  let standalone: StandaloneHandle | null = null;
  let ipcServer: JsonIpcServerHandle | null = null;
  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await ipcServer?.close().catch(() => undefined);
    await standalone?.close().catch(() => undefined);
    await identity?.close().catch(() => undefined);
  };
  const shutdown = async (): Promise<void> => {
    await close();
    dependencies.exit(0);
  };

  try {
    standalone = await dependencies.startStandalone();
    const status = await standalone.readStatus();
    if (status.state !== "running") {
      throw new Error(`Standalone entered terminal state during startup: ${status.state}`);
    }
    identity = await dependencies.writeIdentity(status);
    await dependencies.installMcp(status.daemonUrl);
    const activeStandalone = standalone;
    ipcServer = await dependencies.createIpcServer({
      readStandaloneStatus: async () => await activeStandalone.readStatus(),
      shutdown,
      webUrl: status.webUrl,
    });
    await dependencies.writeWebIdentity(status.webUrl);
    await dependencies.confirmRuntime();
    void standalone.waitForTerminal().then(async (terminal) => {
      if (closed) return;
      await close();
      dependencies.exit(terminal.state === "failed" ? 1 : 0);
    }).catch(async () => {
      if (closed) return;
      await close();
      dependencies.exit(1);
    });
    return { shutdown, webUrl: status.webUrl };
  } catch (error) {
    await close();
    throw error;
  }
}

export function parsePackagedStandaloneRequest(
  argv: readonly string[],
): PackagedStandaloneRequest {
  const standalone = argv.includes("--standalone");
  const installIndex = argv.indexOf("--mcp-install");
  if (installIndex === -1) return { standalone, mcpInstallAgent: null };
  if (!standalone) throw new Error("--mcp-install requires --standalone");
  const agent = argv[installIndex + 1];
  if (agent !== "codex") {
    throw new Error("Packaged standalone MCP installation currently only supports codex.");
  }
  return { standalone: true, mcpInstallAgent: agent };
}

export async function runPackagedStandalone(
  config: PackagedConfig,
  request: PackagedStandaloneRequest = {
    standalone: true,
    mcpInstallAgent: null,
  },
  options: RunPackagedStandaloneOptions = {},
): Promise<void> {
  const initialPaths = resolvePackagedNamespacePaths(config, config.namespace, process.env);
  const launcherRuntime = await resolvePackagedLauncherRuntime(config, initialPaths);
  const shellConfig = launcherRuntime.config;
  const shellVersion = shellConfig.shellVersion;
  if (shellVersion == null) throw new Error("Electron Shell version is unavailable");
  const paths = launcherRuntime.paths;
  const stamp = createStandaloneStamp(config.namespace);
  const mcpBootstrap = options.mcpBootstrapLaunch
    ?? resolvePackagedMcpBootstrapLaunch({
      installedLaunchPath: launcherRuntime.installedLaunchPath,
    });

  await mkdir(paths.runtimeRoot, { recursive: true });
  const availability = await ensurePackagedClosureAvailable({
    channel: launcherRuntime.launcherPaths.channel,
    installationRoot: launcherRuntime.launcherPaths.root,
    metadataUrl: shellConfig.updateMetadataUrl,
    namespace: config.namespace,
    shellVersion,
  }).catch((error: unknown) => {
    console.warn("[open-design standalone] initial Closure materialization failed", error);
    return null;
  });
  const selection = await resolveElectronStandaloneBinding({
    channel: launcherRuntime.launcherPaths.channel,
    installerRequiredVersion: resolvePackagedClosureInstallerRequiredVersion(availability),
    namespace: config.namespace,
    paths,
    shellDigest: await digestElectronShellEntry(options.shellEntryUrl),
    shellVersion,
  });
  const { shutdown, webUrl } = await acquirePackagedStandaloneStartup({
    confirmRuntime: async () => await confirmPackagedLauncherRuntime(launcherRuntime),
    createIpcServer: async ({ readStandaloneStatus, shutdown: stop, webUrl: activeWebUrl }) =>
      await createJsonIpcServer({
        socketPath: stamp.ipc,
        handler: async (message: unknown) => {
          const normalized = normalizeDesktopSidecarMessage(message);
          switch (normalized.type) {
            case SIDECAR_MESSAGES.STATUS:
              return {
                pid: process.pid,
                standalone: await readStandaloneStatus(),
                state: "running",
                updatedAt: new Date().toISOString(),
                url: activeWebUrl,
                windowVisible: false,
              };
            case SIDECAR_MESSAGES.SHUTDOWN:
              setImmediate(() => void stop());
              return { accepted: true };
          }
        },
      }),
    exit: (code) => process.exit(code),
    installMcp: async (daemonUrl) => {
      if (request.mcpInstallAgent === "codex") await installCodexMcp(daemonUrl);
    },
    startStandalone: async () => await withStandaloneBootstrapEnvironment({
      appVersion: selection.pointer.version,
      config: shellConfig,
      mcpBootstrap,
      requireDesktopAuth: false,
    }, async () => await createElectronStandaloneLauncher().launch(
      selection.binding,
      {
        async invoke(command) {
          return {
            handoff: command.handoff,
            outcome: "unsupported",
            requestId: command.requestId,
            schemaVersion: command.schemaVersion,
          };
        },
      },
    )),
    writeIdentity: async (status) => await writePackagedDesktopIdentity({
      identityPath: paths.standaloneIdentityPath,
      paths,
      runtimeIdentity: createElectronStandaloneRuntimeIdentity(status.handoff, status),
      stamp,
    }),
    writeWebIdentity: async (activeWebUrl) => await writePackagedWebIdentity({
      paths,
      pid: process.pid,
      url: activeWebUrl,
    }),
  });

  process.stdout.write("\n Open Design is running\n\n");
  process.stdout.write(` ➜ ${colorize(webUrl)}\n\n`);
  process.stdout.write(" Press Ctrl+C to stop\n\n");

  process.on("SIGINT", () => {
    process.stdout.write("\n Shutting down Open Design...\n");
    void shutdown();
  });
  process.on("SIGTERM", () => {
    process.stdout.write("\n Shutting down Open Design...\n");
    void shutdown();
  });
}

async function installCodexMcp(daemonUrl: string): Promise<void> {
  const url = `${daemonUrl.replace(/\/$/u, "")}/api/mcp/install/codex`;
  const response = await fetch(url, { method: "POST" });
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`Codex MCP install failed (${response.status}): ${detail}`);
  }
  process.stdout.write(" Open Design MCP installed for Codex\n");
}
