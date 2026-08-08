import {
  attachSidecar,
  type AttachedSidecar,
  type SidecarControlContext,
  type SidecarMethod,
} from "@open-design/sidecar/control";

import { startWebRuntime, type WebSidecarHandle } from "./server.js";

export type WebStandaloneStatus = Awaited<ReturnType<WebSidecarHandle["status"]>>;

type WebStandaloneMethods = {
  status: SidecarMethod<Record<string, never>, WebStandaloneStatus>;
};

export interface WebStandaloneRuntime {
  status(): Promise<WebStandaloneStatus>;
  stop(): Promise<void>;
  waitUntilStopped(): Promise<void>;
}

export type AttachedWebStandaloneSidecar = Readonly<{
  control: AttachedSidecar;
  stop(): Promise<void>;
  waitUntilStopped(): Promise<void>;
}>;

async function startDefaultRuntime(
  context: SidecarControlContext,
): Promise<WebStandaloneRuntime> {
  process.env.OD_DATA_DIR = context.roots.dataRoot;
  process.env.OD_RESOURCE_ROOT = context.roots.resourceRoot;
  return await startWebRuntime({ mode: "runtime" });
}

/** Real Web-directory adapter for the normalized Standalone control plane. */
export async function attachWebStandaloneSidecar(options: {
  startRuntime?: (context: SidecarControlContext) => Promise<WebStandaloneRuntime>;
} = {}): Promise<AttachedWebStandaloneSidecar> {
  const state: { runtime?: WebStandaloneRuntime } = {};
  const stopRuntime = async (): Promise<void> => {
    await state.runtime?.stop();
  };
  const control = await attachSidecar<WebStandaloneMethods>({
    handlers: {
      async status() {
        if (state.runtime == null) throw new Error("web runtime is not initialized");
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
    throw new Error("web standalone sidecar did not initialize its runtime");
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
