import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

import { SIDECAR_DEFAULTS, normalizeNamespace } from "@open-design/sidecar-proto";

export type WebuiCommand = "start" | "stop" | "status";

export type WebuiFlags = {
  port?: number;
  daemonPort?: number;
  host?: string;
  token?: string;
  openBrowser?: boolean;
  json?: boolean;
  config?: string;
  /** run attached to the terminal instead of detaching into the background. */
  foreground?: boolean;
  /** launcher output locale override (e.g. "en", "zh-CN"). */
  lang?: string;
};

export type WebuiConfigFile = {
  /** Browser-facing web port (the web child's listen port). */
  port?: number;
  /** Daemon listen port; omit or 0 means a random loopback port (internal, local-only). */
  daemonPort?: number;
  host?: string;
  token?: string;
  openBrowser?: boolean;
  namespace?: string;
  dataDir?: string | null;
  /** launcher output locale (e.g. "en", "zh-CN"). */
  lang?: string;
};

export type ResolvedWebuiConfig = {
  port: number;
  /** null means a dynamic loopback port (the default). */
  daemonPort: number | null;
  host: string;
  token: string | null;
  openBrowser: boolean;
  namespace: string | null;
  dataDir: string | null;
};

const DEFAULT_PORT = 7456;
// Fixed default daemon port (web + 1) so the internal daemon address is stable
// across restarts instead of a random loopback port. Set daemonPort to 0 to opt
// back into dynamic allocation.
const DEFAULT_DAEMON_PORT = 7457;
const DEFAULT_HOST = "127.0.0.1";
const COMMANDS = new Set<WebuiCommand>(["start", "stop", "status"]);

export function parseWebuiArgs(argv: string[]): { command: WebuiCommand; flags: WebuiFlags } {
  const flags: WebuiFlags = {};
  let command: WebuiCommand = "start";
  let i = 0;

  if (argv.length > 0 && !argv[0].startsWith("-")) {
    const candidate = argv[0];
    if (!COMMANDS.has(candidate as WebuiCommand)) {
      throw new Error(`unknown command: ${candidate} (expected start|stop|status)`);
    }
    command = candidate as WebuiCommand;
    i = 1;
  }

  for (; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--port":
        flags.port = Number(argv[++i]);
        if (!Number.isInteger(flags.port)) throw new Error("--port must be an integer");
        break;
      case "--daemon-port":
        flags.daemonPort = Number(argv[++i]);
        if (!Number.isInteger(flags.daemonPort)) throw new Error("--daemon-port must be an integer");
        break;
      case "--host":
        flags.host = argv[++i];
        break;
      case "--token":
        flags.token = argv[++i];
        break;
      case "--config":
        flags.config = argv[++i];
        break;
      case "--no-open":
        flags.openBrowser = false;
        break;
      case "--foreground":
        flags.foreground = true;
        break;
      case "--lang":
        flags.lang = argv[++i];
        break;
      case "--json":
        flags.json = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { command, flags };
}

export function loadConfigFile(path: string): WebuiConfigFile | null {
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as WebuiConfigFile;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`failed to read config file ${path}: ${(error as Error).message}`);
  }
}

export function resolveWebuiConfig(input: {
  flags: WebuiFlags;
  configFile: WebuiConfigFile | null;
  env: NodeJS.ProcessEnv;
}): ResolvedWebuiConfig {
  const { flags, configFile, env } = input;
  const cfg = configFile ?? {};

  const envPort = env.OD_WEB_PORT != null ? Number(env.OD_WEB_PORT) : undefined;
  const port =
    flags.port ?? cfg.port ?? (Number.isInteger(envPort) ? (envPort as number) : undefined) ?? DEFAULT_PORT;

  // daemonPort defaults to the fixed DEFAULT_DAEMON_PORT so the internal daemon
  // address is deterministic across restarts. An explicit 0 (flag/config/env)
  // opts back into a random loopback port chosen by the daemon (OD_PORT=0),
  // which resolves to null here.
  const envDaemonPort = env.OD_PORT != null ? Number(env.OD_PORT) : undefined;
  const daemonPortRaw =
    flags.daemonPort ??
    cfg.daemonPort ??
    (Number.isInteger(envDaemonPort) ? (envDaemonPort as number) : undefined) ??
    DEFAULT_DAEMON_PORT;
  const daemonPort = daemonPortRaw > 0 ? daemonPortRaw : null;

  const host = flags.host ?? cfg.host ?? env.OD_BIND_HOST ?? DEFAULT_HOST;
  const token = flags.token ?? cfg.token ?? env.OD_API_TOKEN ?? null;
  const openBrowser = flags.openBrowser ?? cfg.openBrowser ?? true;
  const namespace = cfg.namespace ?? env.OD_PACKAGED_NAMESPACE ?? null;
  const dataDir = cfg.dataDir ?? env.OD_DATA_DIR ?? null;

  return { port, daemonPort, host, token, openBrowser, namespace, dataDir };
}

/**
 * The canonical default `webui.config.json` body, written when first-run
 * scaffolding finds no example to copy. Mirrors the built-in defaults and
 * surfaces BOTH ports so users can see what is configurable: `port` is the
 * browser-facing web port; `daemonPort` 0 documents the dynamic-loopback
 * default (set a real port only to pin/expose the internal daemon API).
 */
export function defaultWebuiConfigFileContents(): string {
  const body = {
    port: DEFAULT_PORT,
    daemonPort: DEFAULT_DAEMON_PORT,
    host: DEFAULT_HOST,
    token: null,
    openBrowser: true,
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}

// Maps the *bind* host to a host a browser can actually open. A bind-all host
// (0.0.0.0 / ::) is not browsable, so we surface the machine's first
// non-internal LAN IPv4 instead; loopback binds show as "localhost"; a concrete
// host passes through. Interfaces are injectable for tests.
export function resolveDisplayHost(
  host: string,
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces(),
): string {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  const isBindAll = normalized === "0.0.0.0" || normalized === "::" || normalized === "";
  if (isBindAll) {
    for (const addrs of Object.values(interfaces)) {
      for (const addr of addrs ?? []) {
        if (addr.family === "IPv4" && !addr.internal) return addr.address;
      }
    }
    return "localhost";
  }
  return isLoopbackHost(host) ? "localhost" : host;
}

// Makes a host safe to interpolate into a URL authority. A bare IPv6 literal
// (e.g. `fd00::10`, or `::1`) must be bracketed — `http://fd00::10:7456` is not
// parseable, `http://[fd00::10]:7456` is. IPv4 addresses, hostnames, and
// already-bracketed literals pass through unchanged.
export function formatHostForUrl(host: string): string {
  if (host.startsWith("[")) return host;
  return isIP(host) === 6 ? `[${host}]` : host;
}

// Builds an `http://host:port` URL with an IPv6-safe authority. `host` is the
// already-resolved DISPLAY host (see {@link resolveDisplayHost}); this is the
// single chokepoint that brackets IPv6 literals so every printed/opened URL is
// actually parseable.
export function composeHttpUrl(host: string, port: number | string): string {
  return `http://${formatHostForUrl(host)}:${port}`;
}

// Serializes a resolved runtime config back to the on-disk file shape. Used when
// a config file must be CREATED from scratch (an explicit `--config <path>` that
// was never scaffolded), so the file captures the full runtime — not just the
// token. `daemonPort` null (dynamic) round-trips as 0 to preserve the
// dynamic-loopback semantics; null `namespace`/`dataDir` are omitted (absent =
// default).
function resolvedConfigToFile(resolved: ResolvedWebuiConfig): WebuiConfigFile {
  const file: WebuiConfigFile = {
    port: resolved.port,
    daemonPort: resolved.daemonPort ?? 0,
    host: resolved.host,
    openBrowser: resolved.openBrowser,
  };
  if (resolved.namespace != null) file.namespace = resolved.namespace;
  if (resolved.dataDir != null) file.dataDir = resolved.dataDir;
  return file;
}

// Persists an auto-generated token into webui.config.json so the next start
// reuses it instead of minting a new one. When the target file already exists,
// its keys are preserved and only the token is added. When it does NOT exist
// yet — notably an explicit `--config <path>` that discoverConfigFile()
// deliberately did not scaffold — the FULL resolved runtime shape is written so
// a follow-up `start --config <path>` reproduces the same host/port/namespace/
// dataDir instead of silently falling back to defaults. Never throws on a
// read-only dir — the caller falls back to an in-memory token for this run.
export function persistTokenToConfig(
  configPath: string,
  token: string,
  resolved: ResolvedWebuiConfig,
): { persisted: boolean; error?: string } {
  try {
    const base: WebuiConfigFile = existsSync(configPath)
      ? (JSON.parse(readFileSync(configPath, "utf8")) as WebuiConfigFile)
      : resolvedConfigToFile(resolved);
    const next = { ...base, token };
    writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return { persisted: true };
  } catch (error) {
    return { persisted: false, error: (error as Error).message };
  }
}

// A "documentation key" in the shipped example: any object key whose name
// starts with `//`. The example uses `"// <field>": "<description>"` siblings to
// annotate fields while staying valid JSON. These are stripped before a
// webui.config.json is generated so the live config is pure data.
function isDocCommentKey(key: string): boolean {
  return key.startsWith("//");
}

// Builds the comment-free webui.config.json body. When the shipped example is
// present, its real VALUES seed the config (so a packager can tune defaults via
// the example) but its `//` documentation keys are stripped — the generated
// file must never carry description text, which would otherwise show up as
// unknown/garbage config keys. A missing or unparseable example falls back to
// the built-in defaults so first-run always yields a valid config.
function scaffoldContentsFromExample(examplePath: string): string {
  if (!existsSync(examplePath)) return defaultWebuiConfigFileContents();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(examplePath, "utf8")) as Record<string, unknown>;
  } catch {
    return defaultWebuiConfigFileContents();
  }
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!isDocCommentKey(key)) clean[key] = value;
  }
  return `${JSON.stringify(clean, null, 2)}\n`;
}

/**
 * First-run convenience: materialize `webui.config.json` when it does not yet
 * exist, seeding it from the shipped `webui.config.example.json` (with its `//`
 * documentation keys stripped) when present and otherwise writing
 * {@link defaultWebuiConfigFileContents}. The generated file is always pure
 * data — descriptions live only in the example, never in the live config — so
 * it can never fail JSON.parse or carry placeholder/invalid values. Returns
 * whether a file was created. Never throws on a read-only install dir — the
 * caller keeps running on resolved defaults and only surfaces a notice.
 */
export function ensureWebuiConfigScaffold(input: {
  configPath: string;
  examplePath: string;
}): { created: boolean; error?: string } {
  if (existsSync(input.configPath)) return { created: false };
  try {
    writeFileSync(input.configPath, scaffoldContentsFromExample(input.examplePath), "utf8");
    return { created: true };
  } catch (error) {
    return { created: false, error: (error as Error).message };
  }
}

// Mirrors the daemon's isLoopbackHostname (apps/daemon/src/server.ts): the
// net.isIP guard is required so this launcher's "is loopback → skip token"
// decision can never disagree with the daemon's "non-loopback → require token"
// enforcement. A malformed host like "127.garbage" must be treated as
// non-loopback by BOTH, or the launcher skips token generation while the daemon
// refuses to start without one.
export function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (normalized === "localhost") return true;
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  if (isIP(normalized) === 4) return normalized === "127.0.0.1" || normalized.startsWith("127.");
  return false;
}

// The runtime namespace a webui command targets: explicit config namespace >
// OD_PACKAGED_NAMESPACE env override > packaged default, normalized. INVARIANT:
// `start` (which creates the desktop IPC socket) and `stop`/`status` (which
// probe that socket) MUST resolve the SAME namespace, or stop/status looks at
// the default socket and reports "not running" for a live config-driven
// instance. Both call sites derive their namespace through this one function.
export function resolveRuntimeNamespace(
  config: Pick<ResolvedWebuiConfig, "namespace">,
  env: NodeJS.ProcessEnv,
): string {
  return normalizeNamespace(config.namespace ?? env.OD_PACKAGED_NAMESPACE ?? SIDECAR_DEFAULTS.namespace);
}

// Classifies an IPC request failure as "no live worker is listening" (vs a real
// failure that must surface). Only a missing socket (ENOENT) or refused
// connection (ECONNREFUSED) means not-running — those are how `createConnection`
// fails when nothing is accepting on the namespace. A timeout, permission error
// (EACCES/EPERM), or protocol/`ok:false` rejection means the request reached a
// wedged worker or hit a real bug, so stop/status must NOT report "stopped" and
// orphan a live service — the caller rethrows those.
export function isNotRunningIpcError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ECONNREFUSED";
}

// An explicit `--config <path>` MUST point at an existing file. Treating a
// missing explicit path as "no config" silently falls back to the default
// namespace/port/host: `start` would ignore the caller's chosen location, and a
// later `stop`/`status --config <missing>` would probe the DEFAULT namespace and
// could stop the wrong instance. So fail fast instead. A missing path is fine
// only when none was given (the auto-discovered default gets scaffolded). `exists`
// is injectable for tests.
export function assertExplicitConfigExists(
  explicitPath: string | undefined,
  exists: (p: string) => boolean = existsSync,
): void {
  if (explicitPath == null) return;
  const resolved = resolve(explicitPath);
  if (!exists(resolved)) {
    throw new Error(
      `config file not found: ${resolved}. An explicit --config path must exist; ` +
        `falling back to defaults would target the wrong namespace/port.`,
    );
  }
}

export function generateApiToken(): string {
  return `odtoken_${randomBytes(32).toString("base64url")}`;
}

export function hasDisplay(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): boolean {
  if (platform === "win32") return true;
  if (platform === "darwin") return env.SSH_CONNECTION == null;
  return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
}
