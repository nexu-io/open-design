import { contextBridge, ipcRenderer } from "electron";

import { parseElectronRendererMountAcknowledgement } from "@open-design/electron-kit/renderer";

import { ELECTRON_CONTENT_UPDATE_CHANNELS } from "../../contracts/content-update.js";

const acknowledgement = parseElectronRendererMountAcknowledgement(process.argv);
let acknowledged = false;
contextBridge.exposeInMainWorld("electronShell", Object.freeze({
  acknowledgeMounted() {
    if (acknowledged) return;
    acknowledged = true;
    ipcRenderer.send(acknowledgement.channel, acknowledgement);
  },
  contentUpdater: Object.freeze({
    prepare() { return ipcRenderer.invoke(ELECTRON_CONTENT_UPDATE_CHANNELS.prepare); },
    apply(force = false) { return ipcRenderer.invoke(ELECTRON_CONTENT_UPDATE_CHANNELS.apply, force); },
  }),
}));
