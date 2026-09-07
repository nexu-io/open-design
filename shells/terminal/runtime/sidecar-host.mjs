import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { bootstrapSidecarProcess, handoffCurrentSidecarGeneration, SidecarFactory } from "@open-design/sidecar";

import { FileFixtureLifecyclePort } from "./fixture-lifecycle.mjs";
import { FixtureShellUpdaterPort } from "./fixture-shell-updater.mjs";

const ACTION = "standalone.request.v1";
const CONFIG_ENV = "OD_TERMINAL_SIDECAR_CONFIG_V1";
const capabilityDigest = (token) => createHash("sha256").update(token).digest("hex");

function readConfig() {
  const serialized = process.env[CONFIG_ENV];
  if (serialized == null) throw new Error(`${CONFIG_ENV} is required`);
  const value = JSON.parse(serialized);
  if (
    value?.schemaVersion !== 1
    || typeof value.storeRoot !== "string"
    || typeof value.standaloneEntrypoint !== "string"
    || typeof value.runtimeRoot !== "string"
    || typeof value.sidecarHost !== "string"
    || !/^[a-z0-9]{1,12}$/.test(value.channel)
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.namespace)
  ) throw new Error("Terminal Sidecar configuration is invalid");
  return Object.freeze({
    schemaVersion: 1,
    storeRoot: resolve(value.storeRoot),
    standaloneEntrypoint: resolve(value.standaloneEntrypoint),
    runtimeRoot: resolve(value.runtimeRoot),
    sidecarHost: resolve(value.sidecarHost),
    channel: value.channel,
    namespace: value.namespace,
  });
}

class TerminalSidecarRuntime {
  constructor(config, standalone) {
    this.config = config;
    this.standalone = standalone;
    this.scope = Object.freeze({ channel: config.channel, namespace: config.namespace });
    this.lifecycle = new FileFixtureLifecyclePort(config.storeRoot, {
      algebra: standalone.SHARED_LIFECYCLE_ALGEBRA,
      transitionLeaseDurationMs: Number.parseInt(process.env.OD_FIXTURE_TRANSITION_LEASE_MS ?? "30000", 10),
    });
    this.transitions = new Map();
    this.updaterQueues = new Map();
    this.pendingStarts = new Map();
    this.runtimeHandles = new Map();
    this.selectedBindingDigest = null;
    this.selectedGenerationId = null;
    this.handoff = new standalone.FossilHandoffHost(async (binding) => {
      const launcherBytes = await readFile(binding.launcher.path);
      if (createHash("sha256").update(launcherBytes).digest("hex") !== binding.launcher.blobSha256) {
        throw new Error("materialized Standalone launcher failed Sidecar handoff binding");
      }
      const generation = await import(pathToFileURL(binding.launcher.path).href);
      if (typeof generation.createStandaloneGenerationBootloader !== "function") {
        throw new Error("materialized Standalone launcher lacks its generation bootloader");
      }
      return generation.createStandaloneGenerationBootloader(async (request) => {
        const entry = this.pendingStarts.get(request.attachment.id);
        if (entry == null || entry.binding.digest !== request.binding.digest) {
          throw new Error("generation body start escaped its Sidecar lifecycle continuation");
        }
        await entry.run();
        return this.generationRuntimeHandle(request);
      });
    });
  }

  assertScope(scope) {
    if (scope?.channel !== this.scope.channel || scope?.namespace !== this.scope.namespace) {
      throw new Error("Terminal Sidecar request escaped its channel and namespace stamp");
    }
    return this.scope;
  }

  async request(message) {
    if (message?.schemaVersion !== 1) throw new Error("unsupported Terminal Sidecar request schema");
    this.assertScope(message.scope);
    if (message.fault === "crash") {
      setImmediate(() => process.exit(73));
      return { accepted: true };
    }
    if (message.domain === "generation") return await this.generationRequest(message);
    if (message.domain === "lifecycle") return await this.lifecycleRequest(message);
    if (message.domain === "shell-updater") return await this.updaterRequest(message);
    if (message.domain === "maintenance") return await this.maintenanceRequest(message);
    throw new Error("invalid Terminal Sidecar request domain");
  }

  async lifecycleRequest(message) {
    const scope = this.scope;
    if (message.operation === "start") {
      const status = await this.lifecycle.status(scope);
      const existing = status.occupants.some(({ attachmentId }) => attachmentId === message.attachment.id);
      const token = existing ? message.attachmentCapability : randomBytes(32).toString("hex");
      if (typeof token !== "string") {
        throw Object.assign(new Error("Terminal Sidecar attachment capability is required"), {
          code: "attachment-capability-required",
        });
      }
      return await this.startBoundGeneration(message, token, async () => await this.lifecycle.startWithCapability(
        scope,
        message.generation,
        message.attachment,
        {
          candidateHash: capabilityDigest(token),
          presentedHash: message.attachmentCapability == null ? null : capabilityDigest(message.attachmentCapability),
        },
        message.binding,
      ));
    }
    if (message.operation === "heartbeat") {
      return await this.lifecycle.heartbeatWithCapability(
        scope,
        message.attachment,
        capabilityDigest(message.attachmentCapability ?? ""),
      );
    }
    if (message.operation === "ready") return await this.lifecycle.awaitReady(scope, message.readiness);
    if (message.operation === "release") {
      const released = await this.lifecycle.releaseWithCapability(
        scope,
        message.attachmentId,
        capabilityDigest(message.attachmentCapability ?? ""),
      );
      const handle = this.runtimeHandles.get(message.attachmentId);
      if (handle != null) {
        await handle.close();
        this.runtimeHandles.delete(message.attachmentId);
      }
      return released;
    }
    if (message.operation === "status") return await this.lifecycle.status(scope);
    if (message.operation === "stop") {
      const stopped = await this.lifecycle.stop(scope, message.fence);
      for (const [attachmentId, handle] of this.runtimeHandles) {
        await handle.close().catch(() => undefined);
        this.runtimeHandles.delete(attachmentId);
      }
      return stopped;
    }
    if (message.operation === "occupants") return await this.lifecycle.occupants(scope);
    if (message.operation === "begin-transition") {
      const result = await this.lifecycle.beginTransition(scope, message.kind, message.options);
      if (result.state === "blocked") return result;
      const token = randomUUID();
      this.transitions.set(token, { kind: message.kind, transition: result.transition });
      return { state: "acquired", transition: this.transitionDescriptor(token, result.transition) };
    }
    if (message.operation === "transition") {
      const held = this.transitions.get(message.token);
      if (held == null) throw new Error("Terminal Sidecar transition is unavailable");
      const transition = held.transition;
      if (message.action === "renew") {
        await transition.renew();
        return this.transitionDescriptor(message.token, transition);
      }
      if (message.action === "release") {
        await transition.release();
        this.transitions.delete(message.token);
        return { released: true };
      }
      if (message.action === "force-stop") {
        await transition.forceStop();
        return this.transitionDescriptor(message.token, transition);
      }
      if (message.action === "complete-start") {
        const capability = randomBytes(32).toString("hex");
        const status = await this.startBoundGeneration(message, capability, async () => {
          return await transition.completeBoundStart(message.generation, message.attachment, message.binding, capabilityDigest(capability));
        });
        this.transitions.delete(message.token);
        return status;
      }
      throw new Error("Terminal Sidecar transition action is invalid");
    }
    throw new Error(`unsupported Terminal Sidecar lifecycle operation: ${message.operation}`);
  }

  async startBoundGeneration(message, attachmentCapability, start) {
    if (message.binding == null) throw new Error("Terminal Sidecar generation start requires an exact binding");
    const expectedBindingDigest = process.env.OD_TERMINAL_EXPECTED_BINDING_DIGEST;
    if (this.selectedBindingDigest == null && expectedBindingDigest != null && expectedBindingDigest !== message.binding.digest) {
      throw new Error(`Terminal Sidecar successor expected ${expectedBindingDigest}/${process.env.OD_TERMINAL_EXPECTED_GENERATION_ID ?? "unknown"}, received ${message.binding.digest}/${message.binding.generationId}`);
    }
    if (this.selectedBindingDigest != null && this.selectedBindingDigest !== message.binding.digest) {
      throw new Error(`Terminal Sidecar host selected ${this.selectedBindingDigest}/${this.selectedGenerationId}, received ${message.binding.digest}/${message.binding.generationId}`);
    }
    this.selectedBindingDigest ??= message.binding.digest;
    this.selectedGenerationId ??= message.binding.generationId;
    if (this.pendingStarts.has(message.attachment.id)) throw new Error("attachment already has a pending Sidecar generation start");
    const entry = {
      binding: message.binding,
      status: null,
      task: null,
      run() {
        this.task ??= start().then((status) => { this.status = status; return status; });
        return this.task;
      },
    };
    this.pendingStarts.set(message.attachment.id, entry);
    try {
      const handle = await this.handoff.handoff({
        binding: message.binding,
        attachment: message.attachment,
        capabilities: {
          invoke: async (request) => ({
            requestId: request.requestId,
            attachmentId: request.attachmentId,
            bindingDigest: request.bindingDigest,
            outcome: "unsupported",
            error: { code: "terminal-capability-unavailable" },
          }),
        },
      });
      await entry.run();
      const exact = await handle.readStatus();
      if (
        exact.state !== "running"
        || exact.bindingDigest !== message.binding.digest
        || exact.generationId !== message.generation.id
      ) throw new Error("Standalone launcher did not acknowledge its exact Sidecar generation");
      this.runtimeHandles.set(message.attachment.id, handle);
      return { ...entry.status, attachmentCapability };
    } finally {
      this.pendingStarts.delete(message.attachment.id);
    }
  }

  generationRuntimeHandle(request) {
    return {
      readStatus: async () => {
        const status = await this.lifecycle.status(this.scope);
        return {
          bindingDigest: request.binding.digest,
          generationId: request.binding.generationId,
          instanceId: status.instanceId ?? `stopped-${status.fence}`,
          references: status.references,
          state: status.state,
        };
      },
      invoke: async (command) => ({
        requestId: command.requestId,
        attachmentId: command.attachmentId,
        bindingDigest: request.binding.digest,
        outcome: "unsupported",
        error: { code: "terminal-capability-unavailable" },
      }),
      close: async () => {
        const status = await this.lifecycle.status(this.scope);
        return {
          bindingDigest: request.binding.digest,
          generationId: request.binding.generationId,
          instanceId: status.instanceId ?? `stopped-${status.fence}`,
          references: 0,
          state: "stopped",
        };
      },
      waitForTerminal: async () => {
        for (;;) {
          const status = await this.lifecycle.status(this.scope);
          if (status.state !== "running") {
            return {
              bindingDigest: request.binding.digest,
              generationId: request.binding.generationId,
              instanceId: status.instanceId ?? `stopped-${status.fence}`,
              references: status.references,
              state: status.state,
            };
          }
          await new Promise((resolveWait) => setTimeout(resolveWait, 100));
        }
      },
    };
  }

  async generationRequest(message) {
    if (message.operation !== "handoff" || typeof message.bindingDigest !== "string" || typeof message.generationId !== "string") {
      throw new Error("unsupported Terminal Sidecar generation operation");
    }
    const status = await this.lifecycle.status(this.scope);
    if (status.references !== 0) {
      return { accepted: false, occupants: status.occupants, reason: "occupied" };
    }
    await handoffCurrentSidecarGeneration({
      args: [this.config.sidecarHost],
      command: process.execPath,
      cwd: process.cwd(),
      env: {
        ...process.env,
        OD_TERMINAL_EXPECTED_BINDING_DIGEST: message.bindingDigest,
        OD_TERMINAL_EXPECTED_GENERATION_ID: message.generationId,
        OD_TERMINAL_PREVIOUS_HOST_PID: String(process.pid),
      },
    });
    setTimeout(() => process.exit(0), 25);
    return {
      accepted: true,
      bindingDigest: message.bindingDigest,
      generationId: message.generationId,
      generationPid: Number(process.env.OD_TERMINAL_GENERATION_PID ?? 0) || null,
      retiringHostPid: process.pid,
    };
  }

  async updaterRequest(message) {
    const trustedKeys = new Map((message.options.trustedKeys ?? []).map(
      ({ keyId, publicKey }) => [keyId, publicKey],
    ));
    const updater = new FixtureShellUpdaterPort(this.config.storeRoot, this.scope, this.lifecycle, {
      ...message.options,
      algebra: this.standalone.SHELL_UPDATE_ALGEBRA,
      standalone: this.standalone,
      trustedKeys,
      withRetiredStandalone: async (_input, continuation) => await continuation(),
    });
    if (message.operation === "read") return await updater.readSnapshot();
    if (message.operation === "wait") return await updater.waitForChange(message.afterRevision, message.timeoutMs);
    const key = message.options.shellType ?? "electron";
    const previous = this.updaterQueues.get(key) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(async () => {
      if (message.operation === "invoke") return await updater.invoke(message.action);
      if (message.operation === "confirm-installed") return await updater.confirmInstalled(message.proof);
      throw new Error(`unsupported Terminal Sidecar updater operation: ${message.operation}`);
    });
    this.updaterQueues.set(key, operation);
    try { return await operation; }
    finally { if (this.updaterQueues.get(key) === operation) this.updaterQueues.delete(key); }
  }

  async maintenanceRequest(message) {
    if (message.operation !== "sweep-if-idle") {
      throw new Error(`unsupported Terminal Sidecar maintenance operation: ${message.operation}`);
    }
    const status = await this.lifecycle.status(this.scope);
    if (status.references !== 0) return { status: "deferred", reason: "occupied", occupants: status.occupants };
    const sweep = await this.standalone.sweepStandaloneStore(this.config.storeRoot);
    const cleanup = await this.standalone.cleanupStandaloneTrash(this.config.storeRoot, message.options ?? {});
    return { status: "complete", sweep, cleanup };
  }

  transitionDescriptor(token, transition) {
    return {
      token,
      attemptId: transition.attemptId ?? token,
      fence: transition.fence,
      expiresAt: transition.expiresAt,
      heartbeatIntervalMs: transition.heartbeatIntervalMs,
      occupants: transition.occupants,
      phase: transition.phase ?? "reserved",
    };
  }
}

const config = readConfig();
const standalone = await import(pathToFileURL(config.standaloneEntrypoint).href);
const stamp = Object.freeze({
  channel: config.channel,
  namespace: config.namespace,
  source: "standalone",
  mode: "runtime",
  app: "standalone",
});
if (await bootstrapSidecarProcess(stamp, {
  dataRoot: config.storeRoot,
  ownerPid: null,
  port: 0,
  runtimeRoot: config.runtimeRoot,
})) process.exit(0);
let runtime = null;
const client = SidecarFactory.create({
  handlers: {
    [ACTION]: async (input) => {
      if (runtime == null) throw new Error("Terminal Sidecar runtime is not ready");
      return await runtime.request(input);
    },
  },
  lifecycle: {
    async start(resources) {
      if (resolve(resources.dataRoot ?? "") !== config.storeRoot) {
        throw new Error("Terminal Sidecar data root differs from its launch contract");
      }
      runtime = new TerminalSidecarRuntime(config, standalone);
      return runtime;
    },
    async status(active) {
      return {
        bootstrapPid: Number.parseInt(process.env.OD_TERMINAL_BOOTSTRAP_PID ?? "0", 10) || null,
        control: "ready",
        dataRoot: client.resources.dataRoot,
        generationPid: client.resources.pid,
        hostPid: process.pid,
        previousHostPid: Number.parseInt(process.env.OD_TERMINAL_PREVIOUS_HOST_PID ?? "0", 10) || null,
        runtimeRoot: client.resources.runtimeRoot,
        lifecycle: await active.lifecycle.status(active.scope),
      };
    },
    async stop() { runtime = null; },
  },
});
if (JSON.stringify(client.stamp) !== JSON.stringify(stamp)) {
  throw new Error("Terminal Sidecar configuration differs from its process stamp");
}
await client.start();
await client.waitUntilStopped();
