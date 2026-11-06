import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

import { SidecarFactory } from "@open-design/sidecar";
import {
  APP_KEYS,
  MCP_BOOTSTRAP_CONTRACT,
  type DaemonStatusSnapshot,
} from "@open-design/sidecar-proto";

import { resolveDaemonUrl as resolveDaemonUrlDefault } from "./daemon-url.js";

const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 60_000;
const DEFAULT_BOOTSTRAP_POLL_MS = 250;

export type McpDaemonBootstrapPlan =
  | {
      action: "none";
      reason:
        | "daemon-ready"
        | "explicit-daemon-url"
        | "bootstrap-unavailable"
        | "invalid-bootstrap-command"
        | "invalid-bootstrap-args";
    }
  | {
      action: "spawn";
      args: string[];
      command: string;
      env: NodeJS.ProcessEnv;
    };

export interface PlanMcpDaemonBootstrapOptions {
  daemonReachable: boolean;
  env: NodeJS.ProcessEnv;
  explicitDaemonUrl: boolean;
}

export function planMcpDaemonBootstrap(
  options: PlanMcpDaemonBootstrapOptions,
): McpDaemonBootstrapPlan {
  if (options.daemonReachable) {
    return { action: "none", reason: "daemon-ready" };
  }
  if (options.explicitDaemonUrl) {
    return { action: "none", reason: "explicit-daemon-url" };
  }
  const command = options.env.OD_MCP_BOOTSTRAP_COMMAND;
  if (command == null || command.length === 0) {
    return { action: "none", reason: "bootstrap-unavailable" };
  }
  if (!isAbsolute(command)) {
    return { action: "none", reason: "invalid-bootstrap-command" };
  }
  const args = parseBootstrapArgs(options.env.OD_MCP_BOOTSTRAP_ARGS);
  if (args == null || !args.includes("--headless")) {
    return { action: "none", reason: "invalid-bootstrap-args" };
  }
  const env = { ...options.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.OD_DAEMON_URL;
  for (const key of Object.keys(env)) {
    if (key.startsWith("OD_SIDECAR_")) delete env[key];
  }
  return { action: "spawn", args, command, env };
}

interface EnsureMcpDaemonUrlOptions {
  connectInherited?: typeof SidecarFactory.connectInherited;
  discoverTargetDaemonUrl?: (
    env: NodeJS.ProcessEnv,
    timeoutMs: number,
  ) => Promise<string | null>;
  env?: NodeJS.ProcessEnv;
  flagUrl?: string | null;
  probeDaemon?: (url: string) => Promise<boolean>;
  resolveDaemonUrl?: (options: {
    allowLegacyDefault?: boolean;
    env: NodeJS.ProcessEnv;
    flagUrl?: string | null;
    timeoutMs?: number;
  }) => Promise<string>;
  sleep?: (milliseconds: number) => Promise<void>;
  spawnBootstrap?: (plan: Extract<
    McpDaemonBootstrapPlan,
    { action: "spawn" }
  >) => Promise<void>;
  /** Reads STATUS at an absolute sidecar client endpoint (managed registrations). */
  statusAtEndpoint?: SidecarEndpointStatusReader;
  timeoutMs?: number;
}

type SidecarEndpointStatusReader = <T>(
  endpoint: string,
  app: string,
  timeoutMs: number,
) => Promise<T | null>;

/** Absolute client endpoints of every mode of the registering namespace. */
export type ManagedMcpDiscovery = { daemon: string[]; desktop: string[] };

/** True when the registration was written under a managed outer. */
export function isManagedMcpBootstrapEnv(env: NodeJS.ProcessEnv): boolean {
  return parseBootstrapArgs(env.OD_MCP_BOOTSTRAP_ARGS)?.includes(MCP_BOOTSTRAP_CONTRACT.MANAGED_ARG) === true;
}

/**
 * The discovery endpoints of a managed registration, or null when the
 * registration is not managed or is malformed; either way the caller keeps
 * the unmanaged bootstrap path.
 */
export function parseManagedMcpDiscovery(env: NodeJS.ProcessEnv): ManagedMcpDiscovery | null {
  if (!isManagedMcpBootstrapEnv(env)) return null;
  try {
    const parsed = JSON.parse(env[MCP_BOOTSTRAP_CONTRACT.DISCOVERY_ENV] ?? "") as Partial<ManagedMcpDiscovery>;
    const isEndpointList = (value: unknown): value is string[] =>
      Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0);
    if (!isEndpointList(parsed.daemon) || !isEndpointList(parsed.desktop)) return null;
    return { daemon: parsed.daemon, desktop: parsed.desktop };
  } catch {
    return null;
  }
}

export async function ensureMcpDaemonUrl(
  options: EnsureMcpDaemonUrlOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const flagUrl = options.flagUrl ?? null;
  const resolveDaemonUrl = options.resolveDaemonUrl ?? resolveDaemonUrlDefault;
  const discoverTargetDaemonUrl =
    options.discoverTargetDaemonUrl ?? discoverDaemonUrlFromInheritedClient;
  const connectInherited = options.connectInherited ?? SidecarFactory.connectInherited;
  const probeDaemon = options.probeDaemon ?? probeDaemonHealth;
  const sleep = options.sleep ?? delay;
  const spawnBootstrap = options.spawnBootstrap ?? spawnBootstrapDetached;
  const timeoutMs = options.timeoutMs ?? DEFAULT_BOOTSTRAP_TIMEOUT_MS;
  const explicitDaemonUrl =
    (flagUrl != null && flagUrl.length > 0)
    || (env.OD_DAEMON_URL != null && env.OD_DAEMON_URL.length > 0);
  // A managed registration finds the namespace's daemon in whichever mode owns
  // it, and never asks the OS to reopen an app that is already running.
  const managedDiscovery = explicitDaemonUrl ? null : parseManagedMcpDiscovery(env);
  if (managedDiscovery != null) {
    return await ensureManagedMcpDaemonUrl(managedDiscovery, env, {
      probeDaemon,
      sleep,
      spawnBootstrap,
      statusAtEndpoint: options.statusAtEndpoint ?? readStatusAtEndpoint,
      timeoutMs,
    });
  }
  const registeredBootstrapTarget = !explicitDaemonUrl && connectInherited(env) != null;
  if (!explicitDaemonUrl && !registeredBootstrapTarget
    && (env.OD_MCP_BOOTSTRAP_COMMAND || env.OD_MCP_BOOTSTRAP_ARGS)) {
    throw new Error("The Open Design MCP registration is missing its runtime connection. Open the app and refresh the MCP registration, then restart this MCP session.");
  }

  let daemonUrl: string | null = registeredBootstrapTarget
    ? await discoverTargetDaemonUrl(env, 800)
    : await resolveDaemonUrl({
        allowLegacyDefault: false,
        env,
        flagUrl,
        timeoutMs: 800,
      });
  const daemonReachable =
    daemonUrl != null && await probeDaemon(daemonUrl);
  const plan = planMcpDaemonBootstrap({
    daemonReachable,
    env,
    explicitDaemonUrl,
  });
  if (plan.action === "none") {
    if (daemonUrl != null && (daemonReachable || explicitDaemonUrl)) return daemonUrl;
    throw new Error(
      `The registered OpenDesign runtime is unavailable and cannot be launched (${plan.reason}).`,
    );
  }

  await spawnBootstrap(plan);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(DEFAULT_BOOTSTRAP_POLL_MS);
    daemonUrl = registeredBootstrapTarget
      ? await discoverTargetDaemonUrl(env, 300)
      : await resolveDaemonUrl({
          allowLegacyDefault: false,
          env,
          flagUrl: null,
          timeoutMs: 300,
        });
    if (daemonUrl != null && await probeDaemon(daemonUrl)) return daemonUrl;
  }
  throw new Error(
    `OpenDesign was launched headlessly but its daemon did not become ready within ${timeoutMs}ms.`,
  );
}

async function ensureManagedMcpDaemonUrl(
  discovery: ManagedMcpDiscovery,
  env: NodeJS.ProcessEnv,
  deps: {
    probeDaemon: (url: string) => Promise<boolean>;
    sleep: (milliseconds: number) => Promise<void>;
    spawnBootstrap: (plan: Extract<McpDaemonBootstrapPlan, { action: "spawn" }>) => Promise<void>;
    statusAtEndpoint: SidecarEndpointStatusReader;
    timeoutMs: number;
  },
): Promise<string> {
  // The endpoints were resolved by the registering daemon. Never derive them
  // here: this process may not share the daemon's TMPDIR.
  const daemonEndpoints = [...new Set([
    ...(env.OD_SIDECAR_CLIENT_ENDPOINT ? [env.OD_SIDECAR_CLIENT_ENDPOINT] : []),
    ...discovery.daemon,
  ])];
  const findDaemon = async (timeoutMs: number): Promise<string | null> => {
    for (const endpoint of daemonEndpoints) {
      const status = await deps.statusAtEndpoint<DaemonStatusSnapshot>(endpoint, APP_KEYS.DAEMON, timeoutMs);
      if (status?.url != null && status.url.length > 0 && await deps.probeDaemon(status.url)) return status.url;
    }
    return null;
  };
  const ownerRunning = async (timeoutMs: number): Promise<boolean> => {
    for (const endpoint of discovery.desktop) {
      if (await deps.statusAtEndpoint<unknown>(endpoint, APP_KEYS.DESKTOP, timeoutMs) != null) return true;
    }
    return false;
  };

  const ready = await findDaemon(800);
  if (ready != null) return ready;
  if (!await ownerRunning(800)) {
    const plan = planMcpDaemonBootstrap({ daemonReachable: false, env, explicitDaemonUrl: false });
    if (plan.action !== "spawn") {
      throw new Error(
        `The registered OpenDesign runtime is unavailable and cannot be launched (${plan.reason}).`,
      );
    }
    await deps.spawnBootstrap(plan);
  }
  // An owner that is already running (starting, restoring, or restarting its
  // daemon) is waited for, not reopened.
  const deadline = Date.now() + deps.timeoutMs;
  while (Date.now() < deadline) {
    await deps.sleep(DEFAULT_BOOTSTRAP_POLL_MS);
    const url = await findDaemon(300);
    if (url != null) return url;
  }
  throw new Error(
    `OpenDesign did not make its local service available within ${deps.timeoutMs}ms.`,
  );
}

async function readStatusAtEndpoint<T>(
  endpoint: string,
  app: string,
  timeoutMs: number,
): Promise<T | null> {
  const client = SidecarFactory.connectInherited({ OD_SIDECAR_CLIENT_ENDPOINT: endpoint });
  if (client == null) return null;
  try {
    return await client.status<T>(app, { timeoutMs });
  } catch {
    return null;
  }
}

async function discoverDaemonUrlFromInheritedClient(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<string | null> {
  const client = SidecarFactory.connectInherited(env);
  if (client == null) return null;
  try {
    const status = await client.status<DaemonStatusSnapshot>(APP_KEYS.DAEMON, { timeoutMs });
    return status.url;
  } catch {
    return null;
  }
}

function parseBootstrapArgs(raw: string | undefined): string[] | null {
  if (raw == null || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(parsed)
      || parsed.some((value) => typeof value !== "string")
    ) {
      return null;
    }
    return [...parsed];
  } catch {
    return null;
  }
}

async function probeDaemonHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url.replace(/\/$/u, "")}/api/health`, {
      signal: AbortSignal.timeout(800),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function spawnBootstrapDetached(
  plan: Extract<McpDaemonBootstrapPlan, { action: "spawn" }>,
): Promise<void> {
  const child = spawn(plan.command, plan.args, {
    detached: true,
    env: plan.env,
    stdio: "ignore",
    windowsHide: true,
  });
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  child.unref();
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
