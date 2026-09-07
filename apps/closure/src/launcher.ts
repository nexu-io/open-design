import { dirname, join } from "node:path";
import { mkdir, open, type FileHandle } from "node:fs/promises";

import {
  APP_KEYS,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  SIDECAR_SOURCES,
  type DaemonStatusSnapshot,
  type RegisterDesktopAuthResult,
  type RegisterWebUrlResult,
  type WebStatusSnapshot,
} from "@open-design/sidecar-proto";
import {
  getSidecarStatus,
  invokeSidecar,
  spawnSidecar,
  stopSidecar,
  type SpawnedSidecar,
  type SidecarStamp,
} from "@open-design/sidecar";
import {
  OPEN_DESIGN_PRODUCT_RUNTIME_COMMAND,
  validateOpenDesignProductRuntimeReadRequest,
} from "@open-design/contracts/runtime/product-runtime";
import {
  OPEN_DESIGN_ELECTRON_AUTH_REGISTER_COMMAND,
  validateOpenDesignElectronAuthRegisterRequest,
} from "@open-design/electron-contract/runtime-auth";
import {
  createStandaloneGenerationBootloader,
  createStandaloneShellUpdaterCapabilityClient,
  readStandaloneRuntimeLayoutCapability,
  type StandaloneGenerationResourceBinding,
  type StandaloneHandoffRequest,
  type StandaloneRuntimeCommand,
  type StandaloneRuntimeCommandResult,
  type StandaloneRuntimeHandle,
  type StandaloneRuntimeInvocationContext,
  type StandaloneRuntimeStatus,
} from "@open-design/standalone";

export const OPEN_DESIGN_DAEMON_RESOURCE_ID = "open-design-daemon";
export const OPEN_DESIGN_WEB_RESOURCE_ID = "open-design-web";

type ManagedRuntime = Readonly<{
  generation: SpawnedSidecar;
  log: FileHandle;
  stamp: SidecarStamp;
}>;

function requiredResource(request: StandaloneHandoffRequest, id: string): StandaloneGenerationResourceBinding {
  const resource = request.binding.resources[id];
  if (resource == null || resource.component !== "standalone.resource") {
    throw new Error(`OpenDesign Closure requires exact resource ${id}`);
  }
  return resource;
}

function stamp(request: StandaloneHandoffRequest, app: typeof APP_KEYS.DAEMON | typeof APP_KEYS.WEB): SidecarStamp {
  return Object.freeze({
    app,
    channel: request.binding.scope.channel,
    mode: "runtime",
    namespace: request.binding.scope.namespace,
    source: SIDECAR_SOURCES.STANDALONE,
  });
}

async function waitForStatus<T>(input: Readonly<{
  child: SpawnedSidecar;
  isReady(status: T): boolean;
  label: string;
  stamp: SidecarStamp;
  timeoutMs?: number;
}>): Promise<T> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < (input.timeoutMs ?? 120_000)) {
    if (input.child.process.exitCode != null || input.child.process.signalCode != null) {
      throw new Error(`${input.label} exited before exact readiness`);
    }
    try {
      const status = await getSidecarStatus<T>(input.stamp, {
        generationPid: input.child.process.pid,
        timeoutMs: 800,
      });
      if (input.isReady(status)) return status;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`timed out waiting for ${input.label} exact readiness`, { cause: lastError });
}

async function spawnRuntime(input: Readonly<{
  app: typeof APP_KEYS.DAEMON | typeof APP_KEYS.WEB;
  dataRoot: string;
  entrypoint: string;
  env: NodeJS.ProcessEnv;
  logPath: string;
  request: StandaloneHandoffRequest;
  runtimeRoot: string;
  sidecarSupervisorPath: string;
}>): Promise<ManagedRuntime> {
  const runtimeStamp = stamp(input.request, input.app);
  const retired = await stopSidecar(runtimeStamp, { termGraceMs: 5_000 });
  if (retired.remainingPids.length > 0) throw new Error(`could not retire prior exact ${input.app} runtime`);
  await mkdir(dirname(input.logPath), { recursive: true });
  const log = await open(input.logPath, "a");
  try {
    const generation = await spawnSidecar({
      args: [input.entrypoint],
      command: process.execPath,
      cwd: dirname(input.entrypoint),
      env: { ...process.env, ...input.env, NODE_ENV: "production" },
      logFd: log.fd,
      resources: { dataRoot: input.dataRoot, ownerPid: process.pid, port: 0, runtimeRoot: input.runtimeRoot },
      stamp: runtimeStamp,
      supervisor: { command: process.execPath, entrypoint: input.sidecarSupervisorPath },
    });
    return Object.freeze({ generation, log, stamp: runtimeStamp });
  } catch (error) {
    await log.close().catch(() => undefined);
    throw error;
  }
}

async function closeRuntime(runtime: ManagedRuntime, graceMs: number): Promise<void> {
  try {
    const stopped = await runtime.generation.stop({ termGraceMs: graceMs });
    if (stopped.remainingPids.length > 0) throw new Error(`exact ${runtime.stamp.app} runtime retained processes`);
  } finally {
    await runtime.log.close().catch(() => undefined);
  }
}

function resultBase(command: StandaloneRuntimeCommand) {
  return Object.freeze({
    requestId: command.requestId,
    attachmentId: command.attachmentId,
    bindingDigest: command.bindingDigest,
  });
}

async function startOpenDesignGeneration(request: StandaloneHandoffRequest): Promise<StandaloneRuntimeHandle> {
  const daemonResource = requiredResource(request, OPEN_DESIGN_DAEMON_RESOURCE_ID);
  const webResource = requiredResource(request, OPEN_DESIGN_WEB_RESOURCE_ID);
  const layout = await readStandaloneRuntimeLayoutCapability({
    attachmentId: request.attachment.id,
    bindingDigest: request.binding.digest,
    capabilities: request.capabilities,
    requestId: "open-design-runtime-layout",
    scope: request.binding.scope,
  });
  const shellUpdater = createStandaloneShellUpdaterCapabilityClient({
    attachmentId: request.attachment.id,
    bindingDigest: request.binding.digest,
    capabilities: request.capabilities,
    shellType: request.attachment.shell.type,
  });
  // Prove both the generation command line and the Shell-owned updater line
  // before starting mutable product processes.
  await shellUpdater.readSnapshot();
  await Promise.all([mkdir(layout.dataRoot, { recursive: true }), mkdir(layout.logsRoot, { recursive: true }), mkdir(layout.runtimeRoot, { recursive: true })]);

  let daemon: ManagedRuntime | null = null;
  let web: ManagedRuntime | null = null;
  let daemonStatus: DaemonStatusSnapshot | null = null;
  let webStatus: WebStatusSnapshot | null = null;
  let state: StandaloneRuntimeStatus["state"] = "running";
  let shutdown: Promise<void> | null = null;
  let resolveTerminal!: (status: StandaloneRuntimeStatus) => void;
  const terminal = new Promise<StandaloneRuntimeStatus>((resolve) => { resolveTerminal = resolve; });
  const status = (): StandaloneRuntimeStatus => Object.freeze({
    bindingDigest: request.binding.digest,
    generationId: request.binding.generationId,
    instanceId: `open-design-${request.binding.digest.slice(0, 16)}`,
    references: state === "running" ? 1 : 0,
    state,
  });
  const stopBody = (nextState: "failed" | "stopped") => {
    if (shutdown != null) return shutdown;
    state = nextState;
    shutdown = (async () => {
      const errors: unknown[] = [];
      if (web != null) await closeRuntime(web, 5_000).catch((error) => errors.push(error));
      if (daemon != null) await closeRuntime(daemon, 30_000).catch((error) => errors.push(error));
      resolveTerminal(status());
      if (errors.length > 0) throw new AggregateError(errors, "OpenDesign Closure could not stop exact runtime");
    })();
    return shutdown;
  };
  const fail = () => {
    if (state !== "running") return;
    void stopBody("failed").catch((error: unknown) => console.error("OpenDesign Closure failure cleanup failed", error));
  };

  try {
    daemon = await spawnRuntime({
      app: APP_KEYS.DAEMON,
      dataRoot: layout.dataRoot,
      entrypoint: daemonResource.entrypoint,
      env: {
        [SIDECAR_ENV.DAEMON_PORT]: "0",
        ...(request.attachment.shell.type === "electron" ? { OD_REQUIRE_DESKTOP_AUTH: "1" } : {}),
        OD_DATA_DIR: layout.dataRoot,
        OD_DAEMON_CLI_PATH: join(daemonResource.path, "daemon-cli.mjs"),
        OD_INSTALLATION_DIR: dirname(layout.dataRoot),
        OD_RESOURCE_ROOT: daemonResource.path,
        OD_RESOURCE_STORE_ROOT: layout.resourceStoreRoot,
      },
      logPath: join(layout.logsRoot, APP_KEYS.DAEMON, "latest.log"),
      request,
      runtimeRoot: layout.runtimeRoot,
      sidecarSupervisorPath: layout.sidecarSupervisorPath,
    });
    daemonStatus = await waitForStatus<DaemonStatusSnapshot>({
      child: daemon.generation,
      isReady: (candidate) => candidate.url != null,
      label: APP_KEYS.DAEMON,
      stamp: daemon.stamp,
    });
    if (daemonStatus.url == null) throw new Error("OpenDesign daemon did not expose a URL");
    const daemonPort = new URL(daemonStatus.url).port;
    web = await spawnRuntime({
      app: APP_KEYS.WEB,
      dataRoot: layout.dataRoot,
      entrypoint: webResource.entrypoint,
      env: {
        [SIDECAR_ENV.DAEMON_PORT]: daemonPort,
        [SIDECAR_ENV.WEB_PORT]: "0",
        OD_WEB_OUTPUT_MODE: "standalone",
        OD_WEB_STANDALONE_ROOT: join(webResource.path, "standalone"),
        PORT: "0",
      },
      logPath: join(layout.logsRoot, APP_KEYS.WEB, "latest.log"),
      request,
      runtimeRoot: layout.runtimeRoot,
      sidecarSupervisorPath: layout.sidecarSupervisorPath,
    });
    webStatus = await waitForStatus<WebStatusSnapshot>({
      child: web.generation,
      isReady: (candidate) => candidate.url != null,
      label: APP_KEYS.WEB,
      stamp: web.stamp,
    });
    if (webStatus.url == null) throw new Error("OpenDesign Web did not expose a URL");
    const registered = await invokeSidecar<RegisterWebUrlResult>(
      daemon.stamp,
      SIDECAR_MESSAGES.REGISTER_WEB_URL,
      { url: webStatus.url },
      { timeoutMs: 1_200 },
    );
    if (registered.accepted !== true) throw new Error("OpenDesign daemon rejected its exact Web URL");
    daemon.generation.process.once("exit", fail);
    web.generation.process.once("exit", fail);
  } catch (error) {
    if (web != null) await closeRuntime(web, 5_000).catch(() => undefined);
    if (daemon != null) await closeRuntime(daemon, 30_000).catch(() => undefined);
    state = "failed";
    resolveTerminal(status());
    throw error;
  }

  return Object.freeze({
    readStatus: async () => status(),
    async invoke(command: StandaloneRuntimeCommand, context?: StandaloneRuntimeInvocationContext): Promise<StandaloneRuntimeCommandResult> {
      const base = resultBase(command);
      if (command.command === OPEN_DESIGN_ELECTRON_AUTH_REGISTER_COMMAND) {
        try {
          const input = validateOpenDesignElectronAuthRegisterRequest(command.input);
          if (context?.attachment.id !== command.attachmentId || context.attachment.shell.type !== "electron" || state !== "running" || daemon == null) {
            throw new Error("Electron auth registration is unavailable");
          }
          const registered = await invokeSidecar<RegisterDesktopAuthResult>(
            daemon.stamp,
            SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH,
            { secret: input.secret },
            { timeoutMs: 1_200 },
          );
          if (registered.accepted !== true) throw new Error("daemon rejected Electron auth registration");
          return Object.freeze({ ...base, outcome: "accepted" as const, output: Object.freeze({ schemaVersion: 1 as const, accepted: true as const }) });
        } catch {
          return Object.freeze({ ...base, outcome: "failed" as const, error: Object.freeze({ code: "electron-auth-registration-failed" }) });
        }
      }
      if (command.command !== OPEN_DESIGN_PRODUCT_RUNTIME_COMMAND) return Object.freeze({ ...base, outcome: "unsupported", error: Object.freeze({ code: "closure-command-unavailable" }) });
      try {
        validateOpenDesignProductRuntimeReadRequest(command.input);
        if (state !== "running" || daemonStatus?.url == null || webStatus?.url == null) throw new Error("OpenDesign runtime is unavailable");
        return Object.freeze({
          ...base,
          outcome: "accepted" as const,
          output: Object.freeze({ schemaVersion: 1 as const, daemon: Object.freeze({ url: daemonStatus.url }), web: Object.freeze({ url: webStatus.url }) }),
        });
      } catch {
        return Object.freeze({ ...base, outcome: "failed" as const, error: Object.freeze({ code: "product-runtime-unavailable" }) });
      }
    },
    async close() {
      if (state === "running") await stopBody("stopped");
      else await shutdown;
      return status();
    },
    waitForTerminal: async () => await terminal,
  });
}

/** Exact generation-owned Web/daemon body consumed by every Shell. */
export const standaloneGenerationHandoff = createStandaloneGenerationBootloader(startOpenDesignGeneration);
