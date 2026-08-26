import { protocol } from "electron";

import type {
  ElectronShellRenderer,
  ElectronWarmupExecutor,
} from "@open-design/electron-kit/runtime";

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
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${safeTitle}</title><style>html{font-family:ui-sans-serif,system-ui;background:#f7f7f4;color:#20201e}body{margin:0;display:grid;min-height:100vh;place-items:center}.card{max-width:560px;padding:48px;border:1px solid #deded8;border-radius:20px;background:#fff;box-shadow:0 18px 70px #00000012}small{color:#777}h1{font-size:32px;margin:12px 0}p{line-height:1.65}</style></head><body><main class="card"><small>Electron Shell Foundation</small><h1>${safeTitle}</h1><p>Electron + electron-kit 已完成冷启动、显式 readiness 与占位渲染闭环。</p></main><script>document.documentElement.dataset.electronShellMounted="1"</script></body></html>`;
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
      return { webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } };
    },
    async mount({ manifest, window }) {
      protocol.handle(manifest.protocol, () => new Response(resolveResource(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      }));
      try {
        await window.loadURL(`${manifest.protocol}://app/`);
        const mounted = await window.webContents.executeJavaScript(
          `document.documentElement.dataset.electronShellMounted === "1"`,
          true,
        );
        if (mounted !== true) throw new Error("placeholder renderer did not acknowledge mounted state");
      } catch (error) {
        protocol.unhandle(manifest.protocol);
        throw error;
      }
      return Object.freeze({
        dispose() { protocol.unhandle(manifest.protocol); },
      });
    },
  });
  return Object.freeze({
    renderer,
    warmupExecutors: Object.freeze({ [PLACEHOLDER_RESOURCE_EXECUTOR]: prewarm }),
  });
}
