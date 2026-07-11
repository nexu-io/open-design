/**
 * @module proxy-env
 *
 * System proxy discovery and proxy-aware environment merging. Reads the OS
 * proxy configuration (macOS `scutil --proxy`, Windows Internet Settings
 * registry) and normalizes it into canonical `HTTP_PROXY` / `HTTPS_PROXY` /
 * `ALL_PROXY` / `NO_PROXY` / `NODE_USE_ENV_PROXY` environment variables, plus a
 * merge that keeps proxy variables consistent across layered env sources.
 *
 * Pure aside from the single `execFileSync` used to shell out to the platform
 * proxy-config tools; owns no other sibling dependency.
 */
import { execFileSync } from "node:child_process";

export type SystemProxyCommandRunner = (command: string, args: string[]) => string;

export type ResolveSystemProxyEnvOptions = {
  platform?: NodeJS.Platform;
  runCommand?: SystemProxyCommandRunner;
};

const CANONICAL_PROXY_ENV_KEYS = new Map<string, "ALL_PROXY" | "HTTP_PROXY" | "HTTPS_PROXY" | "NODE_USE_ENV_PROXY" | "NO_PROXY">([
  ["all_proxy", "ALL_PROXY"],
  ["http_proxy", "HTTP_PROXY"],
  ["https_proxy", "HTTPS_PROXY"],
  ["node_use_env_proxy", "NODE_USE_ENV_PROXY"],
  ["no_proxy", "NO_PROXY"],
]);

/** @internal Default proxy-config command runner: a short-timeout synchronous shell-out with output captured as UTF-8. */
function defaultSystemProxyCommandRunner(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 2_000,
    windowsHide: true,
  });
}

/** @internal Map a case-insensitive proxy env key to its canonical spelling, or `null` if it is not a proxy variable. */
function canonicalProxyEnvKey(
  key: string,
): "ALL_PROXY" | "HTTP_PROXY" | "HTTPS_PROXY" | "NODE_USE_ENV_PROXY" | "NO_PROXY" | null {
  return CANONICAL_PROXY_ENV_KEYS.get(key.toLowerCase()) ?? null;
}

/** @internal Delete every case-variant of a proxy env key from `env` so a canonical value can replace it cleanly. */
function deleteProxyEnvVariants(env: NodeJS.ProcessEnv, canonicalKey: string): void {
  for (const existingKey of Object.keys(env)) {
    if (existingKey.toLowerCase() === canonicalKey.toLowerCase()) delete env[existingKey];
  }
}

/** @internal Assign a canonical proxy value into `env`, clearing prior case-variants and adding lowercase aliases on POSIX. */
function setCanonicalProxyEnvValue(
  env: NodeJS.ProcessEnv,
  canonicalKey: "ALL_PROXY" | "HTTP_PROXY" | "HTTPS_PROXY" | "NODE_USE_ENV_PROXY" | "NO_PROXY",
  value: string,
  platform: NodeJS.Platform,
): void {
  deleteProxyEnvVariants(env, canonicalKey);
  if (canonicalKey === "NODE_USE_ENV_PROXY") {
    env.NODE_USE_ENV_PROXY = value;
    return;
  }
  addProxyEnvValue(env, canonicalKey, value, platform);
}

/**
 * Merge multiple env sources into one proxy-consistent environment. Proxy
 * variables are collapsed to their canonical spelling (preferring lowercase
 * inputs), non-proxy keys pass through, and `NODE_USE_ENV_PROXY=1` is set when
 * a proxy endpoint is present but the flag is not.
 *
 * @param platform - Target platform, controlling lowercase-alias emission.
 * @param sources - Env sources merged left-to-right (later sources win).
 * @returns A new merged environment with normalized proxy variables.
 */
export function mergeProxyAwareEnv(
  platform: NodeJS.Platform,
  ...sources: Array<NodeJS.ProcessEnv | Record<string, string | undefined>>
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = {};
  for (const source of sources) {
    const proxyEntries = new Map<
      "ALL_PROXY" | "HTTP_PROXY" | "HTTPS_PROXY" | "NODE_USE_ENV_PROXY" | "NO_PROXY",
      { preferLowercase: boolean; value: string }
    >();
    for (const [key, value] of Object.entries(source)) {
      if (value == null) continue;
      const canonicalKey = canonicalProxyEnvKey(key);
      if (canonicalKey) {
        const current = proxyEntries.get(canonicalKey);
        const preferLowercase = key === key.toLowerCase();
        if (!current || preferLowercase || !current.preferLowercase) {
          proxyEntries.set(canonicalKey, { preferLowercase, value });
        }
        continue;
      }
      merged[key] = value;
    }
    for (const [canonicalKey, entry] of proxyEntries) {
      setCanonicalProxyEnvValue(merged, canonicalKey, entry.value, platform);
    }
  }
  if (hasProxyEndpointEnv(merged) && !hasCanonicalProxyEnv(merged, "NODE_USE_ENV_PROXY")) {
    merged.NODE_USE_ENV_PROXY = "1";
  }
  return merged;
}

/** @internal Whether `env` already contains any case-variant of the given canonical proxy key. */
function hasCanonicalProxyEnv(
  env: NodeJS.ProcessEnv,
  canonicalKey: "ALL_PROXY" | "HTTP_PROXY" | "HTTPS_PROXY" | "NODE_USE_ENV_PROXY" | "NO_PROXY",
): boolean {
  return Object.keys(env).some((key) => key.toLowerCase() === canonicalKey.toLowerCase());
}

/** @internal Whether `env` defines a non-empty HTTP/HTTPS/ALL proxy endpoint (ignoring `NO_PROXY`). */
function hasProxyEndpointEnv(env: NodeJS.ProcessEnv): boolean {
  return ["ALL_PROXY", "HTTP_PROXY", "HTTPS_PROXY"].some((key) => {
    for (const [envKey, value] of Object.entries(env)) {
      if (envKey.toLowerCase() === key.toLowerCase() && value?.trim()) return true;
    }
    return false;
  });
}

/** @internal Set an uppercase proxy variable (and its lowercase alias on POSIX) from a trimmed value; no-op when blank. */
function addProxyEnvValue(
  env: NodeJS.ProcessEnv,
  key: "HTTP_PROXY" | "HTTPS_PROXY" | "ALL_PROXY" | "NO_PROXY",
  value: string,
  platform: NodeJS.Platform,
): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  env[key] = trimmed;
  if (platform !== "win32") env[key.toLowerCase()] = trimmed;
}

/** @internal Expand a single NO_PROXY bypass token into its normalized forms (e.g. `<local>`, `*.foo`, `::1`). */
function normalizeBypassToken(token: string): string[] {
  const trimmed = token.trim();
  if (!trimmed) return [];
  if (trimmed === "<local>") return ["<local>", "localhost", "127.0.0.1", "[::1]", ".local"];
  if (trimmed === "::1") return ["[::1]"];
  if (trimmed.startsWith("*.")) return [`.${trimmed.slice(2)}`];
  return [trimmed];
}

/** @internal Build a de-duplicated, comma-joined NO_PROXY value from bypass tokens, or `null` when empty. */
function buildNoProxyValue(tokens: Iterable<string>): string | null {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const token of tokens) {
    for (const normalized of normalizeBypassToken(token)) {
      if (!seen.has(normalized)) {
        seen.add(normalized);
        values.push(normalized);
      }
    }
  }
  return values.length > 0 ? values.join(",") : null;
}

/** @internal Preserve a wildcard (`*`) NO_PROXY bypass verbatim, since it disables proxying entirely. */
function preserveWildcardNoProxyValue(noProxy: string | null | undefined): string | undefined {
  return noProxy?.split(",").some((token) => token.trim() === "*") ? "*" : undefined;
}

/** @internal Ensure a proxy URL has a scheme, defaulting to the supplied scheme when only an authority is given. */
function normalizeProxyUrl(raw: string, scheme: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `${scheme}://${trimmed}`;
}

/** @internal Bracket a bare IPv6 host in an `authority` (`host:port`) so URL parsing does not mistake it for a port. */
function bracketIpv6Authority(authority: string): string {
  if (authority.startsWith("[") || !authority.includes(":")) return authority;
  const portSeparatorIndex = authority.lastIndexOf(":");
  if (portSeparatorIndex <= 0) return authority;
  const host = authority.slice(0, portSeparatorIndex);
  const port = authority.slice(portSeparatorIndex + 1);
  if (!host.includes(":") || !/^\d+$/.test(port)) return authority;
  return `[${host}]:${port}`;
}

/** @internal Normalize a proxy authority into a scheme-qualified URL, IPv6-bracketing the host as needed. */
function normalizeAuthorityProxyUrl(raw: string, scheme: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `${scheme}://${bracketIpv6Authority(trimmed)}`;
}

/** @internal Compose a scheme-qualified proxy URL from separate host and port fields, IPv6-bracketing the host. */
function normalizeHostPortProxyUrl(
  host: string | undefined,
  port: string | undefined,
  scheme: string,
): string | null {
  const trimmedHost = host?.trim() ?? "";
  const trimmedPort = port?.trim() ?? "";
  if (!trimmedHost || !trimmedPort) return null;
  const normalizedHost =
    trimmedHost.includes(":") && !trimmedHost.startsWith("[") && !trimmedHost.endsWith("]")
      ? `[${trimmedHost}]`
      : trimmedHost;
  return normalizeProxyUrl(`${normalizedHost}:${trimmedPort}`, scheme);
}

/** @internal Assemble the final proxy env from parsed values, adding loopback bypasses and the `NODE_USE_ENV_PROXY` flag. */
function finalizeSystemProxyEnv(
  values: {
    allProxy?: string | null;
    httpProxy?: string | null;
    httpsProxy?: string | null;
    noProxy?: string | null;
  },
  platform: NodeJS.Platform,
): NodeJS.ProcessEnv {
  const hasProxy = Boolean(values.httpProxy || values.httpsProxy || values.allProxy);
  const noProxy = hasProxy
    ? preserveWildcardNoProxyValue(values.noProxy) ??
      buildNoProxyValue([
        ...(values.noProxy ? values.noProxy.split(",") : []),
        "localhost",
        "127.0.0.1",
        "[::1]",
      ])
    : null;
  const env: NodeJS.ProcessEnv = {};
  if (values.httpProxy) addProxyEnvValue(env, "HTTP_PROXY", values.httpProxy, platform);
  if (values.httpsProxy) addProxyEnvValue(env, "HTTPS_PROXY", values.httpsProxy, platform);
  if (values.allProxy) addProxyEnvValue(env, "ALL_PROXY", values.allProxy, platform);
  if (noProxy) addProxyEnvValue(env, "NO_PROXY", noProxy, platform);
  if (hasProxy) env.NODE_USE_ENV_PROXY = "1";
  return env;
}

/**
 * Parse macOS `scutil --proxy` output into a normalized proxy environment.
 * Honors the HTTP/HTTPS/SOCKS enable flags, exception list, and the
 * "exclude simple hostnames" toggle.
 *
 * @param stdout - Raw `scutil --proxy` output.
 * @param platform - Target platform for env normalization (defaults to `"darwin"`).
 * @returns A normalized proxy environment (empty when no proxy is enabled).
 */
export function parseMacosScutilProxyOutput(
  stdout: string,
  platform: NodeJS.Platform = "darwin",
): NodeJS.ProcessEnv {
  const scalars = new Map<string, string>();
  const exceptions: string[] = [];
  let inExceptions = false;
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^ExceptionsList\s*:\s*<array>\s*\{$/.test(line)) {
      inExceptions = true;
      continue;
    }
    if (inExceptions) {
      if (line === "}") {
        inExceptions = false;
        continue;
      }
      const match = line.match(/^\d+\s*:\s*(.+)$/);
      if (match) exceptions.push(match[1].trim());
      continue;
    }
    const match = line.match(/^([A-Za-z][A-Za-z0-9]*)\s*:\s*(.+)$/);
    if (match) scalars.set(match[1], match[2].trim());
  }

  const httpProxy =
    scalars.get("HTTPEnable") === "1"
      ? normalizeHostPortProxyUrl(scalars.get("HTTPProxy"), scalars.get("HTTPPort"), "http")
      : null;
  const httpsProxy =
    scalars.get("HTTPSEnable") === "1"
      ? normalizeHostPortProxyUrl(scalars.get("HTTPSProxy"), scalars.get("HTTPSPort"), "http")
      : null;
  const allProxy =
    scalars.get("SOCKSEnable") === "1"
      ? normalizeHostPortProxyUrl(scalars.get("SOCKSProxy"), scalars.get("SOCKSPort"), "socks5")
      : null;
  return finalizeSystemProxyEnv(
    {
      allProxy,
      httpProxy,
      httpsProxy,
      noProxy: buildNoProxyValue([
        ...exceptions,
        ...(scalars.get("ExcludeSimpleHostnames") === "1" ? ["<local>"] : []),
      ]),
    },
    platform,
  );
}

/** @internal Extract a `reg query` value line (`Name REG_TYPE value`) for the named value, or `null` if absent. */
function parseRegistryValue(stdout: string, valueName: string): string | null {
  const match = stdout.match(new RegExp(`^\\s*${valueName}\\s+REG_\\w+\\s+(.+)$`, "m"));
  return match ? match[1].trim() : null;
}

/**
 * Parse Windows Internet Settings proxy registry output into a normalized proxy
 * environment. Handles both the per-protocol (`http=…;https=…`) and shared
 * single-endpoint `ProxyServer` forms, and the `ProxyOverride` bypass list.
 *
 * @param input - Raw `reg query` output for `ProxyEnable`, and optionally `ProxyServer` / `ProxyOverride`.
 * @param platform - Target platform for env normalization (defaults to `"win32"`).
 * @returns A normalized proxy environment (empty when proxying is disabled or unset).
 */
export function parseWindowsInternetSettingsProxyOutput(
  input: { proxyEnable: string; proxyOverride?: string; proxyServer?: string },
  platform: NodeJS.Platform = "win32",
): NodeJS.ProcessEnv {
  const enabled = parseRegistryValue(input.proxyEnable, "ProxyEnable");
  if (enabled == null || !/^(1|0x1)$/i.test(enabled)) return {};
  const proxyServer = parseRegistryValue(input.proxyServer ?? "", "ProxyServer") ?? "";
  const proxyOverride = parseRegistryValue(input.proxyOverride ?? "", "ProxyOverride") ?? "";
  if (!proxyServer.trim()) return {};

  let httpProxy: string | null = null;
  let httpsProxy: string | null = null;
  let allProxy: string | null = null;
  if (proxyServer.includes("=")) {
    for (const segment of proxyServer.split(";")) {
      const [kind, rawValue] = segment.split("=", 2);
      const value = rawValue?.trim();
      if (!kind || !value) continue;
      const lowerKind = kind.trim().toLowerCase();
      if (lowerKind === "http") httpProxy = normalizeAuthorityProxyUrl(value, "http");
      else if (lowerKind === "https") httpsProxy = normalizeAuthorityProxyUrl(value, "http");
      else if (lowerKind === "socks") allProxy = normalizeAuthorityProxyUrl(value, "socks5");
    }
  } else {
    const shared = normalizeAuthorityProxyUrl(proxyServer, "http");
    httpProxy = shared;
    httpsProxy = shared;
  }
  return finalizeSystemProxyEnv(
    {
      allProxy,
      httpProxy,
      httpsProxy,
      noProxy: buildNoProxyValue(proxyOverride.split(/[;,]/)),
    },
    platform,
  );
}

/**
 * Resolve the OS-level proxy configuration into a normalized proxy environment.
 * Shells out to `scutil` on macOS and `reg query` on Windows (swallowing per-
 * command failures), and returns an empty env on other platforms or on error.
 *
 * @param options - Optional platform override and command runner (for testing).
 * @returns A normalized proxy environment, or `{}` when no proxy is configured.
 */
export function resolveSystemProxyEnv(options: ResolveSystemProxyEnvOptions = {}): NodeJS.ProcessEnv {
  const platform = options.platform ?? process.platform;
  const runCommand = options.runCommand ?? defaultSystemProxyCommandRunner;
  const tryRun = (command: string, args: string[]): string => {
    try {
      return runCommand(command, args);
    } catch {
      return "";
    }
  };
  try {
    if (platform === "darwin") {
      return parseMacosScutilProxyOutput(tryRun("scutil", ["--proxy"]), platform);
    }
    if (platform === "win32") {
      return parseWindowsInternetSettingsProxyOutput(
        {
          proxyEnable: tryRun("reg", [
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            "/v",
            "ProxyEnable",
          ]),
          proxyOverride: tryRun("reg", [
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            "/v",
            "ProxyOverride",
          ]),
          proxyServer: tryRun("reg", [
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
            "/v",
            "ProxyServer",
          ]),
        },
        platform,
      );
    }
  } catch {
    return {};
  }
  return {};
}
