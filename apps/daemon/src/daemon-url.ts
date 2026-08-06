import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELEASE_CHANNELS,
  releaseNamespaceCandidates,
  type ReleasePlatform,
} from "@open-design/release";
import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_DEFAULTS,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  type DaemonStatusSnapshot,
} from "@open-design/sidecar-proto";
import { requestJsonIpc, resolveAppIpcPath } from "@open-design/sidecar";
import { isLoopbackHostname } from "./http/local-daemon-request.js";

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
  /**
   * Test-only override for the `ReleasePlatform` that
   * `conventionalIpcSocketPaths` derives from `process.platform`/
   * `process.arch` via `currentReleasePlatform()`. Production callers should
   * never set this. It exists so tests can exercise the macIntel/win
   * candidate-list branches directly instead of mutating global process
   * state (the previous approach, which the #6425 review flagged as making
   * this code hard to test safely under concurrent test execution).
   */
  platform?: ReleasePlatform;
}

/**
 * Outcome of the sidecar IPC discovery stage, distinguishing "nothing
 * answered" (the caller should keep trying the next discovery mechanism)
 * from "more than one channel answered and this function refuses to guess
 * which one is meant" (the caller must NOT keep trying — see
 * `resolveDaemonUrl`'s handling of `kind: "ambiguous"`). Collapsing both
 * into a bare `null` was the bug the #6425 review caught: `resolveDaemonUrl`
 * would fall through to `discoverDaemonUrlFromToolsDev` either way, so an
 * ambiguous conventional-discovery result could still be silently
 * overridden by an unrelated live tools-dev daemon.
 */
type IpcDiscoveryResult =
  | { kind: "found"; url: string }
  | { kind: "not-found" }
  | { kind: "ambiguous" };

/**
 * `resolveDaemonUrlDetailed`'s result. `url` is always a usable HTTP base —
 * legacy callers that only need the URL string can keep calling
 * `resolveDaemonUrl` — but `ambiguous` is the load-bearing field for any
 * caller that is about to PERSIST something derived from fetching that URL
 * (see `resolveMcpLaunchSpec` in cli.ts).
 *
 * `url` being `DEFAULT_DAEMON_URL` does NOT by itself mean "no daemon was
 * found and this is inert": it's also what's returned when discovery was
 * ambiguous, and *something* could coincidentally be listening on that
 * hardcoded legacy port during the exact window a caller queries it (a
 * leftover process, an unrelated local service, even one of the very
 * packaged channels this call refused to choose between). The #6425 review
 * reproduced exactly this: two live channel sockets plus a plain HTTP
 * server on 127.0.0.1:7456 caused `resolveMcpLaunchSpec` to fetch and
 * persist that server's response despite the ambiguity guard. A caller
 * that skips its own fetch/persist step whenever `ambiguous` is true does
 * not have this problem, regardless of what `url` happens to be.
 */
export interface ResolveDaemonUrlResult {
  url: string;
  ambiguous: boolean;
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
 *
 * A thin wrapper over `resolveDaemonUrlDetailed` for callers that only need
 * the URL string and never persist anything derived from fetching it. Any
 * caller that DOES persist something (currently just `resolveMcpLaunchSpec`
 * in cli.ts) must call `resolveDaemonUrlDetailed` directly instead and
 * check its `ambiguous` field — see that function's doc comment for why a
 * bare URL string cannot safely carry this distinction on its own.
 */
export async function resolveDaemonUrl(
  options: ResolveDaemonUrlOptions = {},
): Promise<string> {
  return (await resolveDaemonUrlDetailed(options)).url;
}

/**
 * Like `resolveDaemonUrl`, but also reports whether the result came from an
 * ambiguous multi-channel discovery (see `ResolveDaemonUrlResult`).
 *
 * An ambiguous IPC result (more than one packaged channel answered, see
 * `IpcDiscoveryResult`) skips tools-dev discovery entirely and returns the
 * legacy default directly with `ambiguous: true` — refusing to guess
 * extends to every later discovery mechanism, not just the conventional
 * channel sweep, since a live tools-dev daemon answering in that window is
 * just as much an unrelated runtime as a wrongly-picked packaged channel
 * would have been.
 */
export async function resolveDaemonUrlDetailed(
  options: ResolveDaemonUrlOptions = {},
): Promise<ResolveDaemonUrlResult> {
  const env = options.env ?? process.env;
  const flagUrl = options.flagUrl ?? null;
  if (flagUrl != null && flagUrl.length > 0) return { url: flagUrl, ambiguous: false };
  const envUrl = env.OD_DAEMON_URL;
  if (envUrl != null && envUrl.length > 0) return { url: envUrl, ambiguous: false };
  const discovered = await discoverDaemonUrlFromIpc(
    env,
    options.timeoutMs ?? 800,
    options.allowConventionalIpcDiscovery ?? false,
    options.platform,
  );
  if (discovered.kind === "found") return { url: discovered.url, ambiguous: false };
  if (discovered.kind === "ambiguous") return { url: DEFAULT_DAEMON_URL, ambiguous: true };
  const toolsDevUrl = await discoverDaemonUrlFromToolsDev(env, options.timeoutMs ?? 800);
  if (toolsDevUrl != null) return { url: toolsDevUrl, ambiguous: false };
  return { url: DEFAULT_DAEMON_URL, ambiguous: false };
}

async function discoverDaemonUrlFromIpc(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  allowConventionalIpcDiscovery: boolean,
  platform?: ReleasePlatform,
): Promise<IpcDiscoveryResult> {
  const explicitSocketPath = env[SIDECAR_ENV.IPC_PATH];
  if (explicitSocketPath != null && explicitSocketPath.length > 0) {
    // Unrestricted: this path is a concrete endpoint the lifecycle owner
    // supplied for THIS session, not a guessed/predictable one, so neither
    // the loopback nor the ownership gate applies here. A daemon started
    // with a non-default --host (Tailscale, a specific interface, …) must
    // keep working when the caller was explicitly told its socket path.
    // Never ambiguous: exactly one concrete path is ever probed here.
    const url = await probeIpcSocket(explicitSocketPath, timeoutMs);
    return url != null ? { kind: "found", url } : { kind: "not-found" };
  }
  if (!allowConventionalIpcDiscovery) return { kind: "not-found" };
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
  const candidates = conventionalIpcSocketPaths(env, platform);
  if (candidates.length === 0) return { kind: "not-found" };
  const results = await Promise.allSettled(
    candidates.map((socketPath) =>
      probeIpcSocket(socketPath, timeoutMs, { requireLoopback: true, requireOwnerMatch: true }),
    ),
  );
  // Distinct successful responses only. An explicit OD_SIDECAR_NAMESPACE
  // always yields exactly one candidate above, so ambiguity can only arise
  // from the channel sweep in conventionalIpcSocketPaths(). If MORE THAN ONE
  // distinct daemon answers (e.g. a stable install and a beta install both
  // happen to be running), this function has no way to know which one the
  // invoking `od` binary or user actually meant — a prior version of this
  // code deterministically preferred "stable", but determinism is not
  // correctness: resolveMcpLaunchSpec() would persist that guess's absolute
  // paths into the agent's config, silently wiring it to the WRONG packaged
  // channel. Reports `kind: "ambiguous"` instead of a bare `null` so
  // `resolveDaemonUrl` stops entirely rather than letting a DIFFERENT
  // unrelated discovery mechanism (tools-dev) silently win in this case —
  // see `IpcDiscoveryResult`'s doc comment and the #6425 review discussion.
  // Deduplicated by URL VALUE, not candidate count: releaseNamespaceCandidates()
  // can list more than one namespace alias for the same channel (see
  // conventionalIpcSocketPaths()), and two aliases resolving to the same
  // live daemon is not actually ambiguous.
  const found = results
    .filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled" && result.value != null)
    .map((result) => result.value);
  const distinct = Array.from(new Set(found));
  if (distinct.length === 0) return { kind: "not-found" };
  if (distinct.length > 1) return { kind: "ambiguous" };
  return { kind: "found", url: distinct[0]! };
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
 * Whether `url` is a bare http(s) loopback origin: scheme, loopback host,
 * and an explicit port — nothing else. Only applied to conventional-path
 * candidates (see `probeIpcSocket`'s `requireLoopback`) — it must NOT gate
 * the pre-existing explicit `OD_SIDECAR_IPC_PATH` case, which can
 * legitimately point at a non-default `--host` (Tailscale, a specific
 * interface, …). This rules out a predictable-socket responder redirecting
 * discovery off-host, or onto a non-base URL (embedded credentials, a
 * sub-path, a query string, a fragment) that `resolveMcpLaunchSpec` would
 * otherwise blindly append `/api/mcp/install-info` onto; it does not by
 * itself prove the responder IS the real daemon — see
 * `isOwnedByCurrentProcess`.
 *
 * Delegates hostname classification to `isLoopbackHostname` (the same
 * predicate the daemon's own inbound request validation uses in
 * `http/local-daemon-request.ts`) instead of an exact-match list, so this
 * accepts the full 127.0.0.0/8 range. A packaged daemon started with e.g.
 * `OD_BIND_HOST=127.0.0.2` is an already-supported local configuration
 * whose own bind validation accepts it; conventional discovery rejecting it
 * (falling back to 7456, where nothing listens) would be a regression for
 * that case, not a security improvement — 127/8 is loopback regardless of
 * which address in the block is used. `isLoopbackHostname` also strips the
 * `[...]` brackets WHATWG URL puts around IPv6 literals, so this stays
 * correct for `[::1]`-style hosts without a separate bracket check.
 *
 * `isLoopbackHostname` classifies the URL's HOSTNAME STRING; it does not
 * verify the later HTTP fetch in `resolveMcpLaunchSpec` actually lands on a
 * loopback network interface. In particular, accepting the literal string
 * "localhost" relies on the OS/hosts-file resolving it to a loopback address
 * — a local trust boundary this module does not independently re-verify.
 * Treat this function as "rules out a hostname that does not even claim to
 * be loopback", not as an end-to-end network guarantee.
 */
export function isLoopbackHttpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (!isLoopbackHostname(parsed.hostname)) return false;
  // A real daemon STATUS response is always a bare origin at an explicit
  // ephemeral port. Rejecting anything else means a predictable-socket
  // responder can't smuggle credentials, a redirect-ish sub-path, or a query
  // string through discovery — resolveMcpLaunchSpec (cli.ts) appends
  // `/api/mcp/install-info` to this value as a plain string, so a non-base
  // URL here would produce a surprising fetch target even when the host
  // itself is legitimately loopback.
  if (parsed.username.length > 0 || parsed.password.length > 0) return false;
  if (parsed.port.length === 0) return false;
  if (parsed.pathname !== "/" && parsed.pathname !== "") return false;
  if (parsed.search.length > 0 || parsed.hash.length > 0) return false;
  return true;
}

/**
 * Whether the unix socket FILE at `socketPath` is owned by the current
 * process's effective user, checked via `statSync` immediately before
 * `probeIpcSocket` calls `requestJsonIpc` to connect to it. This is a
 * mitigation, not a proof of identity, in two distinct ways that are worth
 * stating plainly rather than implying a stronger guarantee than either
 * actually provides:
 *
 * 1. TOCTOU: the filesystem object at `socketPath` could in principle be
 *    replaced (unlinked and re-bound by a different process) between this
 *    `statSync` and the `connect()` `requestJsonIpc` performs immediately
 *    after. Node's `net` module has no atomic "connect, then check who you
 *    connected to" primitive for unix sockets, so this check and the
 *    connect it gates are two separate syscalls with a real, if narrow,
 *    window between them.
 * 2. File ownership is not peer identity: even without the TOCTOU race,
 *    "the socket file is owned by my uid" proves that SOME process running
 *    as this uid created or was granted ownership of that path — not that
 *    the process CURRENTLY answering on it is the one this call intended to
 *    reach. A real trust boundary needs OS peer credentials (`SO_PEERCRED`
 *    on Linux, `LOCAL_PEERCRED` on macOS/BSD), which Node's `net` module
 *    does not expose without native code; that is out of scope for this
 *    fix.
 *
 * What this DOES reliably block: a DIFFERENT OS user (no shared uid)
 * squatting the predictable path and answering as though it were the
 * daemon — e.g. while the real daemon is stopped/restarting, which
 * `resolveMcpLaunchSpec` would otherwise treat as authoritative and fetch
 * `/api/mcp/install-info` from. It does NOT defend against other processes
 * already running as THIS SAME user (other local malware, say), which is a
 * materially different and harder threat model requiring the
 * protocol-level authentication noted above, in `packages/sidecar`.
 *
 * POSIX-only: `process.getuid` does not exist on Windows, and Windows named
 * pipes use a different ACL model this module does not verify yet, so
 * `conventionalIpcSocketPaths` returns no candidates on `win32`/`"win"` and
 * this function is never reached there in practice.
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
 * The `ReleasePlatform` this process is currently running as, derived from
 * `platform`/`arch` (defaulting to the real `process` object). Accepts an
 * injectable subset of `NodeJS.Process` purely so tests can exercise the
 * mac/macIntel/win/linux branches of `conventionalIpcSocketPaths` directly
 * — via that function's own `platform` parameter — instead of mutating
 * `process.platform`/`process.arch` globals, which the #6425 review flagged
 * as fragile under concurrent test execution. Production code should always
 * call this with no argument.
 */
export function currentReleasePlatform(
  proc: Pick<NodeJS.Process, "platform" | "arch"> = process,
): ReleasePlatform {
  if (proc.platform === "darwin") return proc.arch === "arm64" ? "mac" : "macIntel";
  if (proc.platform === "win32") return "win";
  return "linux";
}

/**
 * Conventional per-release-channel sidecar IPC socket paths, stable-channel
 * first. Bounded to the product's own known channels (`@open-design/release`)
 * plus the generic library default so an absent daemon still fails fast —
 * probes run concurrently via `Promise.allSettled` in the caller, so the
 * wall-clock cost stays bounded by a single timeout regardless of candidate
 * count, not their sum.
 *
 * Honors an explicit `OD_SIDECAR_NAMESPACE` when present (cheap extra check,
 * mirrors the explicit-namespace precedence `resolveNamespace` already uses
 * elsewhere); otherwise resolves `platform` (defaulting to
 * `currentReleasePlatform()`; callers never need to pass this explicitly in
 * production — see that function's doc comment) and tries every known
 * release channel via `releaseNamespaceCandidates` — which also surfaces any
 * legacy namespace aliases a channel/platform pair is still shipping under
 * (see `@open-design/release`'s own doc comment for the one known outlier,
 * beta on Intel mac) — THEN the bare `SIDECAR_DEFAULTS.namespace`
 * ("default"). The packaged desktop app always stamps an explicit
 * `release-<channel>` namespace, but `tools-pack` installs whose version
 * string doesn't resolve to a known channel (`defaultNamespaceForAppVersion`
 * in `tools/pack/src/config.ts`) fall through to the bare sidecar-proto
 * default instead — release channels are tried first since they're the more
 * common (packaged app) case, with "default" as the deterministic last
 * resort. Namespace/alias identity is intentionally NOT this module's
 * concern beyond converting a namespace string into an IPC path: it is owned
 * by `@open-design/release`, which is the layer four straight rounds of
 * review found new namespace-derivation gaps in before this split (see
 * #6425 review discussion) — keeping that knowledge in one place is what
 * prevents a fifth.
 *
 * Returns no candidates when `platform` is `"win"`: the ownership check this
 * discovery mode requires (`isOwnedByCurrentProcess`) has no Windows
 * implementation yet, and probing a predictable named pipe without any
 * ownership/identity check is exactly the gap this module is trying to
 * close, not widen. This is a known, intentional scope limit of this fix —
 * see issue #6424's follow-up for Windows-specific coverage — not an
 * oversight.
 */
export function conventionalIpcSocketPaths(
  env: NodeJS.ProcessEnv,
  platform: ReleasePlatform = currentReleasePlatform(),
): string[] {
  if (platform === "win") return [];
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
  const orderedChannels = [
    RELEASE_CHANNELS.STABLE,
    RELEASE_CHANNELS.BETA,
    RELEASE_CHANNELS.BETAS,
    RELEASE_CHANNELS.PRERELEASE,
    RELEASE_CHANNELS.PREVIEW,
  ] as const;
  const orderedNamespaces: string[] = [
    ...orderedChannels.flatMap((channel) => releaseNamespaceCandidates(channel, platform)),
    SIDECAR_DEFAULTS.namespace,
  ];
  return orderedNamespaces.map((namespace) =>
    resolveAppIpcPath({
      app: APP_KEYS.DAEMON,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      env,
      namespace,
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
