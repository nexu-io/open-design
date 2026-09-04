import { join } from "node:path";

import { app, ipcMain, protocol } from "electron";

import type {
  ElectronShellRenderer,
  ElectronWarmupExecutor,
} from "@open-design/electron-kit/runtime";

import { ELECTRON_CONTENT_UPDATE_CHANNELS } from "../../contracts/content-update.js";
import { createElectronContentUpdateHandler } from "../updater/content.js";

export const PLACEHOLDER_RESOURCE_EXECUTOR = "shell.placeholder-resource";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function placeholder(title: string): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-electron-shell-placeholder'"><title>${safeTitle}</title><style>html{font-family:ui-sans-serif,system-ui;background:#f7f7f4;color:#20201e}body{margin:0;display:grid;min-height:100vh;place-items:center}.card{max-width:560px;padding:48px;border:1px solid #deded8;border-radius:20px;background:#fff;box-shadow:0 18px 70px #00000012}small{color:#777}h1{font-size:32px;margin:12px 0}p{line-height:1.65}.actions{display:flex;gap:8px}button{padding:8px 12px}output{display:block;margin-top:12px;font:12px ui-monospace,monospace}</style></head><body><main class="card"><small>Electron Shell Foundation</small><h1>${safeTitle}</h1><p>Electron + electron-kit 已完成冷启动、显式 readiness 与占位渲染闭环。</p><div class="actions"><button id="prepare-update">Prepare content update</button><button id="apply-update">Apply prepared update</button></div><output id="update-status"></output></main><script nonce="electron-shell-placeholder">const status=document.getElementById('update-status');document.getElementById('prepare-update').onclick=async()=>{status.textContent=JSON.stringify(await window.electronShell.contentUpdater.prepare())};document.getElementById('apply-update').onclick=async()=>{status.textContent=JSON.stringify(await window.electronShell.contentUpdater.apply(false))};window.electronShell.acknowledgeMounted()</script></body></html>`;
}

export type PlaceholderRendererAdapter = Readonly<{
  renderer: ElectronShellRenderer;
  warmupExecutors: Readonly<Record<typeof PLACEHOLDER_RESOURCE_EXECUTOR, ElectronWarmupExecutor>>;
}>;

export function createPlaceholderRendererAdapter(title: string): PlaceholderRendererAdapter {
  let warmedHtml: string | null = null;
  const prewarm = () => { warmedHtml ??= placeholder(title); };
  const resolveResource = () => {
    prewarm();
    return warmedHtml!;
  };
  const renderer: ElectronShellRenderer = Object.freeze({
    windowOptions() {
      return {
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: join(app.getAppPath(), "renderer-mount-preload.cjs"),
          sandbox: true,
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
      protocol.handle(manifest.protocol, () => new Response(resolveResource(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      }));
      try {
        await window.loadURL(`${manifest.protocol}://app/`);
      } catch (error) {
        protocol.unhandle(manifest.protocol);
        ipcMain.removeHandler(ELECTRON_CONTENT_UPDATE_CHANNELS.prepare);
        ipcMain.removeHandler(ELECTRON_CONTENT_UPDATE_CHANNELS.apply);
        throw error;
      }
      return Object.freeze({
        dispose() {
          protocol.unhandle(manifest.protocol);
          ipcMain.removeHandler(ELECTRON_CONTENT_UPDATE_CHANNELS.prepare);
          ipcMain.removeHandler(ELECTRON_CONTENT_UPDATE_CHANNELS.apply);
        },
      });
    },
  });
  return Object.freeze({
    renderer,
    warmupExecutors: Object.freeze({ [PLACEHOLDER_RESOURCE_EXECUTOR]: prewarm }),
  });
}
