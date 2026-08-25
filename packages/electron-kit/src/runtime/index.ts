import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { BrowserWindow, app, dialog, protocol } from "electron";
import { StandaloneFeedbackEmitter, type LifecycleAttachment, type LifecycleScope } from "@open-design/standalone";

import { validateElectronShellManifest, type ElectronShellDefinition } from "../boundary/index.js";
import { ensureOfficialNodeCarrier, OfficialNodeCarrierError, type OfficialNodeCarrierReceipt } from "../carrier/index.js";
import type { ElectronInstallerHandoff } from "../installer/contracts.js";
import { focusElectronWindow, resolveElectronPresentationMode } from "./presentation.js";
import { ELECTRON_BOOTSTRAP_SCHEMA_VERSION, validateElectronBootstrapResult } from "../bootstrap/contracts.js";
import { ElectronActivationAttempt } from "./activation.js";
import { claimElectronSingleInstanceLock, ElectronLaunchHandoffQueue } from "./single-instance.js";

export * from "./presentation.js";
export * from "./single-instance.js";

const placeholder = (title: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>html{font-family:ui-sans-serif,system-ui;background:#f7f7f4;color:#20201e}body{margin:0;display:grid;min-height:100vh;place-items:center}.card{max-width:560px;padding:48px;border:1px solid #deded8;border-radius:20px;background:#fff;box-shadow:0 18px 70px #00000012}small{color:#777}h1{font-size:32px;margin:12px 0}p{line-height:1.65}</style></head><body><main class="card"><small>Electron Shell Foundation</small><h1>${title}</h1><p>Electron + electron-kit 已完成冷启动、显式 readiness 与占位渲染闭环。</p></main><script>document.documentElement.dataset.electronKitMounted="1"</script></body></html>`;

function splashHtml(title: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><style>html{font-family:ui-sans-serif,system-ui;background:#151515;color:#fff}body{margin:0;display:grid;min-height:100vh;place-items:center;text-align:center}p{color:#aaa}</style><body><main><h2>${title}</h2><p id="stage">Preparing Electron…</p></main></body></html>`)}`;
}

function setSplashStage(window: BrowserWindow | null, stage: string): void {
  if (window == null || window.isDestroyed()) return;
  void window.webContents.executeJavaScript(`document.getElementById("stage").textContent=${JSON.stringify(stage)}`).catch(() => undefined);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); }),
    ]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}

type ElectronRuntimeContext = { activation: ElectronActivationAttempt | null };

async function resolveCarrierWithRecovery(input: Readonly<{
  lockPath: string;
  cacheRoot: string;
  presentation: ReturnType<typeof resolveElectronPresentationMode>;
  splash: BrowserWindow | null;
}>): Promise<OfficialNodeCarrierReceipt> {
  for (;;) {
    try { return await ensureOfficialNodeCarrier({ lockPath: input.lockPath, cacheRoot: input.cacheRoot }); }
    catch (error) {
      if (input.presentation === "headless" || !(error instanceof OfficialNodeCarrierError) || error.code !== "resource-unavailable") throw error;
      const options = {
        buttons: ["Retry", "Quit"],
        cancelId: 1,
        defaultId: 0,
        detail: error.message,
        message: "The official Node carrier could not be downloaded or verified.",
        noLink: true,
        title: "Electron Shell could not finish starting",
        type: "warning" as const,
      };
      const choice = input.splash == null ? await dialog.showMessageBox(options) : await dialog.showMessageBox(input.splash, options);
      if (choice.response !== 0) throw error;
    }
  }
}

async function runElectronShellSession(definition: ElectronShellDefinition, context: ElectronRuntimeContext): Promise<void> {
  const manifest = validateElectronShellManifest(definition.manifest);
  const presentation = resolveElectronPresentationMode({ explicitHeadless: definition.headless });
  app.setName(manifest.productName);
  protocol.registerSchemesAsPrivileged([{ scheme: manifest.protocol, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
  if (!await claimElectronSingleInstanceLock(app)) { app.quit(); return; }

  let mainWindow: BrowserWindow | null = null;
  let splash: BrowserWindow | null = null;
  const handoffs = new ElectronLaunchHandoffQueue(manifest.protocol);
  const dispatch = (url: string) => { void Promise.resolve(definition.handlers?.openDeepLink?.(url)); };
  const initialDeepLink = process.argv.find((value) => value.startsWith(`${manifest.protocol}://`));
  if (initialDeepLink != null) handoffs.enqueue([initialDeepLink]);
  app.on("second-instance", (_event, argv) => {
    const link = argv.find((value) => value.startsWith(`${manifest.protocol}://`));
    if (mainWindow == null) {
      handoffs.enqueue(argv);
      focusElectronWindow(splash, presentation, link == null ? "second-instance" : "deep-link");
      return;
    }
    focusElectronWindow(mainWindow, presentation, link == null ? "second-instance" : "deep-link");
    if (link != null) dispatch(link);
  });
  app.on("activate", () => {
    if (mainWindow == null) {
      handoffs.enqueue([]);
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
  context.activation = await ElectronActivationAttempt.begin(runtimeRoot);
  const nodeLockPath = join(app.getAppPath(), "node-lock.json");
  setSplashStage(splash, "Verifying the official Node carrier…");
  const carrier = await resolveCarrierWithRecovery({
    lockPath: nodeLockPath,
    cacheRoot: join(runtimeRoot, "carriers"),
    presentation,
    splash,
  });
  const sidecarEntryPath = app.isPackaged
    ? join(process.resourcesPath, "fixture-sidecar.cjs")
    : join(app.getAppPath(), "fixture-sidecar.cjs");
  const ports = definition.createPorts({ runtimeRoot, sidecarEntryPath, nodeExecutablePath: carrier.executablePath });
  const feedback = new StandaloneFeedbackEmitter(randomUUID(), { channel: manifest.channel, namespace: manifest.namespace }, ports.observeFeedback);
  const updaterRevisionAtStart = (await ports.updater.readSnapshot()).revision;
  const scope: LifecycleScope = { channel: manifest.channel, namespace: manifest.namespace };
  const attachment: LifecycleAttachment = { id: `electron-${process.pid}-${randomUUID()}`, shell: manifest.shell };
  const bootstrapRequest = {
    schemaVersion: ELECTRON_BOOTSTRAP_SCHEMA_VERSION,
    correlationId: randomUUID(),
    scope,
    shell: manifest.shell,
    releaseVersion: manifest.version,
  } as const;
  setSplashStage(splash, "Resolving the Standalone generation…");
  feedback.emit({ phase: "generation-prepared", state: "begin" });
  const bootstrap = validateElectronBootstrapResult(bootstrapRequest, await ports.bootstrap.resolve(bootstrapRequest));
  const generation = bootstrap.generation;
  feedback.emit({ phase: "generation-prepared", state: "complete", generationId: generation.id });
  feedback.emit({ phase: "closure-starting", state: "begin", generationId: generation.id });
  const status = await ports.lifecycle.start(scope, generation, attachment);
  if (status.instanceId == null) throw new Error("fixture lifecycle did not return an instance id");
  setSplashStage(splash, "Waiting for explicit readiness…");
  const readiness = { generationId: generation.id, instanceId: status.instanceId, attachmentId: attachment.id };
  await withTimeout(ports.lifecycle.awaitReady(scope, readiness), bootstrap.readinessTimeoutMs, "Electron lifecycle readiness timed out");
  feedback.emit({ phase: "closure-ready", state: "complete", generationId: generation.id });

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
  const pendingHandoffs = handoffs.drain();
  focusElectronWindow(mainWindow, presentation, pendingHandoffs.focusRequested ? "second-instance" : "initial-reveal");
  if (splash != null && !splash.isDestroyed()) splash.destroy();
  await context.activation.commit();
  for (const link of pendingHandoffs.deepLinks) dispatch(link);

  let heartbeatInFlight = Promise.resolve();
  const heartbeat = setInterval(() => {
    heartbeatInFlight = heartbeatInFlight
      .then(async () => { await ports.lifecycle.heartbeat(scope, attachment); })
      .catch((error: unknown) => { if (!closing) console.error("[electron-kit] lifecycle heartbeat failed", error); });
  }, status.lease?.heartbeatIntervalMs ?? 1_000);
  heartbeat.unref();
  let closing = false;
  let pendingInstaller: Readonly<{ handoff: ElectronInstallerHandoff; installAttemptId: string }> | null = null;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(heartbeat);
    await heartbeatInFlight;
    const current = await ports.lifecycle.status(scope);
    const ownsAttachment = current.occupants.some((occupant) => occupant.attachmentId === attachment.id);
    const released = ownsAttachment ? await ports.lifecycle.release(scope, attachment.id) : current;
    if (released.references === 0 && released.state === "running") await ports.lifecycle.stop(scope, released.fence);
    await context.activation?.stop();
  };
  app.on("before-quit", (event) => {
    if (closing) return;
    event.preventDefault();
    void close().then(async () => {
      if (pendingInstaller == null) return;
      if (definition.handlers?.installUpdate == null) throw new Error("Electron Shell installer handler is unavailable");
      await definition.handlers.installUpdate({
        handoff: pendingInstaller.handoff,
        installAttemptId: pendingInstaller.installAttemptId,
        nodeExecutablePath: carrier.executablePath,
        parentPid: process.pid,
        runtimeRoot,
      });
    }).catch((error: unknown) => {
      console.error("[electron-kit] shutdown or installer handoff failed", error);
    }).finally(() => app.quit());
  });
  void (async () => {
    let snapshot = await ports.updater.readSnapshot();
    while (!closing) {
      if (snapshot.revision > updaterRevisionAtStart && snapshot.state === "handed-off" && snapshot.handoff != null && snapshot.installAttemptId != null) {
        pendingInstaller = { handoff: snapshot.handoff, installAttemptId: snapshot.installAttemptId };
        app.quit();
        return;
      }
      snapshot = await ports.updater.waitForChange(snapshot.revision, 1_000);
    }
  })().catch((error: unknown) => {
    if (!closing) console.error("[electron-kit] Shell updater observation failed", error);
  });
  const smokeExitMs = Number(process.env.ELECTRON_KIT_SMOKE_EXIT_MS ?? "0");
  if (Number.isFinite(smokeExitMs) && smokeExitMs > 0) setTimeout(() => app.quit(), smokeExitMs).unref();
}

export async function runElectronShell(definition: ElectronShellDefinition): Promise<void> {
  const context: ElectronRuntimeContext = { activation: null };
  try { await runElectronShellSession(definition, context); }
  catch (error) {
    await context.activation?.fail(error).catch(() => undefined);
    console.error("[electron-kit] Electron Shell startup failed", error);
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    app.exit(1);
  }
}
