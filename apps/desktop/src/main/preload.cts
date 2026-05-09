const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('shell:open-external', url),
  pickFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pick-folder'),
});

contextBridge.exposeInMainWorld('__odDesktop', {
  printPdf: (html: string, nonce?: string) => ipcRenderer.invoke('od:print-pdf', html, nonce),
  isDesktop: true,
});
