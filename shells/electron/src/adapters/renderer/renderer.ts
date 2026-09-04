import { join } from "node:path";

import { app, ipcMain, protocol, shell as systemShell } from "electron";

import type {
  ElectronShellRenderer,
  ElectronWarmupExecutor,
} from "@open-design/electron-kit/runtime";

import { ELECTRON_CONTENT_UPDATE_CHANNELS } from "../../contracts/content-update.js";
import { createElectronContentUpdateHandler } from "../updater/content.js";
import { installElectronRendererSecurity } from "./security.js";

export const RENDERER_RESOURCE_EXECUTOR = "shell.renderer-resource";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function bootstrapDocument(title: string): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-electron-shell-renderer'"><title>${safeTitle}</title><style>html{font-family:ui-sans-serif,system-ui;background:#f7f7f4;color:#20201e}body{margin:0;display:grid;min-height:100vh;place-items:center}.card{max-width:560px;padding:48px;border:1px solid #deded8;border-radius:20px;background:#fff;box-shadow:0 18px 70px #00000012}small{color:#777}h1{font-size:32px;margin:12px 0}p{line-height:1.65}.actions{display:flex;gap:8px}button{padding:8px 12px}output{display:block;margin-top:12px;font:12px ui-monospace,monospace}</style></head><body><main class="card"><small>Electron Shell</small><h1>${safeTitle}</h1><p>The signed Shell and Standalone runtime are ready.</p><div class="actions"><button id="prepare-update">Prepare content update</button><button id="apply-update">Apply prepared update</button></div><output id="update-status"></output></main><script nonce="electron-shell-renderer">const status=document.getElementById('update-status');document.getElementById('prepare-update').onclick=async()=>{status.textContent=JSON.stringify(await window.electronShell.contentUpdater.prepare())};document.getElementById('apply-update').onclick=async()=>{status.textContent=JSON.stringify(await window.electronShell.contentUpdater.apply(false))};window.electronShell.acknowledgeMounted()</script></body></html>`;
}

export type ElectronRendererAdapter = Readonly<{
  renderer: ElectronShellRenderer;
  warmupExecutors: Readonly<Record<typeof RENDERER_RESOURCE_EXECUTOR, ElectronWarmupExecutor>>;
}>;

export function createElectronRendererAdapter(title: string): ElectronRendererAdapter {
  let warmedDocument: string | null = null;
  const prewarm = () => { warmedDocument ??= bootstrapDocument(title); };
  const resolveResource = () => {
    prewarm();
    return warmedDocument!;
  };
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
    async mount({ contentUpdater, manifest, window }) {
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
      const entryUrl = `${manifest.protocol}://app/`;
      const security = installElectronRendererSecurity({
        openExternal: (url) => systemShell.openExternal(url),
        shellProtocol: manifest.protocol,
        trustedMainFrameUrl: entryUrl,
        window,
      });
      protocol.handle(manifest.protocol, () => new Response(resolveResource(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      }));
      try {
        await window.loadURL(entryUrl);
      } catch (error) {
        security.dispose();
        protocol.unhandle(manifest.protocol);
        ipcMain.removeHandler(ELECTRON_CONTENT_UPDATE_CHANNELS.prepare);
        ipcMain.removeHandler(ELECTRON_CONTENT_UPDATE_CHANNELS.apply);
        throw error;
      }
      return Object.freeze({
        dispose() {
          security.dispose();
          protocol.unhandle(manifest.protocol);
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
