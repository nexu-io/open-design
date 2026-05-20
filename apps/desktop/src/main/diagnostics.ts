import { writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";

import { BrowserWindow, app, dialog, ipcMain, shell } from "electron";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import {
  resolveLogFilePath,
  resolveNamespaceRoot,
  type SidecarRuntimeContext,
} from "@open-design/sidecar";
import {
  DIAGNOSTICS_FILENAME_PREFIX,
  buildDiagnosticsZip,
  diagnosticsFileName,
  type LogSource,
} from "@open-design/diagnostics";

export const DESKTOP_DIAGNOSTICS_IPC_CHANNEL = "diagnostics:export-to-file";

const TAIL_BYTES_PER_LOG = 4 * 1024 * 1024;

export type DesktopDiagnosticsExportResult =
  | { ok: true; path: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

function safeUsername(): string | undefined {
  try {
    const info = userInfo();
    return info?.username && info.username.length > 0 ? info.username : undefined;
  } catch {
    return undefined;
  }
}

function buildSidecarLogSources(runtime: SidecarRuntimeContext<SidecarStamp>): LogSource[] {
  const namespaceRoot = resolveNamespaceRoot({
    base: runtime.base,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    namespace: runtime.namespace,
  });
  const apps = [APP_KEYS.DAEMON, APP_KEYS.WEB, APP_KEYS.DESKTOP];
  const sources: LogSource[] = [];
  for (const appKey of apps) {
    const absolutePath = resolveLogFilePath({
      app: appKey,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      runtimeRoot: namespaceRoot,
    });
    sources.push({
      name: `logs/${appKey}/latest.log`,
      absolutePath,
      kind: "text",
      tailBytes: TAIL_BYTES_PER_LOG,
    });
    // Only desktop runs an Electron renderer that writes `renderer.log`
    // (see apps/desktop/src/main/runtime.ts). daemon and web are pure Node
    // services with no renderer process, so listing the file there only
    // produces missing-file placeholders and manifest warnings.
    if (appKey === APP_KEYS.DESKTOP) {
      sources.push({
        name: `logs/${appKey}/renderer.log`,
        absolutePath: join(dirname(absolutePath), "renderer.log"),
        kind: "text",
        tailBytes: TAIL_BYTES_PER_LOG,
      });
    }
  }
  return sources;
}

export async function exportDiagnosticsToFile(
  runtime: SidecarRuntimeContext<SidecarStamp>,
  parentWindow: BrowserWindow | null,
): Promise<DesktopDiagnosticsExportResult> {
  const filename = diagnosticsFileName(DIAGNOSTICS_FILENAME_PREFIX);
  const downloadsDir = (() => {
    try {
      return app.getPath("downloads");
    } catch {
      return homedir();
    }
  })();
  const defaultPath = join(downloadsDir, filename);

  const dialogOptions = {
    title: "Export Open Design diagnostics",
    defaultPath,
    filters: [{ name: "Zip archive", extensions: ["zip"] }],
  };
  const choice = parentWindow != null
    ? await dialog.showSaveDialog(parentWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (choice.canceled || choice.filePath == null) {
    return { ok: false, cancelled: true };
  }

  try {
    const result = await buildDiagnosticsZip({
      context: {
        app: { name: "open-design", version: app.getVersion(), packaged: app.isPackaged },
        source: "desktop-ipc",
        namespace: runtime.namespace,
        extra: {
          electronVersion: process.versions.electron,
          chromiumVersion: process.versions.chrome,
          base: runtime.base,
          mode: runtime.mode,
          sourceTag: runtime.source,
        },
      },
      sources: buildSidecarLogSources(runtime),
      redaction: { username: safeUsername() },
      crashReports: {
        // Restrict to Open Design's own process names. A generic "Electron"
        // substring would sweep up crash reports from any other Electron app
        // on the host (VS Code, Slack, …) and leak unrelated user data into
        // the support bundle.
        matchSubstrings: ["Open Design", "open-design"],
        withinDays: 7,
        maxReports: 10,
        homeDir: homedir(),
      },
    });
    await writeFile(choice.filePath, result.zip);
    // Reveal the saved file in Finder (macOS) / Explorer (Windows) / file
    // manager (Linux) so the user can drag it into Slack / email without
    // having to navigate manually. Failures here are non-fatal.
    try {
      shell.showItemInFolder(choice.filePath);
    } catch (revealError) {
      console.warn("desktop diagnostics reveal failed", revealError);
    }
    return { ok: true, path: choice.filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, cancelled: false, message };
  }
}

export function registerDesktopDiagnosticsIpc(runtime: SidecarRuntimeContext<SidecarStamp>): () => void {
  const handler = async (event: Electron.IpcMainInvokeEvent): Promise<DesktopDiagnosticsExportResult> => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    return await exportDiagnosticsToFile(runtime, senderWindow);
  };
  ipcMain.handle(DESKTOP_DIAGNOSTICS_IPC_CHANNEL, handler);
  return () => {
    ipcMain.removeHandler(DESKTOP_DIAGNOSTICS_IPC_CHANNEL);
  };
}
