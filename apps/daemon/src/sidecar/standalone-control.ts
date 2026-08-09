import {
  attachSidecar,
  bootstrapControlPlane,
  type AttachedSidecar,
  type SidecarControlContext,
  type SidecarMethod,
} from "@open-design/sidecar/control";
import {
  STANDALONE_SHELL_CAPABILITIES,
  type StandaloneProtocolJsonValue,
  type StandaloneShellCapability,
  type StandaloneShellCapabilityInput,
  type StandaloneShellCapabilityOutput,
  type StandaloneShellCapabilityResult,
  validateStandaloneShellCapabilityInput,
  validateStandaloneShellCapabilityOutput,
} from "@open-design/standalone-proto";

import { startDaemonRuntime } from "../daemon-startup.js";
import { setDesktopAuthSecret } from "../desktop-auth.js";

export type DaemonStandaloneStatus = Readonly<{
  pid: number;
  state: "running" | "stopped";
  url: string | null;
}>;

type DaemonStandaloneMethods = {
  registerDesktopAuth: SidecarMethod<Readonly<{ secret: string }>, Readonly<{ accepted: true }>>;
  registerWebUrl: SidecarMethod<Readonly<{ url: string }>, Readonly<{ accepted: true }>>;
  status: SidecarMethod<Record<string, never>, DaemonStandaloneStatus>;
};

type ShellCapabilityBridgeMethods = {
  invoke: SidecarMethod<
    Readonly<{ attachmentId: string; capability: string; input: StandaloneProtocolJsonValue }>,
    StandaloneShellCapabilityResult
  >;
};

const STANDALONE_SHELL_CAPABILITY_SERVICE = "shell";

export interface DaemonStandaloneRuntime {
  registerDesktopAuth?(secret: string): Promise<void> | void;
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
  const shellCapabilities = await bootstrapControlPlane({
    projection: context.projection,
    roots: context.roots,
    scope: {
      channel: context.identity.channel,
      generation: context.identity.generation,
      namespace: context.identity.namespace,
    },
  }).connect<ShellCapabilityBridgeMethods>(STANDALONE_SHELL_CAPABILITY_SERVICE);
  const invokeShell = async <TCapability extends StandaloneShellCapability>(
    capability: TCapability,
    input: StandaloneShellCapabilityInput<TCapability>,
  ): Promise<StandaloneShellCapabilityOutput<TCapability>> => {
    const validatedInput = validateStandaloneShellCapabilityInput(capability, input);
    const attachmentId = process.env.OD_STANDALONE_ATTACHMENT_ID;
    if (attachmentId == null || attachmentId.length === 0) {
      throw new Error("Standalone Shell attachment identity is unavailable");
    }
    const result = await shellCapabilities.call("invoke", {
      attachmentId,
      capability,
      input: validatedInput as StandaloneProtocolJsonValue,
    });
    if (result.outcome === "completed") {
      return validateStandaloneShellCapabilityOutput(capability, result.output);
    }
    if (result.outcome === "unsupported") {
      throw new Error(`Electron Shell capability is unsupported: ${capability}`);
    }
    throw new Error(`Electron Shell capability failed: ${capability} (${result.error.code})`);
  };
  const started = await startDaemonRuntime({
    desktopArtifactExporter: async (input) =>
      await invokeShell(
        STANDALONE_SHELL_CAPABILITIES.EXPORT_ARTIFACT,
        input,
      ),
    desktopPdfExporter: async (input) =>
      await invokeShell(
        STANDALONE_SHELL_CAPABILITIES.EXPORT_PDF,
        input,
      ),
    desktopSlideRenderer: async (input) =>
      await invokeShell(
        STANDALONE_SHELL_CAPABILITIES.RENDER_SLIDES,
        input,
      ),
    host: "127.0.0.1",
    port: Number(process.env.OD_PORT) || 0,
  });
  let stopped = false;
  let resolveStopped!: () => void;
  const stoppedTask = new Promise<void>((resolve) => {
    resolveStopped = resolve;
  });
  return {
    registerDesktopAuth(secret) {
      setDesktopAuthSecret(Buffer.from(secret, "base64"));
    },
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
      async registerDesktopAuth({ secret }) {
        await state.runtime?.registerDesktopAuth?.(secret);
        return { accepted: true };
      },
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
