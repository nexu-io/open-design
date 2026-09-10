import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { BrowserWindow, app, dialog, ipcMain } from "electron";
import { startElectronUpdateScheduler } from "./update-scheduler.js";
import type {
  GenerationRecord, StandaloneGenerationBinding, StandaloneHandoffAttachment,
  StandaloneRuntimeHandle, StandaloneRuntimeStatus, StandaloneShellCapabilityRequest,
  StandaloneShellCapabilityPort, StandaloneScope, NodeRuntimeBinding,
} from "@open-design/standalone";
import {
  validateElectronShellAppearance,
  type ElectronRendererLease, type ElectronShellDefinition, type ElectronStartupPresentation,
  type ElectronStandaloneAuthority, type ElectronStandalonePreparedRuntime,
  type ElectronStandaloneContentUpdaterPort,
  type ElectronStartupProgress,
} from "@open-design/electron-kit/contracts";
import {
  completeElectronShutdown, observeElectronUpdateHandoff, resolveElectronInstallerRecovery,
  ELECTRON_WARMUP_ATOMS, runElectronWarmupTopology, validateElectronRuntimeWarmupTopology,
  type ElectronWarmupRun, type ElectronStartupSignal, type ElectronCapsuleSession, type ElectronCapsuleReady,
  focusElectronWindow,
  createElectronRendererMountAcknowledgement, mountElectronRendererLease,
  replaceElectronRendererLease, observeElectronRuntimeTerminal,
  awaitElectronRendererRecoveryDecision, ElectronRendererCrashBreaker,
} from "@open-design/electron-kit/runtime";

function requireWarmupState<T>(value: T | null, label: string): T {
  if (value == null) throw new Error(`Electron warmup completed without ${label}`);
  return value;
}

/** Updatable orchestration over the established physical carrier session.
 * No second lifecycle authority, process singleton or platform discovery. */
export async function runElectronCapsule(
  definition: ElectronShellDefinition,
  context: ElectronCapsuleSession,
): Promise<ElectronCapsuleReady> {
  const { manifest, shell, presentation, paths, preflight, resourceRoot, processErrors } = context;
  const sessionNamespace = context.namespace;
  const runtimeRoot = paths.runtimeRoot;
  let rendererLease: ElectronRendererLease | null = null;
  let splash: BrowserWindow | null = null;
  let startupPresentation: ElectronStartupPresentation | null = null;
  const handoffs = context.ingress.queue;
  const dispatch = (url: string) => {
    if (context.startupQuit.cancelled) return;
    void Promise.resolve(definition.actions?.openDeepLink?.(url));
  };
  context.ingress.bindReceiver(event => {
    if (context.startupQuit.cancelled) return true;
    const reason = event.type === "deep-link" ? "deep-link" : event.source;
    if (rendererLease != null) {
      focusElectronWindow(rendererLease.window, presentation, reason);
      if (event.type === "deep-link") dispatch(event.url);
      return true;
    }
    focusElectronWindow(splash, presentation, reason);
    return false;
  });
  const appearance = validateElectronShellAppearance(definition.appearance);
  const warmupTopology = validateElectronRuntimeWarmupTopology(definition.warmup);
  const scope: StandaloneScope = { channel: manifest.channel, namespace: sessionNamespace };
  const attachment: StandaloneHandoffAttachment = { id: `electron-${process.pid}-${randomUUID()}`, shell };
  let authority: ElectronStandaloneAuthority | null = null;
  let preparedRuntime: ElectronStandalonePreparedRuntime | null = null;
  let preparationAcquisition: Promise<ElectronStandalonePreparedRuntime> | null = null;
  let generation: GenerationRecord | null = null;
  let generationBinding: StandaloneGenerationBinding | null = null;
  let startupSignal: ElectronStartupSignal | null = null;
  let status: StandaloneRuntimeStatus | null = null;
  let runtimeHandle: StandaloneRuntimeHandle | null = null;
  let updaterRevisionAtStart: number | null = null;
  let contentGenerationAtStart: string | null = null;
  let warmup: ElectronWarmupRun | null = null;
  let runtimeAcquisition: Promise<StandaloneRuntimeHandle> | null = null;
  let platformAcquisition: Promise<NodeRuntimeBinding> | null = null;
  let rendererMount: Promise<void> | null = null;
  const rendererShutdown = new AbortController();
  let rendererReplacement: Promise<unknown> | null = null;
  let rendererRecoveryParked = false;
  let closing = false;
  let removeQuitListener = () => {};
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
    readPrepared: () => requireWarmupState(preparedRuntime, "a prepared Standalone runtime").contentUpdater.readPrepared(),
    prepareLatest: (policy: Parameters<ElectronStandaloneContentUpdaterPort["prepareLatest"]>[0]) => requireWarmupState(preparedRuntime, "a prepared Standalone runtime").contentUpdater.prepareLatest(policy),
    prepareFromHead: (...args: Parameters<ElectronStandaloneContentUpdaterPort["prepareFromHead"]>) => requireWarmupState(preparedRuntime, "a prepared Standalone runtime").contentUpdater.prepareFromHead(...args),
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

  context.registerCleanup({
    async disposeWarmup() {
      closing = true;
      removeQuitListener();
      rendererShutdown.abort(new Error("Electron startup cancelled"));
      await warmup?.dispose();
    },
    async settleRendererMount() {
      await platformAcquisition?.catch(() => undefined);
      await rendererMount?.catch(() => undefined);
    },
    async releaseRendererIntegration() { await rendererLease?.releaseIntegration(); },
    async releaseStandaloneAttachment() {
      const prepared = await preparationAcquisition?.catch(() => null);
      const acquired = await runtimeAcquisition?.catch(() => null);
      try { await (runtimeHandle ?? acquired)?.close(); }
      finally { await prepared?.dispose(); }
    },
  });

  const splashStartedAt = Date.now();
  if (presentation === "interactive") {
    startupPresentation = await context.startupQuit.guard(definition.createStartupPresentation());
    splash = startupPresentation.window;
  }
  let lastProgressAt = 0;
  let lastProgressKey = "";
  let progressMode: ElectronStartupProgress["mode"] = "startup";
  let startupProgressComplete = false;
  const observeProgress = (progress: ElectronStartupProgress) => {
    if (context.startupQuit.cancelled) return;
    const now = Date.now(), key = `${progress.label}:${progress.resourceId ?? ""}`;
    if (progress.state === "progress" && key === lastProgressKey && now - lastProgressAt < 250) return;
    lastProgressAt = now; lastProgressKey = key;
    progressMode = progress.mode ?? progressMode;
    if (!startupProgressComplete) startupPresentation?.setProgress({ ...progress, mode: progressMode });
    context.log?.write(startupProgressComplete ? "updater.progress" : "startup.progress", {
      ...progress, mode: startupProgressComplete ? "update" : progressMode, elapsedMs: now - splashStartedAt,
    });
  };
  observeProgress({ label: appearance.splash.initialLabel });

  // The local Capsule owns the first screen. Node/native preparation may need
  // I/O and must not precede that screen or escape the carrier's quit barrier.
  platformAcquisition = definition.prepareNodeRuntime({ runtimeRoot, platform: context.platform, signal: rendererShutdown.signal, scope, observeProgress });
  const nodeRuntime = await context.startupQuit.guard(platformAcquisition);
  context.log.write("platform.ready", { command: nodeRuntime.command });

  warmup = runElectronWarmupTopology({
    topology: warmupTopology,
    executors: {
      ...definition.warmupExecutors,
      [ELECTRON_WARMUP_ATOMS.RESOLVE_STANDALONE]: async ({ signal }) => {
        signal.throwIfAborted();
        authority = definition.createStandaloneAuthority({
          nodeRuntime,
          installedShellPath: process.platform === "darwin" ? resolve(dirname(process.execPath), "../..") : process.execPath,
          namespaceRoot: paths.namespaceRoot,
          resourceRoot,
          runtimeRoot,
          observeFeedback(event) {
            if (!context.startupQuit?.cancelled) {
              observeProgress(definition.describeStartupFeedback(event));
            }
            if (event.state !== "progress") context.log?.write("standalone.feedback", { event });
          },
        });
        preparationAcquisition = authority.prepare({
          correlationId: randomUUID(),
          scope,
          shell,
        });
        preparedRuntime = await preparationAcquisition;
        try { contentGenerationAtStart = (await preparedRuntime.contentUpdater.readPrepared())?.generation.id ?? null; }
        catch (error) { context.log.write("updater.startup.content-unavailable", { error }); }
        signal.throwIfAborted();
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
      [ELECTRON_WARMUP_ATOMS.AWAIT_STANDALONE_READY]: async ({ signal }) => {
        signal.throwIfAborted();
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
      if (!context.startupQuit?.cancelled && event.state === "running") observeProgress({ label: event.node.label ?? event.node.id });
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
    if (!context.startupQuit.cancelled) await startupWarmup.dispose();
    throw error;
  }
  context.log.write("warmup.ready", { nodes: startupWarmup.snapshot() });
  const runtimePrepared = requireWarmupState(preparedRuntime as ElectronStandalonePreparedRuntime | null, "a prepared Standalone runtime");
  const runtimeStandaloneHandle = requireWarmupState(runtimeHandle as StandaloneRuntimeHandle | null, "a Standalone runtime handle");
  const runtimeGeneration = requireWarmupState(generation as GenerationRecord | null, "a Standalone generation");
  requireWarmupState(status as StandaloneRuntimeStatus | null, "Standalone readiness");
  const runtimeUpdaterRevisionAtStart = requireWarmupState(updaterRevisionAtStart as number | null, "the updater revision");
  const runtimeRendererLease = requireWarmupState(rendererLease as ElectronRendererLease | null, "a renderer lease");
  observeProgress({ label: appearance.splash.readyLabel, state: "complete" });
  startupProgressComplete = true;
  const remaining = presentation === "headless" ? 0 : appearance.splash.minimumVisibleMs - (Date.now() - splashStartedAt);
  if (remaining > 0) await context.startupQuit.guard(new Promise((resolve) => setTimeout(resolve, remaining)));
  const pendingHandoffs = handoffs.drain();
  focusElectronWindow(
    runtimeRendererLease.window,
    presentation,
    pendingHandoffs.length > 0 ? "second-instance" : "initial-reveal",
  );
  if (splash != null && !splash.isDestroyed()) splash.destroy();
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
  const beforeQuit = (event: { preventDefault(): void }) => {
    // Until the fixed carrier commits, its startup cancellation owns teardown.
    if (context.startup.phase !== "committed") return;
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
  removeQuitListener = () => app.removeListener("before-quit", beforeQuit);
  void observeElectronRuntimeTerminal({
    runtime: runtimeStandaloneHandle,
    isClosing: () => closing,
    async waitForRendererReplacement() { if (!rendererRecoveryParked) await rendererReplacement?.catch(() => undefined); },
    onTerminal(observation) { context.log?.write("standalone.terminal", observation); app.quit(); },
  }).catch((error: unknown) => { context.log?.write("standalone.observation.failed", { error }); app.quit(); });
  void observeElectronUpdateHandoff({
    afterRevision: runtimeUpdaterRevisionAtStart,
    isClosing: () => closing,
    updater: runtimePrepared.updater,
    async onHandoff(request) {
      if (request.handoff.interaction === "restart-and-activate") {
        const handoff = request.handoff;
        const scheduleRestart = definition.actions?.scheduleRestart;
        if (scheduleRestart == null) throw new Error("Electron Shell restart action is unavailable");
        installerArming = (async () => {
          await runtimePrepared.armShellRestart({ handoff, installAttemptId: request.installAttemptId });
          await scheduleRestart();
          context.log?.write("shell.restart.armed", { installAttemptId: request.installAttemptId });
        })();
        await installerArming;
        app.quit();
        return;
      }
      if (definition.actions?.installUpdate == null) throw new Error("Electron Shell installer action is unavailable");
      const install = definition.actions.installUpdate;
      installerArming = runtimePrepared.armShellInstallation({
        request: {
          ...request,
          handoff: request.handoff,
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
  return { signal: startupSignal!, generationId: runtimeGeneration.id,
    async afterCommit() {
      for (const ingress of pendingHandoffs) if (ingress.type === "deep-link") dispatch(ingress.url);
      await definition.actions?.observeCommitted?.();
      const backgroundUpdates = definition.backgroundUpdates;
      if (backgroundUpdates != null && !rendererShutdown.signal.aborted) {
        startElectronUpdateScheduler({
          schedule: backgroundUpdates.schedule,
          signal: rendererShutdown.signal,
          check: signal => backgroundUpdates.check({ signal,
            contentUpdater: rendererContentUpdater, shellUpdater: runtimePrepared.updater,
            startupShellRevision: runtimeUpdaterRevisionAtStart,
            startupContentGenerationId: contentGenerationAtStart,
            runtime: { attachment, binding: requireWarmupState(generationBinding, "a generation binding"), handle: runtimeStandaloneHandle },
          }),
          observe: (event, detail) => context.log.write(`updater.background.${event}`, { detail }),
        });
      }
    },
  };
}
