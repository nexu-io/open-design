import { contextBridge, ipcRenderer } from "electron";

import { parseElectronRendererMountAcknowledgement } from "@open-design/electron-kit/renderer";

const acknowledgement = parseElectronRendererMountAcknowledgement(process.argv);
let acknowledged = false;
contextBridge.exposeInMainWorld("electronShell", Object.freeze({
  acknowledgeMounted() {
    if (acknowledged) return;
    acknowledged = true;
    ipcRenderer.send(acknowledgement.channel, acknowledgement);
  },
}));
