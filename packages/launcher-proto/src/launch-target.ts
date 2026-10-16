import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { parseReleaseVersion, releaseChannelFromNamespace, releaseChannelFromVersion, releaseInstallIdentity, releaseNamespace } from "@open-design/release";
import {
  LAUNCHER_SCHEMA_VERSION,
  LAUNCHER_STABLE_ALIAS,
  compareLauncherVersions,
  normalizeLauncherChannel,
  normalizeLauncherNamespace,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
  selectLauncherRuntimeTarget,
  validateLauncherAttemptDescriptor,
  validateLauncherRuntimeDescriptor,
  type LauncherChannel,
  type LauncherRootRequest,
  type LauncherTargetSelection,
  type LauncherVersionPointer,
} from "./index.js";

export class LauncherLaunchError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "LauncherLaunchError";
  }
}

export type LauncherCliContextOptions = {
  arch?: string;
  channel?: string;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
  namespace?: string;
  platform?: NodeJS.Platform;
  root?: string;
};

export type LauncherLaunchTarget = LauncherRootRequest & {
  channel: LauncherChannel;
  executablePath: string;
  generation: number;
  launchPath: string;
  payloadExecutablePath: string | null;
  reason: Extract<LauncherTargetSelection, { selected: true }>["reason"];
  source: "canonical" | "current-alias" | "installed";
  version: string;
};

type RawConfig = { appVersion?: string; namespace?: string; namespaceBaseRoot?: string };

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new LauncherLaunchError("launcher-invalid-state", `Cannot read launcher metadata at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function packagedPlatform(platform: NodeJS.Platform): "darwin" | "win32" {
  if (platform !== "darwin" && platform !== "win32") {
    throw new LauncherLaunchError("unsupported-platform", `The packaged launcher is not supported on ${platform}.`);
  }
  return platform;
}

function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

async function samePath(left: string, right: string, platform: NodeJS.Platform): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([realpath(left), realpath(right)]);
    return platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
  } catch {
    return false;
  }
}

/** Resolve launcher installation metadata without a daemon or Electron process. */
export async function resolveLauncherCliContext(options: LauncherCliContextOptions = {}): Promise<LauncherRootRequest> {
  const env = options.env ?? process.env;
  const platform = packagedPlatform(options.platform ?? process.platform);
  const configPath = options.configPath ?? env.OD_PACKAGED_CONFIG_PATH;
  const raw = configPath == null ? null : record(await readJson(resolve(configPath)));
  if (configPath != null && raw == null) {
    throw new LauncherLaunchError("launcher-config-not-found", `Packaged config not found at ${configPath}.`);
  }
  const config = (raw ?? {}) as RawConfig;
  const namespaceValue = options.namespace ?? env.OD_PACKAGED_NAMESPACE ?? env.OD_SIDECAR_NAMESPACE ?? config.namespace;
  const channel = normalizeLauncherChannel(options.channel ?? env.OD_SIDECAR_CHANNEL
    ?? releaseChannelFromVersion(env.OD_APP_VERSION ?? config.appVersion)
    ?? (namespaceValue == null ? null : releaseChannelFromNamespace(namespaceValue, "default"))
    ?? "stable");
  const home = options.home ?? homedir();
  const productName = releaseInstallIdentity(platform === "win32" ? "stable" : channel).productName;
  const namespaceBaseRoot = env.OD_PACKAGED_NAMESPACE_BASE_ROOT ?? config.namespaceBaseRoot;
  const root = resolve(options.root ?? env.OD_INSTALLATION_DIR
    ?? (namespaceBaseRoot == null ? null : dirname(resolve(namespaceBaseRoot)))
    ?? (platform === "darwin"
      ? join(home, "Library", "Application Support", productName)
      : join(env.APPDATA ?? join(home, "AppData", "Roaming"), productName)));
  if (namespaceValue != null) {
    return resolveLauncherPaths({ channel, namespace: normalizeLauncherNamespace(namespaceValue), root });
  }

  // Discover the actual namespace used by an existing installation. Guessing a
  // release namespace must never silently select one of several installations.
  const candidateRoot = join(resolveLauncherPaths({ channel, namespace: "default", root }).channelRoot, "namespaces");
  const entries = await readdir(candidateRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const namespaces: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const paths = resolveLauncherPaths({ channel, namespace: entry.name, root });
    const [runtime, install] = await Promise.all([readJson(paths.runtimePath), readJson(paths.installPath)]);
    const metadata = record(runtime) ?? record(install);
    if (metadata?.schemaVersion === LAUNCHER_SCHEMA_VERSION && metadata.channel === channel && metadata.namespace === entry.name) {
      namespaces.push(entry.name);
    }
  }
  if (namespaces.length > 1) {
    throw new LauncherLaunchError("launcher-namespace-ambiguous", `Several ${channel} launcher namespaces are installed (${namespaces.join(", ")}). Pass --namespace.`);
  }
  const namespace = namespaces[0] ?? releaseNamespace(channel, platform === "win32" ? "win" : (options.arch ?? process.arch) === "x64" ? "macIntel" : "mac");
  return resolveLauncherPaths({ channel, namespace, root });
}

function bundlePath(executablePath: string): string | null {
  const normalized = executablePath.split(sep).join("/");
  const marker = ".app/Contents/MacOS/";
  const index = normalized.lastIndexOf(marker);
  return index < 0 ? null : executablePath.slice(0, index + 4);
}

async function matchesConfig(launchPath: string, executablePath: string, pointer: LauncherVersionPointer, context: LauncherRootRequest, platform: NodeJS.Platform): Promise<boolean> {
  if (!isAbsolute(launchPath) || !isAbsolute(executablePath)) return false;
  if (platform === "darwin" && bundlePath(executablePath) !== launchPath) return false;
  if (platform === "win32" && launchPath !== executablePath) return false;
  const info = await stat(executablePath).catch(() => null);
  if (!info?.isFile()) return false;
  const configPath = platform === "darwin"
    ? join(launchPath, "Contents", "Resources", "open-design-config.json")
    : join(dirname(executablePath), "resources", "open-design-config.json");
  const config = record(await readJson(configPath));
  return config?.appVersion === pointer.version
    && (releaseChannelFromVersion(pointer.version) ?? releaseChannelFromNamespace(context.namespace, "default") ?? "stable") === context.channel;
}

// Conservative compatibility floor, verified against this release's schema-1
// pointer/attempt selection and pre-sidecar payload desktop delegation:
// https://github.com/nexu-io/open-design/blob/open-design-v0.17.0/apps/packaged/src/index.ts
// https://github.com/nexu-io/open-design/blob/open-design-v0.17.0/apps/packaged/src/launcher-runtime.ts
// This local protocol floor is independent of a feed's installer-reseed policy.
const WINDOWS_PAYLOAD_LAUNCHER_MIN_VERSION = "0.17.0";

async function isCompatibleWindowsOuter(launchPath: string, pointer: LauncherVersionPointer, context: LauncherRootRequest): Promise<boolean> {
  if (!isAbsolute(launchPath) || !launchPath.toLowerCase().endsWith(".exe")) return false;
  const paths = resolveLauncherPaths(context);
  const [info, executablePath, versionsRoot, outerRoot] = await Promise.all([
    lstat(launchPath).catch(() => null), realpath(launchPath).catch(() => null),
    realpath(paths.versionsRoot).catch(() => null), realpath(dirname(launchPath)).catch(() => null),
  ]);
  if (!info?.isFile() || info.isSymbolicLink() || executablePath == null || versionsRoot == null || outerRoot == null
    || inside(paths.versionsRoot, launchPath) || inside(versionsRoot, executablePath)) return false;
  const configPath = join(dirname(launchPath), "resources", "open-design-config.json");
  const [configInfo, resolvedConfigPath] = await Promise.all([lstat(configPath).catch(() => null), realpath(configPath).catch(() => null)]);
  if (!configInfo?.isFile() || configInfo.isSymbolicLink() || resolvedConfigPath !== join(outerRoot, "resources", "open-design-config.json")) return false;
  const config = record(await readJson(configPath));
  if (typeof config?.appVersion !== "string") return false;
  try {
    const installedVersion = parseReleaseVersion(config.appVersion, paths.channel).releaseVersion;
    return compareLauncherVersions(installedVersion, WINDOWS_PAYLOAD_LAUNCHER_MIN_VERSION) >= 0
      && compareLauncherVersions(installedVersion, pointer.version) <= 0;
  } catch {
    return false;
  }
}

/** Read the same pointer/attempt selection as the packaged launcher, then prove a stable entry addresses that payload. */
export async function readLauncherLaunchTarget(request: LauncherRootRequest & {
  /** A live caller may supply this only after validating its running owner PID, executable and active app version. Cold CLI callers omit it. */
  delegated?: LauncherVersionPointer;
  platform?: NodeJS.Platform;
}): Promise<LauncherLaunchTarget> {
  const platform = packagedPlatform(request.platform ?? process.platform);
  const paths = resolveLauncherPaths(request);
  const rawRuntime = await readJson(paths.runtimePath);
  if (rawRuntime == null) throw new LauncherLaunchError("launcher-not-installed", `No packaged ${paths.channel} launcher is installed for namespace ${paths.namespace}.`);
  let selection: LauncherTargetSelection;
  try {
    const runtime = validateLauncherRuntimeDescriptor(rawRuntime as Parameters<typeof validateLauncherRuntimeDescriptor>[0], paths);
    const rawAttempt = await readJson(paths.attemptsPath);
    const attempted = rawAttempt == null ? null : validateLauncherAttemptDescriptor(rawAttempt as Parameters<typeof validateLauncherAttemptDescriptor>[0], paths);
    selection = selectLauncherRuntimeTarget({ attempted, delegated: request.delegated ?? null, runtime });
  } catch (error) {
    if (error instanceof LauncherLaunchError) throw error;
    throw new LauncherLaunchError("launcher-invalid-state", `Invalid launcher state: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!selection.selected) throw new LauncherLaunchError("launcher-no-target", "The packaged launcher has no active or successful version.");
  const pointer = selection.pointer;
  const versionPaths = resolveLauncherVersionPaths({ ...paths, version: pointer.version });
  const manifest = record(await readJson(versionPaths.manifestPath));
  let payloadExecutablePath: string | null = null;
  let relativeExecutable: string | null = null;
  if (manifest != null) {
    const entry = record(manifest.entry);
    if (manifest.schemaVersion !== LAUNCHER_SCHEMA_VERSION || manifest.channel !== paths.channel
      || manifest.namespace !== paths.namespace || manifest.version !== pointer.version || manifest.platform !== platform
      || manifest.payloadRoot !== "payload" || typeof entry?.executable !== "string" || isAbsolute(entry.executable)) {
      throw new LauncherLaunchError("launcher-invalid-payload", `Invalid manifest for selected launcher version ${pointer.version}.`);
    }
    relativeExecutable = entry.executable;
    const executable = resolve(versionPaths.versionRoot, relativeExecutable);
    const info = await lstat(executable).catch(() => null);
    const resolved = await realpath(executable).catch(() => null);
    const resolvedRoot = await realpath(versionPaths.payloadRoot).catch(() => null);
    const namespaceRoot = await realpath(paths.namespaceRoot).catch(() => null);
    if (!inside(versionPaths.payloadRoot, executable) || !info?.isFile() || info.isSymbolicLink()
      || resolved == null || resolvedRoot == null || namespaceRoot == null
      || resolvedRoot !== join(namespaceRoot, "versions", pointer.version, "payload") || !inside(resolvedRoot, resolved)) {
      throw new LauncherLaunchError("launcher-invalid-payload", `The selected launcher payload ${pointer.version} has no valid executable.`);
    }
    payloadExecutablePath = executable;
  }
  const result = (launchPath: string, executablePath: string, source: LauncherLaunchTarget["source"]): LauncherLaunchTarget => ({
    channel: paths.channel, executablePath, generation: pointer.generation, launchPath, namespace: paths.namespace,
    payloadExecutablePath, reason: selection.reason, root: paths.root, source, version: pointer.version,
  });

  const promoted = record(await readJson(join(paths.namespaceRoot, "launch-entry.json")));
  if (promoted?.schemaVersion === LAUNCHER_SCHEMA_VERSION && promoted.channel === paths.channel && promoted.namespace === paths.namespace
    && promoted.version === pointer.version && promoted.generation === pointer.generation
    && typeof promoted.launchPath === "string" && typeof promoted.executablePath === "string"
    && !inside(paths.versionsRoot, promoted.launchPath)
    && (payloadExecutablePath == null || (typeof promoted.payloadExecutablePath === "string" && await samePath(promoted.payloadExecutablePath, payloadExecutablePath, platform)))
    && await matchesConfig(promoted.launchPath, promoted.executablePath, pointer, paths, platform)) {
    return result(promoted.launchPath, promoted.executablePath, "canonical");
  }
  if (payloadExecutablePath != null && relativeExecutable != null) {
    const executablePath = join(paths.namespaceRoot, LAUNCHER_STABLE_ALIAS, relativeExecutable);
    const launchPath = platform === "darwin" ? bundlePath(executablePath) : executablePath;
    if (launchPath != null && await samePath(executablePath, payloadExecutablePath, platform)) {
      return result(launchPath, executablePath, "current-alias");
    }
  }
  if (payloadExecutablePath == null || platform === "win32") {
    const installed = record(await readJson(paths.installPath));
    if (installed?.schemaVersion === LAUNCHER_SCHEMA_VERSION && installed.channel === paths.channel && installed.namespace === paths.namespace && typeof installed.launchPath === "string") {
      const launchPath = installed.launchPath;
      const executablePath = platform === "darwin"
        ? join(launchPath, "Contents", "MacOS", releaseInstallIdentity(paths.channel).executableName)
        : launchPath;
      const validInstalled = platform === "win32" && payloadExecutablePath != null
        ? await isCompatibleWindowsOuter(launchPath, pointer, paths)
        : !inside(paths.versionsRoot, launchPath) && await matchesConfig(launchPath, executablePath, pointer, paths, platform);
      if (validInstalled) {
        return result(launchPath, executablePath, "installed");
      }
    }
  }
  throw new LauncherLaunchError("launcher-stale-entry", `No stable launch entry matches selected ${paths.channel} version ${pointer.version}. Start the installed app to repair its launcher entry.`);
}
