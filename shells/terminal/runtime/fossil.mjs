import { createHash } from "node:crypto";
import { appendFile, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { convergeSidecarLaunch, getSidecarStatus, invokeSidecar, stopSidecars, withSidecarLifecycleLock } from "@open-design/sidecar";

const requestPath = process.env.OD_TERMINAL_FOSSIL_REQUEST_V1;
const resultPath = process.env.OD_TERMINAL_FOSSIL_RESULT_V1;
if (!requestPath || !resultPath) throw new Error("Terminal fossil exchange environment is incomplete");

let activeSidecarStamp = null;

const digestPattern = /^[a-f0-9]{64}$/;
const versionPattern = /^\d+\.\d+\.\d+$/;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const inside = (root, path) => {
  const value = relative(root, path);
  return value !== "" && !value.startsWith("..") && !isAbsolute(value);
};

function validateRequest(value) {
  if (value?.schemaVersion !== 1) throw new Error("unsupported fossil request schema");
  const operations = new Set(["probe", "start", "heartbeat", "release", "stop", "status", "prepare-update", "apply-update", "apply-update-force", "shell-update-status", "shell-update-check", "shell-update-download", "shell-update-install", "shell-update-later", "shell-update-force", "shell-update-confirm", "shell-update-abandon"]);
  if (!operations.has(value.operation)) throw new Error("unsupported fossil operation");
  if (!/^[a-z0-9]{1,12}$/.test(value.channel) || value.channel === "local") throw new Error("invalid exact channel");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.namespace)) throw new Error("invalid namespace");
  if (typeof value.carrierResolutionFile !== "string" || !isAbsolute(value.carrierResolutionFile)) throw new Error("invalid carrier resolution path");
  if (value.feedbackFile != null && (typeof value.feedbackFile !== "string" || !isAbsolute(value.feedbackFile))) throw new Error("invalid feedback path");
  if (value.operation !== "probe" && (typeof value.storeRoot !== "string" || !isAbsolute(value.storeRoot))) throw new Error("lifecycle operation requires an absolute Store root");
  if (value.namespaceRoot != null && (typeof value.namespaceRoot !== "string" || !isAbsolute(value.namespaceRoot) || resolve(value.namespaceRoot) !== value.namespaceRoot)) throw new Error("namespace root must be absolute and normalized");
  if (new Set(["start", "heartbeat", "release"]).has(value.operation) && !/^[A-Za-z0-9._-]{1,128}$/.test(value.attachmentId)) throw new Error(`${value.operation} requires an attachment id`);
  if (value.attachmentCapability != null && !/^[a-f0-9]{64}$/.test(value.attachmentCapability)) throw new Error("invalid attachment capability");
  if (value.operation === "prepare-update" && (typeof value.channelHeadUrl !== "string" || !/^(https?:|file:)\/\//.test(value.channelHeadUrl))) throw new Error("prepare-update requires a channel head URL");
  if (new Set(["prepare-update", "apply-update", "apply-update-force"]).has(value.operation) && value.updateProtocolVersion !== 3) throw new Error("unsupported Standalone updater protocol");
  if (value.operation === "prepare-update" && !new Set(["observe", "authorize-silent", "authorize-user", "revoke-silent"]).has(value.activationPolicy)) throw new Error("prepare-update requires an explicit activation policy");
  return value;
}

async function validateInstallation(value) {
  if (value?.schemaVersion !== 1 || value.shell?.type !== "terminal" || !versionPattern.test(value.shell?.version) || !digestPattern.test(value.shell?.digest)) throw new Error("invalid Shell identity");
  if (value.runtime?.name !== "node" || !versionPattern.test(value.runtime?.version) || !digestPattern.test(value.runtime?.digest)) throw new Error("invalid carrier runtime identity");
  const root = resolve(value.installRoot);
  const manifestPath = resolve(value.manifestFile);
  const executablePath = resolve(value.runtime.executablePath);
  if (!inside(root, manifestPath) || !inside(root, executablePath)) throw new Error("carrier resolution escaped install root");
  const manifestBytes = await readFile(manifestPath);
  if (sha256(manifestBytes) !== value.shell.digest) throw new Error("Shell manifest binding failed");
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest?.schemaVersion !== 1 || manifest.shell?.type !== "terminal" || manifest.shell?.version !== value.shell.version || !digestPattern.test(manifest.shell?.buildHash) || manifest.target !== value.target) throw new Error("installed manifest identity mismatch");
  if (manifest.runtime?.name !== "node" || manifest.runtime?.version !== value.runtime.version || manifest.runtime?.sha256 !== value.runtime.digest) throw new Error("installed runtime binding mismatch");
  const descriptorPath = (descriptor) => descriptor?.file ?? descriptor?.entrypoint;
  const descriptors = [manifest.carrierLock, manifest.contracts, manifest.runtimeModules, manifest.fossil, manifest.sidecarBootstrap, manifest.sidecarHost, manifest.standalone, manifest.seed?.closure, manifest.seed?.standaloneLauncher, manifest.releaseDocuments?.content, manifest.trust,
    manifest.shellFiles?.sh?.terminal, manifest.shellFiles?.sh?.install, manifest.shellFiles?.ps1?.terminal, manifest.shellFiles?.ps1?.install];
  for (const descriptor of descriptors) {
    const entrypoint = descriptorPath(descriptor);
    if (typeof entrypoint !== "string" || !digestPattern.test(descriptor?.sha256)) throw new Error("invalid installed artifact descriptor");
    const path = resolve(root, normalize(entrypoint));
    if (!inside(root, path) || sha256(await readFile(path)) !== descriptor.sha256) throw new Error(`installed artifact failed verification: ${entrypoint}`);
  }
  const contractIndex = await readJson(resolve(root, manifest.contracts.file));
  if (contractIndex?.schemaVersion !== 1 || !Array.isArray(contractIndex.files) || contractIndex.files.length === 0) throw new Error("invalid contract index");
  for (const descriptor of contractIndex.files) {
    const path = resolve(root, normalize(descriptor?.file));
    if (typeof descriptor?.file !== "string" || !digestPattern.test(descriptor?.sha256) || !inside(root, path) || sha256(await readFile(path)) !== descriptor.sha256) throw new Error("installed contract bundle failed verification");
  }
  const moduleIndex = await readJson(resolve(root, manifest.runtimeModules.file));
  if (moduleIndex?.schemaVersion !== 1 || !Array.isArray(moduleIndex.files) || moduleIndex.files.length === 0) throw new Error("invalid runtime module index");
  for (const descriptor of moduleIndex.files) {
    const path = resolve(root, normalize(descriptor?.file));
    if (typeof descriptor?.file !== "string" || !digestPattern.test(descriptor?.sha256) || !inside(root, path) || sha256(await readFile(path)) !== descriptor.sha256) throw new Error("installed runtime module failed verification");
  }
  const standalonePath = resolve(root, manifest.standalone.entrypoint);
  const standalone = await import(pathToFileURL(standalonePath).href);
  if (typeof standalone.canonicalJson !== "function" || typeof standalone.StandaloneStore !== "function" || typeof standalone.StandaloneUpdater !== "function") throw new Error("installed Standalone public API is incomplete");
  const packagesPath = "runtime/standalone/packages.mjs";
  if (!moduleIndex.files.some(descriptor => descriptor.file === packagesPath)
    || !moduleIndex.files.some(descriptor => descriptor.file === "carrier/node/platform.json")) throw new Error("physical package binding is missing from installation");
  const packages = await import(pathToFileURL(resolve(root, packagesPath)).href);
  const nodeRuntime = await packages.bindNodePlatform(resolve(root, "carrier/node"));
  if (nodeRuntime.command !== await realpath(executablePath)) throw new Error("physical package runtime differs from carrier resolution");
  const closure = await import(pathToFileURL(resolve(root, manifest.seed.closure.file)).href);
  if (typeof closure.prepareClosureShellUpdate !== "function") throw new Error("installed Closure public API is incomplete");
  return { root, manifest, manifestBytes, standalone, closure, nodeRuntime };
}

async function readUrl(url) {
  if (url.startsWith("file://")) return new Uint8Array(await readFile(new URL(url)));
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) throw new Error(`artifact request failed: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function physicalResourceStamps(scope) {
  return ["standalone", "daemon", "web", "electron-updater"].map((app) => Object.freeze({
    channel: scope.channel, namespace: scope.namespace, source: "standalone", mode: "runtime", app,
  }));
}

async function convergeTerminalSidecar(request, installation, guarded = false) {
  const stamp = Object.freeze({
    channel: request.channel,
    namespace: request.namespace,
    source: "standalone",
    mode: "runtime",
    app: "standalone",
  });
  const runtimeRoot = resolve(request.storeRoot, "sidecar-runtime");
  const sidecarHost = resolve(installation.root, installation.manifest.sidecarHost.entrypoint);
  const sidecarBootstrap = resolve(installation.root, installation.manifest.sidecarBootstrap.entrypoint);
  const layout = installation.standalone.resolveStandaloneRuntimeLayout({
    namespaceRoot: request.namespaceRoot ?? resolve(request.storeRoot, "channels", request.channel, "namespaces", request.namespace),
    resourceStoreRoot: resolve(request.storeRoot),
    sidecarSupervisorPath: resolve(installation.root, "runtime/node_modules/@open-design/sidecar/dist/supervisor.mjs"),
  });
  const config = {
    schemaVersion: 1,
    channel: request.channel,
    namespace: request.namespace,
    storeRoot: resolve(request.storeRoot),
    runtimeRoot,
    standaloneEntrypoint: resolve(installation.root, installation.manifest.standalone.entrypoint),
    sidecarHost,
    layout,
  };
  try {
    const existing = await getSidecarStatus(stamp, { timeoutMs: 500 });
    if (
      existing?.control !== "ready"
      || existing.dataRoot !== config.storeRoot
      || existing.runtimeRoot !== runtimeRoot
      || !Number.isSafeInteger(existing.generationPid)
      || !Number.isSafeInteger(existing.hostPid)
    ) throw new Error("existing Terminal Sidecar differs from its launch contract");
    try {
      installation.standalone.validateStandaloneHostConnection(existing.connection, { scope: { channel: request.channel, namespace: request.namespace }, layout });
    } catch (cause) {
      throw new Error("existing Terminal Sidecar differs from its launch contract", { cause });
    }
    activeSidecarStamp = stamp;
    return {
      description: {
        ready: true,
        resources: {
          dataRoot: existing.dataRoot,
          ownerPid: null,
          pid: existing.generationPid,
          port: 0,
          runtimeRoot: existing.runtimeRoot,
        },
        stamp,
      },
      status: existing,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "existing Terminal Sidecar differs from its launch contract") throw error;
  }
  if (!guarded) return await withSidecarLifecycleLock(physicalResourceStamps(request), () => convergeTerminalSidecar(request, installation, true));
  const converged = await convergeSidecarLaunch({
    args: [sidecarBootstrap],
    command: installation.nodeRuntime.command,
    cwd: installation.root,
    env: { ...process.env, ...installation.nodeRuntime.env, OD_TERMINAL_SIDECAR_CONFIG_V1: JSON.stringify(config) },
    resources: { dataRoot: config.storeRoot, ownerPid: null, port: 0, runtimeRoot },
    stamp,
  });
  if (!converged.description.ready || JSON.stringify(converged.description.stamp) !== JSON.stringify(stamp)) {
    throw new Error("Terminal Sidecar convergence returned another resource identity");
  }
  activeSidecarStamp = stamp;
  const status = await getSidecarStatus(stamp, { generationPid: converged.description.resources.pid });
  if (
    status?.control !== "ready"
    || installation.standalone.canonicalJson(status.layout) !== installation.standalone.canonicalJson(layout)
    || status.generationPid !== converged.description.resources.pid
    || !Number.isSafeInteger(status.hostPid)
    || !Number.isSafeInteger(status.bootstrapPid)
    || status.hostPid === status.bootstrapPid
  ) throw new Error("Terminal Sidecar did not prove its supervised fossil handoff");
  return { description: converged.description, status };
}

async function sidecarControlRequest(standalone, message) {
  if (activeSidecarStamp == null) throw new Error("Terminal Sidecar has not converged");
  return await invokeSidecar(activeSidecarStamp, standalone.STANDALONE_HOST_CONTROL_ACTION, message, {
    timeoutMs: standalone.standaloneHostControlRequestTimeoutMs(message),
  });
}

function sidecarLifecycle(standalone, request) {
  const scope = { channel: request.channel, namespace: request.namespace };
  const client = new standalone.StandaloneHostControlClient(scope, message => sidecarControlRequest(standalone, message));
  if (request.attachmentCapability != null) client.restoreAttachmentCredential({
    schemaVersion: 1, scope, attachmentId: request.attachmentId ?? "terminal-control",
    attachmentCapability: request.attachmentCapability,
  });
  return client;
}

function sidecarShellUpdater(standalone, scope, shellType) {
  return new standalone.StandaloneHostControlUpdater(shellType, scope, message => sidecarControlRequest(standalone, message));
}

async function trustedKeys(installation) {
  const value = await readJson(resolve(installation.root, installation.manifest.trust.file));
  if (value?.schemaVersion !== 1 || !Array.isArray(value.keys) || value.keys.length === 0) throw new Error("invalid trusted key document");
  const keys = new Map();
  for (const entry of value.keys) {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(entry?.keyId) || typeof entry?.publicKey !== "string" || keys.has(entry.keyId)) throw new Error("invalid trusted key entry");
    keys.set(entry.keyId, entry.publicKey);
  }
  return keys;
}

async function ensureInstalledSeed(request, installation, store, keys, feedback) {
  // A healthy channel-scoped Store no longer depends on the carrier's seed.
  // In particular, recovery must not replace its verified generation with the
  // baseline shipped for another channel.
  if ((await store.readState()).lastHealthy != null) return;
  const envelope = await readJson(resolve(installation.root, installation.manifest.releaseDocuments.content.file));
  installation.standalone.verifyStandaloneMetadata(envelope, keys);
  if (envelope.metadata.channel !== request.channel) throw new Error("installed seed belongs to another channel");
  const expectedId = installation.standalone.sha256Hex(installation.standalone.canonicalJson(envelope.metadata));
  let state = await store.readState();
  if (state.lastHealthy == null && state.activationAttempt != null && state.activationAttempt.generationId !== expectedId) {
    await store.recoverInterruptedAttempt();
    state = await store.readState();
  }
  if (state.lastHealthy == null && state.active == null && state.prepared !== expectedId) {
    const candidates = {};
    for (const seed of [installation.manifest.seed.closure, installation.manifest.seed.standaloneLauncher]) {
      const seedBytes = new Uint8Array(await readFile(resolve(installation.root, seed.file)));
      const declared = envelope.metadata.blobs?.[seed.sha256];
      if (declared == null || declared.size !== seedBytes.byteLength) {
        const error = new Error("required installed seed is incomplete");
        error.code = "resource-unavailable";
        throw error;
      }
      candidates[seed.sha256] = [{ path: resolve(installation.root, seed.file), source: "shell" }];
    }
    await store.prepare(envelope, keys, { candidates, feedback });
    state = await store.readState();
  }
  if (state.active == null && state.prepared === expectedId && state.activationIntent?.generationId !== expectedId) {
    await store.authorizePrepared(expectedId, "silent", "installed-seed", state.revision);
  }
}

async function execute(request, installation) {
  if (["start", "stop", "apply-update", "apply-update-force"].includes(request.operation)) {
    return await withSidecarLifecycleLock(physicalResourceStamps(request), () => executeOperation(request, installation, true));
  }
  return await executeOperation(request, installation, false);
}

async function executeOperation(request, installation, guarded) {
  if (request.operation === "probe") return { capabilities: installation.manifest.capabilities, channel: request.channel, namespace: request.namespace };
  const sidecarConvergence = await convergeTerminalSidecar(request, installation, guarded);
  let sidecarDescription = sidecarConvergence.description;
  let currentSidecarStatus = sidecarConvergence.status;
  const sidecar = () => Object.freeze({
    bootstrapPid: currentSidecarStatus.bootstrapPid,
    generationPid: sidecarDescription.resources.pid,
    hostPid: currentSidecarStatus.hostPid,
    status: "ready",
  });
  const { standalone } = installation;
  const keys = await trustedKeys(installation);
  const storeRoot = resolve(request.storeRoot);
  const store = new standalone.StandaloneStore(storeRoot, { channel: request.channel, namespace: request.namespace });
  const lifecycle = sidecarLifecycle(standalone, request);
  const shell = {
    type: "terminal",
    version: installation.manifest.shell.version,
    buildHash: installation.manifest.shell.buildHash,
    digest: sha256(installation.manifestBytes),
  };
  const feedback = request.feedbackFile == null ? undefined : async (event) => appendFile(request.feedbackFile, `${JSON.stringify(event)}\n`, "utf8");
  const launcher = new standalone.VersionedLauncher(store, lifecycle, shell, request.attachmentId ?? "terminal-control", feedback);
  const bootloader = new standalone.FossilBootloader(store, shell, async () => launcher);
  if (request.operation.startsWith("shell-update-")) {
    const updater = sidecarShellUpdater(standalone, { channel: request.channel, namespace: request.namespace }, shell.type);
    const action = ({
      "shell-update-check": "check",
      "shell-update-download": "download",
      "shell-update-install": "install",
      "shell-update-later": "later",
      "shell-update-force": "force-stop-and-install",
      "shell-update-abandon": "abandon",
    })[request.operation];
    if (request.operation === "shell-update-confirm") {
      throw new Error("Terminal installation confirmation requires an installed identity bound to a durable installer claim");
    }
    return action == null ? updater.readSnapshot() : updater.invoke(action);
  }
  if (request.operation === "start") {
    await ensureInstalledSeed(request, installation, store, keys, feedback);
    const scope = { channel: request.channel, namespace: request.namespace };
    const current = await lifecycle.status(scope);
    const state = await store.readState();
    if (current.references > 0 && state.activationIntent != null && state.prepared !== current.generationId) {
      throw new standalone.StandaloneBootstrapError("standalone-occupied", "cold activation cannot replace an occupied generation");
    }
    if (current.references === 0) {
      const ledger = new standalone.StandaloneHostLifecycleLedger(storeRoot, scope);
      const before = await ledger.readOrInitial();
      if (before.transition?.kind === "shell-install") throw new Error("Shell installation must complete before Terminal start");
      const physical = await stopSidecars(physicalResourceStamps(request).map((stamp) => ({ stamp })));
      if (physical.remainingPids.length > 0) throw new Error("Terminal cold start retirement left physical survivors");
      const continuation = new standalone.StandaloneHostLifecycle(scope, { statePort: ledger });
      const stopped = await continuation.status();
      const durable = await ledger.readOrInitial();
      if (durable.transition != null) {
        await continuation.forceStopTransition(durable.transition.token, durable.transition.fence);
      } else if (stopped.state !== "stopped") await continuation.stop(stopped.fence);
      const replacement = await convergeTerminalSidecar(request, installation, true);
      sidecarDescription = replacement.description;
      currentSidecarStatus = replacement.status;
    }
    const status = await bootloader.start();
    return { ...status, attachmentCapability: lifecycle.exportAttachmentCredential(request.attachmentId ?? "terminal-control").attachmentCapability, sidecar: sidecar() };
  }
  if (request.operation === "heartbeat") return { ...await launcher.heartbeat(), sidecar: sidecar() };
  if (request.operation === "release") return { ...await launcher.release(), sidecar: sidecar() };
  if (request.operation === "status") {
    const lifecycleStatus = await launcher.status();
    const physicalStatus = await getSidecarStatus(activeSidecarStamp, { generationPid: sidecarDescription.resources.pid });
    return {
      ...lifecycleStatus,
      sidecar: {
        bootstrapPid: physicalStatus.bootstrapPid,
        generationPid: sidecarDescription.resources.pid,
        hostPid: physicalStatus.hostPid,
        status: physicalStatus.control,
      },
    };
  }
  if (request.operation === "stop") {
    const physical = await stopSidecars(physicalResourceStamps(request).map((stamp) => ({ stamp })));
    if (physical.remainingPids.length > 0) throw new Error("Terminal physical resource retirement left survivors");
    const scope = { channel: request.channel, namespace: request.namespace };
    const ledger = new standalone.StandaloneHostLifecycleLedger(storeRoot, scope);
    const continuation = new standalone.StandaloneHostLifecycle(scope, { statePort: ledger });
    const current = await continuation.status();
    const durable = await ledger.readOrInitial();
    if (durable.transition != null) await continuation.forceStopTransition(durable.transition.token, durable.transition.fence);
    else await continuation.stop(current.fence);
    const stopped = await continuation.status();
    return { ...stopped, sidecar: { generationPid: sidecarDescription.resources.pid, remainingPids: physical.remainingPids } };
  }
  const source = request.operation === "prepare-update"
      ? {
        readChannelHead: async () => JSON.parse(Buffer.from(await readUrl(request.channelHeadUrl)).toString("utf8")),
        readDocument: readUrl,
        prepare: { fetch: globalThis.fetch },
      }
      : {
        readChannelHead: async () => { throw new Error("unused update source"); },
        readDocument: async () => { throw new Error("unused update source"); },
      };
  const updater = new standalone.StandaloneUpdater(request.channel, "content", shell, keys, store, source, feedback);
  if (request.operation === "prepare-update") {
    const preparation = await updater.prepareLatest(request.activationPolicy);
    if (preparation.status !== "shell-reinstall-required") return preparation;
    // No native installer provider is registered yet. Preserve the explicit
    // compatibility requirement without manufacturing a candidate or success.
    return installation.closure.prepareClosureShellUpdate({ requirement: preparation.requirement, shell, updater: null });
  }
  if (!guarded) throw new Error("Terminal content update requires the complete physical resource guard");
  const scope = { channel: request.channel, namespace: request.namespace };
  const ledger = new standalone.StandaloneHostLifecycleLedger(storeRoot, scope);
  const continuation = new standalone.StandaloneHostLifecycle(scope, { statePort: ledger });
  let retired = false;
  let hostAvailable = true;
  const retire = async () => {
    const physical = await stopSidecars(physicalResourceStamps(request).map((stamp) => ({ stamp })));
    if (physical.remainingPids.length > 0) throw new Error("Terminal content retirement left physical survivors");
    retired = true;
    hostAvailable = false;
  };
  const updateLifecycle = {
    start: async () => { throw new Error("Terminal content restart requires a bound transition"); },
    status: (scope) => hostAvailable ? lifecycle.status(scope) : continuation.status(),
    awaitReady: (scope, readiness) => lifecycle.awaitReady(scope, readiness),
    heartbeat: (scope, attachment) => lifecycle.heartbeat(scope, attachment),
    release: (scope, id) => lifecycle.release(scope, id),
    stop: (scope, fence) => hostAvailable ? lifecycle.stop(scope, fence) : continuation.stop(fence),
    async beginTransition(scope, kind, options) {
      // The live host owns all writes until the complete physical set retires.
      const acquired = await lifecycle.beginTransition(scope, kind, options);
      if (acquired.state === "blocked") return acquired;
      const live = acquired.transition;
      let sealed = null;
      return {
        state: "acquired",
        transition: {
          attemptId: live.attemptId,
          get fence() { return sealed?.fence ?? live.fence; },
          get expiresAt() { return sealed?.expiresAt ?? live.expiresAt; },
          heartbeatIntervalMs: live.heartbeatIntervalMs,
          occupants: live.occupants,
          get phase() { return sealed?.phase ?? live.phase; },
          async renew() {
            if (sealed == null) await live.renew();
            else sealed = await continuation.renewTransition(sealed.token, sealed.fence);
          },
          async release() {
            if (sealed == null) await live.release();
            else await continuation.releaseTransition(sealed.token, sealed.fence);
          },
          async forceStop() {
            await retire();
            sealed = await continuation.forceStopTransition(live.attemptId, sealed?.fence ?? live.fence);
          },
          async completeBoundStart(generation, attachment, binding) {
            if (sealed == null) throw new Error("Terminal content restart requires physical retirement and a sealed transition");
            await convergeTerminalSidecar(request, installation, true);
            hostAvailable = true;
            return await lifecycle.completeTransitionStart(sealed.token, sealed.fence, generation, attachment, binding);
          },
        },
      };
    },
  };
  const updateLauncher = new standalone.VersionedLauncher(store, updateLifecycle, shell, request.attachmentId ?? "terminal-control", feedback);
  let result;
  try {
    result = await updater.applyNow(updateLauncher, { force: request.operation === "apply-update-force" });
  } catch (error) {
    if (!retired) throw error;
    // Never leave a failed replacement alive or silently reopen its lifecycle.
    // Store owns attempt rollback; this adapter preserves a sealed recovery stop.
    try {
      await retire();
      const state = await ledger.readOrInitial();
      const recovery = await continuation.beginTransition("content-restart", {
        ...(state.transition == null ? {} : { attemptId: state.transition.token }),
        force: true,
      });
      if (recovery.state !== "acquired") throw new Error("Terminal failed update could not retain its recovery transition");
      await continuation.forceStopTransition(recovery.transition.token, recovery.transition.fence);
    } catch (recoveryError) {
      throw new AggregateError([error, recoveryError], "Terminal content update and physical recovery sealing failed");
    }
    throw error;
  }
  if (result.status !== "applied") return result;
  return { ...result, lifecycle: { ...result.lifecycle, attachmentCapability: lifecycle.exportAttachmentCredential(request.attachmentId ?? "terminal-control").attachmentCapability } };
}

let operation = "unknown";
let phase = "request";
try {
  const request = validateRequest(await readJson(requestPath));
  operation = request.operation;
  phase = "installation";
  const resolution = await readJson(request.carrierResolutionFile);
  const installation = await validateInstallation(resolution);
  phase = "operation";
  const result = await execute(request, installation);
  await writeFile(resultPath, `${JSON.stringify({ schemaVersion: 1, outcome: "ready", operation, shell: resolution.shell, result })}\n`, "utf8");
} catch (error) {
  const allowed = new Set(["installer-required", "no-generation", "resource-unavailable", "standalone-occupied", "standalone-start-failed"]);
  const code = allowed.has(error?.code) ? error.code : phase === "request" ? "invalid-request" : phase === "installation" ? "invalid-installation" : "operation-failed";
  await writeFile(resultPath, `${JSON.stringify({ schemaVersion: 1, outcome: "rejected", operation, error: { code, message: error instanceof Error ? error.message : String(error) } })}\n`, "utf8");
  process.exitCode = 1;
}
