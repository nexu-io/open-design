import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";

import { BrowserWindow, app, dialog, ipcMain, nativeImage, protocol } from "electron";
import {
  canonicalJson,
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
  validateElectronShellAppearance,
  type ElectronRendererLease,
  type ElectronShellDefinition,
  type ElectronShellManifest,
  type ElectronStandaloneAuthority,
  type ElectronStandalonePreparedRuntime,
  type ElectronStandaloneContentUpdaterPort,
} from "../contracts/index.js";
export type {
  ElectronInstallerClaimIdentity,
  ElectronInstallerClaimSnapshot,
  ElectronInstallerConfirmationReceipt,
  ElectronInstallerConfirmationRequest,
  ElectronInstallerRecoveryIntent,
  ElectronInstallerRecoveryReceipt,
  ElectronInstallerRecoveryRequest,
} from "../contracts/index.js";
import { ElectronActivationAttempt } from "./session/activation.js";
import { ElectronRuntimeLog } from "./session/logging.js";
import { resolveElectronSessionNamespace } from "./session/namespace-paths.js";
import { attachElectronProcessErrorHandlers } from "./session/process-errors.js";
import { completeElectronShutdown } from "./session/shutdown.js";
import {
  ElectronLaunchHandoffQueue,
  findElectronProtocolUrl,
  parseElectronInstallerReplacementData,
} from "./session/single-instance.js";
import { observeElectronInstallerHandoff, resolveElectronInstallerRecovery } from "./session/update-handoff.js";
import { applyElectronMacRuntimePolicy } from "../platform/macos/index.js";
import { bindNodePlatform } from "@open-design/standalone/packages";
import {
  ELECTRON_WARMUP_ATOMS,
  runElectronWarmupTopology,
  type ElectronWarmupRun,
  validateElectronRuntimeWarmupTopology,
} from "./startup/warmup/index.js";
import { loadElectronCarrierCapsule, prepareElectronCarrierIdentity } from "./startup/identity.js";
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
} from "./window/mount-acknowledgement.js";
import { mountElectronRendererLease, replaceElectronRendererLease } from "./window/renderer-mount.js";
import { observeElectronRuntimeTerminal } from "./session/terminal-observer.js";
import { awaitElectronRendererRecoveryDecision, ElectronRendererCrashBreaker } from "./window/crash-recovery.js";

import { electronSplashHtml } from "./window/splash.js";

export * from "./session/logging.js";
export * from "./session/cdp.js";
export * from "./session/namespace-paths.js";
export * from "./session/process-errors.js";
export * from "./session/shutdown.js";
export * from "./session/single-instance.js";
export * from "./session/update-handoff.js";
export * from "./startup/attempt.js";
export * from "./startup/cancellation.js";
export * from "./window/presentation.js";
export * from "./window/mount-acknowledgement.js";

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

export type ElectronCarrierDefinition = Readonly<{
  manifest: ElectronShellManifest;
  preflight: ElectronShellDefinition["preflight"];
  headless?: boolean;
  loadCapsule(manifest: ElectronShellManifest): Promise<ElectronShellDefinition>;
}>;

async function runElectronShellSession(input: ElectronCarrierDefinition, context: ElectronRuntimeContext): Promise<void> {
  const manifest = validateElectronShellManifest(input.manifest);
  const presentation = resolveElectronPresentationMode({ explicitHeadless: input.headless });
  const sessionNamespace = resolveElectronSessionNamespace(manifest.namespace, presentation);
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
  const identity = await prepareElectronCarrierIdentity({ app, protocol, platform: process.platform,
    productName: manifest.productName, scheme: manifest.protocol, channel: manifest.channel,
    namespace: sessionNamespace, preflight: input.preflight, presentation });
  if (identity == null) { app.quit(); return; }
  const { paths, preflight } = identity;
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
  const resourceRoot = app.isPackaged ? process.resourcesPath : app.getAppPath();
  // Physical integrity precedes Capsule code and any generation/installer handoff.
  // A damaged platform is repaired only by replacing the physical Shell.
  const { nodeRuntime, definition } = await loadElectronCarrierCapsule(app, async () => {
    const nodeRuntime = await bindNodePlatform(join(resourceRoot, "platform"));
    context.log?.write("platform.verified", { command: nodeRuntime.command });
    return { nodeRuntime, definition: await input.loadCapsule(manifest) };
  });
  if (canonicalJson(definition.manifest) !== canonicalJson(manifest) || canonicalJson(definition.preflight) !== canonicalJson(input.preflight)) {
    throw new Error("Capsule cannot replace the established carrier identity or preflight");
  }
  context.log.write("capsule.definition.loaded", { pid: process.pid });
  const appearance = validateElectronShellAppearance(definition.appearance);
  const warmupTopology = validateElectronRuntimeWarmupTopology(definition.warmup);
  const scope: StandaloneScope = { channel: manifest.channel, namespace: sessionNamespace };
  const attachment: StandaloneHandoffAttachment = { id: `electron-${process.pid}-${randomUUID()}`, shell: manifest.shell };
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
  const rendererShutdown = new AbortController();
  let rendererReplacement: Promise<unknown> | null = null;
  let rendererRecoveryParked = false;
  const recoveringWindows = new WeakSet<BrowserWindow>();
  const rendererRecovery = definition.rendererRecovery;
  const crashBreaker = rendererRecovery == null ? null : new ElectronRendererCrashBreaker(rendererRecovery.policy);
  const rendererSignal = () => {
    const timeoutMs = warmupTopology.nodes.find(({ executor }) => executor === ELECTRON_WARMUP_ATOMS.MOUNT_RENDERER)?.timeoutMs
      ?? warmupTopology.totalTimeoutMs;
    return timeoutMs == null ? rendererShutdown.signal : AbortSignal.any([rendererShutdown.signal, AbortSignal.timeout(timeoutMs)]);
  };
  const recoverRenderer = async (window: BrowserWindow, details: Electron.RenderProcessGoneDetails) => {
    if (rendererShutdown.signal.aborted || window.isDestroyed() || details.reason === "clean-exit") return;
    if (context.startup?.phase !== "committed") { context.log?.write("renderer.startup.crashed", { details }); app.quit(); return; }
    await rendererReplacement?.catch(() => undefined);
    if (rendererShutdown.signal.aborted || window.isDestroyed() || rendererLease?.window !== window) return;
    if (recoveringWindows.has(window)) return;
    recoveringWindows.add(window);
    const outcome = crashBreaker?.record(Date.now());
    if (outcome === "ignore") return;
    context.log?.write("renderer.crashed", { details, outcome });
    if (rendererRecovery == null || crashBreaker == null) { app.quit(); return; }
    const replacing = (async () => {
      if (outcome === "park") {
        rendererRecoveryParked = true;
        context.log?.write("renderer.recovery.parked", { cooldownMs: rendererRecovery.policy.cooldownMs });
        const choice = presentation === "headless" ? "quit" : await awaitElectronRendererRecoveryDecision({
          cooldownMs: rendererRecovery.policy.cooldownMs,
          signal: rendererShutdown.signal,
          async prompt(signal) {
            const labels = rendererRecovery.prompt;
            // macOS parentless message boxes are synchronous and cannot be aborted.
            const result = await dialog.showMessageBox(window, { title: labels.title, message: labels.message, detail: labels.detail,
              buttons: [labels.retryLabel, labels.quitLabel], defaultId: 0, cancelId: 1, noLink: true, type: "error", signal });
            return result.response === 0 ? "retry" : "quit";
          },
        });
        rendererRecoveryParked = false;
        if (rendererShutdown.signal.aborted) return;
        if (choice === "quit") { app.quit(); return; }
        crashBreaker.reset();
      }
      const binding = requireWarmupState(generationBinding, "a renderer generation binding");
      const observed = await requireWarmupState(runtimeHandle, "a Standalone runtime handle").readStatus();
      if (observed.state !== "running" || observed.bindingDigest !== binding.digest || observed.generationId !== binding.generationId) {
        throw new Error("renderer recovery cannot reuse a revoked runtime binding");
      }
      const signal = rendererSignal();
      rendererLease = await replaceElectronRendererLease({
        previous: requireWarmupState(rendererLease, "a renderer lease"),
        mount: () => mountRenderer(binding, signal, randomUUID()),
        reveal: lease => { signal.throwIfAborted(); focusElectronWindow(lease.window, presentation, "initial-reveal"); },
      });
      context.log?.write("renderer.recovery.committed", { bindingDigest: binding.digest, generationId: binding.generationId });
    })();
    rendererReplacement = replacing;
    try { await replacing; }
    catch (error) { context.log?.write("renderer.recovery.failed", { error }); app.quit(); }
    finally { rendererRecoveryParked = false; if (rendererReplacement === replacing) rendererReplacement = null; }
  };
  const mountRenderer = (binding: StandaloneGenerationBinding, signal: AbortSignal, attemptId: string) => mountElectronRendererLease({
    context: {
      acknowledgement: createElectronRendererMountAcknowledgement({ attemptId, bindingDigest: binding.digest }),
      contentUpdater: rendererContentUpdater,
      shellUpdater: requireWarmupState(preparedRuntime, "a prepared Standalone runtime").updater,
      manifest, windowPolicy: appearance.window, preflight, presentation,
      runtime: Object.freeze({ attachment, binding, handle: requireWarmupState(runtimeHandle, "a Standalone runtime handle") }),
    },
    createWindow: (options) => {
      const window = new BrowserWindow(options);
      window.webContents.on("render-process-gone", (_event, details) => {
        void recoverRenderer(window, details).catch(error => { context.log?.write("renderer.recovery.failed", { error }); app.quit(); });
      });
      return window;
    },
    ipc: ipcMain,
    renderer: definition.renderer,
    signal,
  });
  const rendererContentUpdater: ElectronStandaloneContentUpdaterPort = Object.freeze({
    prepareLatest: (policy: Parameters<ElectronStandaloneContentUpdaterPort["prepareLatest"]>[0]) => requireWarmupState(preparedRuntime, "a prepared Standalone runtime").contentUpdater.prepareLatest(policy),
    async applyNow(options: Parameters<ElectronStandaloneContentUpdaterPort["applyNow"]>[0]) {
      if (context.startup?.phase !== "committed" || rendererShutdown.signal.aborted || rendererReplacement != null) {
        throw new Error("Electron renderer is not available for a content update");
      }
      const replacing = (async () => {
        const applied = await requireWarmupState(preparedRuntime, "a prepared Standalone runtime").contentUpdater.applyNow(options);
        if (applied.status === "blocked") return applied;
        const signal = rendererSignal();
        rendererLease = await replaceElectronRendererLease({
          previous: requireWarmupState(rendererLease, "a renderer lease"),
          mount: () => mountRenderer(applied.binding, signal, randomUUID()),
          reveal: (lease) => { signal.throwIfAborted(); focusElectronWindow(lease.window, presentation, "initial-reveal"); },
        });
        generationBinding = applied.binding;
        generation = applied.generation;
        context.log?.write("renderer.generation.committed", { generationId: applied.generation.id, bindingDigest: applied.binding.digest });
        return applied;
      })();
      rendererReplacement = replacing;
      try { return await replacing; }
      catch (error) {
        context.log?.write("renderer.generation.failed", { error });
        // A retired product endpoint must never remain presented as usable.
        app.quit();
        throw error;
      } finally { rendererReplacement = null; }
    },
  });

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
  if (process.platform === "darwin" && presentation === "interactive" && manifest.iconDataUrl != null) {
    const icon = nativeImage.createFromDataURL(manifest.iconDataUrl);
    if (icon.isEmpty()) throw new Error("Electron Shell icon could not be decoded");
    app.dock?.setIcon(icon);
  }
  await context.startupQuit.guard(applyElectronMacRuntimePolicy({ app, platform: process.platform, policy: definition.mac, presentation }));
  const splashStartedAt = Date.now();
  if (presentation === "interactive") {
    splash = new BrowserWindow({ width: appearance.splash.width, height: appearance.splash.height, frame: false, resizable: false, show: true, backgroundColor: appearance.splash.backgroundColor, webPreferences: { sandbox: true } });
    await context.startupQuit.guard(splash.loadURL(electronSplashHtml({ productName: manifest.productName, splash: appearance.splash }, definition.splashMedia)));
  }
  setSplashStage(splash, appearance.splash.initialLabel);

  warmup = runElectronWarmupTopology({
    topology: warmupTopology,
    executors: {
      ...definition.warmupExecutors,
      [ELECTRON_WARMUP_ATOMS.RESOLVE_STANDALONE]: async () => {
        authority = definition.createStandaloneAuthority({
          nodeRuntime,
          installedShellPath: process.platform === "darwin" ? resolve(dirname(process.execPath), "../..") : process.execPath,
          namespaceRoot: paths.namespaceRoot,
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
        });
        generation = preparedRuntime.generation;
        generationBinding = preparedRuntime.binding;
        startupSignal = context.startup!.bind(generationBinding.digest);
        const installerRecovery = await resolveElectronInstallerRecovery({ shell: manifest.shell, updater: preparedRuntime.updater });
        if (installerRecovery.state === "replacement-confirmation-required") {
            const claim = await preparedRuntime.readShellInstallationClaim();
            if (claim == null) throw new Error("Electron replacement Shell cannot confirm a missing installer claim");
            const confirmation = await preparedRuntime.confirmShellInstallation({ expected: claim.identity, proof: manifest.shell });
            context.log?.write("installer.replacement.confirmed", { installAttemptId: confirmation.installAttemptId });
            updaterRevisionAtStart = confirmation.updaterRevision;
        } else if (installerRecovery.state === "recovery-required") {
            const claim = await preparedRuntime.readShellInstallationClaim();
            context.log?.write("installer.recovery.required", { claim, installAttemptId: installerRecovery.request.installAttemptId });
            if (claim == null || definition.actions?.resolveInstallerRecovery == null) {
              throw new Error("Electron Shell pending installer handoff requires explicit recovery");
            }
            const intent = await definition.actions.resolveInstallerRecovery({ claim, snapshot: installerRecovery.snapshot });
            if (intent == null) throw new Error("Electron Shell pending installer handoff requires explicit recovery");
            const receipt = intent.action === "retry-original-artifact"
              ? await preparedRuntime.recoverShellInstallation({
                  request: {
                    ...intent,
                    installer: {
                      ...installerRecovery.request,
                      nodeExecutablePath: nodeRuntime.command,
                      parentPid: process.pid,
                      runtimeRoot,
                    },
                  },
                  install: definition.actions.installUpdate,
                })
              : await preparedRuntime.recoverShellInstallation({ request: intent });
            if (receipt.action === "retry-original-artifact" || receipt.state === "quit-required") {
              context.log?.write("installer.recovery.scheduled", { action: receipt.action, recoveryId: receipt.recoveryId });
              app.quit();
              return;
            }
            context.log?.write("installer.recovery.completed", { action: receipt.action, recoveryId: receipt.recoveryId });
            updaterRevisionAtStart = (await preparedRuntime.updater.readSnapshot()).revision;
        } else {
          updaterRevisionAtStart = installerRecovery.snapshot.revision;
        }
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
          rendererLease = await mountRenderer(generationBinding!, signal, startupSignal!.attemptId);
          context.startup!.advance(startupSignal!, "renderer-mounted");
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
  const runtimePrepared = requireWarmupState(preparedRuntime as ElectronStandalonePreparedRuntime | null, "a prepared Standalone runtime");
  const runtimeStandaloneHandle = requireWarmupState(runtimeHandle as StandaloneRuntimeHandle | null, "a Standalone runtime handle");
  const runtimeGeneration = requireWarmupState(generation as GenerationRecord | null, "a Standalone generation");
  requireWarmupState(status as StandaloneRuntimeStatus | null, "Standalone readiness");
  const runtimeUpdaterRevisionAtStart = requireWarmupState(updaterRevisionAtStart as number | null, "the updater revision");
  const runtimeRendererLease = requireWarmupState(rendererLease as ElectronRendererLease | null, "a renderer lease");
  setSplashStage(splash, appearance.splash.readyLabel);
  const remaining = presentation === "headless" ? 0 : appearance.splash.minimumVisibleMs - (Date.now() - splashStartedAt);
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
    rendererShutdown.abort(new Error("Electron renderer shutdown"));
    await rendererReplacement?.catch(() => undefined);
    try {
      await completeElectronShutdown({
        waitForHeartbeat() { /* Runtime-handle authorities own their leases. */ },
        async releaseRendererIntegration() { await rendererLease?.releaseIntegration(); },
        async disposeWarmup() { await startupWarmup.dispose(); },
        async releaseStandalone() { await runtimeStandaloneHandle.close(); },
        async stopActivation() { await context.activation?.stop(); },
        observe(failures) {
          context.log?.write(failures.length === 0 ? "shutdown.complete" : "shutdown.failed", { failures });
        },
        async flushObservation() { await context.log?.flush(); },
        destroyWindow() { rendererLease?.destroy(); },
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
  void observeElectronRuntimeTerminal({
    runtime: runtimeStandaloneHandle,
    isClosing: () => closing,
    async waitForRendererReplacement() { if (!rendererRecoveryParked) await rendererReplacement?.catch(() => undefined); },
    onTerminal(observation) { context.log?.write("standalone.terminal", observation); app.quit(); },
  }).catch((error: unknown) => { context.log?.write("standalone.observation.failed", { error }); app.quit(); });
  void observeElectronInstallerHandoff({
    afterRevision: runtimeUpdaterRevisionAtStart,
    isClosing: () => closing,
    updater: runtimePrepared.updater,
    async onHandoff(request) {
      if (definition.actions?.installUpdate == null) throw new Error("Electron Shell installer action is unavailable");
      const install = definition.actions.installUpdate;
      installerArming = runtimePrepared.armShellInstallation({
        request: {
          ...request,
          nodeExecutablePath: nodeRuntime.command,
          parentPid: process.pid,
          runtimeRoot,
        },
        install,
      }).then(() => undefined);
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

export async function runElectronCarrier(definition: ElectronCarrierDefinition): Promise<void> {
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
