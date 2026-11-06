import { access, mkdir, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname } from "node:path";
import { userInfo } from "node:os";

import { app } from "electron";

import { PackagedPathAccessError } from "./errors.js";
import type { PackagedNamespacePaths } from "./paths.js";

export type PackagedSingleInstanceApp = {
  on: (
    event: "second-instance",
    listener: (event: unknown, argv: string[]) => void,
  ) => unknown;
  quit: () => void;
  requestSingleInstanceLock: () => boolean;
};
export type PackagedSecondInstanceControls = {
  dispatchDeeplink: (url: string | null) => void;
  show: () => void;
};
type PathDiagnostic = {
  exists: boolean;
  mode?: number;
  path: string;
};

function formatMode(mode: number | undefined): string {
  if (mode == null) return "unknown";
  return `0${(mode & 0o777).toString(8)}`;
}

async function inspectPath(path: string): Promise<PathDiagnostic> {
  try {
    const stats = await stat(path);
    return { exists: true, mode: stats.mode, path };
  } catch {
    return { exists: false, path };
  }
}

function formatWritablePathError(options: {
  attemptedPath: string;
  currentUser: string;
  diagnostic: PathDiagnostic;
  error: unknown;
  parentDiagnostic: PathDiagnostic;
}): string {
  const { attemptedPath, currentUser, diagnostic, error, parentDiagnostic } = options;
  const message = error instanceof Error ? error.message : String(error);
  const parentPath = dirname(attemptedPath);
  const diagLines = [
    `Open Design could not create or write to:`,
    attemptedPath,
    "",
    `Current user: ${currentUser}`,
    `Node error: ${message}`,
    `Target exists: ${diagnostic.exists ? "yes" : "no"}`,
    `Target mode: ${formatMode(diagnostic.mode)}`,
    `Parent exists: ${parentDiagnostic.exists ? "yes" : "no"}`,
    `Parent mode: ${formatMode(parentDiagnostic.mode)}`,
    "",
    `Common causes:`,
    `• the folder was created by another user (for example with sudo)`,
    `• the parent folder is not writable`,
    `• the folder is a symlink to a protected location`,
    "",
    `Try in Terminal:`,
    `ls -ld \"${parentPath}\" \"${attemptedPath}\"`,
    `sudo chown -R \"${currentUser}\":staff \"${parentPath}\"`,
    `chmod -R u+rwX \"${parentPath}\"`,
  ];
  return diagLines.join("\n");
}

export async function verifyPackagedDataRootWritable(paths: Pick<PackagedNamespacePaths, "dataRoot">): Promise<void> {
  try {
    await mkdir(paths.dataRoot, { recursive: true });
    await access(paths.dataRoot, fsConstants.W_OK);
  } catch (error) {
    const [diagnostic, parentDiagnostic] = await Promise.all([
      inspectPath(paths.dataRoot),
      inspectPath(dirname(paths.dataRoot)),
    ]);
    throw new PackagedPathAccessError(
      formatWritablePathError({
        attemptedPath: paths.dataRoot,
        currentUser: userInfo().username,
        diagnostic,
        error,
        parentDiagnostic,
      }),
      { cause: error },
    );
  }
}

export async function ensurePackagedNamespacePaths(
  paths: PackagedNamespacePaths,
): Promise<void> {
  await verifyPackagedDataRootWritable(paths);
  await Promise.all([
    mkdir(paths.namespaceRoot, { recursive: true }),
    mkdir(paths.cacheRoot, { recursive: true }),
    mkdir(paths.dataRoot, { recursive: true }),
    mkdir(paths.logsRoot, { recursive: true }),
    mkdir(paths.desktopLogsRoot, { recursive: true }),
    mkdir(paths.runtimeRoot, { recursive: true }),
    mkdir(paths.updateRoot, { recursive: true }),
    mkdir(paths.electronUserDataRoot, { recursive: true }),
    mkdir(paths.electronSessionDataRoot, { recursive: true }),
  ]);
}

export function stabilizePackagedWorkingDirectory(
  paths: Pick<PackagedNamespacePaths, "runtimeRoot">,
  chdir: (directory: string) => void = (directory) => process.chdir(directory),
): void {
  // Payload launches can inherit a cwd inside an older version directory. Move
  // to the namespace-scoped root before release cleanup makes that cwd invalid.
  chdir(paths.runtimeRoot);
}

export function applyPackagedElectronPathOverrides(
  paths: PackagedNamespacePaths,
): void {
  app.setPath("userData", paths.electronUserDataRoot);
  app.setPath("sessionData", paths.electronSessionDataRoot);
  app.setPath("logs", paths.desktopLogsRoot);
}

export function claimPackagedSingleInstanceLock(
  electronApp: PackagedSingleInstanceApp,
  onSecondInstance: (argv: readonly string[]) => void,
): boolean {
  if (!electronApp.requestSingleInstanceLock()) {
    electronApp.quit();
    return false;
  }
  electronApp.on("second-instance", (_event, argv) => {
    onSecondInstance(argv);
  });
  return true;
}

export function createPackagedSecondInstanceHandoff() {
  let controls: PackagedSecondInstanceControls | null = null;
  let pendingFocus = false;
  const pendingDeeplinks: string[] = [];

  return {
    attach(nextControls: PackagedSecondInstanceControls): void {
      controls = nextControls;
      if (!pendingFocus) return;

      pendingFocus = false;
      controls.show();
      for (const url of pendingDeeplinks.splice(0)) {
        controls.dispatchDeeplink(url);
      }
    },
    handle(deeplinkUrl: string | null): void {
      if (controls != null) {
        // Once desktop startup reaches onDesktopReady, its own second-instance
        // listener is attached before Electron can deliver another event. Keep
        // this listener responsible only for focus so the URL is dispatched
        // exactly once by the desktop listener from that point onward.
        controls.show();
        return;
      }

      pendingFocus = true;
      if (deeplinkUrl != null) pendingDeeplinks.push(deeplinkUrl);
    },
  };
}
