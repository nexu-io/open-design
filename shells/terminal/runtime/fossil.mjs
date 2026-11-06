import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, normalize, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { convergeSidecarLaunch, getSidecarStatus, invokeSidecar, stopSidecar } from "@open-design/sidecar";

const requestPath = process.env.OD_TERMINAL_FOSSIL_REQUEST_V1;
const resultPath = process.env.OD_TERMINAL_FOSSIL_RESULT_V1;
if (!requestPath || !resultPath) throw new Error("Terminal fossil exchange environment is incomplete");

const sidecarAction = "standalone.request.v1";
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
  const descriptors = [manifest.carrierLock, manifest.contracts, manifest.runtimeModules, manifest.fossil, manifest.sidecarBootstrap, manifest.sidecarHost, manifest.fixtureLifecycle, manifest.fixtureShellUpdater, manifest.standalone, manifest.seed?.closure, manifest.seed?.standaloneLauncher, manifest.releaseDocuments?.content, manifest.trust,
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
  const closure = await import(pathToFileURL(resolve(root, manifest.seed.closure.file)).href);
  if (typeof closure.prepareClosureShellUpdate !== "function") throw new Error("installed Closure public API is incomplete");
  return { root, manifest, manifestBytes, standalone, closure };
}

async function readUrl(url) {
  if (url.startsWith("file://")) return new Uint8Array(await readFile(new URL(url)));
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) throw new Error(`artifact request failed: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function sidecarRequest(message) {
  if (activeSidecarStamp == null) throw new Error("Terminal Sidecar has not converged");
  return await invokeSidecar(activeSidecarStamp, sidecarAction, { schemaVersion: 1, ...message });
}

async function convergeTerminalSidecar(request, installation) {
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
  const config = {
    schemaVersion: 1,
    channel: request.channel,
    namespace: request.namespace,
    storeRoot: resolve(request.storeRoot),
    runtimeRoot,
    standaloneEntrypoint: resolve(installation.root, installation.manifest.standalone.entrypoint),
    sidecarHost,
  };
  try {
    const existing = await getSidecarStatus(stamp, { timeoutMs: 500 });
    if (
      existing?.control !== "ready"
      || existing.dataRoot !== config.storeRoot
      || existing.runtimeRoot !== runtimeRoot
      || !Number.isSafeInteger(existing.generationPid)
      || !Number.isSafeInteger(existing.hostPid)
      || !Number.isSafeInteger(existing.bootstrapPid)
    ) throw new Error("existing Terminal Sidecar differs from its launch contract");
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
  const converged = await convergeSidecarLaunch({
    args: [sidecarBootstrap],
    command: process.execPath,
    cwd: installation.root,
    env: { ...process.env, OD_TERMINAL_SIDECAR_CONFIG_V1: JSON.stringify(config) },
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
    || status.generationPid !== converged.description.resources.pid
    || !Number.isSafeInteger(status.hostPid)
    || !Number.isSafeInteger(status.bootstrapPid)
    || status.hostPid === status.bootstrapPid
  ) throw new Error("Terminal Sidecar did not prove its supervised fossil handoff");
  return { description: converged.description, status };
}

async function handoffTerminalSidecarGeneration(binding, convergence) {
  const previousHostPid = convergence.status.hostPid;
  const response = await sidecarRequest({
    domain: "generation",
    operation: "handoff",
    scope: binding.scope,
    bindingDigest: binding.digest,
    generationId: binding.generationId,
  });
  if (response?.accepted !== true || response.retiringHostPid !== previousHostPid) {
    throw new Error("Terminal Sidecar rejected an idle exact generation handoff");
  }
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const status = await getSidecarStatus(activeSidecarStamp, {
        generationPid: convergence.description.resources.pid,
        timeoutMs: 500,
      });
      if (status?.hostPid !== previousHostPid && status?.previousHostPid === previousHostPid) return status;
    } catch {}
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
  }
  throw new Error("Terminal Sidecar exact generation successor did not become ready");
}

function sidecarLifecycle(requestAttachmentCapability) {
  const call = (operation, scope, input = {}) => sidecarRequest({ domain: "lifecycle", operation, scope, ...input });
  return {
    start: (scope, generation, attachment, binding) => call("start", scope, { generation, binding, attachment, attachmentCapability: requestAttachmentCapability }),
    awaitReady: (scope, readiness) => call("ready", scope, { readiness }),
    heartbeat: (scope, attachment) => call("heartbeat", scope, { attachment, attachmentCapability: requestAttachmentCapability }),
    release: (scope, attachmentId) => call("release", scope, { attachmentId, attachmentCapability: requestAttachmentCapability }),
    status: (scope) => call("status", scope),
    stop: (scope, fence) => call("stop", scope, { fence }),
    occupants: (scope) => call("occupants", scope),
    async beginTransition(scope, kind, options) {
      const result = await call("begin-transition", scope, { kind, options });
      if (result.state === "blocked") return result;
      const descriptor = result.transition;
      const transitionCall = (action, input = {}) => call("transition", scope, { action, token: descriptor.token, ...input });
      return {
        state: "acquired",
        transition: {
          attemptId: descriptor.attemptId ?? descriptor.token,
          fence: descriptor.fence,
          expiresAt: descriptor.expiresAt,
          heartbeatIntervalMs: descriptor.heartbeatIntervalMs,
          occupants: descriptor.occupants,
          phase: descriptor.phase ?? "reserved",
          renew: () => transitionCall("renew"),
          release: () => transitionCall("release"),
          forceStop: () => transitionCall("force-stop"),
          completeBoundStart: (generation, attachment, binding) => transitionCall("complete-start", { generation, binding, attachment }),
        },
      };
    },
  };
}

function sidecarShellUpdater(scope, options) {
  const request = (operation, input = {}) => sidecarRequest({ domain: "shell-updater", operation, scope, options, ...input });
  return {
    shellType: options.shellType,
    readSnapshot: () => request("read"),
    waitForChange: (afterRevision, timeoutMs) => request("wait", { afterRevision, timeoutMs }),
    invoke: (action) => request("invoke", { action }),
    confirmInstalled: (proof) => request("confirm-installed", { proof }),
  };
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
  if (request.operation === "probe") return { capabilities: installation.manifest.capabilities, channel: request.channel, namespace: request.namespace };
  const sidecarConvergence = await convergeTerminalSidecar(request, installation);
  const sidecarDescription = sidecarConvergence.description;
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
  const lifecycle = sidecarLifecycle(request.attachmentCapability);
  const shell = {
    type: "terminal",
    version: installation.manifest.shell.version,
    buildHash: installation.manifest.shell.buildHash,
    digest: sha256(installation.manifestBytes),
  };
  const feedback = request.feedbackFile == null ? undefined : async (event) => appendFile(request.feedbackFile, `${JSON.stringify(event)}\n`, "utf8");
  const launcher = new standalone.VersionedLauncher(store, lifecycle, shell, request.attachmentId ?? "terminal-control", feedback);
  const bootloader = new standalone.FossilBootloader(store, shell, async (binding) => {
    const status = await lifecycle.status(binding.scope);
    if (status.state === "running" && status.references === 0) {
      currentSidecarStatus = await handoffTerminalSidecarGeneration(binding, {
        ...sidecarConvergence,
        status: currentSidecarStatus,
      });
    }
    return launcher;
  });
  if (request.operation.startsWith("shell-update-")) {
    const updaterOptions = {
      algebra: standalone.SHELL_UPDATE_ALGEBRA,
      attachmentId: request.attachmentId ?? `${shell.type}-updater`,
      shellType: shell.type,
    };
    const updater = sidecarShellUpdater({ channel: request.channel, namespace: request.namespace }, updaterOptions);
    const action = ({
      "shell-update-check": "check",
      "shell-update-download": "download",
      "shell-update-install": "install",
      "shell-update-later": "later",
      "shell-update-force": "force-stop-and-install",
      "shell-update-abandon": "abandon",
    })[request.operation];
    if (request.operation === "shell-update-confirm") {
      const snapshot = await updater.readSnapshot();
      return updater.confirmInstalled(snapshot.handoff?.shell);
    }
    return action == null ? updater.readSnapshot() : updater.invoke(action);
  }
  if (request.operation === "start") {
    await ensureInstalledSeed(request, installation, store, keys, feedback);
    return { ...await bootloader.start(), sidecar: sidecar() };
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
        previousHostPid: physicalStatus.previousHostPid,
        status: physicalStatus.control,
      },
    };
  }
  if (request.operation === "stop") {
    const stopped = await launcher.stop();
    const physical = await stopSidecar(activeSidecarStamp);
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
    const updaterOptions = {
      algebra: standalone.SHELL_UPDATE_ALGEBRA,
      attachmentId: request.attachmentId ?? `${shell.type}-updater`,
      channelHeadUrl: request.channelHeadUrl,
      shellType: shell.type,
      target: installation.manifest.target,
      trustedKeys: [...keys].map(([keyId, publicKey]) => ({ keyId, publicKey })),
    };
    const shellUpdater = sidecarShellUpdater({ channel: request.channel, namespace: request.namespace }, updaterOptions);
    return installation.closure.prepareClosureShellUpdate({ requirement: preparation.requirement, shell, updater: shellUpdater });
  }
  const prepared = await store.preparedGeneration();
  const currentLifecycle = await lifecycle.status({ channel: request.channel, namespace: request.namespace });
  if (prepared != null && currentLifecycle.state === "running" && currentLifecycle.references === 0) {
    const binding = standalone.createStandaloneGenerationBinding(prepared, { channel: request.channel, namespace: request.namespace });
    if (currentLifecycle.bindingDigest !== binding.digest) {
      await handoffTerminalSidecarGeneration(binding, sidecarConvergence);
    }
  }
  return updater.applyNow(launcher, { force: request.operation === "apply-update-force" });
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
