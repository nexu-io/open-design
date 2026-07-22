import { spawn, type ChildProcess } from "node:child_process";
import { access, appendFile, mkdir, open, type FileHandle } from "node:fs/promises";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  type AppKey,
  type DaemonStatusSnapshot,
  type SidecarStamp,
  type WebStatusSnapshot,
} from "@open-design/sidecar-proto";
import {
  createSidecarLaunchEnv,
  requestJsonIpc,
  resolveAppIpcPath,
  type SidecarRuntimeContext,
} from "@open-design/sidecar";
import {
  createProcessStampArgs,
  isProcessAlive,
  mergeProxyAwareEnv,
  resolveSystemProxyEnv,
  stopProcesses,
  waitForProcessExit,
  wellKnownUserToolchainBins,
} from "@open-design/platform";

import type { PackagedWebOutputMode } from "./config.js";
import type { PackagedNamespacePaths } from "./paths.js";
import {
  prewarmPackagedFiles,
  resolveDaemonPrewarmTargets,
  resolveWebPrewarmTargets,
} from "./prewarm.js";

const require = createRequire(import.meta.url);
const PACKAGED_CHILD_ENV_ALLOWLIST = [
  "HOME",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "ALL_PROXY",
  "NODE_USE_ENV_PROXY",
  "NO_PROXY",
  "TMPDIR",
  "USER",
  "VP_HOME",
  "all_proxy",
  "http_proxy",
  "https_proxy",
  "no_proxy",
] as const;

function shouldForwardPackagedChildEnv(key: string, includeProviderSecrets = false): boolean {
  return (
    PACKAGED_CHILD_ENV_ALLOWLIST.includes(
      key as (typeof PACKAGED_CHILD_ENV_ALLOWLIST)[number],
    ) ||
    (includeProviderSecrets && (key.endsWith("_API_KEY") || key.endsWith("_TOKEN")))
  );
}

export type PackagedSidecarHandle = {
  close(): Promise<void>;
  daemon: DaemonStatusSnapshot;
  web: WebStatusSnapshot;
};

type ManagedSidecarChild = {
  app: AppKey;
  child: ChildProcess;
  ipcPath: string;
  logHandle: FileHandle;
  logPath: string;
};

type PackagedDaemonManagedPathEnv = {
  OD_DATA_DIR: string;
  OD_RESOURCE_ROOT: string;
  /**
   * Channel-root path. Lives one level above the namespaces directory so
   * the daemon can persist installationId (and any future fields that
   * must outlive a namespace-scoped data-dir reset) outside the
   * `<namespace>/data/` subtree.
   *
   * Required so PostHog person identity survives a reinstall of the same
   * channel even when the baked namespace token changes or per-namespace
   * data is cleared. See `apps/daemon/src/installation.ts`.
   */
  OD_INSTALLATION_DIR: string;
};

function resolveSidecarEntry(packageName: string, exportName: string): string {
  return require.resolve(`${packageName}/${exportName}`);
}

function logPathFor(paths: PackagedNamespacePaths, app: AppKey): string {
  return join(paths.logsRoot, app, "latest.log");
}

async function appendSidecarLifecycleLog(logPath: string, message: string): Promise<void> {
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${message}\n`, "utf8").catch(() => undefined);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolvePackagedElectronNodeCommand(
  execPath = process.execPath,
  platform = process.platform,
): Promise<string> {
  if (platform !== "darwin") return execPath;

  const executableName = execPath.split("/").pop();
  if (executableName == null || executableName.length === 0) return execPath;

  const marker = "/Contents/MacOS/";
  const markerIndex = execPath.lastIndexOf(marker);
  if (markerIndex === -1) return execPath;

  const appPath = execPath.slice(0, markerIndex);
  const helperName = `${executableName} Helper`;
  const helperPath = join(
    appPath,
    "Contents",
    "Frameworks",
    `${helperName}.app`,
    "Contents",
    "MacOS",
    helperName,
  );

  return (await pathExists(helperPath)) ? helperPath : execPath;
}

async function openLog(path: string): Promise<FileHandle> {
  await mkdir(dirname(path), { recursive: true });
  return await open(path, "w");
}

const DAEMON_STATUS_TIMEOUT_MS = 35_000;
// Windows first launches routinely blow past the 35s POSIX budget: Defender
// real-time scanning of the freshly-written packaged binaries inflates the
// daemon cold start (native better-sqlite3 load + first SQLite open/migrate +
// status-pipe bind) well past 35s. PostHog on the packaged_runtime_failed
// status-timeout bucket showed ~90% of affected devices DID open the app on a
// later launch — the daemon was merely slow, not dead — so a wider win32 budget
// lets that first launch succeed instead of failing to a recovery screen and
// forcing a manual relaunch.
const WIN32_STATUS_TIMEOUT_MS = 90_000;
// Linux AppImage launches remount a fresh FUSE squashfs every time, so the
// VFS page cache for the packaged payload is cold on EVERY launch — the
// daemon demand-pages its 124 MB bundled node binary through FUSE while the
// Electron main process faults through the same mount, and the 35s POSIX
// baseline is unreachable on mid-range hardware (issue #5835). The prewarm
// pass in startPackagedSidecars cuts the usual case to a few seconds; this
// widened budget is the safety net for slow devices, mirroring the win32
// rationale above (same "slow, not dead" failure class as #5515).
const LINUX_STATUS_TIMEOUT_MS = 90_000;
const DAEMON_MIGRATION_STATUS_TIMEOUT_MS = 30 * 60 * 1000;

// Poll cadence for waitForStatus: start tight so a fast daemon is detected
// promptly, then back off geometrically (capped) so a not-yet-bound pipe is not
// hammered with connect attempts that add CPU/AV contention to an already-slow
// cold start.
const STATUS_POLL_INITIAL_MS = 150;
const STATUS_POLL_MAX_MS = 1500;

// Baseline status wait budget by platform, before the daemon-only legacy
// migration override. win32 gets the wider AV-scan headroom, linux gets the
// same headroom for AppImage FUSE cold starts; every other OS keeps the 35s
// baseline.
function baseStatusTimeoutMs(platform: NodeJS.Platform = process.platform): number {
  if (platform === "win32") return WIN32_STATUS_TIMEOUT_MS;
  if (platform === "linux") return LINUX_STATUS_TIMEOUT_MS;
  return DAEMON_STATUS_TIMEOUT_MS;
}

/**
 * Daemon status wait budget. The platform baseline (35s, or 90s on win32 for
 * AV-scan headroom and on linux for AppImage FUSE cold starts) is fine for
 * normal cold boots, but the OD_LEGACY_DATA_DIR
 * one-shot recovery flow can synch-copy a multi-GB legacy `.od/` payload before
 * SQLite even opens, and killing the child mid-migration can leave dataDir
 * half-promoted. When the env var is set, use a 30-minute budget so the parent
 * will not tear the daemon down before the migration can complete.
 *
 * @see apps/daemon/src/legacy-data-migrator.ts
 * @see https://github.com/nexu-io/open-design/issues/710
 */
export function resolveDaemonStatusTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): number {
  const raw = env.OD_LEGACY_DATA_DIR;
  if (raw != null && raw.length > 0) return DAEMON_MIGRATION_STATUS_TIMEOUT_MS;
  return baseStatusTimeoutMs(platform);
}

/**
 * Waits for the sidecar to report a ready status over IPC.
 *
 * When `watch` is provided, the polling loop also races the spawned
 * child's `exit` event so a daemon that throws at startup (e.g. the
 * #710 migrator's LegacyMigrationError on invalid OD_LEGACY_DATA_DIR,
 * existing target payload, symlink in payload, or marker write
 * failure) surfaces immediately instead of leaving the packaged app
 * waiting the full DAEMON_MIGRATION_STATUS_TIMEOUT_MS for a process
 * that already exited. The error message includes the daemon log path
 * so the user can read the actual failure reason.
 */
export async function waitForStatus<T>(
  ipcPath: string,
  isReady: (status: T) => boolean,
  timeoutMs = DAEMON_STATUS_TIMEOUT_MS,
  watch: { child: { exitCode: number | null; pid?: number; signalCode: NodeJS.Signals | null; once: (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void) => void; off: (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void) => void }; logPath: string } | null = null,
): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown;
  let pollDelayMs = STATUS_POLL_INITIAL_MS;
  let childExited: { code: number | null; signal: NodeJS.Signals | null } | null = null;

  // Cover the race between spawn-resolved and now: if the child has
  // already exited by the time we got here, the 'exit' event is gone,
  // so seed childExited from the synchronous status fields.
  if (watch != null && watch.child.exitCode !== null) {
    childExited = { code: watch.child.exitCode, signal: watch.child.signalCode };
  }

  const onChildExit = (code: number | null, signal: NodeJS.Signals | null): void => {
    childExited = { code, signal };
  };
  watch?.child.once('exit', onChildExit);

  try {
    while (Date.now() - startedAt < timeoutMs) {
      if (childExited !== null) {
        throw new Error(
          `daemon exited before reporting status (code=${childExited.code}, signal=${childExited.signal ?? 'none'}); see ${watch?.logPath ?? '<no log path>'} for details`,
        );
      }
      try {
        const status = await requestJsonIpc<T>(
          ipcPath,
          { type: SIDECAR_MESSAGES.STATUS },
          { timeoutMs: 800 },
        );
        const statusPid = typeof (status as { pid?: unknown }).pid === "number"
          ? (status as { pid: number }).pid
          : null;
        if (watch?.child.pid != null) {
          if (statusPid == null) {
            lastError = new Error(`sidecar status did not include pid for spawned pid ${watch.child.pid}`);
            await sleep(STATUS_POLL_INITIAL_MS);
            continue;
          }
          if (statusPid !== watch.child.pid) {
            lastError = new Error(`sidecar status pid ${statusPid} did not match spawned pid ${watch.child.pid}`);
            await sleep(STATUS_POLL_INITIAL_MS);
            continue;
          }
        }
        if (isReady(status)) return status;
      } catch (error) {
        lastError = error;
      }
      // Keep timeoutMs a hard-ish upper bound: never sleep past the deadline, so
      // the widened win32 budget can't be overshot by a full backoff interval on
      // a slow/dead sidecar. The in-flight requestJsonIpc timeout is the only
      // residual overshoot; the while-condition re-checks the deadline next tick.
      const remaining = timeoutMs - (Date.now() - startedAt);
      if (remaining <= 0) break;
      await sleep(Math.min(pollDelayMs, remaining));
      pollDelayMs = Math.min(pollDelayMs * 2, STATUS_POLL_MAX_MS);
    }

    throw new Error(
      `timed out waiting for sidecar status at ${ipcPath}${
        lastError instanceof Error ? ` (${lastError.message})` : ""
      }`,
    );
  } finally {
    watch?.child.off('exit', onChildExit);
  }
}

async function retireExistingSidecarEndpoint(ipcPath: string, logPath: string): Promise<void> {
  let status: { pid?: number | null } | null = null;
  try {
    status = await requestJsonIpc<{ pid?: number | null }>(
      ipcPath,
      { type: SIDECAR_MESSAGES.STATUS },
      { timeoutMs: 350 },
    );
  } catch {
    return;
  }

  const pid = typeof status.pid === "number" ? status.pid : null;
  await appendSidecarLifecycleLog(
    logPath,
    `[open-design packaged] existing sidecar endpoint detected ipc=${ipcPath} pid=${pid ?? "unknown"}; requesting shutdown before relaunch`,
  );
  try {
    await requestJsonIpc(ipcPath, { type: SIDECAR_MESSAGES.SHUTDOWN }, { timeoutMs: 800 });
  } catch (error) {
    await appendSidecarLifecycleLog(
      logPath,
      `[open-design packaged] existing sidecar shutdown request failed ipc=${ipcPath} error=${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (pid != null && pid !== process.pid && isProcessAlive(pid)) {
    const exited = await waitForProcessExit(pid, 2500);
    await appendSidecarLifecycleLog(
      logPath,
      `[open-design packaged] existing sidecar endpoint ${exited ? "exited" : "still-running"} ipc=${ipcPath} pid=${pid}`,
    );
  }
}

function extractPort(url: string): string {
  const parsed = new URL(url);
  return parsed.port || (parsed.protocol === "https:" ? "443" : "80");
}

// Hardcoded POSIX system bins the packaged daemon must always be able to
// reach even when the inherited PATH from launchd / a desktop launcher is
// stripped down to nothing. The user-toolchain portion of the search list
// (Homebrew, npm globals, nvm/fnm/mise, cargo, ...) lives in
// @open-design/platform's wellKnownUserToolchainBins so the daemon
// resolver and this PATH builder cannot drift again. See issue #442.
const PACKAGED_POSIX_SYSTEM_BINS = ["/usr/bin", "/bin", "/usr/sbin", "/sbin"] as const;

export function resolvePackagedPathEnv(basePath = process.env.PATH ?? ""): string {
  const candidates = [
    ...basePath.split(delimiter),
    ...wellKnownUserToolchainBins(),
    ...PACKAGED_POSIX_SYSTEM_BINS,
  ];
  return [...new Set(candidates.filter((entry) => entry.length > 0))].join(delimiter);
}

export function resolvePackagedChildBaseEnv(
  env: NodeJS.ProcessEnv = process.env,
  includeProviderSecrets = false,
  systemProxyEnv: NodeJS.ProcessEnv = resolveSystemProxyEnv(),
  includeSystemProxyEnv = true,
): NodeJS.ProcessEnv {
  const forwardedEnv: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value != null && value.length > 0 && shouldForwardPackagedChildEnv(key, includeProviderSecrets)) {
      forwardedEnv[key] = value;
    }
  }
  return includeSystemProxyEnv
    ? mergeProxyAwareEnv(process.platform, systemProxyEnv, forwardedEnv)
    : mergeProxyAwareEnv(process.platform, forwardedEnv);
}

function createPackagedDaemonManagedPathEnv(
  paths: PackagedNamespacePaths,
): PackagedDaemonManagedPathEnv {
  return {
    OD_DATA_DIR: paths.dataRoot,
    OD_RESOURCE_ROOT: paths.resourceRoot,
    OD_INSTALLATION_DIR: paths.installationRoot,
  };
}

export type PackagedDaemonSpawnEnvOptions = {
  appVersion: string | null;
  amrProfile?: string | null;
  daemonCliEntry: string | null;
  nodeCommand?: string | null;
  /**
   * PR #974 round-5 (lefarcen P2): only pin the daemon's import-folder
   * gate ON when the desktop runtime is actually being started in the
   * same packaged process group. Headless packaged deployments
   * (`tools-pack linux start --headless`) have no `shell.openPath`
   * surface, so leaving the gate dormant avoids the impossible-auth
   * state where the daemon waits forever for a registration that the
   * headless runtime can never deliver.
   */
  requireDesktopAuth: boolean;
  legacyDataDir?: string | null;
  telemetryRelayUrl?: string | null;
  posthogKey?: string | null;
  posthogHost?: string | null;
};

/**
 * Pure helper: assemble the daemon spawn env for a packaged sidecar.
 * Extracted from `startPackagedSidecars` so vitest can pin both
 * branches of `requireDesktopAuth` without spinning up a real child
 * process.
 */
export function buildPackagedDaemonSpawnEnv(
  paths: PackagedNamespacePaths,
  options: PackagedDaemonSpawnEnvOptions,
): NodeJS.ProcessEnv {
  return {
    [SIDECAR_ENV.DAEMON_PORT]: "0",
    ...(options.daemonCliEntry == null ? {} : { [SIDECAR_ENV.DAEMON_CLI_PATH]: options.daemonCliEntry }),
    // PR #974 round-4 P1 + round-5 P2: pinned ON when a desktop is
    // being started, OFF for headless. The daemon-side flag refuses
    // tokenless imports even before the desktop main process has
    // finished registering, closing the daemon-restart-mid-session
    // bypass that a runtime-only handshake left open. Headless skips
    // it because there is no privileged shell.openPath surface and
    // no client to register a secret.
    ...(options.requireDesktopAuth ? { OD_REQUIRE_DESKTOP_AUTH: "1" } : {}),
    // Packaged daemon managed paths are deliberately delivered through
    // the sidecar launch environment. The daemon may keep its own default
    // fallback, but packaged runtime must not rely on path inference from
    // Electron userData, bundle names, or ports.
    ...createPackagedDaemonManagedPathEnv(paths),
    ...(options.nodeCommand == null || options.nodeCommand.length === 0
      ? {}
      : { OD_NODE_BIN: options.nodeCommand }),
    ...(options.amrProfile == null || options.amrProfile.length === 0
      ? {}
      : { OPEN_DESIGN_AMR_PROFILE: options.amrProfile }),
    ...(options.appVersion == null ? {} : { OD_APP_VERSION: options.appVersion }),
    ...(options.telemetryRelayUrl == null || options.telemetryRelayUrl.length === 0
      ? {}
      : { OPEN_DESIGN_TELEMETRY_RELAY_URL: options.telemetryRelayUrl }),
    // OD_LEGACY_DATA_DIR is the one-shot recovery handle for users
    // upgrading from 0.3.x .od/ layouts. The daemon's startup
    // migrator (legacy-data-migrator.ts) reads it; the env-allowlist
    // for packaged children would otherwise drop it. Forward only
    // when set so we do not invent an empty string and trigger the
    // daemon's "env set but path invalid" error path.
    ...(options.legacyDataDir == null || options.legacyDataDir.length === 0
      ? {}
      : { OD_LEGACY_DATA_DIR: options.legacyDataDir }),
    // PostHog analytics ingest key, baked into the bundle at packaging time
    // by tools/pack. Daemon reads this as POSTHOG_KEY at startup. Absent
    // for fork builds without the CI secret — the daemon's analytics
    // module no-ops cleanly in that case, and /api/analytics/config
    // returns enabled=false regardless of user consent.
    ...(options.posthogKey == null || options.posthogKey.length === 0
      ? {}
      : { POSTHOG_KEY: options.posthogKey }),
    ...(options.posthogHost == null || options.posthogHost.length === 0
      ? {}
      : { POSTHOG_HOST: options.posthogHost }),
  };
}

async function spawnSidecarChild(options: {
  app: AppKey;
  electronNodeCommand: string | null;
  entryPath: string;
  env: NodeJS.ProcessEnv;
  nodeCommand: string | null;
  paths: PackagedNamespacePaths;
  runtime: SidecarRuntimeContext<SidecarStamp>;
}): Promise<ManagedSidecarChild> {
  const ipcPath = resolveAppIpcPath({
    app: options.app,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    namespace: options.runtime.namespace,
  });
  const stamp = {
    app: options.app,
    ipc: ipcPath,
    mode: SIDECAR_MODES.RUNTIME,
    namespace: options.runtime.namespace,
    source: options.runtime.source,
  } satisfies SidecarStamp;
  const logPath = logPathFor(options.paths, options.app);
  const logHandle = await openLog(logPath);
  await retireExistingSidecarEndpoint(ipcPath, logPath);
  const usesElectronAsNode = options.nodeCommand == null;
  const command = options.nodeCommand
    ?? options.electronNodeCommand
    ?? await resolvePackagedElectronNodeCommand();
  const childEnv = createSidecarLaunchEnv({
    base: options.paths.runtimeRoot,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    extraEnv: {
      ...resolvePackagedChildBaseEnv(
        process.env,
        options.app === APP_KEYS.DAEMON,
        resolveSystemProxyEnv(),
        options.app !== APP_KEYS.DAEMON,
      ),
      ...options.env,
      NODE_ENV: "production",
      PATH: resolvePackagedPathEnv(),
      ...(usesElectronAsNode ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    },
    stamp,
  });
  const child = spawn(
    command,
    [options.entryPath, ...createProcessStampArgs(stamp, OPEN_DESIGN_SIDECAR_CONTRACT)],
    createPackagedSidecarSpawnOptions({
      env: childEnv,
      logFd: logHandle.fd,
      paths: options.paths,
    }),
  );

  await new Promise<void>((resolveSpawn, rejectSpawn) => {
    child.once("error", rejectSpawn);
    child.once("spawn", resolveSpawn);
  });

  return { app: options.app, child, ipcPath, logHandle, logPath };
}

export function createPackagedSidecarSpawnOptions(input: {
  env: NodeJS.ProcessEnv;
  logFd: number;
  paths: Pick<PackagedNamespacePaths, "runtimeRoot">;
}): {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio: ["ignore", number, number];
  windowsHide: true;
} {
  return {
    cwd: input.paths.runtimeRoot,
    env: input.env,
    stdio: ["ignore", input.logFd, input.logFd],
    windowsHide: true,
  };
}

async function closeManagedChild(child: ManagedSidecarChild): Promise<void> {
  const appendLifecycleLog = async (message: string): Promise<void> => appendSidecarLifecycleLog(child.logPath, message);
  await appendLifecycleLog(`[open-design packaged] shutdown requested app=${child.app} pid=${child.child.pid ?? "unknown"}`);
  try {
    await requestJsonIpc(child.ipcPath, { type: SIDECAR_MESSAGES.SHUTDOWN }, { timeoutMs: 1200 });
  } catch {
    // Fall through to process cleanup.
  }

  if (!(await waitForProcessExit(child.child.pid, 5000))) {
    await appendLifecycleLog(`[open-design packaged] shutdown timeout app=${child.app} pid=${child.child.pid ?? "unknown"}; forcing stop`);
    await stopProcesses([child.child.pid]);
  }

  await appendLifecycleLog(`[open-design packaged] exited app=${child.app} pid=${child.child.pid ?? "unknown"} code=${child.child.exitCode ?? "unknown"} signal=${child.child.signalCode ?? "none"}`);
  await child.logHandle.close().catch(() => undefined);
}

export async function startPackagedSidecars(
  runtime: SidecarRuntimeContext<SidecarStamp>,
  paths: PackagedNamespacePaths,
  options: {
    appVersion: string | null;
    amrProfile: string | null;
    daemonCliEntry: string | null;
    daemonSidecarEntry: string | null;
    electronNodeCommand: string | null;
    nodeCommand: string | null;
    telemetryRelayUrl: string | null;
    posthogKey: string | null;
    posthogHost: string | null;
    /**
     * PR #974 round-5 (lefarcen P2): caller asserts whether a desktop
     * runtime is being started in this packaged process group. The
     * Electron entry passes `true`; `headless.ts` passes `false` so the
     * daemon's import-folder gate stays dormant in headless mode where
     * there is no `shell.openPath` surface and no client to register a
     * secret. Required (no default) so a future packaged caller cannot
     * silently regress the gate by omitting it.
     */
    requireDesktopAuth: boolean;
    webSidecarEntry: string | null;
    webStandaloneRoot: string | null;
    webOutputMode: PackagedWebOutputMode;
    /**
     * Boot-progress hook, fired at each sidecar bring-up boundary: the
     * `"-spawning"` edge just before a child is spawned, and the `"-ready"`
     * edge once it reports a usable URL. The Electron entry forwards these to
     * the splash status line so a slow cold boot shows which phase is underway
     * (and visibly advances the step counter the moment each long native wait
     * clears) instead of a frozen frame; headless callers omit it.
     */
    onPhase?: (phase: "daemon-spawning" | "daemon-ready" | "web-spawning" | "web-ready") => void;
  },
): Promise<PackagedSidecarHandle> {
  await mkdir(paths.namespaceRoot, { recursive: true });
  await mkdir(paths.cacheRoot, { recursive: true });
  await mkdir(paths.dataRoot, { recursive: true });
  await mkdir(paths.logsRoot, { recursive: true });
  await mkdir(paths.desktopLogsRoot, { recursive: true });
  await mkdir(paths.runtimeRoot, { recursive: true });
  await mkdir(paths.updateRoot, { recursive: true });
  await mkdir(paths.electronUserDataRoot, { recursive: true });
  await mkdir(paths.electronSessionDataRoot, { recursive: true });

  const children: ManagedSidecarChild[] = [];

  const daemonSidecarEntry =
    options.daemonSidecarEntry ?? resolveSidecarEntry("@open-design/daemon", "sidecar");
  const webSidecarEntry =
    options.webSidecarEntry ?? resolveSidecarEntry("@open-design/web", "sidecar");
  const prewarmLog = (message: string): void => {
    void appendSidecarLifecycleLog(join(paths.logsRoot, "launcher", "latest.log"), message);
  };

  try {
    // Issue #5835: on Linux AppImage the payload lives on a fresh FUSE mount
    // with a cold page cache. Read the daemon's cold-start set (bundled node
    // binary + daemon dist) into the page cache BEFORE spawning, so the
    // timed status window covers real daemon work instead of demand-paging
    // ~145 MB through FUSE page fault by page fault. Best-effort and gated
    // to linux+FUSE inside prewarmPackagedFiles; plain-file installs skip.
    await prewarmPackagedFiles(
      resolveDaemonPrewarmTargets({
        nodeCommand: options.nodeCommand,
        daemonSidecarEntry,
        resourceRoot: paths.resourceRoot,
      }),
      { log: prewarmLog },
    );

    options.onPhase?.("daemon-spawning");
    const daemon = await spawnSidecarChild({
      app: APP_KEYS.DAEMON,
      entryPath: daemonSidecarEntry,
      env: buildPackagedDaemonSpawnEnv(paths, {
        appVersion: options.appVersion,
        amrProfile: options.amrProfile,
        daemonCliEntry: options.daemonCliEntry,
        legacyDataDir: process.env.OD_LEGACY_DATA_DIR ?? null,
        nodeCommand: options.nodeCommand,
        requireDesktopAuth: options.requireDesktopAuth,
        telemetryRelayUrl: options.telemetryRelayUrl,
        posthogKey: options.posthogKey,
        posthogHost: options.posthogHost,
      }),
      electronNodeCommand: options.electronNodeCommand,
      nodeCommand: options.nodeCommand,
      paths,
      runtime,
    });
    children.push(daemon);
    // The web prewarm overlaps the daemon's boot wait: its read set (web
    // sidecar dist, .next/server chunks, Next framework code) is disjoint
    // from the daemon's already-warm working set, so the FUSE server stays
    // busy on sequential reads while the daemon does CPU/SQLite work.
    const webPrewarm = prewarmPackagedFiles(
      resolveWebPrewarmTargets({
        webSidecarEntry,
        webStandaloneRoot: options.webStandaloneRoot,
      }),
      { log: prewarmLog },
    );
    const daemonStatus = await waitForStatus<DaemonStatusSnapshot>(
      daemon.ipcPath,
      (status) => status.url != null,
      resolveDaemonStatusTimeoutMs(),
      // Race the IPC polling against the daemon child's exit. Without
      // this, a daemon that throws at startup (LegacyMigrationError on
      // invalid OD_LEGACY_DATA_DIR, existing target payload, symlink,
      // marker write failure) leaves the packaged app waiting the full
      // 30-minute migration budget for a process that already died.
      { child: daemon.child, logPath: logPathFor(paths, APP_KEYS.DAEMON) },
    );
    if (daemonStatus.url == null) throw new Error("daemon did not report a URL");
    options.onPhase?.("daemon-ready");

    // The web payload must be in the page cache before the web sidecar
    // enters its own timed status window.
    await webPrewarm;

    options.onPhase?.("web-spawning");
    const web = await spawnSidecarChild({
      app: APP_KEYS.WEB,
      entryPath: webSidecarEntry,
      env: {
        [SIDECAR_ENV.DAEMON_PORT]: extractPort(daemonStatus.url),
        [SIDECAR_ENV.WEB_PORT]: "0",
        ...(options.webStandaloneRoot == null ? {} : { OD_WEB_STANDALONE_ROOT: options.webStandaloneRoot }),
        OD_WEB_OUTPUT_MODE: options.webOutputMode,
        PORT: "0",
      },
      electronNodeCommand: options.electronNodeCommand,
      nodeCommand: options.nodeCommand,
      paths,
      runtime,
    });
    children.push(web);
    const webStatus = await waitForStatus<WebStatusSnapshot>(
      web.ipcPath,
      (status) => status.url != null,
      // Web has no legacy-migration path, so it uses the plain platform
      // baseline (still widened on win32, where AV scanning can also slow the
      // web sidecar's first bind) rather than resolveDaemonStatusTimeoutMs.
      baseStatusTimeoutMs(),
      { child: web.child, logPath: logPathFor(paths, APP_KEYS.WEB) },
    );
    if (webStatus.url == null) throw new Error("web did not report a URL");
    options.onPhase?.("web-ready");

    return {
      daemon: daemonStatus,
      web: webStatus,
      async close() {
        for (const child of [...children].reverse()) {
          await closeManagedChild(child).catch((error: unknown) => {
            console.error(`failed to close packaged ${child.app} sidecar`, error);
          });
        }
      },
    };
  } catch (error) {
    for (const child of [...children].reverse()) {
      await closeManagedChild(child).catch(() => undefined);
    }
    throw error;
  }
}
