import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";

import { BrowserWindow, app, protocol } from "electron";
import type { GenerationRecord, LifecycleAttachment, LifecycleScope } from "@open-design/standalone";

import { validateElectronShellManifest, type ElectronShellDefinition } from "../boundary/index.js";
import { focusElectronWindow, resolveElectronPresentationMode } from "./presentation.js";

export * from "./presentation.js";

const placeholder = (title: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>html{font-family:ui-sans-serif,system-ui;background:#f7f7f4;color:#20201e}body{margin:0;display:grid;min-height:100vh;place-items:center}.card{max-width:560px;padding:48px;border:1px solid #deded8;border-radius:20px;background:#fff;box-shadow:0 18px 70px #00000012}small{color:#777}h1{font-size:32px;margin:12px 0}p{line-height:1.65}</style></head><body><main class="card"><small>Electron Shell Foundation</small><h1>${title}</h1><p>Electron + electron-kit 已完成冷启动、显式 readiness 与占位渲染闭环。</p></main><script>document.documentElement.dataset.electronKitMounted="1"</script></body></html>`;

function splashHtml(title: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><style>html{font-family:ui-sans-serif,system-ui;background:#151515;color:#fff}body{margin:0;display:grid;min-height:100vh;place-items:center;text-align:center}p{color:#aaa}</style><body><main><h2>${title}</h2><p id="stage">Preparing Electron…</p></main></body></html>`)}`;
}

function setSplashStage(window: BrowserWindow | null, stage: string): void {
  if (window == null || window.isDestroyed()) return;
  void window.webContents.executeJavaScript(`document.getElementById("stage").textContent=${JSON.stringify(stage)}`).catch(() => undefined);
}

export async function runElectronShell(definition: ElectronShellDefinition): Promise<void> {
  const manifest = validateElectronShellManifest(definition.manifest);
  const presentation = resolveElectronPresentationMode({ explicitHeadless: definition.headless });
  app.setName(manifest.productName);
  protocol.registerSchemesAsPrivileged([{ scheme: manifest.protocol, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }

  let mainWindow: BrowserWindow | null = null;
  let splash: BrowserWindow | null = null;
  let pendingFocus = false;
  const pendingDeepLinks: string[] = [];
  const dispatch = (url: string) => { void Promise.resolve(definition.handlers?.openDeepLink?.(url)); };
  const initialDeepLink = process.argv.find((value) => value.startsWith(`${manifest.protocol}://`));
  if (initialDeepLink != null) pendingDeepLinks.push(initialDeepLink);
  app.on("second-instance", (_event, argv) => {
    const link = argv.find((value) => value.startsWith(`${manifest.protocol}://`));
    if (mainWindow == null) {
      pendingFocus = true;
      if (link != null) pendingDeepLinks.push(link);
      focusElectronWindow(splash, presentation, link == null ? "second-instance" : "deep-link");
      return;
    }
    focusElectronWindow(mainWindow, presentation, link == null ? "second-instance" : "deep-link");
    if (link != null) dispatch(link);
  });
  app.on("activate", () => {
    if (mainWindow == null) {
      pendingFocus = true;
      focusElectronWindow(splash, presentation, "app-activate");
      return;
    }
    focusElectronWindow(mainWindow, presentation, "app-activate");
  });

  await app.whenReady();
  if (presentation === "headless" && process.platform === "darwin") app.dock?.hide();
  const splashStartedAt = Date.now();
  if (presentation === "interactive") {
    splash = new BrowserWindow({ width: 520, height: 320, frame: false, resizable: false, show: true, webPreferences: { sandbox: true } });
    await splash.loadURL(splashHtml(manifest.productName));
  }
  setSplashStage(splash, "Starting the local foundation…");

  const runtimeRoot = join(app.getPath("userData"), "electron-kit", manifest.namespace);
  const sidecarEntryPath = app.isPackaged
    ? join(process.resourcesPath, "fixture-sidecar.cjs")
    : join(app.getAppPath(), "fixture-sidecar.cjs");
  const ports = definition.createPorts({ runtimeRoot, sidecarEntryPath });
  const scope: LifecycleScope = { channel: manifest.channel, namespace: manifest.namespace };
  const attachment: LifecycleAttachment = { id: `electron-${process.pid}-${randomUUID()}`, shell: manifest.shell };
  const generationId = createHash("sha256").update(`${manifest.channel}:${manifest.namespace}:fixture`).digest("hex");
  const generation: GenerationRecord = {
    schemaVersion: 3,
    id: generationId,
    channel: manifest.channel,
    releaseVersion: manifest.version,
    standaloneVersion: "fixture-v1",
    sourceCommit: "electron-kit-fixture",
    minimumShellVersions: { electron: manifest.version },
    resources: {},
  };
  const status = await ports.lifecycle.start(scope, generation, attachment);
  if (status.instanceId == null) throw new Error("fixture lifecycle did not return an instance id");
  setSplashStage(splash, "Waiting for explicit readiness…");
  await ports.lifecycle.awaitReady(scope, { generationId, instanceId: status.instanceId, attachmentId: attachment.id });

  protocol.handle(manifest.protocol, () => new Response(placeholder(manifest.window.title), { headers: { "content-type": "text/html; charset=utf-8" } }));
  mainWindow = new BrowserWindow({
    width: manifest.window.width,
    height: manifest.window.height,
    title: manifest.window.title,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await mainWindow.loadURL(`${manifest.protocol}://app/`);
  const mounted = await mainWindow.webContents.executeJavaScript(`document.documentElement.dataset.electronKitMounted === "1"`, true);
  if (mounted !== true) throw new Error("placeholder renderer did not acknowledge mounted state");
  setSplashStage(splash, "Ready");
  const remaining = presentation === "headless" ? 0 : 350 - (Date.now() - splashStartedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  focusElectronWindow(mainWindow, presentation, pendingFocus ? "second-instance" : "initial-reveal");
  if (splash != null && !splash.isDestroyed()) splash.destroy();
  for (const link of pendingDeepLinks.splice(0)) dispatch(link);

  let heartbeatInFlight = Promise.resolve();
  const heartbeat = setInterval(() => {
    heartbeatInFlight = heartbeatInFlight
      .then(async () => { await ports.lifecycle.heartbeat(scope, attachment); })
      .catch((error: unknown) => { if (!closing) console.error("[electron-kit] lifecycle heartbeat failed", error); });
  }, status.lease?.heartbeatIntervalMs ?? 1_000);
  heartbeat.unref();
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(heartbeat);
    await heartbeatInFlight;
    const released = await ports.lifecycle.release(scope, attachment.id);
    if (released.references === 0 && released.state === "running") await ports.lifecycle.stop(scope, released.fence);
  };
  app.on("before-quit", (event) => {
    if (closing) return;
    event.preventDefault();
    void close().finally(() => app.quit());
  });
  const smokeExitMs = Number(process.env.ELECTRON_KIT_SMOKE_EXIT_MS ?? "0");
  if (Number.isFinite(smokeExitMs) && smokeExitMs > 0) setTimeout(() => app.quit(), smokeExitMs).unref();
}
