import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  bootstrapSidecarProcess,
  readCurrentSidecarStamp,
  SidecarClient,
  SidecarFactory,
} from "@open-design/sidecar";
import {
  FossilHandoffHost,
  createStandaloneShellUpdaterCapabilityHandler,
  validateShellIdentity,
  type StandaloneHandoffRequest,
  type StandaloneRuntimeHandle,
  type StandaloneRuntimeCommand,
} from "@open-design/standalone";

import {
  ELECTRON_STANDALONE_CONTROL_ACTION,
  validateElectronStandaloneControlRequest,
} from "./control-contract.js";
import { ElectronStandaloneHostLifecycle } from "./host-lifecycle.js";
import { ElectronStandaloneLifecycleLedger } from "./lifecycle-ledger.js";
import { ElectronStandaloneHostUpdater } from "./host-updater.js";
import { ElectronStandaloneShellUpdaterLedger } from "./shell-updater-ledger.js";
import { ElectronReleaseExactFeed } from "./release-feed.js";
import { ElectronStandaloneShellCandidateLedger } from "./shell-updater-candidate.js";
import { loadElectronStandaloneInstallation, resolveElectronStandaloneTarget, type ResolvedElectronStandaloneInstallation } from "./installation.js";

export const ELECTRON_STANDALONE_HOST_CONFIG_ENV = "OD_ELECTRON_STANDALONE_HOST_V1";

type HostConfig = Readonly<{
  schemaVersion: 1;
  scope: Readonly<{ channel: string; namespace: string }>;
  storeRoot: string;
  runtimeRoot: string;
  resourceRoot: string;
  hostPath: string;
  hostSha256: string;
  supervisorSha256: string;
  supervisorPath: string;
  shell: Readonly<{ type: string; version: string; buildHash: string; digest: string }>;
}>;

function readConfig(): HostConfig {
  const serialized = process.env[ELECTRON_STANDALONE_HOST_CONFIG_ENV];
  if (serialized == null) throw new Error(`${ELECTRON_STANDALONE_HOST_CONFIG_ENV} is required`);
  const value = JSON.parse(serialized) as Partial<HostConfig>;
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["hostPath", "hostSha256", "resourceRoot", "runtimeRoot", "schemaVersion", "scope", "shell", "storeRoot", "supervisorPath", "supervisorSha256"])) throw new Error("Electron Standalone host configuration fields are invalid");
  if (
    value.schemaVersion !== 1
    || value.scope == null
    || !/^[a-z0-9]{1,12}$/u.test(value.scope.channel ?? "")
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.scope.namespace ?? "")
    || typeof value.storeRoot !== "string"
    || typeof value.runtimeRoot !== "string"
    || typeof value.resourceRoot !== "string"
    || typeof value.hostPath !== "string"
    || typeof value.supervisorPath !== "string"
    || !/^[a-f0-9]{64}$/u.test(value.hostSha256 ?? "")
    || !/^[a-f0-9]{64}$/u.test(value.supervisorSha256 ?? "")
  ) throw new Error("Electron Standalone host configuration is invalid");
  const storeRoot = resolve(value.storeRoot);
  const runtimeRoot = resolve(value.runtimeRoot);
  const resourceRoot = resolve(value.resourceRoot);
  const hostPath = resolve(value.hostPath);
  const supervisorPath = resolve(value.supervisorPath);
  if (storeRoot !== value.storeRoot || runtimeRoot !== value.runtimeRoot || resourceRoot !== value.resourceRoot || hostPath !== value.hostPath || supervisorPath !== value.supervisorPath) throw new Error("Electron Standalone host paths must be absolute and normalized");
  if (value.shell == null || typeof value.shell !== "object" || Array.isArray(value.shell)
    || JSON.stringify(Object.keys(value.shell).sort()) !== JSON.stringify(["buildHash", "digest", "type", "version"])) throw new Error("Electron Standalone host Shell identity is invalid");
  const shell = value.shell as HostConfig["shell"];
  validateShellIdentity(shell);
  return Object.freeze({ schemaVersion: 1, scope: Object.freeze({ ...value.scope }), storeRoot, runtimeRoot, resourceRoot, hostPath, hostSha256: value.hostSha256!, supervisorPath, supervisorSha256: value.supervisorSha256!, shell: Object.freeze({ ...shell }) });
}

type PendingStart = Readonly<{
  bindingDigest: string;
  run(): Promise<Awaited<ReturnType<ElectronStandaloneHostLifecycle["start"]>>>;
}>;

class ElectronStandaloneHostRuntime {
  readonly lifecycle: ElectronStandaloneHostLifecycle;
  readonly updater: ElectronStandaloneHostUpdater;
  readonly #handoff: FossilHandoffHost;
  readonly #handles = new Map<string, Readonly<{
    attachment: StandaloneHandoffRequest["attachment"];
    handle: StandaloneRuntimeHandle;
  }>>();
  readonly #pending = new Map<string, PendingStart>();

  constructor(readonly config: HostConfig, installation: ResolvedElectronStandaloneInstallation) {
    this.lifecycle = new ElectronStandaloneHostLifecycle(config.scope, {
      statePort: new ElectronStandaloneLifecycleLedger(config.storeRoot, config.scope),
    });
    const updaterLedger = new ElectronStandaloneShellUpdaterLedger(config.storeRoot, config.scope, "electron");
    const feed = new ElectronReleaseExactFeed({
      cacheRoot: config.storeRoot,
      channel: config.scope.channel,
      channelHeadUrl: installation.declaration.update.channelHeadUrl,
      currentReleaseVersion: installation.declaration.releaseVersion,
      shell: config.shell,
      target: installation.declaration.target,
      trustedKeys: installation.trustedKeys,
    });
    this.updater = new ElectronStandaloneHostUpdater("electron", this.lifecycle, updaterLedger, {
      feed,
      candidates: new ElectronStandaloneShellCandidateLedger(config.storeRoot, config.scope, feed),
    });
    this.#handoff = new FossilHandoffHost(async (binding) => {
      const bytes = await readFile(binding.launcher.path);
      if (createHash("sha256").update(bytes).digest("hex") !== binding.launcher.blobSha256) {
        throw new Error("materialized Electron Standalone launcher failed its handoff binding");
      }
      const generation = await import(pathToFileURL(binding.launcher.path).href) as Record<string, unknown>;
      if (typeof generation.createStandaloneGenerationBootloader !== "function") {
        throw new Error("materialized Electron Standalone launcher lacks createStandaloneGenerationBootloader");
      }
      const createBootloader = generation.createStandaloneGenerationBootloader as (
        start: (request: StandaloneHandoffRequest) => Promise<StandaloneRuntimeHandle>,
      ) => (request: StandaloneHandoffRequest) => Promise<StandaloneRuntimeHandle>;
      return createBootloader(async (request) => {
        const pending = this.#pending.get(request.attachment.id);
        if (pending == null || pending.bindingDigest !== request.binding.digest) throw new Error("Electron Standalone generation body escaped its pending start");
        await pending.run();
        return this.#bodyHandle(request);
      });
    });
  }

  async request(input: unknown): Promise<unknown> {
    const request = validateElectronStandaloneControlRequest(input, this.config.scope);
    if (request.operation === "lifecycle.status") return await this.lifecycle.status();
    if (request.operation === "lifecycle.ready") return await this.lifecycle.awaitReady(request.readiness);
    if (request.operation === "lifecycle.heartbeat") return await this.lifecycle.heartbeat(request.attachment, request.attachmentCapability);
    if (request.operation === "lifecycle.release") {
      const status = await this.lifecycle.release(request.attachmentId, request.attachmentCapability);
      const active = this.#handles.get(request.attachmentId);
      if (active != null) {
        await active.handle.close();
        this.#handles.delete(request.attachmentId);
      }
      return status;
    }
    if (request.operation === "lifecycle.stop") {
      const status = await this.lifecycle.stop(request.fence);
      await Promise.all([...this.#handles.values()].map(({ handle }) => handle.close().catch(() => undefined)));
      this.#handles.clear();
      return status;
    }
    if (request.operation === "lifecycle.start") return await this.#start(request);
    if (request.operation === "runtime.invoke") {
      const active = this.#handles.get(request.command.attachmentId);
      if (active == null) throw new Error("Electron Standalone runtime attachment is unavailable");
      await this.lifecycle.heartbeat(active.attachment, request.attachmentCapability);
      return await active.handle.invoke(request.command);
    }
    if (request.operation === "transition.begin") return await this.lifecycle.beginTransition(request.kind, request.options);
    if (request.operation === "transition.renew") return await this.lifecycle.renewTransition(request.token, request.fence);
    if (request.operation === "transition.release") return await this.lifecycle.releaseTransition(request.token, request.fence);
    if (request.operation === "transition.force-stop") {
      const transition = await this.lifecycle.forceStopTransition(request.token, request.fence);
      await Promise.all([...this.#handles.values()].map(({ handle }) => handle.close().catch(() => undefined)));
      this.#handles.clear();
      return transition;
    }
    if (request.operation === "transition.complete-start") {
      return await this.#completeTransitionStart(request);
    }
    if (request.operation === "updater.read") {
      if (request.shellType !== this.updater.shellType) throw new Error("Electron Standalone updater Shell type differs from its host");
      return await this.updater.readSnapshot();
    }
    if (request.operation === "updater.wait") {
      if (request.shellType !== this.updater.shellType) throw new Error("Electron Standalone updater Shell type differs from its host");
      return await this.updater.waitForChange(request.afterRevision, request.timeoutMs);
    }
    if (request.operation === "updater.invoke") {
      if (request.shellType !== this.updater.shellType) throw new Error("Electron Standalone updater Shell type differs from its host");
      return await this.updater.invoke(request.action);
    }
    if (request.operation === "updater.confirm-installed") {
      if (request.shellType !== this.updater.shellType) throw new Error("Electron Standalone updater Shell type differs from its host");
      return await this.updater.confirmInstalled(request.proof);
    }
    throw new Error(`Electron Standalone host operation is not implemented: ${request.operation}`);
  }

  async #start(request: Extract<ReturnType<typeof validateElectronStandaloneControlRequest>, { operation: "lifecycle.start" }>) {
    return await this.#boundStart(request, () => this.#startLifecycle(request));
  }

  async #completeTransitionStart(request: Extract<ReturnType<typeof validateElectronStandaloneControlRequest>, { operation: "transition.complete-start" }>) {
    return await this.#boundStart(request, () => this.lifecycle.completeTransitionStart(
      request.token,
      request.fence,
      request.generation,
      request.attachment,
      request.binding,
    ));
  }

  async #boundStart(
    request: Readonly<{
      attachment: StandaloneHandoffRequest["attachment"];
      binding: StandaloneHandoffRequest["binding"];
      generation: Parameters<ElectronStandaloneHostLifecycle["start"]>[0];
    }>,
    startLifecycle: () => Promise<Awaited<ReturnType<ElectronStandaloneHostLifecycle["start"]>>>,
  ) {
    if (this.#pending.has(request.attachment.id)) throw new Error("Electron Standalone attachment already has a pending start");
    let task: Promise<Awaited<ReturnType<ElectronStandaloneHostLifecycle["start"]>>> | null = null;
    const pending: PendingStart = Object.freeze({
      bindingDigest: request.binding.digest,
      run: () => {
        task ??= startLifecycle();
        return task;
      },
    });
    this.#pending.set(request.attachment.id, pending);
    try {
      const handle = await this.#handoff.handoff({
        binding: request.binding,
        attachment: request.attachment,
        capabilities: createStandaloneShellUpdaterCapabilityHandler(this.updater),
      });
      const started = await pending.run();
      const exact = await handle.readStatus();
      if (exact.state !== "running" || exact.generationId !== request.generation.id || exact.bindingDigest !== request.binding.digest) {
        throw new Error("Electron Standalone launcher did not acknowledge the exact Sidecar generation");
      }
      this.#handles.set(request.attachment.id, Object.freeze({ attachment: request.attachment, handle }));
      return started;
    } finally {
      this.#pending.delete(request.attachment.id);
    }
  }

  async #startLifecycle(request: Extract<ReturnType<typeof validateElectronStandaloneControlRequest>, { operation: "lifecycle.start" }>) {
    const updater = await this.updater.readSnapshot();
    if (updater.state === "installed" && updater.installAttemptId != null) {
      const recovered = await this.lifecycle.completeStoppedTransitionStart("shell-install", updater.installAttemptId, request.generation, request.attachment, request.binding);
      if (recovered != null) return recovered;
    }
    const recoveredContent = await this.lifecycle.completeStoppedTransitionStart("content-restart", null, request.generation, request.attachment, request.binding);
    if (recoveredContent != null) return recoveredContent;
    return await this.lifecycle.start(request.generation, request.attachment, request.binding, request.attachmentCapability);
  }

  #bodyHandle(request: StandaloneHandoffRequest): StandaloneRuntimeHandle {
    const project = async (state?: "stopped") => {
      const status = await this.lifecycle.status();
      return Object.freeze({
        bindingDigest: request.binding.digest,
        generationId: request.binding.generationId,
        instanceId: status.instanceId ?? `stopped-${status.fence}`,
        references: status.references,
        state: state ?? status.state,
      });
    };
    return Object.freeze({
      readStatus: () => project(),
      async invoke(command: StandaloneRuntimeCommand) {
        return Object.freeze({ requestId: command.requestId, attachmentId: command.attachmentId, bindingDigest: request.binding.digest, outcome: "unsupported" as const, error: Object.freeze({ code: "electron-command-unavailable" }) });
      },
      close: () => project("stopped"),
      async waitForTerminal() {
        for (;;) {
          const status = await project();
          if (status.state !== "running") return status;
          await new Promise((resolveWait) => setTimeout(resolveWait, 100));
        }
      },
    });
  }

  async stop(): Promise<void> {
    const current = await this.lifecycle.status();
    if (current.references === 0 && current.state === "running") await this.lifecycle.stop(current.fence);
  }
}

export async function runElectronStandaloneHost(): Promise<void> {
  const config = readConfig();
  const target = resolveElectronStandaloneTarget();
  const installation = await loadElectronStandaloneInstallation({ resourceRoot: config.resourceRoot, channel: config.scope.channel, target });
  const stamp = Object.freeze({ ...readCurrentSidecarStamp() });
  if (stamp.channel !== config.scope.channel || stamp.namespace !== config.scope.namespace || stamp.source !== "standalone" || stamp.mode !== "runtime" || stamp.app !== "standalone") {
    throw new Error("Electron Standalone host configuration differs from its Sidecar stamp");
  }
  const resources = Object.freeze({ dataRoot: config.storeRoot, ownerPid: null, port: 0, runtimeRoot: config.runtimeRoot });
  if (await bootstrapSidecarProcess(stamp, resources, {
    args: [config.hostPath],
    command: process.execPath,
    cwd: process.cwd(),
    env: process.env,
    supervisor: { command: process.execPath, entrypoint: config.supervisorPath },
  })) return;
  let runtime: ElectronStandaloneHostRuntime | null = null;
  let client!: SidecarClient<ElectronStandaloneHostRuntime>;
  client = SidecarFactory.create<ElectronStandaloneHostRuntime>({
    handlers: {
      [ELECTRON_STANDALONE_CONTROL_ACTION]: async (input) => {
        if (runtime == null) throw new Error("Electron Standalone host runtime is unavailable");
        return await runtime.request(input);
      },
    },
    lifecycle: {
      async start(sidecarResources) {
        if (resolve(sidecarResources.dataRoot ?? "") !== config.storeRoot || resolve(sidecarResources.runtimeRoot) !== config.runtimeRoot) throw new Error("Electron Standalone host resources differ from its launch contract");
        runtime = new ElectronStandaloneHostRuntime(config, installation);
        return runtime;
      },
      async status(active) {
        return Object.freeze({
          control: "ready",
          generationPid: client.resources.pid,
          hostPid: process.pid,
          hostSha256: config.hostSha256,
          supervisorSha256: config.supervisorSha256,
          dataRoot: client.resources.dataRoot,
          runtimeRoot: client.resources.runtimeRoot,
          resourceRoot: config.resourceRoot,
          shell: config.shell,
          lifecycle: await active.lifecycle.status(),
        });
      },
      async stop(active) {
        await active.stop();
        runtime = null;
      },
    },
  });
  await client.start();
  await client.waitUntilStopped();
}

if (process.env[ELECTRON_STANDALONE_HOST_CONFIG_ENV] != null) {
  void runElectronStandaloneHost().catch((error) => {
    console.error("[shell/electron] Standalone host failed", error);
    process.exitCode = 1;
  });
}
