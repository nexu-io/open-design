import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  type DaemonStatusSnapshot,
} from "@open-design/sidecar-proto";
import { requestJsonIpc, resolveAppIpcPath } from "@open-design/sidecar";

export const DEFAULT_DAEMON_URL = "http://127.0.0.1:7456";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export interface ResolveDaemonUrlOptions {
  /** Value passed via `--daemon-url`. Empty string is treated as unset. */
  flagUrl?: string | null;
  /** Defaults to `process.env`; injected for tests. */
  env?: NodeJS.ProcessEnv;
  /** IPC discovery timeout. Short by default so an absent daemon does not stall CLI startup. */
  timeoutMs?: number;
}

/**
 * Resolve the daemon HTTP base URL for `od` client commands.
 *
 * Spawn order: explicit `--daemon-url` flag, `OD_DAEMON_URL` env, then
 * a STATUS roundtrip to the concrete sidecar IPC endpoint supplied by
 * the lifecycle owner in `OD_SIDECAR_IPC_PATH`, then the default
 * `tools-dev status --json` runtime, then packaged sidecar sockets.
 * Falls back to the legacy default for direct `od` launches that do not
 * have a discoverable sidecar runtime.
 */
export async function resolveDaemonUrl(
  options: ResolveDaemonUrlOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const flagUrl = options.flagUrl ?? null;
  if (flagUrl != null && flagUrl.length > 0) return flagUrl;
  const envUrl = env.OD_DAEMON_URL;
  if (envUrl != null && envUrl.length > 0) return envUrl;
  const discovered = await discoverDaemonUrlFromIpc(env, options.timeoutMs ?? 800);
  if (discovered != null) return discovered;
  const toolsDevUrl = await discoverDaemonUrlFromToolsDev(env, options.timeoutMs ?? 800);
  if (toolsDevUrl != null) return toolsDevUrl;
  const packagedUrl = await discoverDaemonUrlFromPackagedIpc(env, options.timeoutMs ?? 800);
  if (packagedUrl != null) return packagedUrl;
  return DEFAULT_DAEMON_URL;
}

async function discoverDaemonUrlFromIpc(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<string | null> {
  const socketPath = env[SIDECAR_ENV.IPC_PATH];
  if (socketPath == null || socketPath.length === 0) return null;
  return await readDaemonUrlFromIpc(socketPath, timeoutMs);
}

async function discoverDaemonUrlFromToolsDev(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<string | null> {
  return await new Promise<string | null>((resolve) => {
    let child;
    try {
      child = spawn("pnpm", ["--silent", "exec", "tools-dev", "status", "--json"], {
        cwd: REPO_ROOT,
        env,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      resolve(null);
      return;
    }

    let settled = false;
    let stdout = "";
    const done = (url: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(url);
    };
    const timer = setTimeout(() => {
      child.kill();
      done(null);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.on("error", () => done(null));
    child.on("close", (code) => {
      done(code === 0 ? extractDaemonUrlFromToolsDevStatus(stdout) : null);
    });
  });
}

async function discoverDaemonUrlFromPackagedIpc(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<string | null> {
  const stablePath = resolveAppIpcPath({
    app: APP_KEYS.DAEMON,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    env,
    namespace: "release-stable",
  });
  const stableUrl = await readDaemonUrlFromIpc(stablePath, timeoutMs);
  if (stableUrl != null) return stableUrl;
  if (process.platform === "win32") return null;

  const ipcBase = path.resolve(
    env[SIDECAR_ENV.IPC_BASE] ?? OPEN_DESIGN_SIDECAR_CONTRACT.defaults.ipcBase,
  );
  let entries;
  try {
    entries = await readdir(ipcBase, { withFileTypes: true });
  } catch {
    return null;
  }

  const socketPaths = entries
    .filter((entry) => entry.isDirectory() && entry.name !== "release-stable")
    .map((entry) =>
      resolveAppIpcPath({
        app: APP_KEYS.DAEMON,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        env,
        namespace: entry.name,
      }),
    )
    .sort();
  for (const socketPath of socketPaths) {
    const url = await readDaemonUrlFromIpc(socketPath, timeoutMs);
    if (url != null) return url;
  }
  return null;
}

async function readDaemonUrlFromIpc(
  socketPath: string,
  timeoutMs: number,
): Promise<string | null> {
  try {
    const status = await requestJsonIpc<DaemonStatusSnapshot>(
      socketPath,
      { type: SIDECAR_MESSAGES.STATUS },
      { timeoutMs },
    );
    return status?.url ?? null;
  } catch {
    return null;
  }
}

function extractDaemonUrlFromToolsDevStatus(stdout: string): string | null {
  for (let i = stdout.indexOf("{"); i !== -1; i = stdout.indexOf("{", i + 1)) {
    try {
      const parsed = JSON.parse(stdout.slice(i)) as {
        apps?: { daemon?: { url?: string | null } };
        url?: string | null;
      };
      const url = parsed?.apps?.daemon?.url ?? parsed?.url ?? null;
      if (typeof url === "string" && url.length > 0) return url;
    } catch {
      // pnpm wrappers can print warnings before JSON; continue scanning.
    }
  }
  return null;
}
