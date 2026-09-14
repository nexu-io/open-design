import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";

import { SidecarFactory } from "@open-design/sidecar";
import {
  APP_KEYS,
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
    env: NodeJS.ProcessEnv;
    flagUrl?: string | null;
    timeoutMs?: number;
  }) => Promise<string>;
  sleep?: (milliseconds: number) => Promise<void>;
  spawnBootstrap?: (plan: Extract<
    McpDaemonBootstrapPlan,
    { action: "spawn" }
  >) => Promise<void>;
  timeoutMs?: number;
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
  const registeredBootstrapTarget =
    !explicitDaemonUrl
    && connectInherited(env) != null
    && env.OD_MCP_BOOTSTRAP_COMMAND != null
    && env.OD_MCP_BOOTSTRAP_COMMAND.length > 0
    && env.OD_MCP_BOOTSTRAP_ARGS != null
    && env.OD_MCP_BOOTSTRAP_ARGS.length > 0;

  let daemonUrl: string | null = registeredBootstrapTarget
    ? await discoverTargetDaemonUrl(env, 800)
    : await resolveDaemonUrl({
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
    if (daemonUrl != null) return daemonUrl;
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
