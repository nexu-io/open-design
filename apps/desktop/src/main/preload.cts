const { contextBridge, ipcRenderer } = require('electron');

// PR #974 trust boundary. The renderer no longer receives a raw
// filesystem path from the main process: `pickFolder` was deleted from
// this bridge and replaced with `pickAndImport`, which shows the
// folder picker, mints an HMAC token bound to the chosen path, and
// POSTs `/api/import/folder` from the main process — all atomically.
// The renderer only ever sees the daemon's response shape (project,
// conversationId, entryFile) or a structured error envelope. A
// compromised renderer cannot name an arbitrary baseDir even
// indirectly because the picker dialog is the single source of paths
// crossing into the daemon, and it lives in the main process.
contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:open-external', url),
  pickAndImport: (
    init?: { name?: string; skillId?: string | null; designSystemId?: string | null },
  ): Promise<unknown> =>
    ipcRenderer.invoke('dialog:pick-and-import', init ?? null),
  // Reveals the named project's working directory in the OS file
  // manager. The renderer passes a project ID; the main process asks
  // the daemon for the canonical resolvedDir and forwards that path
  // (validated) to shell.openPath. For folder-imported projects, the
  // main process additionally requires `metadata.fromTrustedPicker`
  // to be true (set by the HMAC-gated import flow), so renderer code
  // cannot ask the bridge to open arbitrary local paths even
  // indirectly through legacy or future project-creation routes.
  openPath: (projectId: string): Promise<string> =>
    ipcRenderer.invoke('shell:open-path', projectId),
});

contextBridge.exposeInMainWorld('__odDesktop', {
  printPdf: (html: string, nonce?: string) => ipcRenderer.invoke('od:print-pdf', html, nonce),
  isDesktop: true,
});
