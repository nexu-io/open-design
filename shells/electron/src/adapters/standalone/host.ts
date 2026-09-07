import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  bootstrapSidecarProcessWithSupervisor,
  readCurrentSidecarStamp,
  SidecarClient,
  SidecarFactory,
} from "@open-design/sidecar/authority";
import {
  StandaloneHostRuntime,
  createStandaloneRuntimeLayoutCapabilityHandler,
  createStandaloneShellCapabilityRouter,
  createStandaloneShellUpdaterCapabilityHandler,
  resolveStandaloneGenerationHandoff,
  validateShellIdentity,
  validateStandaloneRuntimeLayout,
} from "@open-design/standalone";

import {
  STANDALONE_HOST_CONTROL_ACTION,
} from "@open-design/standalone";
import { StandaloneHostLifecycle } from "@open-design/standalone";
import { StandaloneHostLifecycleLedger } from "@open-design/standalone";
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
  layout: Readonly<{ dataRoot: string; logsRoot: string; resourceStoreRoot: string; runtimeRoot: string; sidecarSupervisorPath: string }>;
  supervisorSha256: string;
  supervisorPath: string;
  shell: Readonly<{ type: string; version: string; buildHash: string; digest: string }>;
  channelHeadUrl: string;
}>;

function readConfig(): HostConfig {
  const serialized = process.env[ELECTRON_STANDALONE_HOST_CONFIG_ENV];
  if (serialized == null) throw new Error(`${ELECTRON_STANDALONE_HOST_CONFIG_ENV} is required`);
  const value = JSON.parse(serialized) as Partial<HostConfig>;
  const keys = Object.keys(value).sort();
  if (JSON.stringify(keys) !== JSON.stringify(["channelHeadUrl", "hostPath", "hostSha256", "layout", "resourceRoot", "runtimeRoot", "schemaVersion", "scope", "shell", "storeRoot", "supervisorPath", "supervisorSha256"])) throw new Error("Standalone host configuration fields are invalid");
  if (
    value.schemaVersion !== 1
    || value.scope == null
    || !/^[a-z0-9]{1,12}$/u.test(value.scope.channel ?? "")
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.scope.namespace ?? "")
    || typeof value.storeRoot !== "string"
    || typeof value.runtimeRoot !== "string"
    || typeof value.resourceRoot !== "string"
    || typeof value.hostPath !== "string"
    || typeof value.channelHeadUrl !== "string"
    || value.layout == null
    || typeof value.supervisorPath !== "string"
    || !/^[a-f0-9]{64}$/u.test(value.hostSha256 ?? "")
    || !/^[a-f0-9]{64}$/u.test(value.supervisorSha256 ?? "")
  ) throw new Error("Standalone host configuration is invalid");
  const storeRoot = resolve(value.storeRoot);
  const runtimeRoot = resolve(value.runtimeRoot);
  const resourceRoot = resolve(value.resourceRoot);
  const hostPath = resolve(value.hostPath);
  const supervisorPath = resolve(value.supervisorPath);
  if (storeRoot !== value.storeRoot || runtimeRoot !== value.runtimeRoot || resourceRoot !== value.resourceRoot || hostPath !== value.hostPath || supervisorPath !== value.supervisorPath) throw new Error("Standalone host paths must be absolute and normalized");
  if (value.shell == null || typeof value.shell !== "object" || Array.isArray(value.shell)
    || JSON.stringify(Object.keys(value.shell).sort()) !== JSON.stringify(["buildHash", "digest", "type", "version"])) throw new Error("Standalone host Shell identity is invalid");
  const shell = value.shell as HostConfig["shell"];
  validateShellIdentity(shell);
  const channelHeadUrl = new URL(value.channelHeadUrl);
  if ((channelHeadUrl.protocol !== "https:" && channelHeadUrl.protocol !== "http:") || channelHeadUrl.username.length > 0 || channelHeadUrl.password.length > 0 || channelHeadUrl.hash.length > 0) throw new Error("Standalone host channel head URL is invalid");
  const layout = validateStandaloneRuntimeLayout(value.layout);
  return Object.freeze({ schemaVersion: 1, scope: Object.freeze({ ...value.scope }), storeRoot, runtimeRoot, resourceRoot, hostPath, hostSha256: value.hostSha256!, layout, supervisorPath, supervisorSha256: value.supervisorSha256!, shell: Object.freeze({ ...shell }), channelHeadUrl: channelHeadUrl.href });
}

function createHostRuntime(config: HostConfig, installation: ResolvedElectronStandaloneInstallation): StandaloneHostRuntime {
  const lifecycle = new StandaloneHostLifecycle(config.scope, {
    statePort: new StandaloneHostLifecycleLedger(config.storeRoot, config.scope),
  });
  const ledger = new ElectronStandaloneShellUpdaterLedger(config.storeRoot, config.scope, "electron");
  const feed = new ElectronReleaseExactFeed({
    cacheRoot: config.storeRoot, channel: config.scope.channel, channelHeadUrl: config.channelHeadUrl,
    currentReleaseVersion: installation.declaration.releaseVersion, shell: config.shell,
    target: installation.declaration.target, trustedKeys: installation.trustedKeys,
  });
  const updater = new ElectronStandaloneHostUpdater("electron", lifecycle, ledger, {
    authorityRoot: config.storeRoot, feed, candidates: new ElectronStandaloneShellCandidateLedger(config.storeRoot, config.scope, feed),
  });
  return new StandaloneHostRuntime({
    scope: config.scope, lifecycle,
    updater: (shellType) => shellType === updater.shellType ? updater : undefined,
    capabilities: () => createStandaloneShellCapabilityRouter([
      createStandaloneShellUpdaterCapabilityHandler(updater),
      createStandaloneRuntimeLayoutCapabilityHandler({ layout: config.layout, scope: config.scope }),
    ]),
    async resolveGeneration(binding) {
      const bytes = await readFile(binding.launcher.path);
      if (createHash("sha256").update(bytes).digest("hex") !== binding.launcher.blobSha256) {
        throw new Error("materialized Standalone host launcher failed its handoff binding");
      }
      return resolveStandaloneGenerationHandoff(await import(pathToFileURL(binding.launcher.path).href));
    },
  });
}

export async function runElectronStandaloneHost(): Promise<void> {
  const config = readConfig();
  const target = resolveElectronStandaloneTarget();
  const installation = await loadElectronStandaloneInstallation({ resourceRoot: config.resourceRoot, channel: config.scope.channel, target });
  const stamp = Object.freeze({ ...readCurrentSidecarStamp() });
  if (stamp.channel !== config.scope.channel || stamp.namespace !== config.scope.namespace || stamp.source !== "standalone" || stamp.mode !== "runtime" || stamp.app !== "standalone") {
    throw new Error("Standalone host configuration differs from its Sidecar stamp");
  }
  const resources = Object.freeze({ dataRoot: config.storeRoot, ownerPid: null, port: 0, runtimeRoot: config.runtimeRoot });
  if (await bootstrapSidecarProcessWithSupervisor(stamp, resources, {
    args: [config.hostPath],
    command: process.execPath,
    cwd: process.cwd(),
    env: process.env,
    supervisor: { command: process.execPath, entrypoint: config.supervisorPath },
  })) return;
  let runtime: StandaloneHostRuntime | null = null;
  let client!: SidecarClient<StandaloneHostRuntime>;
  client = SidecarFactory.create<StandaloneHostRuntime>({
    handlers: {
      [STANDALONE_HOST_CONTROL_ACTION]: async (input) => {
        if (runtime == null) throw new Error("Standalone host runtime is unavailable");
        return await runtime.request(input);
      },
    },
    lifecycle: {
      async start(sidecarResources) {
        if (resolve(sidecarResources.dataRoot ?? "") !== config.storeRoot || resolve(sidecarResources.runtimeRoot) !== config.runtimeRoot) throw new Error("Standalone host resources differ from its launch contract");
        runtime = createHostRuntime(config, installation);
        return runtime;
      },
      async status(active) {
        return Object.freeze({
          control: "ready",
          generationPid: client.resources.pid,
          hostPid: process.pid,
          hostSha256: config.hostSha256,
          layout: config.layout,
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
