import { spawn } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_KEYS,
  type DaemonStatusSnapshot,
} from "@open-design/sidecar-proto";
import { SidecarFactory } from "@open-design/sidecar";

export const DEFAULT_DAEMON_URL = "http://127.0.0.1:7456";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export interface ResolveDaemonUrlOptions {
  connectInherited?: typeof SidecarFactory.connectInherited;
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
 * inherited sidecar client status, then the default
 * `tools-dev status --json` runtime in a verified source checkout only.
 * Discovery never invokes a package manager. Falls back to the legacy default
 * for direct `od` launches that do not run as a sidecar.
 */
export async function resolveDaemonUrl(
  options: ResolveDaemonUrlOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const flagUrl = options.flagUrl ?? null;
  if (flagUrl != null && flagUrl.length > 0) return flagUrl;
  const envUrl = env.OD_DAEMON_URL;
  if (envUrl != null && envUrl.length > 0) return envUrl;
  const discovered = await discoverDaemonUrlFromInheritedClient(
    env,
    options.timeoutMs ?? 800,
    options.connectInherited ?? SidecarFactory.connectInherited,
  );
  if (discovered != null) return discovered;
  const toolsDevUrl = await discoverDaemonUrlFromToolsDev(env, options.timeoutMs ?? 800);
  if (toolsDevUrl != null) return toolsDevUrl;
  return DEFAULT_DAEMON_URL;
}

async function discoverDaemonUrlFromInheritedClient(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  connectInherited: typeof SidecarFactory.connectInherited,
): Promise<string | null> {
  const client = connectInherited(env);
  if (client == null) return null;
  try {
    const status = await client.status<DaemonStatusSnapshot>(APP_KEYS.DAEMON, { timeoutMs });
    return status?.url ?? null;
  } catch {
    return null;
  }
}

async function discoverDaemonUrlFromToolsDev(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<string | null> {
  const entry = await sourceToolsDevEntry();
  if (entry == null) return null;
  return await new Promise<string | null>((resolve) => {
    let child;
    try {
      child = spawn(process.execPath, [entry, "status", "--json"], {
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

/**
 * A dev probe may execute only the owned Node entry in a source checkout.
 * Missing MCP environment is normal for old registrations, so env flags cannot
 * establish this boundary. Anchor it to the module's physical location and
 * repository identities; installed bundles and launcher payloads fail closed.
 */
async function sourceToolsDevEntry(): Promise<string | null> {
  try {
    const root = await realpath(REPO_ROOT);
    const moduleDir = path.dirname(await realpath(fileURLToPath(import.meta.url)));
    if (root.split(path.sep).some((segment) => segment.toLowerCase().endsWith(".app"))) return null;
    if (!["src", "dist"].some((dir) => moduleDir === path.join(root, "apps/daemon", dir))) return null;
    const entry = path.join(root, "tools/dev/bin/tools-dev.mjs");
    const [git, workspace, entryStat, entryPath, rootJson, daemonJson, toolsJson] = await Promise.all([
      stat(path.join(root, ".git")),
      stat(path.join(root, "pnpm-workspace.yaml")),
      stat(entry),
      realpath(entry),
      readFile(path.join(root, "package.json"), "utf8"),
      readFile(path.join(root, "apps/daemon/package.json"), "utf8"),
      readFile(path.join(root, "tools/dev/package.json"), "utf8"),
    ]);
    if ((!git.isDirectory() && !git.isFile()) || !workspace.isFile() || !entryStat.isFile() || entryPath !== entry) return null;
    if (JSON.parse(rootJson)?.name !== "open-design" || JSON.parse(daemonJson)?.name !== "@open-design/daemon") return null;
    const tools = JSON.parse(toolsJson);
    if (tools?.name !== "@open-design/tools-dev" || tools?.bin?.["tools-dev"] !== "./bin/tools-dev.mjs") return null;
    return entry;
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
      // The Node runtime can print notices before JSON; continue scanning.
    }
  }
  return null;
}
