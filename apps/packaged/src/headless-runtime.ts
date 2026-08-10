import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  normalizeDesktopSidecarMessage,
  type DesktopStatusSnapshot,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import {
  bootstrapSidecarRuntime,
  createJsonIpcServer,
  requestJsonIpc,
  resolveAppIpcPath,
} from "@open-design/sidecar";
import type { JsonIpcServerHandle } from "@open-design/sidecar";

import type { PackagedConfig } from "./config.js";
import type { PackagedDesktopIdentityHandle } from "./identity.js";
import { writePackagedDesktopIdentity, writePackagedWebIdentity } from "./identity.js";
import { confirmPackagedLauncherRuntime, resolvePackagedLauncherRuntime } from "./launcher-runtime.js";
import { resolvePackagedNamespacePaths } from "./paths.js";
import type { PackagedSidecarHandle } from "./sidecars.js";
import { startPackagedSidecars } from "./sidecars.js";

function createHeadlessStamp(namespace: string): SidecarStamp {
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

export interface PackagedHeadlessStartupDependencies {
  confirmRuntime(): Promise<void>;
  createIpcServer(options: {
    currentWebUrl(): string | null;
    shutdown(): Promise<void>;
  }): Promise<JsonIpcServerHandle>;
  exit(code: number): void;
  installMcp(daemonUrl: string | null): Promise<void>;
  startSidecars(): Promise<PackagedSidecarHandle>;
  writeIdentity(): Promise<PackagedDesktopIdentityHandle>;
  writeWebIdentity(webUrl: string): Promise<void>;
}

export interface PackagedHeadlessStartupHandle {
  ownership: "owner";
  shutdown(): Promise<void>;
  webUrl: string;
}

export interface AdoptedPackagedHeadlessStartupHandle {
  ownership: "adopted";
  webUrl: string;
}

export interface ExistingPackagedHeadlessOwner {
  state: "starting" | "running";
  webUrl: string | null;
}

export interface AcquireOrAdoptPackagedHeadlessOptions {
  inspectExistingOwner(): Promise<ExistingPackagedHeadlessOwner | null>;
  repairAdoptedOwner?(webUrl: string): Promise<void>;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}

export async function acquirePackagedHeadlessStartup(
  dependencies: PackagedHeadlessStartupDependencies,
): Promise<PackagedHeadlessStartupHandle> {
  let identity: PackagedDesktopIdentityHandle | null = null;
  let sidecars: PackagedSidecarHandle | null = null;
  let ipcServer: JsonIpcServerHandle | null = null;
  let webUrl: string | null = null;
  let closed = false;

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await ipcServer?.close().catch(() => undefined);
    await sidecars?.close().catch(() => undefined);
    await identity?.close().catch(() => undefined);
  };
  const shutdown = async (): Promise<void> => {
    await close();
    dependencies.exit(0);
  };

  try {
    ipcServer = await dependencies.createIpcServer({
      currentWebUrl: () => webUrl,
      shutdown,
    });
    identity = await dependencies.writeIdentity();
    sidecars = await dependencies.startSidecars();
    webUrl = sidecars.web.url;
    if (!webUrl) {
      throw new Error(
        "web sidecar failed to produce URL — check logs/desktop/latest.log",
      );
    }
    await dependencies.installMcp(sidecars.daemon.url);
    await dependencies.writeWebIdentity(webUrl);
    await dependencies.confirmRuntime();
    return { ownership: "owner", shutdown, webUrl };
  } catch (error) {
    await close();
    throw error;
  }
}

function isPackagedHeadlessOwnershipConflict(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "EADDRINUSE" || code === "EACCES" || code === "EPERM";
}

export async function acquireOrAdoptPackagedHeadlessStartup(
  dependencies: PackagedHeadlessStartupDependencies,
  options: AcquireOrAdoptPackagedHeadlessOptions,
): Promise<PackagedHeadlessStartupHandle | AdoptedPackagedHeadlessStartupHandle> {
  const adopt = async (webUrl: string): Promise<AdoptedPackagedHeadlessStartupHandle> => {
    await options.repairAdoptedOwner?.(webUrl);
    return { ownership: "adopted", webUrl };
  };
  const existing = await options.inspectExistingOwner();
  if (existing?.state === "running" && existing.webUrl) {
    return await adopt(existing.webUrl);
  }

  try {
    return await acquirePackagedHeadlessStartup(dependencies);
  } catch (error) {
    if (!isPackagedHeadlessOwnershipConflict(error)) throw error;
    const deadline = Date.now() + (options.timeoutMs ?? 60_000);
    const sleep = options.sleep ?? (async (milliseconds: number) => {
      await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
    });
    while (Date.now() < deadline) {
      const owner = await options.inspectExistingOwner();
      if (owner?.state === "running" && owner.webUrl) {
        return await adopt(owner.webUrl);
      }
      await sleep(100);
    }
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
  const stamp = createHeadlessStamp(config.namespace);
  const mcpBootstrap =
    options.mcpBootstrapLaunch
    ?? resolvePackagedMcpBootstrapLaunch({
      installedLaunchPath: launcherRuntime.installedLaunchPath,
    });

  await mkdir(paths.runtimeRoot, { recursive: true });

  const runtime = bootstrapSidecarRuntime(stamp, process.env, {
    app: APP_KEYS.DESKTOP,
    base: paths.runtimeRoot,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
  });

  const startup = await acquireOrAdoptPackagedHeadlessStartup({
    confirmRuntime: async () => await confirmPackagedLauncherRuntime(launcherRuntime),
    createIpcServer: async ({ currentWebUrl, shutdown: stop }) =>
      await createJsonIpcServer({
        socketPath: stamp.ipc,
        handler: async (message: unknown) => {
          const normalized = normalizeDesktopSidecarMessage(message);
          switch (normalized.type) {
            case SIDECAR_MESSAGES.STATUS:
              const activeWebUrl = currentWebUrl();
              return {
                pid: process.pid,
                state: activeWebUrl ? "running" : "idle",
                updatedAt: new Date().toISOString(),
                url: activeWebUrl,
                windowVisible: false,
              };
            case SIDECAR_MESSAGES.SHUTDOWN:
              setImmediate(() => {
                void stop();
              });
              return { accepted: true };
          }
        },
      }),
    exit: (code) => process.exit(code),
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
    // Write a headless-specific identity marker so `tools-pack linux stop
    // --headless` can find this process without confusing it for a
    // menu-launched AppImage that owns desktop-root.json in the same namespace.
    writeIdentity: async () =>
      await writePackagedDesktopIdentity({
        identityPath: paths.headlessIdentityPath,
        paths,
        stamp,
      }),
    writeWebIdentity: async (activeWebUrl) =>
      await writePackagedWebIdentity({
        paths,
        pid: process.pid,
        url: activeWebUrl,
      }),
  }, {
    inspectExistingOwner: async () => {
      try {
        const status = await requestJsonIpc<DesktopStatusSnapshot>(
          stamp.ipc,
          { type: SIDECAR_MESSAGES.STATUS },
          { timeoutMs: 800 },
        );
        return {
          state: status.state === "running" ? "running" : "starting",
          webUrl: status.url ?? null,
        };
      } catch {
        return null;
      }
    },
    ...(request.mcpInstallAgent === "codex"
      ? {
          repairAdoptedOwner: async (webUrl: string) => {
            const codexBin = process.env.CODEX_BIN?.trim();
            if (codexBin) {
              await repairCodexMcpRegistrationViaLiveOwner(webUrl, codexBin);
              return;
            }
            await installCodexMcp(webUrl);
          },
        }
      : {}),
  });

  const { webUrl } = startup;
  if (startup.ownership === "adopted") {
    process.stdout.write(`\n Open Design is already running\n\n`);
    process.stdout.write(` ➜ ${colorize(webUrl)}\n\n`);
    return;
  }
  const { shutdown } = startup;

  process.stdout.write(`\n Open Design is running\n\n`);
  process.stdout.write(` ➜ ${colorize(webUrl)}\n\n`);
  process.stdout.write(` Press Ctrl+C to stop\n\n`);

  process.on("SIGINT", () => {
    process.stdout.write("\n Shutting down Open Design...\n");
    void shutdown();
  });
  process.on("SIGTERM", () => {
    process.stdout.write("\n Shutting down Open Design...\n");
    void shutdown();
  });
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

interface LiveOwnerMcpInstallPayload {
  args: string[];
  command: string;
  env: Record<string, string>;
}

interface LiveOwnerCodexRunnerResult {
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface RepairCodexMcpRegistrationOptions {
  fetchImpl?: typeof fetch;
  run?: (
    command: string,
    args: string[],
  ) => Promise<LiveOwnerCodexRunnerResult>;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return value != null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.values(value).every((entry) => typeof entry === "string");
}

function parseLiveOwnerMcpInstallPayload(value: unknown): LiveOwnerMcpInstallPayload {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("live Open Design owner returned invalid MCP install info");
  }
  const payload = value as Partial<LiveOwnerMcpInstallPayload>;
  if (
    typeof payload.command !== "string"
    || payload.command.length === 0
    || !Array.isArray(payload.args)
    || !payload.args.every((entry) => typeof entry === "string")
    || !isStringRecord(payload.env)
  ) {
    throw new Error("live Open Design owner returned incomplete MCP install info");
  }
  return {
    args: payload.args,
    command: payload.command,
    env: payload.env,
  };
}

async function runCodexMcpRepair(
  command: string,
  args: string[],
): Promise<LiveOwnerCodexRunnerResult> {
  return await new Promise<LiveOwnerCodexRunnerResult>((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (
      callback: () => void,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new Error("codex MCP registration timed out after 30s")));
    }, 30_000);
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", (error) => {
      finish(() => reject(error));
    });
    child.once("close", (code) => {
      finish(() => resolve({ exitCode: code ?? -1, stderr, stdout }));
    });
  });
}

export async function repairCodexMcpRegistrationViaLiveOwner(
  webUrl: string,
  codexBin: string,
  options: RepairCodexMcpRegistrationOptions = {},
): Promise<void> {
  const ownerUrl = new URL(webUrl);
  if (
    ownerUrl.protocol !== "http:"
    || !["127.0.0.1", "localhost", "[::1]"].includes(ownerUrl.hostname)
  ) {
    throw new Error("live Open Design owner must use a loopback HTTP URL");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const installInfoUrl = `${webUrl.replace(/\/$/u, "")}/api/mcp/install-info`;
  const response = await fetchImpl(installInfoUrl);
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(
      `live Open Design MCP install info failed (${response.status}): ${detail}`,
    );
  }
  const payload = parseLiveOwnerMcpInstallPayload(await response.json());
  const registrationEnv = { ...payload.env, CODEX_BIN: codexBin };
  const args = ["mcp", "add", "open-design"];
  for (const [key, value] of Object.entries(registrationEnv)) {
    args.push("--env", `${key}=${value}`);
  }
  args.push("--", payload.command, ...payload.args);
  const result = await (options.run ?? runCodexMcpRepair)(codexBin, args);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim()
      || result.stdout.trim()
      || `exit ${result.exitCode}`;
    throw new Error(`codex mcp add failed: ${detail}`);
  }
  process.stdout.write(" Open Design MCP repaired through the running owner\n");
}
