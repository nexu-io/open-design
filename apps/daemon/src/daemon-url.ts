import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_CHANNELS,
  releaseNamespace,
  type ReleasePlatform,
} from "@open-design/release";
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
  /**
   * Opt-in: when `OD_SIDECAR_IPC_PATH` is absent, also probe the
   * conventional per-release-channel sidecar socket path(s) (see
   * `conventionalIpcSocketPaths`) before falling through to `tools-dev`
   * discovery and the legacy default. Defaults to `false` so every existing
   * `resolveDaemonUrl` caller (media generate, project list, run start, …)
   * keeps its current behavior unchanged — an unrelated already-running
   * packaged daemon must not silently start answering for commands that
   * never asked for daemon auto-discovery beyond an explicit IPC path.
   * `resolveMcpLaunchSpec` (cli.ts, `od mcp install <agent>`) is the one
   * caller that opts in: a plain terminal invocation of that command has no
   * other way to find a packaged install's daemon. See issue #6424.
   *
   * A candidate response is only trusted when it is both a loopback URL
   * (rules out off-host redirection) and the socket file is owned by this
   * process's effective user (rules out a different local user squatting
   * the predictable path — see `isOwnedByCurrentProcess`). Neither check
   * applies to the explicit `OD_SIDECAR_IPC_PATH` path above, which is a
   * concrete endpoint the lifecycle owner supplied rather than a guessed
   * one. POSIX-only for now: `conventionalIpcSocketPaths` yields no
   * candidates on `win32`.
   */
  allowConventionalIpcDiscovery?: boolean;
}

/**
 * Resolve the daemon HTTP base URL for `od` client commands.
 *
 * Spawn order: explicit `--daemon-url` flag, `OD_DAEMON_URL` env, then
 * a STATUS roundtrip to the concrete sidecar IPC endpoint supplied by
 * the lifecycle owner in `OD_SIDECAR_IPC_PATH` (optionally falling back to
 * the conventional per-channel socket path(s) when that env var is absent —
 * see `allowConventionalIpcDiscovery` / `conventionalIpcSocketPaths`), then
 * the default `tools-dev status --json` runtime. Falls back to the legacy
 * default for direct `od` launches that do not run as a sidecar.
 */
export async function resolveDaemonUrl(
  options: ResolveDaemonUrlOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const flagUrl = options.flagUrl ?? null;
  if (flagUrl != null && flagUrl.length > 0) return flagUrl;
  const envUrl = env.OD_DAEMON_URL;
  if (envUrl != null && envUrl.length > 0) return envUrl;
  const discovered = await discoverDaemonUrlFromIpc(
    env,
    options.timeoutMs ?? 800,
    options.allowConventionalIpcDiscovery ?? false,
  );
  if (discovered != null) return discovered;
  const toolsDevUrl = await discoverDaemonUrlFromToolsDev(env, options.timeoutMs ?? 800);
  if (toolsDevUrl != null) return toolsDevUrl;
  return DEFAULT_DAEMON_URL;
}

async function discoverDaemonUrlFromIpc(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  allowConventionalIpcDiscovery: boolean,
): Promise<string | null> {
  const explicitSocketPath = env[SIDECAR_ENV.IPC_PATH];
  if (explicitSocketPath != null && explicitSocketPath.length > 0) {
    // Unrestricted: this path is a concrete endpoint the lifecycle owner
    // supplied for THIS session, not a guessed/predictable one, so neither
    // the loopback nor the ownership gate applies here. A daemon started
    // with a non-default --host (Tailscale, a specific interface, …) must
    // keep working when the caller was explicitly told its socket path.
    return await probeIpcSocket(explicitSocketPath, timeoutMs);
  }
  if (!allowConventionalIpcDiscovery) return null;
  // `OD_SIDECAR_IPC_PATH` is only ever stamped by the packaged app into its
  // OWN spawned child processes (see apps/packaged/src/sidecars.ts) — an
  // ordinary user terminal never has it set. Without this fallback, `od mcp
  // install <agent>` run from a plain shell against a running packaged
  // install can never find `/api/mcp/install-info` and always degrades to
  // the broken bare-`od` launch spec in cli.ts's resolveMcpLaunchSpec, even
  // though a live daemon is reachable at a well-known socket path. Gated
  // behind `allowConventionalIpcDiscovery` so every other `od` subcommand
  // keeps requiring an explicit IPC path / --daemon-url instead of silently
  // latching onto an unrelated already-running packaged daemon. See #6424.
  const candidates = conventionalIpcSocketPaths(env);
  if (candidates.length === 0) return null;
  const results = await Promise.allSettled(
    candidates.map((socketPath) =>
      probeIpcSocket(socketPath, timeoutMs, { requireLoopback: true, requireOwnerMatch: true }),
    ),
  );
  for (const result of results) {
    if (result.status === "fulfilled" && result.value != null) return result.value;
  }
  return null;
}

async function probeIpcSocket(
  socketPath: string,
  timeoutMs: number,
  options: { requireLoopback?: boolean; requireOwnerMatch?: boolean } = {},
): Promise<string | null> {
  if (options.requireOwnerMatch && !isOwnedByCurrentProcess(socketPath)) return null;
  try {
    const status = await requestJsonIpc<DaemonStatusSnapshot>(
      socketPath,
      { type: SIDECAR_MESSAGES.STATUS },
      { timeoutMs },
    );
    const url = status?.url ?? null;
    if (url == null) return null;
    if (options.requireLoopback && !isLoopbackHttpUrl(url)) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Whether `url` is an http(s) URL whose host is loopback. Only applied to
 * conventional-path candidates (see `probeIpcSocket`'s `requireLoopback`) —
 * it must NOT gate the pre-existing explicit `OD_SIDECAR_IPC_PATH` case,
 * which can legitimately point at a non-default `--host` (Tailscale, a
 * specific interface, …). This rules out a predictable-socket responder
 * redirecting discovery off-host; it does not by itself prove the responder
 * IS the real daemon — see `isOwnedByCurrentProcess`.
 */
function isLoopbackHttpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return parsed.hostname === "127.0.0.1" || parsed.hostname === "::1" || parsed.hostname === "localhost";
}

/**
 * Whether the unix socket at `socketPath` is owned by the current process's
 * effective user. Loopback alone only rules out off-host redirection — on a
 * predictable, unauthenticated path (see `conventionalIpcSocketPaths`),
 * another local process could still occupy the path (e.g. while the real
 * daemon is stopped/restarting) and answer with a loopback URL of its own,
 * which `resolveMcpLaunchSpec` would then treat as authoritative and fetch
 * `/api/mcp/install-info` from. Comparing the socket file's owning uid
 * against `process.getuid()` blocks a different OS user from impersonating
 * the daemon this way (same-user impersonation, e.g. by other malware
 * already running as this user, is a materially different threat this
 * check does not — and cannot cheaply — address; that needs protocol-level
 * authentication in `packages/sidecar`).
 *
 * POSIX-only: `process.getuid` does not exist on Windows, and Windows named
 * pipes use a different ACL model this module does not verify yet, so
 * `conventionalIpcSocketPaths` returns no candidates on `win32` and this
 * function is never reached there in practice.
 */
function isOwnedByCurrentProcess(socketPath: string): boolean {
  if (typeof process.getuid !== "function") return false;
  try {
    const stat = statSync(socketPath);
    return stat.isSocket() && stat.uid === process.getuid();
  } catch {
    return false;
  }
}

/**
 * Conventional per-release-channel sidecar IPC socket paths, stable-channel
 * first. Bounded to the product's own known channels (`@open-design/release`)
 * so an absent daemon still fails fast — probes run concurrently via
 * `Promise.allSettled` in the caller, so the wall-clock cost stays bounded by
 * a single timeout regardless of candidate count, not their sum.
 *
 * Honors an explicit `OD_SIDECAR_NAMESPACE` when present (cheap extra check,
 * mirrors the explicit-namespace precedence `resolveNamespace` already uses
 * elsewhere); otherwise derives the current platform's namespace suffix from
 * `process.platform`/`process.arch` and tries every known channel.
 *
 * Returns no candidates on `win32`: the ownership check this discovery mode
 * requires (`isOwnedByCurrentProcess`) has no Windows implementation yet, and
 * probing a predictable named pipe without any ownership/identity check is
 * exactly the gap this module is trying to close, not widen.
 */
function conventionalIpcSocketPaths(env: NodeJS.ProcessEnv): string[] {
  if (process.platform === "win32") return [];
  const explicitNamespace = env[SIDECAR_ENV.NAMESPACE];
  if (explicitNamespace != null && explicitNamespace.length > 0) {
    return [
      resolveAppIpcPath({
        app: APP_KEYS.DAEMON,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        env,
        namespace: explicitNamespace,
      }),
    ];
  }
  const platform: ReleasePlatform =
    process.platform === "darwin" ? (process.arch === "arm64" ? "mac" : "macIntel") : "linux";
  const orderedChannels = [
    RELEASE_CHANNELS.STABLE,
    RELEASE_CHANNELS.BETA,
    RELEASE_CHANNELS.BETAS,
    RELEASE_CHANNELS.PRERELEASE,
    RELEASE_CHANNELS.PREVIEW,
  ] as const;
  return orderedChannels.map((channel) =>
    resolveAppIpcPath({
      app: APP_KEYS.DAEMON,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      env,
      namespace: releaseNamespace(channel, platform),
    }),
  );
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
