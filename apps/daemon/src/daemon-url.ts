import { spawn } from "node:child_process";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_CHANNELS,
  releaseNamespaceCandidates,
  releaseChannelFromNamespace,
  type ReleasePlatform,
} from "@open-design/release";
import {
  APP_KEYS,
  SIDECAR_DEFAULTS,
  SIDECAR_ENV,
  type DaemonStatusSnapshot,
} from "@open-design/sidecar-proto";
import { getSidecarStatus, resolveSidecarClientEndpoint, SidecarFactory, type SidecarStamp } from "@open-design/sidecar";
import { isLoopbackHostname } from "./http/local-daemon-request.js";

export const DEFAULT_DAEMON_URL = "http://127.0.0.1:7456";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export interface ResolveDaemonUrlOptions {
  flagUrl?: string | null;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  /** MCP startup must never guess the legacy default port. */
  allowLegacyDefault?: boolean;
  connectInherited?: typeof SidecarFactory.connectInherited;
  /** Only MCP installation opts into packaged-channel discovery. */
  allowConventionalIpcDiscovery?: boolean;
  platform?: ReleasePlatform;
}

export interface ResolveDaemonUrlResult {
  url: string;
  ambiguous: boolean;
}

/** Explicit URL, inherited client, optional packaged discovery, then source tools-dev. */
export async function resolveDaemonUrl(
  options: ResolveDaemonUrlOptions = {},
): Promise<string> {
  return (await resolveDaemonUrlDetailed(options)).url;
}

export async function resolveDaemonUrlDetailed(
  options: ResolveDaemonUrlOptions = {},
): Promise<ResolveDaemonUrlResult> {
  const env = options.env ?? process.env;
  const flagUrl = options.flagUrl ?? null;
  if (flagUrl != null && flagUrl.length > 0) return { url: flagUrl, ambiguous: false };
  const envUrl = env.OD_DAEMON_URL;
  if (envUrl != null && envUrl.length > 0) return { url: envUrl, ambiguous: false };
  const timeoutMs = options.timeoutMs ?? 800;
  const client = (options.connectInherited ?? SidecarFactory.connectInherited)(env);
  if (client != null) {
    try {
      const status = await client.status<DaemonStatusSnapshot>(APP_KEYS.DAEMON, { timeoutMs });
      if (status?.url) return { url: status.url, ambiguous: false };
    } catch {
      // An unavailable inherited endpoint may still resolve through source tools-dev.
    }
  } else if (options.allowConventionalIpcDiscovery) {
    const results = await Promise.allSettled(
      conventionalDaemonStamps(env, options.platform).map(async (stamp) => {
        // Treat the client endpoint as opaque; retain the POSIX ownership gate.
        const socket = await lstat(resolveSidecarClientEndpoint(stamp));
        if (!socket.isSocket() || socket.uid !== process.getuid?.()) return null;
        const status = await getSidecarStatus<DaemonStatusSnapshot>(stamp, { timeoutMs });
        return status?.url && isLoopbackHttpUrl(status.url) ? status.url : null;
      }),
    );
    const urls = new Set(results.flatMap((result) =>
      result.status === "fulfilled" && result.value != null ? [result.value] : [],
    ));
    // Ambiguity must stop all later discovery and install-info persistence.
    if (urls.size > 1) return { url: DEFAULT_DAEMON_URL, ambiguous: true };
    if (urls.size === 1) return { url: [...urls][0]!, ambiguous: false };
  }
  const toolsDevUrl = await discoverDaemonUrlFromToolsDev(env, options.timeoutMs ?? 800);
  if (toolsDevUrl != null) return { url: toolsDevUrl, ambiguous: false };
  if (options.allowLegacyDefault === false) {
    throw new Error("Open Design daemon could not be discovered. Open the app and refresh the MCP registration, or supply --daemon-url explicitly.");
  }
  return { url: DEFAULT_DAEMON_URL, ambiguous: false };
}

/** Auto-discovery accepts only bare loopback origins with an explicit port. */
export function isLoopbackHttpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (!isLoopbackHostname(parsed.hostname)) return false;
  if (parsed.username.length > 0 || parsed.password.length > 0) return false;
  if (parsed.port.length === 0) return false;
  if (parsed.pathname !== "/" && parsed.pathname !== "") return false;
  if (parsed.search.length > 0 || parsed.hash.length > 0) return false;
  return true;
}

export function currentReleasePlatform(
  proc: Pick<NodeJS.Process, "platform" | "arch"> = process,
): ReleasePlatform {
  if (proc.platform === "darwin") return proc.arch === "arm64" ? "mac" : "macIntel";
  if (proc.platform === "win32") return "win";
  return "linux";
}

/** Product identities only; private endpoint derivation and transport stay in sidecar. */
export function conventionalDaemonStamps(
  env: NodeJS.ProcessEnv,
  platform: ReleasePlatform = currentReleasePlatform(),
): SidecarStamp[] {
  if (platform === "win") return [];
  const explicitNamespace = env[SIDECAR_ENV.NAMESPACE];
  // Preserve the previously shipped named lanes, plus an explicitly named release.
  const namedChannel = explicitNamespace ? releaseChannelFromNamespace(explicitNamespace) : null;
  const channels = new Set<string>([...Object.values(RELEASE_CHANNELS), "betas", "preview"]);
  if (namedChannel != null) channels.add(namedChannel);
  return [...channels].flatMap((channel) => {
    const namespaces = explicitNamespace
      ? [explicitNamespace]
      : [...releaseNamespaceCandidates(channel, platform), SIDECAR_DEFAULTS.namespace];
    return namespaces.flatMap((namespace) =>
      ["packaged", "tools-pack"].flatMap((source) =>
        ["runtime", "headless"].map((mode) => ({
          app: APP_KEYS.DAEMON, channel, namespace, source, mode,
        })),
      ),
    );
  });
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
