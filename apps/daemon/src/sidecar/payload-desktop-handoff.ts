import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  LAUNCHER_SCHEMA_VERSION,
  buildLauncherAfterQuitArgs,
  buildLauncherHandoffResumeArgs,
  normalizeLauncherVersion,
  resolveLauncherPaths,
  resolveLauncherVersionPaths,
  validateLauncherAttemptDescriptor,
  validateLauncherDesktopHandoffDescriptor,
  validateLauncherRuntimeDescriptor,
  type LauncherAttemptDescriptor,
  type LauncherDesktopHandoffDescriptor,
  type LauncherPaths,
  type LauncherRuntimeDescriptor,
  type LauncherVersionPointer,
} from "@open-design/launcher-proto";
import { createProcessStampArgs } from "@open-design/platform";
import { releaseChannelFromNamespace, releaseChannelFromVersion } from "@open-design/release";
import {
  readJsonFile,
  requestJsonIpc,
  resolveAppIpcPath,
  writeJsonFile,
} from "@open-design/sidecar";
import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MESSAGES,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type DesktopStatusSnapshot,
  type SidecarSource,
  type SidecarStamp,
} from "@open-design/sidecar-proto";

const HANDOFF_CONFIRM_TIMEOUT_MS = 60_000;
const HANDOFF_POLL_INTERVAL_MS = 100;
const HANDOFF_PAYLOAD_WAIT_TIMEOUT_MS = 60_000;
const PACKAGED_NAMESPACE_BASE_ROOT_ENV = "OD_PACKAGED_NAMESPACE_BASE_ROOT";
const SIDECAR_ONLY_ENV_KEYS = [
  "ELECTRON_RUN_AS_NODE",
  "OD_SIDECAR_BASE",
  "OD_SIDECAR_IPC_PATH",
  "OD_SIDECAR_NAMESPACE",
  "OD_SIDECAR_SOURCE",
] as const;

type DesktopRootIdentity = {
  executablePath: string;
  pid: number;
  stamp: SidecarStamp;
  version: number;
};

type LauncherPayloadManifest = {
  channel: string;
  entry: {
    executable: string;
  };
  namespace: string;
  platform: "darwin" | "win32";
  schemaVersion: typeof LAUNCHER_SCHEMA_VERSION;
  version: string;
};

type LauncherInstallDescriptor = {
  channel: string;
  launchPath: string;
  namespace: string;
  schemaVersion: typeof LAUNCHER_SCHEMA_VERSION;
};

export type PreparedLegacyPayloadDesktopHandoff = {
  descriptor: LauncherDesktopHandoffDescriptor;
  kind: "prepared";
  launcherPaths: LauncherPaths;
  runtimeRoot: string;
};

export type LegacyPayloadDesktopHandoffPreparation =
  | PreparedLegacyPayloadDesktopHandoff
  | {
      kind: "none";
      reason:
        | "already-armed"
        | "desktop-identity-mismatch"
        | "invalid-install-anchor"
        | "invalid-launcher-state"
        | "invalid-payload"
        | "invalid-runtime"
        | "launcher-state-not-eligible"
        | "missing-environment"
        | "not-packaged"
        | "payload-desktop-active"
        | "unsupported-platform";
    };

export type LegacyPayloadDesktopHandoffResult =
  | { kind: "aborted"; reason: "outer-not-confirmed" | "payload-desktop-active" | "shutdown-failed" | "spawn-failed" }
  | { kind: "scheduled"; target: LauncherVersionPointer };

function samePointer(
  left: LauncherVersionPointer | null,
  right: LauncherVersionPointer | null,
): boolean {
  return left != null && right != null &&
    left.generation === right.generation &&
    left.version === right.version;
}

function samePath(left: string, right: string, platform: NodeJS.Platform): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function containsPath(root: string, target: string): boolean {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(target);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${sep}`);
}

function desktopProcessEnv(env: NodeJS.ProcessEnv, runtimeRoot: string): NodeJS.ProcessEnv {
  const desktopEnv: NodeJS.ProcessEnv = {
    ...env,
    [PACKAGED_NAMESPACE_BASE_ROOT_ENV]: dirname(dirname(runtimeRoot)),
  };
  for (const key of SIDECAR_ONLY_ENV_KEYS) delete desktopEnv[key];
  return desktopEnv;
}

async function resolvePayloadExecutable(options: {
  appVersion: string;
  launcherPaths: LauncherPaths;
  namespace: string;
  platform: NodeJS.Platform;
}): Promise<string | null> {
  const versionPaths = resolveLauncherVersionPaths({
    channel: options.launcherPaths.channel,
    namespace: options.namespace,
    root: options.launcherPaths.root,
    version: options.appVersion,
  });
  const manifest = await readJsonFile<LauncherPayloadManifest>(versionPaths.manifestPath);
  if (
    manifest == null ||
    manifest.schemaVersion !== LAUNCHER_SCHEMA_VERSION ||
    manifest.channel !== options.launcherPaths.channel ||
    manifest.namespace !== options.namespace ||
    manifest.version !== options.appVersion ||
    manifest.platform !== options.platform ||
    typeof manifest.entry?.executable !== "string"
  ) return null;
  const executablePath = resolve(versionPaths.versionRoot, manifest.entry.executable);
  if (!containsPath(versionPaths.versionRoot, executablePath)) return null;
  const entry = await lstat(executablePath).catch(() => null);
  return entry != null && entry.isFile() && !entry.isSymbolicLink()
    ? executablePath
    : null;
}

async function readDesktopIdentity(
  runtimeRoot: string,
  namespace: string,
): Promise<DesktopRootIdentity | null> {
  const identity = await readJsonFile<DesktopRootIdentity>(join(runtimeRoot, "desktop-root.json"));
  if (
    identity == null ||
    identity.version !== 1 ||
    !Number.isSafeInteger(identity.pid) ||
    identity.pid <= 0 ||
    typeof identity.executablePath !== "string" ||
    !isAbsolute(identity.executablePath) ||
    identity.stamp?.app !== APP_KEYS.DESKTOP ||
    identity.stamp.namespace !== namespace ||
    (
      identity.stamp.source !== SIDECAR_SOURCES.PACKAGED &&
      identity.stamp.source !== SIDECAR_SOURCES.TOOLS_PACK
    )
  ) return null;
  return identity;
}

async function readRuntime(
  launcherPaths: LauncherPaths,
): Promise<LauncherRuntimeDescriptor | null> {
  const value = await readJsonFile<LauncherRuntimeDescriptor>(launcherPaths.runtimePath);
  if (value == null) return null;
  try {
    return validateLauncherRuntimeDescriptor(value, launcherPaths);
  } catch {
    return null;
  }
}

async function readAttempt(
  launcherPaths: LauncherPaths,
): Promise<LauncherAttemptDescriptor | null> {
  const value = await readJsonFile<LauncherAttemptDescriptor>(launcherPaths.attemptsPath);
  if (value == null) return null;
  try {
    return validateLauncherAttemptDescriptor(value, launcherPaths);
  } catch {
    return null;
  }
}

async function resolveInstalledOuterIdentity(options: {
  launcherPaths: LauncherPaths;
  parentPid: number;
  platform: NodeJS.Platform;
}): Promise<LauncherDesktopHandoffDescriptor["outer"] | null> {
  if (!Number.isSafeInteger(options.parentPid) || options.parentPid <= 0) return null;
  const install = await readJsonFile<LauncherInstallDescriptor>(options.launcherPaths.installPath);
  if (
    install == null ||
    install.schemaVersion !== LAUNCHER_SCHEMA_VERSION ||
    install.channel !== options.launcherPaths.channel ||
    install.namespace !== options.launcherPaths.namespace ||
    typeof install.launchPath !== "string" ||
    !isAbsolute(install.launchPath)
  ) return null;
  const executablePath = options.platform === "darwin" && install.launchPath.endsWith(".app")
    ? join(
      install.launchPath,
      "Contents",
      "MacOS",
      basename(install.launchPath, ".app"),
    )
    : install.launchPath;
  const entry = await lstat(executablePath).catch(() => null);
  if (entry == null || !entry.isFile() || entry.isSymbolicLink()) return null;
  return { executablePath, pid: options.parentPid };
}

export async function prepareLegacyPayloadDesktopHandoff(options: {
  env?: NodeJS.ProcessEnv;
  namespace: string;
  now?: () => Date;
  parentPid?: number;
  platform?: NodeJS.Platform;
  randomId?: () => string;
  runtimeRoot: string;
  source: SidecarSource;
}): Promise<LegacyPayloadDesktopHandoffPreparation> {
  if (
    options.source !== SIDECAR_SOURCES.PACKAGED &&
    options.source !== SIDECAR_SOURCES.TOOLS_PACK
  ) {
    return { kind: "none", reason: "not-packaged" };
  }
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin" && platform !== "win32") {
    return { kind: "none", reason: "unsupported-platform" };
  }
  const env = options.env ?? process.env;
  const installationRoot = env.OD_INSTALLATION_DIR;
  const rawAppVersion = env.OD_APP_VERSION;
  if (
    installationRoot == null ||
    !isAbsolute(installationRoot) ||
    rawAppVersion == null
  ) return { kind: "none", reason: "missing-environment" };

  let appVersion: string;
  try {
    appVersion = normalizeLauncherVersion(rawAppVersion);
  } catch {
    return { kind: "none", reason: "invalid-launcher-state" };
  }
  const channel = releaseChannelFromVersion(appVersion)
    ?? releaseChannelFromNamespace(options.namespace, "default")
    ?? "stable";
  const launcherPaths = resolveLauncherPaths({
    channel,
    namespace: options.namespace,
    root: installationRoot,
  });
  const [runtime, attempt, identity, outer, payloadExecutablePath] = await Promise.all([
    readRuntime(launcherPaths),
    readAttempt(launcherPaths),
    readDesktopIdentity(options.runtimeRoot, options.namespace),
    resolveInstalledOuterIdentity({
      launcherPaths,
      parentPid: options.parentPid ?? process.ppid,
      platform,
    }),
    resolvePayloadExecutable({
      appVersion,
      launcherPaths,
      namespace: options.namespace,
      platform,
    }),
  ]);
  if (runtime == null) return { kind: "none", reason: "invalid-runtime" };
  if (outer == null) return { kind: "none", reason: "invalid-install-anchor" };
  if (payloadExecutablePath == null) return { kind: "none", reason: "invalid-payload" };
  if (identity != null && samePath(identity.executablePath, payloadExecutablePath, platform)) {
    return { kind: "none", reason: "payload-desktop-active" };
  }
  if (identity != null && (
    identity.pid !== outer.pid ||
    !samePath(identity.executablePath, outer.executablePath, platform)
  )) return { kind: "none", reason: "desktop-identity-mismatch" };

  const existingRaw = await readJsonFile<LauncherDesktopHandoffDescriptor>(launcherPaths.handoffPath);
  const existing = existingRaw == null
    ? null
    : (() => {
        try {
          return validateLauncherDesktopHandoffDescriptor(existingRaw, launcherPaths);
        } catch {
          return null;
        }
      })();
  if (existing?.state === "armed") return { kind: "none", reason: "already-armed" };

  const initialSource = runtime.active;
  const initialPrevious = runtime.lastSuccessful;
  const canCaptureInitialState =
    initialSource?.version === appVersion &&
    initialPrevious != null &&
    !samePointer(initialSource, initialPrevious) &&
    samePointer(attempt, initialSource);
  const canCaptureConfirmedBinding =
    existing?.state === "confirmed" &&
    existing.target != null &&
    initialSource?.version === appVersion &&
    samePointer(existing.source, existing.target) &&
    samePointer(existing.target, initialSource) &&
    samePointer(initialPrevious, initialSource);
  const canResumePreparedState =
    existing?.state === "prepared" &&
    existing.source.version === appVersion &&
    samePointer(runtime.active, existing.source) &&
    (
      samePointer(runtime.lastSuccessful, existing.previous) ||
      samePointer(runtime.lastSuccessful, existing.source)
    );
  if (!canCaptureInitialState && !canCaptureConfirmedBinding && !canResumePreparedState) {
    return { kind: "none", reason: "launcher-state-not-eligible" };
  }

  const now = (options.now ?? (() => new Date()))().toISOString();
  const descriptor: LauncherDesktopHandoffDescriptor = canResumePreparedState && existing != null
    ? {
        ...existing,
        outer,
        payloadExecutablePath,
        updatedAt: now,
      }
    : {
        channel,
        createdAt: now,
        handoffId: (options.randomId ?? randomUUID)(),
        namespace: options.namespace,
        outer,
        payloadExecutablePath,
        previous: canCaptureConfirmedBinding && existing != null
          ? existing.previous
          : initialPrevious as LauncherVersionPointer,
        schemaVersion: LAUNCHER_SCHEMA_VERSION,
        source: initialSource as LauncherVersionPointer,
        state: "prepared",
        updatedAt: now,
      };
  await writeJsonFile(launcherPaths.handoffPath, descriptor);
  return {
    descriptor,
    kind: "prepared",
    launcherPaths,
    runtimeRoot: options.runtimeRoot,
  };
}

async function waitForOuterConfirm(
  prepared: PreparedLegacyPayloadDesktopHandoff,
  options: {
    confirmTimeoutMs: number;
    requestDesktop: (message: "shutdown" | "status") => Promise<unknown>;
    sleep: (durationMs: number) => Promise<unknown>;
  },
): Promise<"confirmed" | "outer-not-confirmed" | "payload-desktop-active"> {
  const deadline = Date.now() + options.confirmTimeoutMs;
  while (Date.now() < deadline) {
    const [runtime, attempt, identity, status] = await Promise.all([
      readRuntime(prepared.launcherPaths),
      readAttempt(prepared.launcherPaths),
      readDesktopIdentity(prepared.runtimeRoot, prepared.descriptor.namespace),
      options.requestDesktop("status").catch(() => null) as Promise<DesktopStatusSnapshot | null>,
    ]);
    if (
      identity?.pid === prepared.descriptor.outer.pid &&
      samePath(identity.executablePath, prepared.descriptor.payloadExecutablePath, process.platform)
    ) return "payload-desktop-active";
    if (
      runtime != null &&
      attempt == null &&
      samePointer(runtime.active, prepared.descriptor.source) &&
      samePointer(runtime.lastSuccessful, prepared.descriptor.source) &&
      identity?.pid === prepared.descriptor.outer.pid &&
      samePath(identity.executablePath, prepared.descriptor.outer.executablePath, process.platform) &&
      status?.state === "running" &&
      status.pid === prepared.descriptor.outer.pid
    ) return "confirmed";
    await options.sleep(HANDOFF_POLL_INTERVAL_MS);
  }
  return "outer-not-confirmed";
}

export async function executeLegacyPayloadDesktopHandoff(
  prepared: PreparedLegacyPayloadDesktopHandoff,
  options: {
    confirmTimeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    now?: () => Date;
    requestDesktop?: (message: "shutdown" | "status") => Promise<unknown>;
    sleep?: (durationMs: number) => Promise<unknown>;
    spawn?: typeof spawn;
  } = {},
): Promise<LegacyPayloadDesktopHandoffResult> {
  const desktopIpcPath = resolveAppIpcPath({
    app: APP_KEYS.DESKTOP,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    namespace: prepared.descriptor.namespace,
  });
  const requestDesktop = options.requestDesktop ?? (async (message) => await requestJsonIpc(
    desktopIpcPath,
    { type: message === "status" ? SIDECAR_MESSAGES.STATUS : SIDECAR_MESSAGES.SHUTDOWN },
    { timeoutMs: 800 },
  ));
  const confirmation = await waitForOuterConfirm(prepared, {
    confirmTimeoutMs: options.confirmTimeoutMs ?? HANDOFF_CONFIRM_TIMEOUT_MS,
    requestDesktop,
    sleep: options.sleep ?? (async (durationMs) => await sleep(durationMs)),
  });
  if (confirmation === "payload-desktop-active") {
    await rm(prepared.launcherPaths.handoffPath, { force: true });
    return { kind: "aborted", reason: confirmation };
  }
  if (confirmation === "outer-not-confirmed") return { kind: "aborted", reason: confirmation };

  const now = (options.now ?? (() => new Date()))().toISOString();
  const target: LauncherVersionPointer = {
    generation: Math.max(
      prepared.descriptor.source.generation,
      prepared.descriptor.previous.generation,
    ) + 1,
    version: prepared.descriptor.source.version,
  };
  const armed: LauncherDesktopHandoffDescriptor = {
    ...prepared.descriptor,
    state: "armed",
    target,
    updatedAt: now,
  };
  const attempt: LauncherAttemptDescriptor = {
    channel: prepared.launcherPaths.channel,
    generation: target.generation,
    namespace: prepared.launcherPaths.namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    startedAt: now,
    version: target.version,
  };
  const runtime: LauncherRuntimeDescriptor = {
    active: target,
    channel: prepared.launcherPaths.channel,
    lastSuccessful: prepared.descriptor.previous,
    namespace: prepared.launcherPaths.namespace,
    schemaVersion: LAUNCHER_SCHEMA_VERSION,
    updatedAt: now,
  };

  const desktopStamp: SidecarStamp = {
    app: APP_KEYS.DESKTOP,
    ipc: desktopIpcPath,
    mode: SIDECAR_MODES.RUNTIME,
    namespace: prepared.descriptor.namespace,
    source: SIDECAR_SOURCES.PACKAGED,
  };
  const args = [
    ...buildLauncherAfterQuitArgs({
      targetPid: prepared.descriptor.outer.pid,
      timeoutMs: HANDOFF_PAYLOAD_WAIT_TIMEOUT_MS,
    }),
    ...buildLauncherHandoffResumeArgs({ handoffId: prepared.descriptor.handoffId }),
    ...createProcessStampArgs(desktopStamp, OPEN_DESIGN_SIDECAR_CONTRACT),
  ];
  let child: ReturnType<typeof spawn>;
  try {
    child = (options.spawn ?? spawn)(prepared.descriptor.payloadExecutablePath, args, {
      cwd: dirname(prepared.descriptor.payloadExecutablePath),
      detached: true,
      env: desktopProcessEnv(options.env ?? process.env, prepared.runtimeRoot),
      stdio: "ignore",
      windowsHide: true,
    });
    await new Promise<void>((resolveSpawn, rejectSpawn) => {
      child.once("spawn", () => resolveSpawn());
      child.once("error", rejectSpawn);
    });
    child.unref();
  } catch {
    return { kind: "aborted", reason: "spawn-failed" };
  }

  try {
    await requestDesktop("shutdown");
  } catch {
    return { kind: "aborted", reason: "shutdown-failed" };
  }

  // Commit the armed journal and rewritten runtime/attempt state only after both
  // the payload child has actually spawned and the old desktop has accepted the
  // shutdown. Writing earlier would strand an "armed" journal on disk when
  // `spawn()` throws or the shutdown request fails: the next cold start bails out
  // of prepareLegacyPayloadDesktopHandoff() with reason "already-armed" and the
  // install stays pinned to the old desktop generation. The old desktop is still
  // alive while it acks the shutdown, and the payload waits for its pid to exit
  // before resuming, so these writes still land before the payload reads them.
  await writeJsonFile(prepared.launcherPaths.handoffPath, armed);
  await writeJsonFile(prepared.launcherPaths.attemptsPath, attempt);
  await writeJsonFile(prepared.launcherPaths.runtimePath, runtime);

  return { kind: "scheduled", target };
}
