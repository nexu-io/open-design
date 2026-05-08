import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { BrowserWindow, dialog, ipcMain, shell } from "electron";

const PENDING_POLL_MS = 120;
const RUNNING_POLL_MS = 2000;
const MAX_CONSOLE_ENTRIES = 200;

export type DesktopEvalInput = {
  expression: string;
};

export type DesktopEvalResult = {
  error?: string;
  ok: boolean;
  value?: unknown;
};

export type DesktopScreenshotInput = {
  path: string;
};

export type DesktopScreenshotResult = {
  path: string;
};

export type DesktopConsoleEntry = {
  level: string;
  text: string;
  timestamp: string;
};

export type DesktopConsoleResult = {
  entries: DesktopConsoleEntry[];
};

export type DesktopClickInput = {
  selector: string;
};

export type DesktopClickResult = {
  clicked: boolean;
  found: boolean;
};

export type DesktopStatusSnapshot = {
  pid?: number;
  state: "idle" | "running" | "unknown";
  title?: string | null;
  updatedAt?: string;
  url?: string | null;
  windowVisible?: boolean;
};

export type DesktopRuntime = {
  close(): Promise<void>;
  click(input: DesktopClickInput): Promise<DesktopClickResult>;
  console(): DesktopConsoleResult;
  eval(input: DesktopEvalInput): Promise<DesktopEvalResult>;
  screenshot(input: DesktopScreenshotInput): Promise<DesktopScreenshotResult>;
  show(): void;
  status(): DesktopStatusSnapshot;
};

export type DesktopRuntimeOptions = {
  discoverUrl(): Promise<string | null>;
};

const MAC_WINDOW_CHROME =
  process.platform === "darwin"
    ? ({
        titleBarStyle: "hiddenInset" as const,
        trafficLightPosition: { x: 14, y: 12 },
      })
    : {};

const MAC_WINDOW_CHROME_CSS = `
  .app-chrome-header {
    --app-chrome-traffic-space: 56px !important;
    -webkit-app-region: drag;
  }
  .app-chrome-traffic-space {
    flex: 0 0 56px !important;
    width: 56px !important;
  }
  .app-chrome-header button,
  .app-chrome-header [role="button"],
  .app-chrome-header [contenteditable],
  .app-chrome-actions,
  .app-chrome-actions *,
  .avatar-popover,
  .avatar-popover * {
    -webkit-app-region: no-drag;
  }
  .app-chrome-drag {
    -webkit-app-region: drag;
  }
  .entry-brand,
  .entry-header {
    -webkit-app-region: drag;
  }
  .entry-brand button,
  .entry-brand [role="button"],
  .entry-header button,
  .entry-header [role="button"],
  .entry-tabs,
  .entry-tabs *,
  .viewer-toolbar,
  .viewer-toolbar *,
  .deck-nav,
  .deck-nav *,
  .ds-modal-header,
  .ds-modal-header *,
  .ds-modal-actions,
  .ds-modal-actions *,
  .share-menu-popover,
  .share-menu-popover *,
  .entry-side-resizer,
  .avatar-popover,
  .avatar-popover * {
    -webkit-app-region: no-drag;
  }
`;

function createPendingHtml(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html>
  <head>
    <title>Open Design</title>
    <style>
      body {
        align-items: center;
        background: #05070d;
        color: #f7f7fb;
        display: flex;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        height: 100vh;
        justify-content: center;
        margin: 0;
      }
      main {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 24px;
        padding: 32px;
      }
      p { color: #aeb7d5; margin: 12px 0 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>Open Design</h1>
      <p>Waiting for the web runtime URL…</p>
    </main>
  </body>
</html>`)}`;
}

function normalizeScreenshotPath(filePath: string): string {
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
}

function mapConsoleLevel(level: number): string {
  switch (level) {
    case 0:
      return "debug";
    case 1:
      return "info";
    case 2:
      return "warn";
    case 3:
      return "error";
    default:
      return "log";
  }
}

async function applyWindowChromeCss(window: BrowserWindow): Promise<void> {
  if (process.platform !== "darwin" || window.isDestroyed()) return;
  await window.webContents.insertCSS(MAC_WINDOW_CHROME_CSS, { cssOrigin: "user" });
}

// Exported for unit tests in `apps/packaged/tests/desktop-url-allowlist.test.ts`
// — these are pure URL-policy helpers and `apps/desktop` itself has no
// vitest setup, so the packaged workspace hosts the coverage. Keep them
// pure and side-effect-free.
export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isAllowedChildWindowUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // `blob:` covers in-renderer generated downloads / object URLs.
    // `od:` is the packaged Electron entry's privileged scheme
    // registered by `apps/packaged/src/protocol.ts` and proxied to the
    // local web sidecar. Without this branch, any in-app
    // `<a target="_blank" href="/api/...">` resolves to `od://app/...`
    // in packaged builds, falls through `setWindowOpenHandler` to
    // `{ action: "deny" }`, and the click is silently dropped — that
    // was the Orbit "Open artifact" no-op reported in #911. Allowing
    // `od:` here lets Electron open the link in a child BrowserWindow
    // that inherits the same protocol registration + preload, so the
    // live artifact preview renders normally. Dev mode is unaffected:
    // its links resolve to `http://127.0.0.1:.../...`, which is gated
    // by the separate `isHttpUrl` branch and continues to open in the
    // user's external browser via `shell.openExternal`.
    return parsed.protocol === "blob:" || parsed.protocol === "od:";
  } catch {
    return false;
  }
}

function installWindowChromeCssHook(window: BrowserWindow): void {
  window.webContents.on("did-finish-load", () => {
    void applyWindowChromeCss(window).catch((error: unknown) => {
      console.error("desktop window chrome CSS injection failed", error);
    });
  });
}

function showWindowButtons(window: BrowserWindow): void {
  if (process.platform !== "darwin" || window.isDestroyed()) return;
  window.setWindowButtonVisibility(true);
}

// Windows focus-stealing prevention can leave a detached-spawned GUI
// window minimized or hidden even when constructed with show:true,
// leaving users unable to locate the window. Cross-platform safe: only
// acts when the window is actually minimized or hidden, preserving any
// user-adjusted window state.
function ensureWindowVisible(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

// PPTX is rendered by the agent into the project folder and reaches the
// renderer through a normal `<a download>` link to /api/projects/:id/raw/*.
// Without this hook Electron writes the bytes straight to the OS Downloads
// folder, so the user never gets to pick a destination. setSaveDialogOptions
// makes Electron show the native Save As panel before the download starts.
const SAVE_AS_EXTENSIONS = new Set([".pptx"]);

function attachDownloadSaveAsDialog(window: BrowserWindow): void {
  window.webContents.session.on("will-download", (_event, item) => {
    const filename = item.getFilename();
    const dot = filename.lastIndexOf(".");
    const ext = dot >= 0 ? filename.slice(dot).toLowerCase() : "";
    if (!SAVE_AS_EXTENSIONS.has(ext)) return;
    item.setSaveDialogOptions({
      title: "Save As",
      defaultPath: filename,
      filters: [
        { name: "PowerPoint Presentation", extensions: ["pptx"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
  });
}

export async function createDesktopRuntime(options: DesktopRuntimeOptions): Promise<DesktopRuntime> {
  const preloadPath = join(dirname(fileURLToPath(import.meta.url)), "preload.cjs");

  // ipcMain.handle() registers a handler in an internal map that is *not*
  // surfaced via eventNames(); the previous `!eventNames().includes(...)`
  // check was therefore always true and would throw "Attempted to register
  // a second handler" on the second createDesktopRuntime() call (e.g. dev
  // hot-reload). removeHandler is a no-op when nothing is registered.
  ipcMain.removeHandler("dialog:pick-folder");
  ipcMain.removeHandler("shell:open-external");
  ipcMain.handle("dialog:pick-folder", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });
  ipcMain.handle("shell:open-external", async (_event, url: string) => {
    if (!isHttpUrl(url)) return false;
    try {
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  });

  const consoleEntries: DesktopConsoleEntry[] = [];
  const window = new BrowserWindow({
    height: 900,
    show: true,
    title: "Open Design",
    ...MAC_WINDOW_CHROME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
    width: 1280,
  });
  installWindowChromeCssHook(window);
  showWindowButtons(window);
  attachDownloadSaveAsDialog(window);
  let currentUrl: string | null = null;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  window.on("focus", () => showWindowButtons(window));
  window.on("blur", () => showWindowButtons(window));

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedChildWindowUrl(url)) return { action: "allow" };
    if (isHttpUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isHttpUrl(url) || url === currentUrl) return;
    const currentOrigin = currentUrl ? new URL(currentUrl).origin : null;
    const nextOrigin = new URL(url).origin;
    if (currentOrigin === nextOrigin) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  if (process.platform === "darwin") {
    window.on("close", (event) => {
      if (!stopped) {
        event.preventDefault();
        window.hide();
      }
    });
  }

  (window.webContents as any).on("console-message", (event: { level?: number | string; message?: string }) => {
    const level = typeof event.level === "number" ? mapConsoleLevel(event.level) : (event.level ?? "log");
    consoleEntries.push({
      level,
      text: event.message ?? "",
      timestamp: new Date().toISOString(),
    });
    if (consoleEntries.length > MAX_CONSOLE_ENTRIES) {
      consoleEntries.splice(0, consoleEntries.length - MAX_CONSOLE_ENTRIES);
    }
  });

  await window.loadURL(createPendingHtml());
  showWindowButtons(window);
  ensureWindowVisible(window);

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      void tick();
    }, delayMs);
  };

  const tick = async () => {
    if (stopped || window.isDestroyed()) return;

    try {
      const url = await options.discoverUrl();
      if (url != null && url !== currentUrl) {
        currentUrl = url;
        await window.loadURL(url);
        showWindowButtons(window);
      }
      schedule(url == null ? PENDING_POLL_MS : RUNNING_POLL_MS);
    } catch (error) {
      console.error("desktop web discovery failed", error);
      schedule(PENDING_POLL_MS);
    }
  };

  void tick();

  return {
    async click(input) {
      if (window.isDestroyed()) return { clicked: false, found: false };
      const selector = JSON.stringify(input.selector);
      return await window.webContents.executeJavaScript(
        `(() => {
          const element = document.querySelector(${selector});
          if (!element) return { found: false, clicked: false };
          if (typeof element.click === "function") element.click();
          return { found: true, clicked: true };
        })()`,
        true,
      );
    },
    async close() {
      stopped = true;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      if (!window.isDestroyed()) window.close();
    },
    console() {
      return { entries: [...consoleEntries] };
    },
    async eval(input) {
      if (window.isDestroyed()) return { error: "desktop window is destroyed", ok: false };
      try {
        const value = await window.webContents.executeJavaScript(input.expression, true);
        return { ok: true, value };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error), ok: false };
      }
    },
    async screenshot(input) {
      if (window.isDestroyed()) throw new Error("desktop window is destroyed");
      const outputPath = normalizeScreenshotPath(input.path);
      const image = await window.webContents.capturePage();
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, image.toPNG());
      return { path: outputPath };
    },
    show() {
      if (!window.isDestroyed()) {
        window.show();
        window.focus();
      }
    },
    status() {
      return {
        pid: process.pid,
        state: window.isDestroyed() ? "unknown" : "running",
        title: window.isDestroyed() ? null : window.getTitle(),
        updatedAt: new Date().toISOString(),
        url: currentUrl,
        windowVisible: !window.isDestroyed() && window.isVisible(),
      };
    },
  };
}
