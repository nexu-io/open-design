const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:open-external', url),
  pickFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pick-folder'),
  // Reveals the named project's working directory in the OS file
  // manager. The renderer passes a project ID; the main process asks
  // the daemon for the canonical resolvedDir and forwards that path
  // (validated) to shell.openPath. Renderer never names the path
  // directly, so a compromised renderer cannot escalate to opening
  // arbitrary local paths.
  openPath: (projectId: string): Promise<string> =>
    ipcRenderer.invoke('shell:open-path', projectId),
});
