import {
  existsSync, mkdirSync, readFileSync, readdirSync, realpathSync,
  renameSync, rmSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  LAUNCHER_SCHEMA_VERSION, LAUNCHER_HOST_CONTRACT_VERSION,
  compareLauncherVersions, normalizeLauncherVersion, normalizeNamespace,
  parseLauncherDelegatedArgs, publishLauncherHost, resolveLauncherChannel, resolveLauncherPaths,
  selectLauncherRuntimeTarget, validateLauncherRuntimeDescriptor, validateLauncherAttemptDescriptor,
  validateLauncherHostEnvironment,
  type LauncherAttemptDescriptor, type LauncherCleanupDescriptor, type LauncherHost,
  type LauncherHostEnvironment, type LauncherHostRunningCode, type LauncherHostSelection,
  type LauncherPaths, type LauncherRuntimeDescriptor, type LauncherVersionPointer,
} from "@open-design/launcher-proto";
import { resolvePayload, within } from "./artifact.js";
import type { LauncherPlatform } from "./platform.js";
import type { LauncherEntry, LauncherEntryOptions } from "./types.js";

type RawConfig = {
  appVersion?: string;
  namespace?: string;
  namespaceBaseRoot?: string;
  launcherHost?: LauncherHostEnvironment;
};
type HostBinding = {
  contractVersion: number;
  installedAppPath: string;
  outerVersion: string;
  electronVersion: string;
};
type Installation = {
  version: string;
  namespaceBaseRoot: string;
  installedAppPath: string;
  executablePath: string;
  resourcesPath: string;
  paths: LauncherPaths;
  config: RawConfig;
};
type StartupState = {
  runtime: LauncherRuntimeDescriptor;
  attempt: LauncherAttemptDescriptor | null;
};
type ApplicationSelection = {
  running: LauncherHostRunningCode;
  entry: string;
  selection: LauncherHostSelection | null;
  rolledBackFromVersion: string | null;
};

/** The installed host owns lifecycle state; platform operations are injected. */
export async function startLauncher(
  options: LauncherEntryOptions & { adapter: LauncherPlatform },
): Promise<LauncherEntry | null> {
  const argv = options.argv ?? process.argv.slice(1);
  const installation = resolveInstallation(options);

  // A cached app received by an old outer stays legacy until an installer has
  // claimed this namespace. Afterwards old OS entries redirect to that host.
  if (within(installation.paths.versionsRoot, installation.executablePath)) {
    if (!await redirectCachedEntry(installation, options.adapter, argv)) {
      return { entry: options.bundledEntry, source: "legacy" };
    }
    options.app.exit(0);
    return null;
  }

  validateLauncherHostEnvironment(installation.config.launcherHost, options.adapter.environment);
  const onSecondInstance = claimInstance(options.app, installation, argv);
  if (onSecondInstance == null) {
    options.app.exit(0);
    return null;
  }

  // No journal writes precede single-instance ownership.
  const startup = loadOrAdoptInstallation(installation, options.adapter.environment);
  const application = selectApplication(installation, startup, options, argv);
  const host = createHostLifecycle(installation, application, startup.runtime, options, onSecondInstance);
  (options.publish ?? publishLauncherHost)(host);

  if (application.running.source === "payload") options.app.setAppPath(application.running.appRoot);
  synchronizeSystemEntries(installation, options.adapter);
  return { entry: application.entry, source: application.running.source };
}

function resolveInstallation(options: LauncherEntryOptions & { adapter: LauncherPlatform }): Installation {
  const env = options.env ?? process.env;
  const resourcesPath = options.resourcesPath ?? (process as NodeJS.Process & { resourcesPath: string }).resourcesPath;
  const executablePath = options.executablePath ?? process.execPath;
  const config = (readJson(env.OD_PACKAGED_CONFIG_PATH || join(resourcesPath, "open-design-config.json")) ?? {}) as RawConfig;
  const version = normalizeLauncherVersion(config.appVersion ?? "");
  const namespace = normalizeNamespace(env.OD_PACKAGED_NAMESPACE ?? config.namespace ?? "default");
  const namespaceBaseRoot = resolve(
    env.OD_PACKAGED_NAMESPACE_BASE_ROOT || config.namespaceBaseRoot || join(options.app.getPath("userData"), "namespaces"),
  );
  const paths = resolveLauncherPaths({
    channel: resolveLauncherChannel(version, namespace),
    namespace,
    root: resolve(namespaceBaseRoot, ".."),
  });
  return {
    version, namespaceBaseRoot, resourcesPath, executablePath, paths, config,
    installedAppPath: options.adapter.installedAppPath(executablePath),
  };
}

async function redirectCachedEntry(
  installation: Installation,
  platform: LauncherPlatform,
  argv: readonly string[],
): Promise<boolean> {
  const binding = readJson(join(installation.paths.stateRoot, "hosted.json")) as HostBinding | null;
  if (binding?.contractVersion !== LAUNCHER_HOST_CONTRACT_VERSION ||
      within(installation.paths.versionsRoot, binding.installedAppPath)) return false;
  const config = readJson(platform.installedConfigPath(binding.installedAppPath)) as RawConfig | null;
  if (config?.launcherHost?.contractVersion !== LAUNCHER_HOST_CONTRACT_VERSION) return false;
  await platform.openInstalled(
    binding.installedAppPath,
    argv.filter(arg => arg.startsWith("opendesign://") || arg === "--headless"),
  );
  return true;
}

function claimInstance(
  app: LauncherEntryOptions["app"],
  installation: Installation,
  argv: readonly string[],
): LauncherHost["onSecondInstance"] | null {
  const { namespaceBaseRoot, paths, version } = installation;
  // userData determines Electron's single-instance lock key.
  app.setPath("userData", join(namespaceBaseRoot, paths.namespace, "user-data"));
  if (!app.requestSingleInstanceLock({ argv: [...argv], version })) return null;

  let listener: ((argv: readonly string[]) => void) | null = null;
  const pending: string[][] = [];
  app.on("second-instance", (_event, args) => {
    if (!Array.isArray(args) || !args.every(arg => typeof arg === "string")) return;
    if (listener == null) pending.push(args);
    else listener(args);
  });
  return next => {
    listener = next;
    for (const args of pending.splice(0)) next(args);
  };
}

function loadOrAdoptInstallation(installation: Installation, environment: LauncherHostEnvironment): StartupState {
  const { paths, version, installedAppPath } = installation;
  const expected = { channel: paths.channel, namespace: paths.namespace };
  const bindingPath = join(paths.stateRoot, "hosted.json");
  const binding = readJson(bindingPath) as HostBinding | null;
  const alreadyAdopted = binding?.contractVersion === LAUNCHER_HOST_CONTRACT_VERSION &&
    binding.installedAppPath === installedAppPath && binding.outerVersion === version &&
    binding.electronVersion === environment.electronVersion;
  const baselinePointer = { version, generation: 0 };
  const baseline: LauncherRuntimeDescriptor = {
    schemaVersion: LAUNCHER_SCHEMA_VERSION, ...expected,
    active: baselinePointer, lastSuccessful: baselinePointer,
  };
  const rawRuntime = readJson(paths.runtimePath);
  let runtime = rawRuntime == null ? baseline : validateLauncherRuntimeDescriptor(rawRuntime as LauncherRuntimeDescriptor, expected);
  if (alreadyAdopted) return { runtime, attempt: readAttempt(paths) };

  // Same-version replacement is an architecture migration. Keep newer code
  // only when it is compatible; never silently downgrade newer application data.
  let attempt: LauncherAttemptDescriptor | null = null;
  if (runtime.active != null && compareLauncherVersions(runtime.active.version, version) > 0) {
    attempt = readAttempt(paths);
    // Installer adoption must not retry a generation that already failed.
    // Validate the selected code before changing any migration journals.
    const selected = selectLauncherRuntimeTarget({ runtime, attempted: attempt });
    if (selected.selected && compareLauncherVersions(selected.pointer.version, version) > 0) {
      try {
        resolvePayload(paths, selected.pointer.version, environment);
      } catch {
        // Complete adoption so selectApplication can record the failed target
        // and recover to compatible code without deleting the payload bytes.
      }
    }
    let lastSuccessful = baselinePointer;
    if (runtime.lastSuccessful != null && compareLauncherVersions(runtime.lastSuccessful.version, version) > 0) {
      try {
        resolvePayload(paths, runtime.lastSuccessful.version, environment);
        lastSuccessful = runtime.lastSuccessful;
      } catch { /* Only a compatible fallback can run inside this host. */ }
    }
    runtime = { ...runtime, lastSuccessful };
  } else {
    runtime = baseline;
  }
  writeJson(paths.cleanupPath, inventoryLegacyPayloads(paths, version));
  writeJson(paths.runtimePath, runtime);
  if (attempt == null) rmSync(paths.attemptsPath, { force: true });
  rmSync(paths.handoffPath, { force: true });
  writeJson(paths.installPath, { schemaVersion: LAUNCHER_SCHEMA_VERSION, ...expected, launchPath: installedAppPath });
  writeJson(bindingPath, {
    contractVersion: LAUNCHER_HOST_CONTRACT_VERSION,
    installedAppPath, outerVersion: version, electronVersion: environment.electronVersion,
  } satisfies HostBinding);
  return { runtime, attempt };
}

function inventoryLegacyPayloads(paths: LauncherPaths, boundVersion: string): LauncherCleanupDescriptor {
  const cleanup: LauncherCleanupDescriptor = {
    version: LAUNCHER_SCHEMA_VERSION, channel: paths.channel, namespace: paths.namespace,
    currentVersion: boundVersion, updatedAt: new Date().toISOString(), versions: [],
  };
  if (!existsSync(paths.versionsRoot)) return cleanup;
  for (const directory of readdirSync(paths.versionsRoot, { withFileTypes: true })) {
    if (!directory.isDirectory() || directory.isSymbolicLink()) continue;
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(directory.name)) continue;
    try {
      if (normalizeLauncherVersion(directory.name) !== directory.name ||
          compareLauncherVersions(directory.name, boundVersion) > 0) continue;
    } catch {
      continue;
    }
    cleanup.versions.push({
      version: directory.name, generation: 0, reason: "older-than-bound-package",
      state: "deprecated", updatedAt: cleanup.updatedAt,
    });
  }
  // Inventory only. The existing cleanup executor removes bytes after readiness
  // and consults the host's running-resource protection before each removal.
  return cleanup;
}

function selectApplication(
  installation: Installation,
  startup: StartupState,
  options: LauncherEntryOptions & { adapter: LauncherPlatform },
  argv: readonly string[],
): ApplicationSelection {
  const { paths, version, resourcesPath, executablePath } = installation;
  const { runtime, attempt } = startup;
  const baselinePointer = { version, generation: 0 };
  const selected = selectLauncherRuntimeTarget({ runtime, attempted: attempt, delegated: parseLauncherDelegatedArgs(argv) });
  let target = selected.selected ? selected.pointer : baselinePointer;
  const application: ApplicationSelection = {
    entry: options.bundledEntry,
    running: { appRoot: options.appRoot, resourcesPath, executablePath, source: "bundled", version },
    selection: null,
    rolledBackFromVersion: attempt != null && runtime.active?.version === attempt.version &&
      runtime.active.generation === attempt.generation && selected.selected && selected.reason === "last-successful"
      ? attempt.version : null,
  };
  if (compareLauncherVersions(target.version, version) <= 0) return application;

  let payload: ReturnType<typeof resolvePayload> | null;
  let reason: LauncherHostSelection["reason"] = selected.selected && selected.reason !== "active-resume"
    ? selected.reason : "active";
  try {
    payload = resolvePayload(paths, target.version, options.adapter.environment);
  } catch {
    // Preserve failure evidence and recover inside the installed process even
    // when the selected payload is missing/corrupt before its code can run.
    application.rolledBackFromVersion = target.version;
    writeAttempt(paths, target);
    target = runtime.lastSuccessful ?? baselinePointer;
    reason = "last-successful";
    try {
      payload = compareLauncherVersions(target.version, version) > 0
        ? resolvePayload(paths, target.version, options.adapter.environment) : null;
    } catch {
      target = baselinePointer;
      payload = null;
    }
  }
  if (payload != null) {
    application.running = payload.running;
    application.entry = payload.entry;
    application.selection = { pointer: target, reason };
    if (reason !== "last-successful") writeAttempt(paths, target);
  }
  return application;
}

function createHostLifecycle(
  installation: Installation,
  application: ApplicationSelection,
  initialRuntime: LauncherRuntimeDescriptor,
  options: LauncherEntryOptions & { adapter: LauncherPlatform },
  onSecondInstance: LauncherHost["onSecondInstance"],
): LauncherHost {
  const { paths, version, installedAppPath, namespaceBaseRoot } = installation;
  let runtime = initialRuntime;
  let readinessConfirmed = false;
  let relaunchRequested = false;
  function commitRuntime(next: LauncherRuntimeDescriptor): void {
    writeJson(paths.runtimePath, next);
    runtime = next;
  }
  return {
    contractVersion: LAUNCHER_HOST_CONTRACT_VERSION,
    installedAppPath, namespaceBaseRoot,
    running: application.running,
    selection: application.selection,
    rolledBackFromVersion: application.rolledBackFromVersion,
    snapshot: () => structuredClone(runtime),
    async reportReady() {
      if (readinessConfirmed || relaunchRequested) return;
      // Readiness of a fallback must not acknowledge the failed successor.
      if (application.selection?.reason !== "last-successful" && application.rolledBackFromVersion == null) {
        const current = application.selection?.pointer ?? { version, generation: 0 };
        commitRuntime({ ...runtime, active: current, lastSuccessful: current, updatedAt: new Date().toISOString() });
        rmSync(paths.attemptsPath, { force: true });
      }
      // Commit last: any persistence failure must leave confirmation retryable.
      readinessConfirmed = true;
    },
    async validateCandidate(nextVersion, artifactRoot) {
      resolvePayload(paths, normalizeLauncherVersion(nextVersion), options.adapter.environment, artifactRoot);
    },
    async activateCandidate(nextVersion) {
      const normalized = normalizeLauncherVersion(nextVersion);
      resolvePayload(paths, normalized, options.adapter.environment);
      const active = {
        version: normalized,
        generation: Math.max(runtime.active?.generation ?? 0, runtime.lastSuccessful?.generation ?? 0) + 1,
      };
      commitRuntime({ ...runtime, active, updatedAt: new Date().toISOString() });
      writeAttempt(paths, active);
      return structuredClone(runtime);
    },
    async resetFailedLaunch() { resetFailedLaunch(paths); },
    async protectsResource(path) { return protectsRunningResource(path, installation, application.running); },
    onSecondInstance,
    async requestRelaunch() {
      if (relaunchRequested) return;
      await options.adapter.relaunchInstalled(installedAppPath, {
        predecessorPid: options.processPid ?? process.pid, target: runtime.active,
      });
      relaunchRequested = true;
    },
  };
}

function resetFailedLaunch(paths: LauncherPaths): void {
  rmSync(paths.attemptsPath, { force: true });
  let handoff: { state?: string } | null = null;
  try { handoff = readJson(paths.handoffPath) as { state?: string } | null; }
  catch { /* An interrupted, malformed handoff is not a confirmed generation. */ }
  if (handoff?.state !== "confirmed") rmSync(paths.handoffPath, { force: true });
}

function protectsRunningResource(path: string, installation: Installation, running: LauncherHostRunningCode): boolean {
  const contains = (root: string, value: string) => resolve(root) === resolve(value) || within(root, value);
  if (contains(path, installation.executablePath) ||
      (running.source === "payload" && contains(path, running.appRoot))) return true;
  let physicalRoot: string;
  try { physicalRoot = realpathSync(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  return contains(physicalRoot, realpathSync(installation.executablePath)) ||
    (running.source === "payload" && contains(physicalRoot, realpathSync(running.appRoot)));
}

function synchronizeSystemEntries(installation: Installation, platform: LauncherPlatform): void {
  // System integration is best effort, independent of business readiness.
  void Promise.resolve().then(() => platform.synchronizeSystemEntries({
    installedAppPath: installation.installedAppPath,
    executablePath: installation.executablePath,
    paths: installation.paths,
  })).catch(error => console.warn("[launcher] system entry synchronization failed", error));
}

function readAttempt(paths: LauncherPaths): LauncherAttemptDescriptor | null {
  try {
    return validateLauncherAttemptDescriptor(readJson(paths.attemptsPath) as LauncherAttemptDescriptor, {
      channel: paths.channel, namespace: paths.namespace,
    });
  } catch {
    return null;
  }
}

function writeAttempt(paths: LauncherPaths, pointer: LauncherVersionPointer): void {
  writeJson(paths.attemptsPath, {
    schemaVersion: LAUNCHER_SCHEMA_VERSION, channel: paths.channel, namespace: paths.namespace,
    ...pointer, startedAt: new Date().toISOString(),
  } satisfies LauncherAttemptDescriptor);
}

function readJson(path: string): unknown {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}
