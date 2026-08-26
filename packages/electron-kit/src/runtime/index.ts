import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { BrowserWindow, app, dialog, protocol } from "electron";
import {
  StandaloneFeedbackEmitter,
  type GenerationRecord,
  type LifecycleAttachment,
  type LifecycleScope,
  type LifecycleStatus,
} from "@open-design/standalone";

import {
  validateElectronShellManifest,
  type ElectronClosurePorts,
  type ElectronRendererLease,
  type ElectronShellDefinition,
} from "../contracts/index.js";
import type { ElectronInstallerHandoff } from "../update/installation/contracts.js";
import { ElectronActivationAttempt } from "./session/activation.js";
import { ElectronRuntimeLog } from "./session/logging.js";
import { completeElectronShutdown } from "./session/shutdown.js";
import { claimElectronSingleInstanceLock, ElectronLaunchHandoffQueue } from "./session/single-instance.js";
import { ELECTRON_BOOTSTRAP_SCHEMA_VERSION, validateElectronBootstrapResult } from "./startup/bootstrap/contracts.js";
import { ensureOfficialNodeCarrier, OfficialNodeCarrierError, type OfficialNodeCarrierReceipt } from "./startup/carrier/index.js";
import {
  ELECTRON_WARMUP_ATOMS,
  runElectronWarmupTopology,
  validateElectronRuntimeWarmupTopology,
} from "./startup/warmup/index.js";
import { applyElectronPreflight } from "./startup/preflight/index.js";
import { focusElectronWindow, resolveElectronPresentationMode } from "./window/presentation.js";

export * from "./session/logging.js";
export * from "./session/shutdown.js";
export * from "./session/single-instance.js";
export * from "./window/presentation.js";

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

function requireWarmupState<T>(value: T | null, label: string): T {
  if (value == null) throw new Error(`Electron warmup completed without ${label}`);
  return value;
}

type ElectronRuntimeContext = { activation: ElectronActivationAttempt | null; log: ElectronRuntimeLog | null };

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
  const preflight = applyElectronPreflight(app, definition.preflight);
  const warmupTopology = validateElectronRuntimeWarmupTopology(definition.warmup);
  const presentation = resolveElectronPresentationMode({ explicitHeadless: definition.headless });
  app.setName(manifest.productName);
  protocol.registerSchemesAsPrivileged([{ scheme: manifest.protocol, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
  if (!await claimElectronSingleInstanceLock(app)) { app.quit(); return; }
  const runtimeRoot = join(app.getPath("userData"), "electron-kit", manifest.namespace);
  context.log = new ElectronRuntimeLog(runtimeRoot);
  context.log.write("preflight.complete", {
    namespace: manifest.namespace,
    pid: process.pid,
    platform: process.platform,
    presentation,
    runtimeRoot,
    preflight,
  });
  context.activation = await ElectronActivationAttempt.begin(runtimeRoot);

  let rendererLease: ElectronRendererLease | null = null;
  let splash: BrowserWindow | null = null;
  const handoffs = new ElectronLaunchHandoffQueue(manifest.protocol);
  const dispatch = (url: string) => { void Promise.resolve(definition.actions?.openDeepLink?.(url)); };
  const initialDeepLink = process.argv.find((value) => value.startsWith(`${manifest.protocol}://`));
  if (initialDeepLink != null) handoffs.enqueue([initialDeepLink]);
  app.on("second-instance", (_event, argv) => {
    const link = argv.find((value) => value.startsWith(`${manifest.protocol}://`));
    if (rendererLease == null) {
      handoffs.enqueue(argv);
      focusElectronWindow(splash, presentation, link == null ? "second-instance" : "deep-link");
      return;
    }
    focusElectronWindow(rendererLease.window, presentation, link == null ? "second-instance" : "deep-link");
    if (link != null) dispatch(link);
  });
  app.on("activate", () => {
    if (rendererLease == null) {
      handoffs.enqueue([]);
      focusElectronWindow(splash, presentation, "app-activate");
      return;
    }
    focusElectronWindow(rendererLease.window, presentation, "app-activate");
  });

  await app.whenReady();
  if (presentation === "headless" && process.platform === "darwin") app.dock?.hide();
  const splashStartedAt = Date.now();
  if (presentation === "interactive") {
    splash = new BrowserWindow({ width: 520, height: 320, frame: false, resizable: false, show: true, webPreferences: { sandbox: true } });
    await splash.loadURL(splashHtml(manifest.productName));
  }
  setSplashStage(splash, "Preparing…");

  const nodeLockPath = join(app.getAppPath(), "node-lock.json");
  const sidecarEntryPath = app.isPackaged
    ? join(process.resourcesPath, "fixture-sidecar.cjs")
    : join(app.getAppPath(), "fixture-sidecar.cjs");
  const scope: LifecycleScope = { channel: manifest.channel, namespace: manifest.namespace };
  const attachment: LifecycleAttachment = { id: `electron-${process.pid}-${randomUUID()}`, shell: manifest.shell };
  let carrier: OfficialNodeCarrierReceipt | null = null;
  let ports: ElectronClosurePorts | null = null;
  let feedback: StandaloneFeedbackEmitter | null = null;
  let generation: GenerationRecord | null = null;
  let status: LifecycleStatus | null = null;
  let updaterRevisionAtStart: number | null = null;
  let readinessTimeoutMs: number | null = null;
  const warmup = runElectronWarmupTopology({
    topology: warmupTopology,
    executors: {
      ...definition.warmupExecutors,
      [ELECTRON_WARMUP_ATOMS.ENSURE_CARRIER]: async () => {
        carrier = await resolveCarrierWithRecovery({
          lockPath: nodeLockPath,
          cacheRoot: join(runtimeRoot, "carriers"),
          presentation,
          splash,
        });
      },
      [ELECTRON_WARMUP_ATOMS.RESOLVE_STANDALONE]: async () => {
        if (carrier == null) throw new Error("official Node carrier is unavailable");
        ports = definition.createPorts({ runtimeRoot, sidecarEntryPath, nodeExecutablePath: carrier.executablePath });
        feedback = new StandaloneFeedbackEmitter(randomUUID(), scope, ports.observeFeedback);
        updaterRevisionAtStart = (await ports.updater.readSnapshot()).revision;
        const bootstrapRequest = {
          schemaVersion: ELECTRON_BOOTSTRAP_SCHEMA_VERSION,
          correlationId: randomUUID(),
          scope,
          shell: manifest.shell,
          releaseVersion: manifest.version,
        } as const;
        feedback.emit({ phase: "generation-prepared", state: "begin" });
        const bootstrap = validateElectronBootstrapResult(bootstrapRequest, await ports.bootstrap.resolve(bootstrapRequest));
        generation = bootstrap.generation;
        readinessTimeoutMs = bootstrap.readinessTimeoutMs;
        feedback.emit({ phase: "generation-prepared", state: "complete", generationId: generation.id });
      },
      [ELECTRON_WARMUP_ATOMS.AWAIT_STANDALONE_READY]: async () => {
        if (ports == null || feedback == null || generation == null || readinessTimeoutMs == null) {
          throw new Error("Standalone resolution has not completed");
        }
        feedback.emit({ phase: "closure-starting", state: "begin", generationId: generation.id });
        status = await ports.lifecycle.start(scope, generation, attachment);
        if (status.instanceId == null) throw new Error("fixture lifecycle did not return an instance id");
        const readiness = { generationId: generation.id, instanceId: status.instanceId, attachmentId: attachment.id };
        await withTimeout(ports.lifecycle.awaitReady(scope, readiness), readinessTimeoutMs, "Electron lifecycle readiness timed out");
        feedback.emit({ phase: "closure-ready", state: "complete", generationId: generation.id });
      },
      [ELECTRON_WARMUP_ATOMS.MOUNT_RENDERER]: async () => {
        const window = new BrowserWindow({
          ...definition.renderer.windowOptions?.({ manifest, preflight, presentation }),
          width: manifest.window.width,
          height: manifest.window.height,
          title: manifest.window.title,
          show: false,
        });
        try {
          const integration = await definition.renderer.mount({ manifest, preflight, presentation, window });
          rendererLease = Object.freeze({
            window,
            releaseIntegration() {
              return integration.dispose();
            },
            destroy() { if (!window.isDestroyed()) window.destroy(); },
          });
        } catch (error) {
          if (!window.isDestroyed()) window.destroy();
          throw error;
        }
      },
    },
    onEvent(event) {
      if (event.state === "running") setSplashStage(splash, event.node.label ?? event.node.id);
      context.log?.write("warmup.node", {
        blocking: event.node.blocking,
        error: event.error,
        executor: event.node.executor,
        nodeId: event.node.id,
        state: event.state,
      });
    },
  });
  try { await warmup.ready; }
  catch (error) {
    await warmup.dispose();
    throw error;
  }
  const runtimeCarrier = requireWarmupState(carrier as OfficialNodeCarrierReceipt | null, "the official Node carrier");
  const runtimePorts = requireWarmupState(ports as ElectronClosurePorts | null, "Standalone ports");
  const runtimeGeneration = requireWarmupState(generation as GenerationRecord | null, "a Standalone generation");
  const runtimeStatus = requireWarmupState(status as LifecycleStatus | null, "Standalone readiness");
  const runtimeUpdaterRevisionAtStart = requireWarmupState(updaterRevisionAtStart as number | null, "the updater revision");
  const runtimeRendererLease = requireWarmupState(rendererLease as ElectronRendererLease | null, "a renderer lease");
  setSplashStage(splash, "Ready");
  const remaining = presentation === "headless" ? 0 : 350 - (Date.now() - splashStartedAt);
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  const pendingHandoffs = handoffs.drain();
  focusElectronWindow(runtimeRendererLease.window, presentation, pendingHandoffs.focusRequested ? "second-instance" : "initial-reveal");
  if (splash != null && !splash.isDestroyed()) splash.destroy();
  await context.activation.commit();
  context.log.write("startup.committed", { generationId: runtimeGeneration.id, presentation });
  for (const link of pendingHandoffs.deepLinks) dispatch(link);

  let heartbeatInFlight = Promise.resolve();
  const heartbeat = setInterval(() => {
    heartbeatInFlight = heartbeatInFlight
      .then(async () => { await runtimePorts.lifecycle.heartbeat(scope, attachment); })
      .catch((error: unknown) => { if (!closing) console.error("[electron-kit] lifecycle heartbeat failed", error); });
  }, runtimeStatus.lease?.heartbeatIntervalMs ?? 1_000);
  heartbeat.unref();
  let closing = false;
  let pendingInstaller: Readonly<{ handoff: ElectronInstallerHandoff; installAttemptId: string }> | null = null;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(heartbeat);
    await completeElectronShutdown({
      async waitForHeartbeat() { await heartbeatInFlight; },
      async releaseRendererIntegration() { await runtimeRendererLease.releaseIntegration(); },
      async disposeWarmup() { await warmup.dispose(); },
      async releaseStandalone() {
        const current = await runtimePorts.lifecycle.status(scope);
        const ownsAttachment = current.occupants.some((occupant) => occupant.attachmentId === attachment.id);
        const released = ownsAttachment ? await runtimePorts.lifecycle.release(scope, attachment.id) : current;
        if (released.references === 0 && released.state === "running") await runtimePorts.lifecycle.stop(scope, released.fence);
      },
      async stopActivation() { await context.activation?.stop(); },
      observe(failures) {
        context.log?.write(failures.length === 0 ? "shutdown.complete" : "shutdown.failed", { failures });
      },
      async flushObservation() { await context.log?.flush(); },
      destroyWindow() { runtimeRendererLease.destroy(); },
    });
  };
  app.on("before-quit", (event) => {
    if (closing) return;
    event.preventDefault();
    void close().then(async () => {
      if (pendingInstaller == null) return;
      if (definition.actions?.installUpdate == null) throw new Error("Electron Shell installer action is unavailable");
      await definition.actions.installUpdate({
        handoff: pendingInstaller.handoff,
        installAttemptId: pendingInstaller.installAttemptId,
        nodeExecutablePath: runtimeCarrier.executablePath,
        parentPid: process.pid,
        runtimeRoot,
      });
    }).catch((error: unknown) => {
      console.error("[electron-kit] shutdown or installer handoff failed", error);
    }).finally(() => app.quit());
  });
  void (async () => {
    let snapshot = await runtimePorts.updater.readSnapshot();
    while (!closing) {
      if (snapshot.revision > runtimeUpdaterRevisionAtStart && snapshot.state === "handed-off" && snapshot.handoff != null && snapshot.installAttemptId != null) {
        pendingInstaller = { handoff: snapshot.handoff, installAttemptId: snapshot.installAttemptId };
        app.quit();
        return;
      }
      snapshot = await runtimePorts.updater.waitForChange(snapshot.revision, 1_000);
    }
  })().catch((error: unknown) => {
    if (!closing) console.error("[electron-kit] Shell updater observation failed", error);
  });
  const smokeExitMs = Number(process.env.ELECTRON_KIT_SMOKE_EXIT_MS ?? "0");
  if (Number.isFinite(smokeExitMs) && smokeExitMs > 0) setTimeout(() => app.quit(), smokeExitMs).unref();
}

export async function runElectronShell(definition: ElectronShellDefinition): Promise<void> {
  const context: ElectronRuntimeContext = { activation: null, log: null };
  try { await runElectronShellSession(definition, context); }
  catch (error) {
    await context.activation?.fail(error).catch(() => undefined);
    context.log?.write("startup.failed", { error });
    await context.log?.flush();
    console.error("[electron-kit] Electron Shell startup failed", error);
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    app.exit(1);
  }
}
