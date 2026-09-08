import { join } from "node:path";
import { BrowserWindow, app, nativeImage, protocol } from "electron";
import { canonicalJson } from "@open-design/standalone";
import { bindNodePlatform } from "@open-design/standalone/packages";
import {
  validateElectronShellManifest, validateElectronShellAppearance,
  type ElectronShellManifest,
} from "../contracts/index.js";
import { applyElectronMacRuntimePolicy } from "../platform/macos/index.js";
import { ElectronActivationAttempt } from "./session/activation.js";
import { installElectronLaunchIngress } from "./session/launch-ingress.js";
import { ElectronRuntimeLog } from "./session/logging.js";
import { resolveElectronPresentationMode } from "./window/presentation.js";
import { resolveElectronSessionNamespace } from "./session/namespace-paths.js";
import { attachElectronProcessErrorHandlers, type ElectronProcessErrorLease } from "./session/process-errors.js";
import { prepareElectronCarrierIdentity, loadElectronCarrierCapsule } from "./startup/identity.js";
import { ElectronStartupAttemptFence } from "./startup/attempt.js";
import {
  completeElectronStartupCancellation, installElectronStartupQuitBarrier,
  isElectronStartupCancelledError, type ElectronStartupQuitBarrier,
} from "./startup/cancellation.js";
import type { ElectronCapsuleModule } from "./startup/capsule.js";
import type { ElectronCapsuleCleanup } from "./startup/capsule-session.js";
import type { ElectronPreflightTopology } from "./startup/preflight/index.js";

export * from "./session/logging.js";
export * from "./session/cdp.js";
export * from "./session/namespace-paths.js";
export * from "./session/process-errors.js";
export * from "./session/shutdown.js";
export * from "./session/single-instance.js";
export * from "./session/launch-ingress.js";
export * from "./session/update-handoff.js";
export * from "./startup/attempt.js";
export * from "./startup/cancellation.js";
export * from "./window/presentation.js";
export * from "./window/mount-acknowledgement.js";

export * from "./startup/capsule-session.js";
export * from "./session/terminal-observer.js";
export * from "./window/renderer-mount.js";
export * from "./window/crash-recovery.js";

type ElectronRuntimeContext = {
  activation: ElectronActivationAttempt | null;
  log: ElectronRuntimeLog | null;
  startup: ElectronStartupAttemptFence | null;
  startupQuit: ElectronStartupQuitBarrier | null;
  ingress: ReturnType<typeof installElectronLaunchIngress> | null;
  processErrors: ElectronProcessErrorLease | null;
};

export type ElectronCarrierDefinition = Readonly<{
  manifest: ElectronShellManifest;
  preflight: ElectronPreflightTopology;
  headless?: boolean;
  loadCapsule(manifest: ElectronShellManifest, installation: Readonly<{
    resourceRoot: string;
    runtimeRoot: string;
  }>): Promise<ElectronCapsuleModule>;
}>;

async function runElectronCarrierSession(input: ElectronCarrierDefinition, context: ElectronRuntimeContext): Promise<void> {
  const manifest = validateElectronShellManifest(input.manifest);
  // A same-process Capsule receives values, not permission to rewrite the OS
  // identity already used for paths, singleton ownership and platform binding.
  Object.freeze(manifest.shell);
  Object.freeze(manifest);
  const presentation = resolveElectronPresentationMode({ explicitHeadless: input.headless });
  const namespace = resolveElectronSessionNamespace(manifest.namespace, presentation);
  const ingress = installElectronLaunchIngress({ app, protocol: manifest.protocol, argv: process.argv });
  context.ingress = ingress;
  const identity = await prepareElectronCarrierIdentity({ app, protocol, platform: process.platform,
    productName: manifest.productName, scheme: manifest.protocol, channel: manifest.channel,
    namespace, preflight: input.preflight, presentation });
  if (identity == null) { ingress.dispose(); app.quit(); return; }
  const { paths, preflight } = identity;
  const log = new ElectronRuntimeLog(paths.runtimeRoot);
  context.log = log;
  const processErrors = attachElectronProcessErrorHandlers(event => {
    log.write(`process.${event.source}.${event.classification}`, { error: event.error });
  });
  context.processErrors = processErrors;
  log.write("preflight.complete", { namespace, pid: process.pid, platform: process.platform,
    presentation, runtimeRoot: paths.runtimeRoot, preflight });
  const resourceRoot = app.isPackaged ? process.resourcesPath : app.getAppPath();
  // Platform damage cannot consume generation or installer handoff state.
  const nodeRuntime = await loadElectronCarrierCapsule(app, async () => {
    const binding = await bindNodePlatform(join(resourceRoot, "platform"));
    log.write("platform.verified", { command: binding.command });
    return binding;
  });

  let cleanup: ElectronCapsuleCleanup | null = null;
  let activationAcquisition: Promise<ElectronActivationAttempt> | null = null;
  const startupQuit = installElectronStartupQuitBarrier({
    app,
    cancelAttempt() { ingress.dispose(); context.startup?.cancel(); },
    async cleanup(error) {
      try {
        await completeElectronStartupCancellation({
          async disposeWarmup() { await cleanup?.disposeWarmup(); },
          async settleRendererMount() { await cleanup?.settleRendererMount(); },
          async releaseRendererIntegration() { await cleanup?.releaseRendererIntegration(); },
          async releaseStandaloneAttachment() { await cleanup?.releaseStandaloneAttachment(); },
          async failActivation() {
            const activation = await activationAcquisition?.catch(() => null);
            await activation?.fail(error);
          },
          observe(failures) { log.write(failures.length === 0 ? "startup.cancelled" : "startup.cancellation.failed", { failures }); },
          async flushObservation() { await log.flush(); },
          destroyWindows() { for (const window of BrowserWindow.getAllWindows()) window.destroy(); },
        });
      } finally { processErrors.dispose(); }
    },
    observeFailure(error) { log.write("startup.cancellation.failed", { error }); },
  });
  context.startupQuit = startupQuit;
  activationAcquisition = ElectronActivationAttempt.begin(paths.runtimeRoot);
  const activation = await startupQuit.guard(activationAcquisition);
  context.activation = activation;
  const startup = new ElectronStartupAttemptFence(activation.attemptId);
  context.startup = startup;

  // The physical quit/activation barrier already exists when Capsule code runs.
  const capsule = await startupQuit.guard(input.loadCapsule(manifest, Object.freeze({ resourceRoot, runtimeRoot: paths.runtimeRoot })));
  const definition = capsule.createElectronCapsuleDefinition(manifest);
  if (canonicalJson(definition.manifest) !== canonicalJson(manifest) || "preflight" in definition) {
    throw new Error("Capsule cannot replace the established carrier identity or preflight");
  }
  validateElectronShellAppearance(definition.appearance);
  log.write("capsule.definition.loaded", { pid: process.pid });
  await startupQuit.guard(app.whenReady());
  if (process.platform === "darwin" && presentation === "interactive" && manifest.iconDataUrl != null) {
    const icon = nativeImage.createFromDataURL(manifest.iconDataUrl);
    if (icon.isEmpty()) throw new Error("Electron Shell icon could not be decoded");
    app.dock?.setIcon(icon);
  }
  await startupQuit.guard(applyElectronMacRuntimePolicy({ app, platform: process.platform, policy: definition.mac, presentation }));
  await startupQuit.guard(capsule.runElectronCapsule(definition, Object.freeze({
    manifest, presentation, namespace, paths, preflight, resourceRoot, nodeRuntime,
    log, processErrors, ingress, activation, startup, startupQuit,
    registerCleanup(steps: ElectronCapsuleCleanup) {
      if (startupQuit.cancelled) throw new Error("Electron Capsule cannot acquire cancelled startup owners");
      if (cleanup != null) throw new Error("Electron Capsule startup cleanup is already registered");
      cleanup = steps;
    },
  })));
}

export async function runElectronCarrier(definition: ElectronCarrierDefinition): Promise<void> {
  const context: ElectronRuntimeContext = { activation: null, log: null, startup: null, startupQuit: null,
    ingress: null, processErrors: null };
  try { await runElectronCarrierSession(definition, context); }
  catch (error) {
    context.ingress?.dispose();
    if (isElectronStartupCancelledError(error)) {
      await context.startupQuit?.settled;
      context.processErrors?.dispose();
      return;
    }
    context.startup?.cancel();
    await context.startupQuit?.cancel(error).catch(() => undefined);
    if (context.startupQuit == null) await context.activation?.fail(error).catch(() => undefined);
    context.log?.write("startup.failed", { error });
    await context.log?.flush();
    context.processErrors?.dispose();
    console.error("[electron-kit] Electron Shell startup failed", error);
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    app.exit(1);
  }
}
