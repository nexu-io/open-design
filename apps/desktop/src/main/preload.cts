const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:open-external', url),
  pickFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pick-folder'),
  openPath: (path: string): Promise<string> =>
    ipcRenderer.invoke('shell:open-path', path),
  registerProjectRoot: (path: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:register-project-root', path),
});
