import { writeFile } from "node:fs/promises";

import { BrowserWindow, dialog, ipcMain, shell } from "electron";

import { DIAGNOSTICS_FILENAME_PREFIX, diagnosticsFileName } from "@open-design/diagnostics";

import { fetchDiagnosticsBundle } from "./diagnostics-fetch.js";

export const DESKTOP_DIAGNOSTICS_IPC_CHANNEL = "diagnostics:export-to-file";

export type DesktopDiagnosticsExportResult =
  | { ok: true; path: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

export interface DesktopDiagnosticsDeps {
  /**
   * Resolve the daemon base URL the bundle is fetched from. Mirrors the
   * app-config base-URL discovery (daemon URL → web URL → sidecar web
   * discovery) so the export targets the same daemon the rest of the desktop
   * talks to. Throws when no URL is available.
   */
  discoverDaemonBaseUrl: () => Promise<string>;
}

export async function exportDiagnosticsToFile(
  deps: DesktopDiagnosticsDeps,
  parentWindow: BrowserWindow | null,
): Promise<DesktopDiagnosticsExportResult> {
  const filename = diagnosticsFileName(DIAGNOSTICS_FILENAME_PREFIX);
  // Seed only the filename, never a directory. Forcing `defaultPath` into the
  // Downloads folder made the native Windows Save dialog open *inside* it, and
  // when Downloads is OneDrive-backed the shell's folder-type discovery +
  // cloud-provider status enumeration can stall the dialog's UI thread long
  // enough for Windows to flag the owner window "not responding" (AppHangB1).
  // The PDF/PPTX save flows already pass a bare filename; match them and let
  // the OS restore the user's last-used, already-warm location.
  // `dontAddToRecent` further avoids shell recent-items writes against that
  // same slow folder. ponytail: mitigates the trigger; a fully wedged OneDrive
  // shell is an OS-side stall no app option can unblock.
  const dialogOptions = {
    title: "Export Open Design diagnostics",
    defaultPath: filename,
    filters: [{ name: "Zip archive", extensions: ["zip"] }],
    properties: ["dontAddToRecent" as const],
  };
  const choice = parentWindow != null
    ? await dialog.showSaveDialog(parentWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (choice.canceled || choice.filePath == null) {
    return { ok: false, cancelled: true };
  }

  try {
    // Delegate the bundle to the daemon's own export endpoint instead of
    // rebuilding it here with a guessed data dir. The daemon owns its real
    // RUNTIME_DATA_DIR, so the bundle's run-event logs (`runs/<id>/events.jsonl`)
    // and AMR/agent CLI logs resolve correctly in dev, packaged, and
    // OD_DATA_DIR-override setups alike. See diagnostics-fetch.ts.
    const baseUrl = await deps.discoverDaemonBaseUrl();
    const zip = await fetchDiagnosticsBundle(baseUrl);
    await writeFile(choice.filePath, zip);
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

export function registerDesktopDiagnosticsIpc(deps: DesktopDiagnosticsDeps): () => void {
  const handler = async (event: Electron.IpcMainInvokeEvent): Promise<DesktopDiagnosticsExportResult> => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    return await exportDiagnosticsToFile(deps, senderWindow);
  };
  ipcMain.handle(DESKTOP_DIAGNOSTICS_IPC_CHANNEL, handler);
  return () => {
    ipcMain.removeHandler(DESKTOP_DIAGNOSTICS_IPC_CHANNEL);
  };
}
