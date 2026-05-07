import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, open, type FileHandle } from "node:fs/promises";
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
  stopProcesses,
  waitForProcessExit,
  wellKnownUserToolchainBins,
} from "@open-design/platform";

import type { PackagedWebOutputMode } from "./config.js";
import type { PackagedNamespacePaths } from "./paths.js";

const require = createRequire(import.meta.url);
const PACKAGED_CHILD_ENV_ALLOWLIST = ["HOME", "LANG", "LC_ALL", "LOGNAME", "TMPDIR", "USER"] as const;

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
};

type PackagedDaemonManagedPathEnv = {
  OD_DATA_DIR: string;
  OD_RESOURCE_ROOT: string;
};

function resolveSidecarEntry(packageName: string, exportName: string): string {
  return require.resolve(`${packageName}/${exportName}`);
}

function logPathFor(paths: PackagedNamespacePaths, app: AppKey): string {
  return join(paths.logsRoot, app, "latest.log");
}

async function openLog(path: string): Promise<FileHandle> {
  await mkdir(dirname(path), { recursive: true });
  return await open(path, "w");
}

const DAEMON_STATUS_TIMEOUT_MS = 35_000;
const DAEMON_MIGRATION_STATUS_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Daemon status wait budget. The default 35s is fine for normal cold
 * boots, but the OD_LEGACY_DATA_DIR one-shot recovery flow can synch-
 * copy a multi-GB legacy `.od/` payload before SQLite even opens, and
 * killing the child mid-migration can leave dataDir half-promoted.
 * When the env var is set, use a 30-minute budget so the parent will
 * not tear the daemon down before the migration can complete.
 *
 * @see apps/daemon/src/legacy-data-migrator.ts
 * @see https://github.com/nexu-io/open-design/issues/710
 */
export function resolveDaemonStatusTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.OD_LEGACY_DATA_DIR;
  if (raw != null && raw.length > 0) return DAEMON_MIGRATION_STATUS_TIMEOUT_MS;
  return DAEMON_STATUS_TIMEOUT_MS;
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
  watch: { child: { exitCode: number | null; signalCode: NodeJS.Signals | null; once: (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void) => void; off: (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void) => void }; logPath: string } | null = null,
): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown;
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
        if (isReady(status)) return status;
      } catch (error) {
        lastError = error;
      }
      await sleep(150);
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

function resolvePackagedPathEnv(basePath = process.env.PATH ?? ""): string {
  const candidates = [
    ...basePath.split(delimiter),
    ...wellKnownUserToolchainBins(),
    ...PACKAGED_POSIX_SYSTEM_BINS,
  ];
  return [...new Set(candidates.filter((entry) => entry.length > 0))].join(delimiter);
}

function resolvePackagedChildBaseEnv(env: NodeJS.ProcessEnv = process.env,includeProviderSecrets = false,): NodeJS.ProcessEnv {
  const baseEnv: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value != null && value.length > 0 && shouldForwardPackagedChildEnv(key, includeProviderSecrets)) {
      baseEnv[key] = value;
    }
  }
  return baseEnv;
}

function createPackagedDaemonManagedPathEnv(
  paths: PackagedNamespacePaths,
): PackagedDaemonManagedPathEnv {
  return {
    OD_DATA_DIR: paths.dataRoot,
    OD_RESOURCE_ROOT: paths.resourceRoot,
  };
}

async function spawnSidecarChild(options: {
  app: AppKey;
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
  const logHandle = await openLog(logPathFor(options.paths, options.app));
  const childEnv = createSidecarLaunchEnv({
    base: options.paths.runtimeRoot,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    extraEnv: {
      ...resolvePackagedChildBaseEnv(process.env, options.app === APP_KEYS.DAEMON),
      ...options.env,
      NODE_ENV: "production",
      PATH: resolvePackagedPathEnv(),
      ...(options.nodeCommand == null ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    },
    stamp,
  });
  const command = options.nodeCommand ?? process.execPath;
  const child = spawn(
    command,
    [options.entryPath, ...createProcessStampArgs(stamp, OPEN_DESIGN_SIDECAR_CONTRACT)],
    {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ["ignore", logHandle.fd, logHandle.fd],
      windowsHide: true,
    },
  );

  await new Promise<void>((resolveSpawn, rejectSpawn) => {
    child.once("error", rejectSpawn);
    child.once("spawn", resolveSpawn);
  });

  return { app: options.app, child, ipcPath, logHandle };
}

async function closeManagedChild(child: ManagedSidecarChild): Promise<void> {
  try {
    await requestJsonIpc(child.ipcPath, { type: SIDECAR_MESSAGES.SHUTDOWN }, { timeoutMs: 1200 });
  } catch {
    // Fall through to process cleanup.
  }

  if (!(await waitForProcessExit(child.child.pid, 5000))) {
    await stopProcesses([child.child.pid]);
  }

  await child.logHandle.close().catch(() => undefined);
}

export async function startPackagedSidecars(
  runtime: SidecarRuntimeContext<SidecarStamp>,
  paths: PackagedNamespacePaths,
  options: {
    appVersion: string | null;
    daemonCliEntry: string | null;
    daemonSidecarEntry: string | null;
    nodeCommand: string | null;
    webSidecarEntry: string | null;
    webStandaloneRoot: string | null;
    webOutputMode: PackagedWebOutputMode;
  },
): Promise<PackagedSidecarHandle> {
  await mkdir(paths.namespaceRoot, { recursive: true });
  await mkdir(paths.cacheRoot, { recursive: true });
  await mkdir(paths.dataRoot, { recursive: true });
  await mkdir(paths.logsRoot, { recursive: true });
  await mkdir(paths.desktopLogsRoot, { recursive: true });
  await mkdir(paths.runtimeRoot, { recursive: true });
  await mkdir(paths.electronUserDataRoot, { recursive: true });
  await mkdir(paths.electronSessionDataRoot, { recursive: true });

  const children: ManagedSidecarChild[] = [];

  try {
    const daemon = await spawnSidecarChild({
      app: APP_KEYS.DAEMON,
      entryPath: options.daemonSidecarEntry ?? resolveSidecarEntry("@open-design/daemon", "sidecar"),
      env: {
        [SIDECAR_ENV.DAEMON_PORT]: "0",
        ...(options.daemonCliEntry == null ? {} : { [SIDECAR_ENV.DAEMON_CLI_PATH]: options.daemonCliEntry }),
        // Packaged daemon managed paths are deliberately delivered through
        // the sidecar launch environment. The daemon may keep its own default
        // fallback, but packaged runtime must not rely on path inference from
        // Electron userData, bundle names, or ports.
        ...createPackagedDaemonManagedPathEnv(paths),
        ...(options.appVersion == null ? {} : { OD_APP_VERSION: options.appVersion }),
        // OD_LEGACY_DATA_DIR is the one-shot recovery handle for users
        // upgrading from 0.3.x .od/ layouts. The daemon's startup
        // migrator (legacy-data-migrator.ts) reads it; the env-allowlist
        // for packaged children would otherwise drop it. Forward only
        // when set so we do not invent an empty string and trigger the
        // daemon's "env set but path invalid" error path.
        ...(process.env.OD_LEGACY_DATA_DIR == null || process.env.OD_LEGACY_DATA_DIR.length === 0
          ? {}
          : { OD_LEGACY_DATA_DIR: process.env.OD_LEGACY_DATA_DIR }),
      },
      nodeCommand: options.nodeCommand,
      paths,
      runtime,
    });
    children.push(daemon);
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

    const web = await spawnSidecarChild({
      app: APP_KEYS.WEB,
      entryPath: options.webSidecarEntry ?? resolveSidecarEntry("@open-design/web", "sidecar"),
      env: {
        [SIDECAR_ENV.DAEMON_PORT]: extractPort(daemonStatus.url),
        [SIDECAR_ENV.WEB_PORT]: "0",
        ...(options.webStandaloneRoot == null ? {} : { OD_WEB_STANDALONE_ROOT: options.webStandaloneRoot }),
        OD_WEB_OUTPUT_MODE: options.webOutputMode,
        PORT: "0",
      },
      nodeCommand: options.nodeCommand,
      paths,
      runtime,
    });
    children.push(web);
    const webStatus = await waitForStatus<WebStatusSnapshot>(
      web.ipcPath,
      (status) => status.url != null,
    );
    if (webStatus.url == null) throw new Error("web did not report a URL");

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
