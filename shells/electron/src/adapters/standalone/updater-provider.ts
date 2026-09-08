import { resolve } from "node:path";
import {
  bootstrapSidecarProcessWithSupervisor, readCurrentSidecarStamp, SidecarFactory,
} from "@open-design/sidecar/authority";
import {
  canonicalJson, createStandaloneHostUpdaterHandler, STANDALONE_HOST_CONTROL_ACTION,
  StandaloneHostControlClient, validateShellIdentity, validateStandaloneScope,
  validateStandaloneHostControlRequest,
  type LifecycleScope, type StandaloneShellIdentity,
} from "@open-design/standalone";
import { createStandaloneHostControlTransport } from "./control-client.js";
import { ElectronStandaloneHostUpdater } from "./host-updater.js";
import { loadElectronStandaloneInstallation, resolveElectronStandaloneTarget } from "./installation.js";
import { ElectronReleaseExactFeed } from "./release-feed.js";
import { ElectronStandaloneShellCandidateLedger } from "./shell-updater-candidate.js";
import { ElectronStandaloneShellUpdaterLedger } from "./shell-updater-ledger.js";

export const ELECTRON_UPDATER_PROVIDER_CONFIG_ENV = "OD_ELECTRON_UPDATER_PROVIDER_V2";
export type ElectronUpdaterProviderConfig = Readonly<{
  schemaVersion: 2;
  scope: LifecycleScope;
  shell: StandaloneShellIdentity;
  carrier: StandaloneShellIdentity;
  resourceRoot: string;
  storeRoot: string;
  runtimeRoot: string;
  channelHeadUrl: string;
}>;

export function parseElectronUpdaterProviderConfig(input: unknown): ElectronUpdaterProviderConfig {
  if (input == null || typeof input !== "object" || Array.isArray(input)) throw new Error("Electron updater provider configuration is invalid");
  const value = input as ElectronUpdaterProviderConfig;
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["carrier", "channelHeadUrl", "resourceRoot", "runtimeRoot", "schemaVersion", "scope", "shell", "storeRoot"])) throw new Error("Electron updater provider configuration fields are invalid");
  if (value.schemaVersion !== 2) throw new Error("Electron updater provider schema is unsupported");
  if (value.scope == null || JSON.stringify(Object.keys(value.scope).sort()) !== JSON.stringify(["channel", "namespace"])) throw new Error("Electron updater provider scope is invalid");
  const scope = Object.freeze({ ...validateStandaloneScope(value.scope) });
  for (const identity of [value.shell, value.carrier]) {
    if (identity == null || JSON.stringify(Object.keys(identity).sort()) !== JSON.stringify(["buildHash", "digest", "type", "version"])) throw new Error("Electron updater provider Shell is invalid");
    validateShellIdentity(identity);
    if (identity.type !== "electron") throw new Error("Electron updater provider cannot serve another Shell");
  }
  for (const path of [value.resourceRoot, value.runtimeRoot, value.storeRoot]) {
    if (typeof path !== "string" || resolve(path) !== path) throw new Error("Electron updater provider paths must be absolute and normalized");
  }
  const url = new URL(value.channelHeadUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) throw new Error("Electron updater provider feed URL is invalid");
  return Object.freeze({ ...value, scope, shell: Object.freeze({ ...value.shell }), carrier: Object.freeze({ ...value.carrier }), channelHeadUrl: url.href });
}

export async function runElectronUpdaterProvider(): Promise<void> {
  const serialized = process.env[ELECTRON_UPDATER_PROVIDER_CONFIG_ENV];
  if (serialized == null) throw new Error("Electron updater provider configuration is required");
  const config = parseElectronUpdaterProviderConfig(JSON.parse(serialized));
  const stamp = readCurrentSidecarStamp();
  const expectedStamp = { ...config.scope, source: "standalone", mode: "runtime", app: "electron-updater" };
  if (canonicalJson(stamp) !== canonicalJson(expectedStamp)) throw new Error("Electron updater provider escaped its Sidecar scope");
  const installation = await loadElectronStandaloneInstallation({ resourceRoot: config.resourceRoot, channel: config.scope.channel, target: resolveElectronStandaloneTarget() });
  const resources = { dataRoot: config.storeRoot, ownerPid: null, port: 0, runtimeRoot: config.runtimeRoot };
  if (await bootstrapSidecarProcessWithSupervisor(stamp, resources, {
    args: [installation.updaterProviderPath], command: process.execPath, env: process.env,
    supervisor: { command: process.execPath, entrypoint: installation.supervisorPath },
  })) return;
  const client = SidecarFactory.create({
    handlers: {
      [STANDALONE_HOST_CONTROL_ACTION]: async (input) => {
        if (handler == null) throw new Error("Electron updater provider is not ready");
        return await handler(validateStandaloneHostControlRequest(input, config.scope));
      },
    },
    lifecycle: {
      async start(activeResources) {
        if (activeResources.dataRoot !== config.storeRoot || activeResources.runtimeRoot !== config.runtimeRoot) throw new Error("Electron updater provider resource binding differs");
        const lifecycle = new StandaloneHostControlClient(config.scope, createStandaloneHostControlTransport({ ...expectedStamp, app: "standalone" }));
        const feed = new ElectronReleaseExactFeed({
          cacheRoot: config.storeRoot, channel: config.scope.channel, channelHeadUrl: config.channelHeadUrl,
          currentReleaseVersion: installation.declaration.releaseVersion, shell: config.carrier,
          target: installation.declaration.target, trustedKeys: installation.trustedKeys,
        });
        const updater = new ElectronStandaloneHostUpdater("electron", lifecycle, new ElectronStandaloneShellUpdaterLedger(config.storeRoot, config.scope, "electron"), {
          authorityRoot: config.storeRoot, feed, candidates: new ElectronStandaloneShellCandidateLedger(config.storeRoot, config.scope, feed),
        });
        handler = createStandaloneHostUpdaterHandler(config.scope, updater);
        return { ready: true };
      },
      status() {
        return { control: "ready", providerSha256: installation.declaration.updaterProvider.sha256, supervisorSha256: installation.declaration.supervisor.sha256,
          resourceRoot: config.resourceRoot, dataRoot: config.storeRoot, runtimeRoot: config.runtimeRoot, shell: config.shell, carrier: config.carrier };
      },
      async stop() { handler = null; },
    },
  });
  let handler: ReturnType<typeof createStandaloneHostUpdaterHandler> | null = null;
  await client.start();
  await client.waitUntilStopped();
}

if (process.env[ELECTRON_UPDATER_PROVIDER_CONFIG_ENV] != null) {
  void runElectronUpdaterProvider().catch((error) => {
    console.error("[shell/electron] updater provider failed", error);
    process.exitCode = 1;
  });
}
