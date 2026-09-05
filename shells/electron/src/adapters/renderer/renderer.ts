import { join } from "node:path";

import { app, ipcMain, shell as systemShell } from "electron";

import type {
  ElectronShellRenderer,
  ElectronWarmupExecutor,
} from "@open-design/electron-kit/runtime";

import { ELECTRON_CONTENT_UPDATE_CHANNELS } from "../../contracts/content-update.js";
import { createElectronContentUpdateHandler } from "../updater/content.js";
import { readElectronProductRuntime } from "../standalone/product-runtime.js";
import { installElectronRendererSecurity } from "./security.js";

export const RENDERER_RESOURCE_EXECUTOR = "shell.renderer-resource";

export type ElectronRendererAdapter = Readonly<{
  renderer: ElectronShellRenderer;
  warmupExecutors: Readonly<Record<typeof RENDERER_RESOURCE_EXECUTOR, ElectronWarmupExecutor>>;
}>;

export function createElectronRendererAdapter(title: string): ElectronRendererAdapter {
  const prewarm = () => { void title; };
  const renderer: ElectronShellRenderer = Object.freeze({
    windowOptions() {
      return {
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: join(app.getAppPath(), "renderer-mount-preload.cjs"),
          sandbox: true,
          webviewTag: true,
        },
      };
    },
    async mount({ acknowledgement, contentUpdater, manifest, runtime, window }) {
      const product = await readElectronProductRuntime({
        attachmentId: runtime.attachment.id,
        bindingDigest: runtime.binding.digest,
        handle: runtime.handle,
        requestId: `${acknowledgement.attemptId}.product-runtime`,
      });
      const handler = createElectronContentUpdateHandler(contentUpdater);
      const ownSender = (sender: unknown) => sender === window.webContents;
      ipcMain.handle(ELECTRON_CONTENT_UPDATE_CHANNELS.prepare, async (event) => {
        if (!ownSender(event.sender)) throw new Error("content updater IPC sender is not the mounted renderer");
        return await handler.prepare();
      });
      ipcMain.handle(ELECTRON_CONTENT_UPDATE_CHANNELS.apply, async (event, force: unknown) => {
        if (!ownSender(event.sender)) throw new Error("content updater IPC sender is not the mounted renderer");
        if (typeof force !== "boolean") throw new Error("content updater force flag must be boolean");
        return await handler.apply(force);
      });
      const entryUrl = product.web.url;
      const security = installElectronRendererSecurity({
        openExternal: (url) => systemShell.openExternal(url),
        shellProtocol: manifest.protocol,
        trustedMainFrameUrl: entryUrl,
        window,
      });
      try {
        await window.loadURL(entryUrl);
      } catch (error) {
        security.dispose();
        ipcMain.removeHandler(ELECTRON_CONTENT_UPDATE_CHANNELS.prepare);
        ipcMain.removeHandler(ELECTRON_CONTENT_UPDATE_CHANNELS.apply);
        throw error;
      }
      return Object.freeze({
        dispose() {
          security.dispose();
          ipcMain.removeHandler(ELECTRON_CONTENT_UPDATE_CHANNELS.prepare);
          ipcMain.removeHandler(ELECTRON_CONTENT_UPDATE_CHANNELS.apply);
        },
      });
    },
  });
  return Object.freeze({
    renderer,
    warmupExecutors: Object.freeze({ [RENDERER_RESOURCE_EXECUTOR]: prewarm }),
  });
}
