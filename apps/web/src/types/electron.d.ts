// Single source of truth for the Electron preload bridge as seen from
// the web client. The bridge is exposed via contextBridge in
// apps/desktop/src/main/preload.cts; method shapes are kept in sync
// here so any web-side caller (NewProjectPanel, useTerminalLaunch,
// future consumers) shares one declaration.
//
// PR #974 trust boundary: `pickFolder` is intentionally absent. The
// renderer cannot receive a raw filesystem path from the main
// process — it can only ask the main process to show the picker and
// import the chosen folder atomically (`pickAndImport`). The
// `openPath` bridge additionally enforces a trusted-picker check on
// the main side so even legacy projects with a `metadata.baseDir` set
// outside the HMAC-gated flow cannot be opened.

import type { ImportFolderResponse } from '@open-design/contracts';

export {};

export type DesktopPickAndImportResult =
  | { ok: true; response: ImportFolderResponse }
  | { canceled: true; ok: false }
  | { details?: unknown; ok: false; reason: string };

declare global {
  interface Window {
    electronAPI?: {
      openExternal?: (url: string) => Promise<boolean>;
      // Atomic main-process flow: show the native folder picker, mint
      // an HMAC token bound to the chosen path, POST
      // /api/import/folder with the token + body, return the daemon
      // response (or a structured failure). Renderer never sees the
      // path or the token.
      pickAndImport?: (init?: {
        name?: string;
        skillId?: string | null;
        designSystemId?: string | null;
      }) => Promise<DesktopPickAndImportResult>;
      // Reveals the project's working directory in the OS file
      // manager. The argument is a project ID (not a filesystem
      // path) — the desktop main process asks the daemon for the
      // canonical resolvedDir and forwards that path to
      // shell.openPath. Renderer never names the path directly so a
      // compromised renderer cannot ask the bridge to open arbitrary
      // local paths. For folder-imported projects, the main process
      // additionally requires `metadata.fromTrustedPicker === true`,
      // the marker stamped by the desktop HMAC-gated import flow.
      // Resolves to '' on success and a non-empty error string on
      // failure (Electron's shell.openPath contract, plus PR #974
      // trust-boundary failures).
      openPath?: (projectId: string) => Promise<string>;
    };
  }
}
