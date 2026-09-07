import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { bootstrapSidecarProcess, handoffCurrentSidecarGeneration, SidecarFactory } from "@open-design/sidecar";

const ACTION = "standalone.request.v1";
const CONFIG_ENV = "OD_TERMINAL_SIDECAR_CONFIG_V1";
const REQUEST_FIELDS = new Set([
  "schemaVersion", "scope", "domain", "operation", "options",
  "bindingDigest", "generationId",
]);

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
    layout: value.layout,
  });
}

class TerminalSidecarRuntime {
  constructor(config, standalone) {
    this.config = config;
    this.standalone = standalone;
    this.scope = Object.freeze({ channel: config.channel, namespace: config.namespace });
    this.layout = standalone.validateStandaloneRuntimeLayout(config.layout);
    if (this.layout.resourceStoreRoot !== config.storeRoot) throw new Error("Terminal layout escaped its Store root");
    this.lifecycle = new standalone.StandaloneHostLifecycle(this.scope, {
      statePort: new standalone.StandaloneHostLifecycleLedger(config.storeRoot, this.scope),
    });
    this.control = new standalone.StandaloneHostRuntime({
      scope: this.scope,
      lifecycle: this.lifecycle,
      capabilities: () => standalone.createStandaloneRuntimeLayoutCapabilityHandler({ layout: this.layout, scope: this.scope }),
      resolveGeneration: async (binding) => {
        const expected = process.env.OD_TERMINAL_EXPECTED_BINDING_DIGEST;
        if (expected != null && expected !== binding.digest) throw new Error("Terminal Sidecar successor received another generation binding");
        const launcherBytes = await readFile(binding.launcher.path);
        if (createHash("sha256").update(launcherBytes).digest("hex") !== binding.launcher.blobSha256) {
          throw new Error("materialized Standalone launcher failed Sidecar handoff binding");
        }
        return standalone.resolveStandaloneGenerationHandoff(await import(pathToFileURL(binding.launcher.path).href));
      },
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
    if (Object.keys(message).some(key => !REQUEST_FIELDS.has(key))) throw new Error("Terminal Sidecar request contains unsupported fields");
    if (message.domain === "generation") return await this.generationRequest(message);
    if (message.domain === "maintenance") return await this.maintenanceRequest(message);
    throw new Error("invalid Terminal Sidecar request domain");
  }

  async generationRequest(message) {
    if (message.operation !== "handoff" || typeof message.bindingDigest !== "string" || typeof message.generationId !== "string") {
      throw new Error("unsupported Terminal Sidecar generation operation");
    }
    const status = await this.lifecycle.status();
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

  async maintenanceRequest(message) {
    if (message.operation !== "sweep-if-idle") {
      throw new Error(`unsupported Terminal Sidecar maintenance operation: ${message.operation}`);
    }
    const status = await this.lifecycle.status();
    if (status.references !== 0) return { status: "deferred", reason: "occupied", occupants: status.occupants };
    const sweep = await this.standalone.sweepStandaloneStore(this.config.storeRoot);
    const cleanup = await this.standalone.cleanupStandaloneTrash(this.config.storeRoot, message.options ?? {});
    return { status: "complete", sweep, cleanup };
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
    [standalone.STANDALONE_HOST_CONTROL_ACTION]: async (input) => {
      if (runtime == null) throw new Error("Terminal Sidecar runtime is not ready");
      return await runtime.control.request(input);
    },
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
        layout: active.layout,
        lifecycle: await active.lifecycle.status(),
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
