// Single source of truth for the Electron preload bridge as seen from
// the web client. The bridge is exposed via contextBridge in
// apps/desktop/src/main/preload.cts; method shapes are kept in sync
// here so any web-side caller (NewProjectPanel, useTerminalLaunch,
// future consumers) shares one declaration and the new openPath
// method (#451) is visible everywhere.

export {};

declare global {
  interface Window {
    electronAPI?: {
      openExternal?: (url: string) => Promise<boolean>;
      pickFolder?: () => Promise<string | null>;
      // Reveals the project's working directory in the OS file
      // manager. The argument is a project ID (not a filesystem
      // path) — the desktop main process asks the daemon for the
      // canonical resolvedDir and forwards that path to
      // shell.openPath. Renderer never names the path directly so a
      // compromised renderer cannot ask the bridge to open arbitrary
      // local paths. Resolves to '' on success and a non-empty
      // error string on failure (Electron's shell.openPath contract).
      openPath?: (projectId: string) => Promise<string>;
    };
  }
}
