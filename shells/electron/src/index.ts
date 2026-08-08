import { join } from "node:path";

import { app, dialog } from "electron";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import {
  parseLauncherAfterQuitArgs,
  parseLauncherDelegatedArgs,
  parseLauncherHandoffResumeArgs,
} from "@open-design/launcher-proto";
import {
  bootstrapSidecarRuntime,
  createSidecarLaunchEnv,
  resolveAppIpcPath,
} from "@open-design/sidecar";
import { readProcessStamp } from "@open-design/platform";

import { readPackagedConfig } from "./config.js";
import {
  checkForPackagedClosureUpdate,
  resolvePackagedClosureInstallerRequiredVersion,
  resolvePackagedClosureReleaseVersion,
} from "./closure-update.js";
import {
  claimPackagedDownloadAttribution,
  discoverPackagedDownloadAttribution,
} from "./download-attribution.js";
import { PackagedPathAccessError } from "./errors.js";
import {
  createElectronStandaloneRuntimeIdentity,
  writePackagedDesktopIdentity,
} from "./identity.js";
import {
  exitPackagedLauncherForExistingDesktop,
  inspectExistingDesktopForLauncher,
  waitForLauncherAfterQuit,
} from "./launcher-after-quit.js";
import {
  confirmPackagedLauncherRuntime,
  resolvePackagedLauncherRuntime,
} from "./launcher-runtime.js";
import {
  applyPackagedElectronPathOverrides,
  claimPackagedSingleInstanceLock,
  createPackagedSecondInstanceHandoff,
  ensurePackagedNamespacePaths,
  stabilizePackagedWorkingDirectory,
} from "./launch.js";
import {
  attachPackagedDesktopProcessLogging,
  createPackagedDesktopLogger,
  type PackagedDesktopLogger,
} from "./logging.js";
import { resolvePackagedMcpBootstrapLaunch } from "./mcp-bootstrap.js";
import {
  applyLoopbackConnectionLimitSwitch,
  applyOsLocaleSwitch,
  createSplashWindow,
  setSplashStage,
} from "./main/index.js";
import { createObsoleteInstalledOuterRetirement } from "./obsolete-installed-outer.js";
import { resolvePackagedNamespacePaths } from "./paths.js";
import { findPackagedDeeplinkArg, launchPackagedPayloadDesktop } from "./payload-desktop-launch.js";
import { packagedEntryUrl, registerOdProtocol } from "./protocol.js";
import { reportStartupFailure, resolveStartupDistinctId } from "./startup-telemetry.js";
import {
  confirmElectronStandaloneBinding,
  digestElectronShellEntry,
  resolveElectronStandaloneBinding,
} from "./standalone-binding.js";
import { createElectronStandaloneLauncher } from "./standalone-handoff.js";
import { createStandaloneDesktopAuthRegistration } from "./standalone-commands.js";
import { withStandaloneBootstrapEnvironment } from "./standalone-environment.js";
import {
  parsePackagedStandaloneRequest,
  runPackagedStandalone,
} from "./standalone-launcher.js";
import { resolvePackagedWindowTitle } from "./window-title.js";
import { syncWindowsUninstallDisplayVersion } from "./windows-lifecycle.js";

let packagedLogger: PackagedDesktopLogger | null = null;
const secondInstanceHandoff = createPackagedSecondInstanceHandoff();

let startupTelemetryContext:
  | {
      appVersion: string | null;
      installationRoot: string;
      namespace: string;
      nativeModulePath: string | null;
      posthogHost: string | null;
      posthogKey: string | null;
      source: string;
    }
  | null = null;

function createElectronDesktopStamp(namespace: string): SidecarStamp {
  return {
    app: APP_KEYS.DESKTOP,
    ipc: resolveAppIpcPath({
      app: APP_KEYS.DESKTOP,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      namespace,
    }),
    mode: SIDECAR_MODES.RUNTIME,
    namespace,
    source: SIDECAR_SOURCES.PACKAGED,
  };
}

function applyLaunchEnv(base: string, stamp: SidecarStamp): void {
  const env = createSidecarLaunchEnv({
    base,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    stamp,
  });
  for (const [key, value] of Object.entries(env)) {
    if (value != null) process.env[key] = value;
  }
}

function applyShellUpdateEnv(updateMetadataUrl: string | null): void {
  if (updateMetadataUrl == null) return;
  if (process.env.OD_UPDATE_METADATA_URL?.trim()) return;
  process.env.OD_UPDATE_METADATA_URL = updateMetadataUrl;
}

async function main(): Promise<void> {
  const packageConfig = await readPackagedConfig();
  const standaloneRequest = parsePackagedStandaloneRequest(process.argv.slice(1));
  if (standaloneRequest.standalone) {
    await runPackagedStandalone(packageConfig, standaloneRequest, {
      shellEntryUrl: import.meta.url,
    });
    return;
  }

  applyOsLocaleSwitch(app);
  applyLoopbackConnectionLimitSwitch(app);
  app.commandLine.appendSwitch("ignore-connections-limit", "127.0.0.1,localhost");

  const afterQuit = parseLauncherAfterQuitArgs(process.argv.slice(1));
  const handoffResume = parseLauncherHandoffResumeArgs(process.argv.slice(1));
  const delegated = parseLauncherDelegatedArgs(process.argv.slice(1));
  const argvStamp = readProcessStamp(process.argv.slice(1), OPEN_DESIGN_SIDECAR_CONTRACT);
  const namespace = argvStamp?.namespace ?? packageConfig.namespace;
  const namespaceConfig = namespace === packageConfig.namespace
    ? packageConfig
    : { ...packageConfig, namespace };
  const initialPaths = resolvePackagedNamespacePaths(namespaceConfig, namespace, process.env);
  if (!await waitForLauncherAfterQuit(afterQuit, initialPaths)) {
    app.exit(1);
    return;
  }

  const existingDesktop = await inspectExistingDesktopForLauncher(namespace, {
    deeplinkUrl: findPackagedDeeplinkArg(process.argv),
    incomingVersion: namespaceConfig.appVersion,
    logger: console,
    paths: initialPaths,
  });
  if (exitPackagedLauncherForExistingDesktop(existingDesktop, (code) => app.exit(code))) return;

  const stamp = argvStamp ?? createElectronDesktopStamp(namespace);
  const shellRuntime = await resolvePackagedLauncherRuntime(namespaceConfig, initialPaths, {
    delegated,
    resume: handoffResume,
  });
  if (await launchPackagedPayloadDesktop(shellRuntime, stamp)) {
    app.exit(0);
    return;
  }

  const shellConfig = shellRuntime.config;
  const paths = shellRuntime.paths;
  const shellVersion = shellConfig.appVersion;
  if (shellVersion == null) throw new Error("Electron Shell version is unavailable");
  const mcpBootstrap = resolvePackagedMcpBootstrapLaunch({
    installedLaunchPath: shellRuntime.installedLaunchPath,
  });

  startupTelemetryContext = {
    appVersion: shellVersion,
    installationRoot: paths.installationRoot,
    namespace,
    nativeModulePath: null,
    posthogHost: shellConfig.posthogHost,
    posthogKey: shellConfig.posthogKey,
    source: SIDECAR_SOURCES.PACKAGED,
  };

  await ensurePackagedNamespacePaths(paths);
  stabilizePackagedWorkingDirectory(paths);
  const downloadAttribution = await discoverPackagedDownloadAttribution(paths, console).catch(
    (error: unknown) => {
      console.warn("[attribution] failed to discover packaged download attribution", error);
      return null;
    },
  );
  packagedLogger = createPackagedDesktopLogger(paths);
  attachPackagedDesktopProcessLogging({ logger: packagedLogger, paths, stamp });
  const retireObsoleteInstalledOuter = createObsoleteInstalledOuterRetirement({
    currentExecutablePath: process.execPath,
    currentPid: process.pid,
    installedLaunchPath: shellRuntime.installedLaunchPath,
    logger: packagedLogger,
    payloadDesktopProcess: shellRuntime.payloadDesktopProcess,
    payloadExecutablePath: shellRuntime.desktopExecutablePath,
    platform: process.platform,
  });
  applyPackagedElectronPathOverrides(paths);
  applyShellUpdateEnv(shellConfig.updateMetadataUrl);
  if (!claimPackagedSingleInstanceLock(app, (argv) => {
    secondInstanceHandoff.handle(findPackagedDeeplinkArg(argv));
  })) return;
  await app.whenReady();

  const splash = createSplashWindow();
  setSplashStage(splash.window, "engine");

  const metadataUrl = process.env.OD_UPDATE_METADATA_URL?.trim()
    || shellConfig.updateMetadataUrl;
  const update = await checkForPackagedClosureUpdate({
    channel: shellRuntime.launcherPaths.channel,
    installationRoot: shellRuntime.launcherPaths.root,
    metadataUrl,
    namespace,
    shellVersion,
  }).catch((error: unknown) => {
    packagedLogger?.warn("Standalone cold-update discovery failed; checking committed Store", { error });
    return null;
  });
  if (update != null) {
    packagedLogger?.info("Standalone cold-update check completed", {
      reason: update.reason,
      state: update.state,
    });
  }

  const selection = await resolveElectronStandaloneBinding({
    channel: shellRuntime.launcherPaths.channel,
    installerRequiredVersion: resolvePackagedClosureInstallerRequiredVersion(update),
    namespace,
    paths,
    releaseVersion: resolvePackagedClosureReleaseVersion(update, null),
    shellDigest: await digestElectronShellEntry(import.meta.url),
    shellVersion,
  });
  applyLaunchEnv(paths.runtimeRoot, stamp);
  const desktopControl = bootstrapSidecarRuntime(stamp, process.env, {
    app: APP_KEYS.DESKTOP,
    base: paths.runtimeRoot,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
  });

  const standalone = await withStandaloneBootstrapEnvironment({
    appVersion: selection.pointer.version,
    config: shellConfig,
    mcpBootstrap,
  }, async () => await createElectronStandaloneLauncher().launch(
    selection.binding,
    {
      async invoke(request) {
        return {
          handoff: request.handoff,
          outcome: "unsupported",
          requestId: request.requestId,
          schemaVersion: request.schemaVersion,
        };
      },
    },
  ));
  const status = await standalone.readStatus();
  if (status.state !== "running") {
    throw new Error(`Standalone entered terminal state before Desktop startup: ${status.state}`);
  }
  void standalone.waitForTerminal().then((terminal) => {
    if (terminal.state !== "failed") return;
    packagedLogger?.error("Standalone exited while the Electron Shell was running", {
      code: terminal.error.code,
    });
    app.quit();
  }).catch((error: unknown) => {
    packagedLogger?.error("Standalone terminal lifecycle observation failed", { error });
    app.quit();
  });
  startupTelemetryContext.appVersion = selection.pointer.version;
  const identity = await writePackagedDesktopIdentity({
    paths,
    runtimeIdentity: createElectronStandaloneRuntimeIdentity(status.handoff, status),
    stamp,
  });

  if (status.daemonUrl) {
    void claimPackagedDownloadAttribution({
      attribution: downloadAttribution,
      daemonUrl: status.daemonUrl,
      installerObservationRoot: paths.installerObservationRoot,
      logger: packagedLogger,
    });
  }
  setSplashStage(splash.window, "workspace");
  registerOdProtocol(() => status.webUrl);

  const { runDesktopMain } = await import("./main/index.js");
  await runDesktopMain(desktopControl, {
    splashWindow: splash.window,
    splashStartedAt: splash.startedAt,
    async beforeShutdown() {
      try {
        await retireObsoleteInstalledOuter();
      } finally {
        try {
          await standalone.close();
        } finally {
          await identity.close();
        }
      }
    },
    async discoverDaemonUrl() {
      return status.daemonUrl;
    },
    async discoverWebUrl() {
      return packagedEntryUrl();
    },
    inviteProtocolClientPath: process.platform === "win32"
      ? shellRuntime.installedLaunchPath
      : null,
    async onExternalShow() {
      await retireObsoleteInstalledOuter();
    },
    onDesktopReady(controls) {
      void confirmPackagedLauncherRuntime(shellRuntime).catch((error: unknown) => {
        packagedLogger?.warn("failed to confirm Electron Shell runtime", { error });
      });
      void confirmElectronStandaloneBinding(selection).catch((error: unknown) => {
        packagedLogger?.warn("failed to confirm Standalone runtime", { error });
      });
      void syncWindowsUninstallDisplayVersion({
        namespace,
        version: selection.binding.descriptor.release.version,
      }).catch((error: unknown) => {
        packagedLogger?.warn("failed to sync Windows uninstall registry version", { error });
      });
      secondInstanceHandoff.attach({
        dispatchDeeplink: controls.dispatchInviteDeeplink,
        show: controls.show,
      });
    },
    preloadPath: join(app.getAppPath(), "preload.cjs"),
    registerDesktopAuth: createStandaloneDesktopAuthRegistration({
      handoff: status.handoff,
      handle: standalone,
    }),
    async readStandaloneStatus() {
      return await standalone.readStatus();
    },
    update: {
      currentVersion: shellVersion,
      downloadRoot: paths.updateRoot,
      installerObservationRoot: paths.installerObservationRoot,
      launcherLaunchPath: shellRuntime.installedLaunchPath,
      launcherRoot: shellRuntime.launcherPaths.root,
      launcherPayloadExtractorPath: shellConfig.resourceRoot == null
        ? null
        : join(shellConfig.resourceRoot, "bin", "7z.exe"),
      launcherRuntimePath: shellRuntime.launcherPaths.runtimePath,
    },
    windowTitle: resolvePackagedWindowTitle(shellConfig),
  });
}

void main().catch(async (error: unknown) => {
  if (error instanceof PackagedPathAccessError) {
    try {
      dialog.showErrorBox(error.title, error.message);
    } catch {
      // Fall through to logging and exit.
    }
  }
  packagedLogger?.error("Electron Shell failed", { error });
  console.error("Electron Shell failed", error);
  if (startupTelemetryContext != null) {
    await reportStartupFailure({
      appVersion: startupTelemetryContext.appVersion,
      distinctId: resolveStartupDistinctId(
        startupTelemetryContext.namespace,
        startupTelemetryContext.installationRoot,
      ),
      error,
      isPathAccess: error instanceof PackagedPathAccessError,
      namespace: startupTelemetryContext.namespace,
      nativeModulePath: startupTelemetryContext.nativeModulePath,
      posthogHost: startupTelemetryContext.posthogHost,
      posthogKey: startupTelemetryContext.posthogKey,
      source: startupTelemetryContext.source,
    });
  }
  process.exit(1);
});
