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
      openPath?: (path: string) => Promise<string>;
    };
  }
}
