import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('__odDesktop', {
  printPdf: (html: string) => ipcRenderer.invoke('od:print-pdf', html),
  isDesktop: true,
});
