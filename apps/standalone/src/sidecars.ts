import { mkdir } from "node:fs/promises";

import {
  bootstrapControlPlane,
  type SidecarLaunch,
  type SidecarLaunchOptions,
  type SidecarMethod,
} from "@open-design/sidecar/control";
import {
  STANDALONE_HANDOFF_SCHEMA_VERSION,
  validateStandaloneHandoffRequest,
  type StandaloneHandle,
  type StandaloneHandoffRequest,
  type StandaloneRuntimeFailedStatus,
  type StandaloneRuntimeStatus,
  type StandaloneRuntimeTerminalStatus,
} from "@open-design/standalone-proto";
import {
  acquireStandalone,
  type StandaloneRuntimeHandle,
} from "@open-design/standalone-runtime";

type SidecarStatus = Readonly<{
  pid: number;
  state: "running" | "stopped";
  url: string | null;
}>;

type StatusMethods = {
  status: SidecarMethod<Record<string, never>, SidecarStatus>;
};

type DaemonMethods = StatusMethods & {
  registerWebUrl: SidecarMethod<Readonly<{ url: string }>, Readonly<{ accepted: true }>>;
};

export type StandaloneSidecarLaunchSpec = Readonly<{
  args?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  executable: string;
  output?: "ignore" | "inherit";
  readyTimeoutMs?: number;
  stopTimeoutMs?: number;
}>;

export type StartSidecarStandaloneOptions = Readonly<{
  daemon: StandaloneSidecarLaunchSpec;
  web: StandaloneSidecarLaunchSpec;
}>;

function launchOptions(
  service: "daemon" | "web",
  spec: StandaloneSidecarLaunchSpec,
  env?: NodeJS.ProcessEnv,
): SidecarLaunchOptions {
  const launchEnv = env ?? spec.env;
  return {
    executable: spec.executable,
    service,
    ...(spec.args == null ? {} : { args: spec.args }),
    ...(spec.cwd == null ? {} : { cwd: spec.cwd }),
    ...(launchEnv == null ? {} : { env: launchEnv }),
    ...(spec.output == null ? {} : { output: spec.output }),
    ...(spec.readyTimeoutMs == null ? {} : { readyTimeoutMs: spec.readyTimeoutMs }),
    ...(spec.stopTimeoutMs == null ? {} : { stopTimeoutMs: spec.stopTimeoutMs }),
  };
}

function runtimeHandle(
  stop: () => Promise<unknown>,
  readStatus: () => Promise<SidecarStatus>,
  status: SidecarStatus,
): StandaloneRuntimeHandle<SidecarStatus> {
  return {
    async close() {
      await stop();
    },
    readStatus,
    status,
  };
}

function webDaemonPort(url: string): string {
  const parsed = new URL(url);
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
  if (!/^\d+$/u.test(port)) throw new Error("daemon URL does not contain a valid port");
  return port;
}

/**
 * Real Standalone composition over the normalized sidecar control plane.
 * Product method catalogs remain local; packages/sidecar only sees opaque
 * services, lifecycle mechanics and caller-owned launch commands.
 */
export async function startSidecarStandalone(
  input: StandaloneHandoffRequest,
  options: StartSidecarStandaloneOptions,
): Promise<StandaloneHandle> {
  const request = validateStandaloneHandoffRequest(input);
  const scope = request.handoff.scope;
  const control = bootstrapControlPlane({
    projection: {
      digest: request.handoff.descriptorDigest,
      value: request.handoff.descriptor,
    },
    roots: {
      dataRoot: request.paths.dataRoot,
      resourceRoot: request.paths.resourceRoot,
      runtimeRoot: request.paths.runtimeRoot,
    },
    scope: {
      channel: scope.channel,
      generation: scope.generation,
      namespace: scope.namespace,
    },
  });
  const launches: {
    daemon?: SidecarLaunch<DaemonMethods>;
    web?: SidecarLaunch<StatusMethods>;
  } = {};

  const product = await acquireStandalone<SidecarStatus, SidecarStatus>({
    dependencies: {
      async preparePaths(paths) {
        await Promise.all([
          mkdir(paths.cacheRoot, { recursive: true }),
          mkdir(paths.dataRoot, { recursive: true }),
          mkdir(paths.logsRoot, { recursive: true }),
          mkdir(paths.runtimeRoot, { recursive: true }),
        ]);
      },
      async registerWebUrl({ webUrl }) {
        if (launches.daemon == null) throw new Error("daemon sidecar is unavailable");
        await launches.daemon.client.call("registerWebUrl", { url: webUrl });
      },
      async startDaemon() {
        const launch = await control.launch<DaemonMethods>(launchOptions("daemon", options.daemon));
        launches.daemon = launch;
        const status = await launch.client.call("status", {});
        return runtimeHandle(
          async () => await launch.stop(),
          async () => await launch.client.call("status", {}),
          status,
        );
      },
      async startWeb({ daemon }) {
        const launch = await control.launch<StatusMethods>(launchOptions("web", options.web, {
          ...options.web.env,
          OD_PORT: webDaemonPort(daemon.url ?? ""),
        }));
        launches.web = launch;
        const status = await launch.client.call("status", {});
        return runtimeHandle(
          async () => await launch.stop(),
          async () => await launch.client.call("status", {}),
          status,
        );
      },
    },
    namespace: scope.namespace,
    paths: request.paths,
  });

  let status: StandaloneRuntimeStatus = {
    handoff: request.handoff,
    pid: process.pid,
    schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
    state: "running",
    webUrl: product.webUrl,
  };
  let closing = false;
  let closeTask: Promise<StandaloneRuntimeTerminalStatus> | null = null;
  let resolveTerminal!: (value: StandaloneRuntimeTerminalStatus) => void;
  const terminal = new Promise<StandaloneRuntimeTerminalStatus>((resolve) => {
    resolveTerminal = resolve;
  });

  const failFromExit = (service: "daemon" | "web"): void => {
    if (closing || status.state !== "running") return;
    closing = true;
    const failed: StandaloneRuntimeFailedStatus = {
      error: { code: `${service}-sidecar-exited` },
      handoff: request.handoff,
      pid: process.pid,
      schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
      state: "failed",
    };
    status = failed;
    void product.close().catch(() => undefined).finally(() => resolveTerminal(failed));
  };
  void launches.daemon?.exited.then(() => failFromExit("daemon"));
  void launches.web?.exited.then(() => failFromExit("web"));

  return Object.freeze({
    async close() {
      if (closeTask != null) return await closeTask;
      if (status.state === "failed") return status;
      closing = true;
      closeTask = (async () => {
        try {
          await product.close();
          const stopped = {
            handoff: request.handoff,
            pid: process.pid,
            schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
            state: "stopped",
          } as const;
          status = stopped;
          resolveTerminal(stopped);
          return stopped;
        } catch (error) {
          const failed = {
            error: { code: "sidecar-stop-failed" },
            handoff: request.handoff,
            pid: process.pid,
            schemaVersion: STANDALONE_HANDOFF_SCHEMA_VERSION,
            state: "failed",
          } as const;
          status = failed;
          resolveTerminal(failed);
          throw error;
        }
      })();
      return await closeTask;
    },
    async readStatus() {
      return status;
    },
    async waitForTerminal() {
      return await terminal;
    },
  });
}
