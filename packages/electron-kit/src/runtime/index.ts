import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { BrowserWindow, app, dialog, ipcMain, protocol } from "electron";
import {
  type GenerationRecord,
  type StandaloneGenerationBinding,
  type StandaloneHandoffAttachment,
  type StandaloneRuntimeHandle,
  type StandaloneRuntimeStatus,
  type StandaloneShellCapabilityRequest,
  type StandaloneShellCapabilityPort,
  type StandaloneScope,
} from "@open-design/standalone";

import {
  validateElectronShellManifest,
  type ElectronRendererLease,
  type ElectronShellDefinition,
  type ElectronStandaloneAuthority,
  type ElectronStandalonePreparedRuntime,
} from "../contracts/index.js";
import { ElectronActivationAttempt } from "./session/activation.js";
import { ElectronRuntimeLog } from "./session/logging.js";
import { prepareElectronNamespacePaths, resolveElectronSessionNamespace } from "./session/namespace-paths.js";
import { attachElectronProcessErrorHandlers } from "./session/process-errors.js";
import { completeElectronShutdown } from "./session/shutdown.js";
import {
  claimElectronSingleInstanceLock,
  ElectronLaunchHandoffQueue,
  findElectronProtocolUrl,
  parseElectronInstallerReplacementData,
} from "./session/single-instance.js";
import { observeElectronInstallerHandoff } from "./session/update-handoff.js";
import { applyElectronMacRuntimePolicy } from "../platform/macos/index.js";
import { ensureOfficialNodeCarrier, OfficialNodeCarrierError, type OfficialNodeCarrierReceipt } from "./startup/carrier/index.js";
import {
  ELECTRON_WARMUP_ATOMS,
  runElectronWarmupTopology,
  type ElectronWarmupRun,
  validateElectronRuntimeWarmupTopology,
} from "./startup/warmup/index.js";
import { applyElectronPreflight } from "./startup/preflight/index.js";
import { ElectronStartupAttemptFence, type ElectronStartupSignal } from "./startup/attempt.js";
import {
  completeElectronStartupCancellation,
  installElectronStartupQuitBarrier,
  isElectronStartupCancelledError,
  type ElectronStartupQuitBarrier,
} from "./startup/cancellation.js";
import { focusElectronWindow, resolveElectronPresentationMode } from "./window/presentation.js";
import {
  createElectronRendererMountAcknowledgement,
  installElectronRendererMountBarrier,
  serializeElectronRendererMountAcknowledgement,
} from "./window/mount-acknowledgement.js";

export * from "./session/logging.js";
export * from "./session/namespace-paths.js";
export * from "./session/process-errors.js";
export * from "./session/shutdown.js";
export * from "./session/single-instance.js";
export * from "./session/update-handoff.js";
export * from "./startup/attempt.js";
export * from "./startup/cancellation.js";
export * from "./window/presentation.js";
export * from "./window/mount-acknowledgement.js";

function splashHtml(title: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><style>html{font-family:ui-sans-serif,system-ui;background:#151515;color:#fff}body{margin:0;display:grid;min-height:100vh;place-items:center;text-align:center}p{color:#aaa}</style><body><main><h2>${title}</h2><p id="stage">Preparing Electron…</p></main></body></html>`)}`;
}

function setSplashStage(window: BrowserWindow | null, stage: string): void {
  if (window == null || window.isDestroyed()) return;
  void window.webContents.executeJavaScript(`document.getElementById("stage").textContent=${JSON.stringify(stage)}`).catch(() => undefined);
}

function requireWarmupState<T>(value: T | null, label: string): T {
  if (value == null) throw new Error(`Electron warmup completed without ${label}`);
  return value;
}

type ElectronRuntimeContext = {
  activation: ElectronActivationAttempt | null;
  log: ElectronRuntimeLog | null;
  startup: ElectronStartupAttemptFence | null;
  startupQuit: ElectronStartupQuitBarrier | null;
};

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
  const sessionNamespace = resolveElectronSessionNamespace(manifest.namespace, presentation);
  app.setName(manifest.productName);
  protocol.registerSchemesAsPrivileged([{ scheme: manifest.protocol, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
  let rendererLease: ElectronRendererLease | null = null;
  let splash: BrowserWindow | null = null;
  const handoffs = new ElectronLaunchHandoffQueue(manifest.protocol);
  const dispatch = (url: string) => {
    if (context.startupQuit?.cancelled) return;
    void Promise.resolve(definition.actions?.openDeepLink?.(url));
  };
  const initialDeepLink = findElectronProtocolUrl(manifest.protocol, process.argv);
  if (initialDeepLink != null) handoffs.enqueue({ type: "deep-link", source: "initial-argv", url: initialDeepLink });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    if (context.startupQuit?.cancelled) return;
    if (rendererLease != null) {
      focusElectronWindow(rendererLease.window, presentation, "deep-link");
      if (findElectronProtocolUrl(manifest.protocol, [url]) != null) dispatch(url);
      return;
    }
    if (handoffs.enqueue({ type: "deep-link", source: "mac-open-url", url })) focusElectronWindow(splash, presentation, "deep-link");
  });
  app.on("second-instance", (_event, argv, _workingDirectory, additionalData) => {
    if (context.startupQuit?.cancelled) return;
    if (parseElectronInstallerReplacementData(additionalData) != null) return;
    const link = findElectronProtocolUrl(manifest.protocol, argv);
    if (rendererLease != null) {
      focusElectronWindow(rendererLease.window, presentation, link == null ? "second-instance" : "deep-link");
      if (link != null) dispatch(link);
      return;
    }
    handoffs.enqueue(link == null
      ? { type: "focus", source: "second-instance" }
      : { type: "deep-link", source: "second-instance", url: link });
    focusElectronWindow(splash, presentation, link == null ? "second-instance" : "deep-link");
  });
  app.on("activate", () => {
    if (context.startupQuit?.cancelled) return;
    if (rendererLease != null) {
      focusElectronWindow(rendererLease.window, presentation, "app-activate");
      return;
    }
    handoffs.enqueue({ type: "focus", source: "app-activate" });
    focusElectronWindow(splash, presentation, "app-activate");
  });
  const paths = await prepareElectronNamespacePaths(app, {
    channel: manifest.channel,
    namespace: sessionNamespace,
  });
  if (!await claimElectronSingleInstanceLock(app)) { app.quit(); return; }
  const runtimeRoot = paths.runtimeRoot;
  context.log = new ElectronRuntimeLog(runtimeRoot);
  const processErrors = attachElectronProcessErrorHandlers((event) => {
    context.log?.write(`process.${event.source}.${event.classification}`, { error: event.error });
  });
  context.log.write("preflight.complete", {
    namespace: sessionNamespace,
    pid: process.pid,
    platform: process.platform,
    presentation,
    runtimeRoot,
    preflight,
  });
  const nodeLockPath = join(app.getAppPath(), "node-lock.json");
  const resourceRoot = app.isPackaged ? process.resourcesPath : app.getAppPath();
  const scope: StandaloneScope = { channel: manifest.channel, namespace: sessionNamespace };
  const attachment: StandaloneHandoffAttachment = { id: `electron-${process.pid}-${randomUUID()}`, shell: manifest.shell };
  let carrier: OfficialNodeCarrierReceipt | null = null;
  let authority: ElectronStandaloneAuthority | null = null;
  let preparedRuntime: ElectronStandalonePreparedRuntime | null = null;
  let generation: GenerationRecord | null = null;
  let generationBinding: StandaloneGenerationBinding | null = null;
  let startupSignal: ElectronStartupSignal | null = null;
  let status: StandaloneRuntimeStatus | null = null;
  let runtimeHandle: StandaloneRuntimeHandle | null = null;
  let updaterRevisionAtStart: number | null = null;
  let warmup: ElectronWarmupRun | null = null;
  let runtimeAcquisition: Promise<StandaloneRuntimeHandle> | null = null;
  let rendererMount: Promise<void> | null = null;
  let activationAcquisition: Promise<ElectronActivationAttempt> | null = null;

  context.startupQuit = installElectronStartupQuitBarrier({
    app,
    cancelAttempt() {
      handoffs.cancel();
      context.startup?.cancel();
    },
    async cleanup(error) {
      try {
        await completeElectronStartupCancellation({
          async disposeWarmup() { await warmup?.dispose(); },
          async settleRendererMount() { await rendererMount?.catch(() => undefined); },
          async releaseRendererIntegration() { await rendererLease?.releaseIntegration(); },
          async releaseStandaloneAttachment() {
            const acquired = await runtimeAcquisition?.catch(() => null);
            await (runtimeHandle ?? acquired)?.close();
          },
          async failActivation() {
            const activation = await activationAcquisition?.catch(() => null);
            await activation?.fail(error);
          },
          observe(failures) {
            context.log?.write(failures.length === 0 ? "startup.cancelled" : "startup.cancellation.failed", { failures });
          },
          async flushObservation() { await context.log?.flush(); },
          destroyWindows() {
            for (const window of BrowserWindow.getAllWindows()) window.destroy();
          },
        });
      } finally {
        processErrors.dispose();
      }
    },
    observeFailure(error) {
      context.log?.write("startup.cancellation.failed", { error });
      console.error("[electron-kit] startup cancellation failed", error);
    },
  });
  activationAcquisition = ElectronActivationAttempt.begin(runtimeRoot);
  context.activation = await context.startupQuit.guard(activationAcquisition);
  context.startup = new ElectronStartupAttemptFence(context.activation.attemptId);

  await context.startupQuit.guard(app.whenReady());
  await context.startupQuit.guard(applyElectronMacRuntimePolicy({ app, platform: process.platform, policy: definition.mac, presentation }));
  const splashStartedAt = Date.now();
  if (presentation === "interactive") {
    splash = new BrowserWindow({ width: 520, height: 320, frame: false, resizable: false, show: true, webPreferences: { sandbox: true } });
    await context.startupQuit.guard(splash.loadURL(splashHtml(manifest.productName)));
  }
  setSplashStage(splash, "Preparing…");

  warmup = runElectronWarmupTopology({
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
        authority = definition.createStandaloneAuthority({
          officialNodeExecutablePath: carrier.executablePath,
          resourceRoot,
          runtimeRoot,
          observeFeedback(event) {
            if (!context.startupQuit?.cancelled) {
              setSplashStage(splash, event.phase === "generation-prepared" ? "Preparing generation…" : event.phase);
            }
            context.log?.write("standalone.feedback", { event });
          },
        });
        preparedRuntime = await authority.prepare({
          correlationId: randomUUID(),
          scope,
          shell: manifest.shell,
          releaseVersion: manifest.version,
        });
        generation = preparedRuntime.generation;
        generationBinding = preparedRuntime.binding;
        startupSignal = context.startup!.bind(generationBinding.digest);
        updaterRevisionAtStart = (await preparedRuntime.updater.readSnapshot()).revision;
      },
      [ELECTRON_WARMUP_ATOMS.AWAIT_STANDALONE_READY]: async () => {
        if (preparedRuntime == null || generation == null || generationBinding == null) {
          throw new Error("Standalone resolution has not completed");
        }
        const runtime = preparedRuntime;
        const capabilities: StandaloneShellCapabilityPort = Object.freeze({
          async invoke(request: StandaloneShellCapabilityRequest) {
            return Object.freeze({
              requestId: request.requestId,
              attachmentId: request.attachmentId,
              bindingDigest: request.bindingDigest,
              outcome: "unsupported" as const,
              error: Object.freeze({ code: "electron-capability-unavailable" }),
            });
          },
        });
        runtimeAcquisition = runtime.start({
          attachment,
          capabilities,
        });
        runtimeHandle = await runtimeAcquisition;
        status = await runtimeHandle.readStatus();
        if (
          status.state !== "running"
          || status.generationId !== generation.id
          || status.bindingDigest !== generationBinding.digest
          || status.instanceId.length === 0
        ) throw new Error("Standalone runtime handle did not acknowledge exact readiness");
        context.startup!.advance(startupSignal!, "runtime-ready");
      },
      [ELECTRON_WARMUP_ATOMS.MOUNT_RENDERER]: async ({ signal }) => {
        rendererMount = (async () => {
          const acknowledgement = createElectronRendererMountAcknowledgement(startupSignal!);
          const rendererOptions = definition.renderer.windowOptions?.({ acknowledgement, manifest, preflight, presentation });
          const window = new BrowserWindow({
            ...rendererOptions,
            width: manifest.window.width,
            height: manifest.window.height,
            title: manifest.window.title,
            show: false,
            webPreferences: {
              ...rendererOptions?.webPreferences,
              additionalArguments: [
                ...(rendererOptions?.webPreferences?.additionalArguments ?? []),
                serializeElectronRendererMountAcknowledgement(acknowledgement),
              ],
            },
          });
          const barrier = installElectronRendererMountBarrier({ acknowledgement, ipc: ipcMain, sender: window.webContents, signal });
          let integration: Awaited<ReturnType<ElectronShellDefinition["renderer"]["mount"]>> | null = null;
          try {
            integration = await definition.renderer.mount({ acknowledgement, manifest, preflight, presentation, window });
            await barrier.ready;
            const mountedIntegration = integration;
            rendererLease = Object.freeze({
              window,
              releaseIntegration() {
                return mountedIntegration.dispose();
              },
              destroy() { if (!window.isDestroyed()) window.destroy(); },
            });
            context.startup!.advance(startupSignal!, "renderer-mounted");
          } catch (error) {
            if (!window.isDestroyed()) window.destroy();
            try { await integration?.dispose(); }
            catch (disposeError) {
              throw new AggregateError([error, disposeError], "Electron renderer mount and integration cleanup failed");
            }
            throw error;
          } finally {
            barrier.dispose();
          }
        })();
        await rendererMount;
      },
    },
    onEvent(event) {
      if (!context.startupQuit?.cancelled && event.state === "running") setSplashStage(splash, event.node.label ?? event.node.id);
      context.log?.write("warmup.node", {
        blocking: event.node.blocking,
        error: event.error,
        executor: event.node.executor,
        nodeId: event.node.id,
        state: event.state,
      });
    },
  });
  const startupWarmup = warmup;
  try { await context.startupQuit.guard(startupWarmup.ready); }
  catch (error) {
    if (!isElectronStartupCancelledError(error)) await startupWarmup.dispose();
    throw error;
  }
  context.log.write("warmup.ready", { nodes: startupWarmup.snapshot() });
  const runtimeCarrier = requireWarmupState(carrier as OfficialNodeCarrierReceipt | null, "the official Node carrier");
  const runtimePrepared = requireWarmupState(preparedRuntime as ElectronStandalonePreparedRuntime | null, "a prepared Standalone runtime");
  const runtimeStandaloneHandle = requireWarmupState(runtimeHandle as StandaloneRuntimeHandle | null, "a Standalone runtime handle");
  const runtimeGeneration = requireWarmupState(generation as GenerationRecord | null, "a Standalone generation");
  requireWarmupState(status as StandaloneRuntimeStatus | null, "Standalone readiness");
  const runtimeUpdaterRevisionAtStart = requireWarmupState(updaterRevisionAtStart as number | null, "the updater revision");
  const runtimeRendererLease = requireWarmupState(rendererLease as ElectronRendererLease | null, "a renderer lease");
  setSplashStage(splash, "Ready");
  const remaining = presentation === "headless" ? 0 : 350 - (Date.now() - splashStartedAt);
  if (remaining > 0) await context.startupQuit.guard(new Promise((resolve) => setTimeout(resolve, remaining)));
  const pendingHandoffs = handoffs.drain();
  focusElectronWindow(
    runtimeRendererLease.window,
    presentation,
    pendingHandoffs.length > 0 ? "second-instance" : "initial-reveal",
  );
  if (splash != null && !splash.isDestroyed()) splash.destroy();
  await context.startupQuit.guard(context.activation.commit());
  context.startup.advance(startupSignal!, "committed");
  context.log.write("startup.committed", { generationId: runtimeGeneration.id, presentation });
  void Promise.resolve().then(() => definition.actions?.observeCommitted?.()).catch((error: unknown) => {
    context.log?.write("shell.commit-observer.failed", { error });
  });
  for (const ingress of pendingHandoffs) {
    if (ingress.type === "deep-link") dispatch(ingress.url);
  }

  let closing = false;
  let installerArming = Promise.resolve();
  const close = async () => {
    if (closing) return;
    closing = true;
    try {
      await completeElectronShutdown({
        waitForHeartbeat() { /* Runtime-handle authorities own their leases. */ },
        async releaseRendererIntegration() { await runtimeRendererLease.releaseIntegration(); },
        async disposeWarmup() { await startupWarmup.dispose(); },
        async releaseStandalone() { await runtimeStandaloneHandle.close(); },
        async stopActivation() { await context.activation?.stop(); },
        observe(failures) {
          context.log?.write(failures.length === 0 ? "shutdown.complete" : "shutdown.failed", { failures });
        },
        async flushObservation() { await context.log?.flush(); },
        destroyWindow() { runtimeRendererLease.destroy(); },
      });
    } finally {
      processErrors.dispose();
    }
  };
  context.startupQuit.commit();
  const beforeQuit = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (closing) return;
    void installerArming.catch((error: unknown) => {
      console.error("[electron-kit] installer arming failed", error);
    }).then(close).catch((error: unknown) => {
      console.error("[electron-kit] shutdown or installer handoff failed", error);
    }).finally(() => {
      app.removeListener("before-quit", beforeQuit);
      app.quit();
    });
  };
  app.on("before-quit", beforeQuit);
  void observeElectronInstallerHandoff({
    afterRevision: runtimeUpdaterRevisionAtStart,
    isClosing: () => closing,
    updater: runtimePrepared.updater,
    async onHandoff(request) {
      if (definition.actions?.installUpdate == null) throw new Error("Electron Shell installer action is unavailable");
      installerArming = Promise.resolve(definition.actions.installUpdate({
        ...request,
        nodeExecutablePath: runtimeCarrier.executablePath,
        parentPid: process.pid,
        runtimeRoot,
      })).then(() => undefined);
      await installerArming;
      context.log?.write("installer.armed", { installAttemptId: request.installAttemptId });
      app.quit();
    },
  }).catch((error: unknown) => {
    if (!closing) {
      context.log?.write("installer.observation.failed", { error });
      console.error("[electron-kit] Shell updater observation failed", error);
    }
  });
  const smokeExitMs = Number(process.env.ELECTRON_KIT_SMOKE_EXIT_MS ?? "0");
  if (Number.isFinite(smokeExitMs) && smokeExitMs > 0) setTimeout(() => app.quit(), smokeExitMs).unref();
}

export async function runElectronShell(definition: ElectronShellDefinition): Promise<void> {
  const context: ElectronRuntimeContext = { activation: null, log: null, startup: null, startupQuit: null };
  try { await runElectronShellSession(definition, context); }
  catch (error) {
    if (isElectronStartupCancelledError(error)) {
      await context.startupQuit?.settled;
      return;
    }
    context.startup?.cancel();
    await context.startupQuit?.cancel(error).catch(() => undefined);
    if (context.startupQuit == null) await context.activation?.fail(error).catch(() => undefined);
    context.log?.write("startup.failed", { error });
    await context.log?.flush();
    console.error("[electron-kit] Electron Shell startup failed", error);
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    app.exit(1);
  }
}
