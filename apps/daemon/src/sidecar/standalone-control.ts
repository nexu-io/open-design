import {
  attachSidecar,
  type AttachedSidecar,
  type SidecarControlContext,
  type SidecarMethod,
} from "@open-design/sidecar/control";

import { startDaemonRuntime } from "../daemon-startup.js";

export type DaemonStandaloneStatus = Readonly<{
  pid: number;
  state: "running" | "stopped";
  url: string | null;
}>;

type DaemonStandaloneMethods = {
  registerWebUrl: SidecarMethod<Readonly<{ url: string }>, Readonly<{ accepted: true }>>;
  status: SidecarMethod<Record<string, never>, DaemonStandaloneStatus>;
};

export interface DaemonStandaloneRuntime {
  registerWebUrl?(url: string): Promise<void> | void;
  status(): Promise<DaemonStandaloneStatus>;
  stop(): Promise<void>;
  waitUntilStopped(): Promise<void>;
}

export type AttachedDaemonStandaloneSidecar = Readonly<{
  control: AttachedSidecar;
  stop(): Promise<void>;
  waitUntilStopped(): Promise<void>;
}>;

async function startDefaultRuntime(
  context: SidecarControlContext,
): Promise<DaemonStandaloneRuntime> {
  process.env.OD_DATA_DIR = context.roots.dataRoot;
  process.env.OD_RESOURCE_ROOT = context.roots.resourceRoot;
  const started = await startDaemonRuntime({
    host: "127.0.0.1",
    port: Number(process.env.OD_PORT) || 0,
  });
  let stopped = false;
  let resolveStopped!: () => void;
  const stoppedTask = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });
  return {
    async status() {
      return {
        pid: process.pid,
        state: stopped ? "stopped" : "running",
        url: stopped ? null : started.url,
      };
    },
    async stop() {
      if (stopped) return;
      stopped = true;
      await started.stop();
      resolveStopped();
    },
    async waitUntilStopped() {
      return await stoppedTask;
    },
  };
}

/** Real daemon-directory adapter for the normalized Standalone control plane. */
export async function attachDaemonStandaloneSidecar(options: {
  startRuntime?: (context: SidecarControlContext) => Promise<DaemonStandaloneRuntime>;
} = {}): Promise<AttachedDaemonStandaloneSidecar> {
  const state: { runtime?: DaemonStandaloneRuntime } = {};
  const stopRuntime = async (): Promise<void> => {
    await state.runtime?.stop();
  };
  const control = await attachSidecar<DaemonStandaloneMethods>({
    handlers: {
      async registerWebUrl({ url }) {
        const parsed = new URL(url);
        const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");
        process.env.OD_WEB_PORT = port;
        await state.runtime?.registerWebUrl?.(url);
        return { accepted: true };
      },
      async status() {
        if (state.runtime == null) throw new Error("daemon runtime is not initialized");
        return await state.runtime.status();
      },
    },
    async initialize(context) {
      state.runtime = await (options.startRuntime ?? startDefaultRuntime)(context);
    },
    onStopRequested: stopRuntime,
  });
  const activeRuntime = state.runtime;
  if (activeRuntime == null) {
    await control.close().catch(() => undefined);
    throw new Error("daemon standalone sidecar did not initialize its runtime");
  }
  return Object.freeze({
    control,
    async stop() {
      await stopRuntime();
      await control.close();
    },
    async waitUntilStopped() {
      await activeRuntime.waitUntilStopped();
    },
  });
}
