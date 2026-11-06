import { APP_KEYS, SIDECAR_MESSAGES, isSidecarSource } from "@open-design/sidecar-proto";
import { SidecarFactory, type SidecarClient } from "@open-design/sidecar";

import { startDaemonSidecar, type DaemonSidecarHandle } from "./server.js";
import {
  executeLegacyPayloadDesktopHandoff,
  prepareLegacyPayloadDesktopHandoff,
} from "./payload-desktop-handoff.js";
import { waitForParentMonitorRelease } from "./parent-monitor-gate.js";

async function main(): Promise<void> {
  let runtimeHandle: DaemonSidecarHandle | null = null;
  const invoke = async (action: string, input: unknown) => {
    if (runtimeHandle == null) throw new Error("daemon sidecar is not running");
    return await runtimeHandle.invoke(action, input);
  };
  let client!: SidecarClient<DaemonSidecarHandle>;
  client = SidecarFactory.create<DaemonSidecarHandle>({
    handlers: {
      [SIDECAR_MESSAGES.MINT_IMPORT_TOKEN]: (input) => invoke(SIDECAR_MESSAGES.MINT_IMPORT_TOKEN, input),
      [SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH]: (input) => invoke(SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH, input),
      [SIDECAR_MESSAGES.REGISTER_WEB_URL]: (input) => invoke(SIDECAR_MESSAGES.REGISTER_WEB_URL, input),
    },
    lifecycle: {
      async start(resources) {
        if (client.stamp.app !== APP_KEYS.DAEMON) throw new Error(`daemon sidecar cannot run stamp app ${client.stamp.app}`);
        if (!isSidecarSource(client.stamp.source)) throw new Error(`unsupported daemon sidecar source: ${client.stamp.source}`);
        if (resources.dataRoot == null) delete process.env.OD_DATA_DIR;
        else process.env.OD_DATA_DIR = resources.dataRoot;
        const started = await startDaemonSidecar({
          base: resources.runtimeRoot,
          mode: client.stamp.mode,
          namespace: client.stamp.namespace,
          source: client.stamp.source,
        }, {
          inheritedEnvironment: (baseEnv) => SidecarFactory.inheritedEnvironment(baseEnv),
          invokeDesktop: async <TResult>(action: string, input: unknown, timeoutMs: number) =>
            await client.invoke<TResult>(APP_KEYS.DESKTOP, action, input, { timeoutMs }),
          port: resources.port,
          statusDesktop: async (timeoutMs: number) =>
            await client.status(APP_KEYS.DESKTOP, { timeoutMs }),
        });
        runtimeHandle = started;
        return started;
      },
      async status(runtime) {
        return await runtime.status();
      },
      async stop(runtime) {
        await waitForParentMonitorRelease();
        await runtime.stop();
        runtimeHandle = null;
      },
    },
  });
  await client.start();
  if (!isSidecarSource(client.stamp.source)) throw new Error(`unsupported daemon sidecar source: ${client.stamp.source}`);
  const desktopHandoff = client.resources.dataRoot == null ? null : await prepareLegacyPayloadDesktopHandoff({
    dataRoot: client.resources.dataRoot,
    namespace: client.stamp.namespace,
    outerPid: client.resources.ownerPid,
    requestDesktopStatus: async () => await client.status(APP_KEYS.DESKTOP, { timeoutMs: 800 }),
    runtimeRoot: client.resources.runtimeRoot,
    source: client.stamp.source,
  }).catch((error: unknown) => {
    console.warn("[packaged desktop handoff] prepare failed", error);
    return null;
  });
  if (desktopHandoff?.kind === "none") {
    console.info("[packaged desktop handoff] skipped", { reason: desktopHandoff.reason });
  } else if (desktopHandoff?.kind === "prepared") {
    void executeLegacyPayloadDesktopHandoff(desktopHandoff, {
      requestDesktop: async (message) => message === "status"
        ? await client.status(APP_KEYS.DESKTOP, { timeoutMs: 800 })
        : await client.requestStop(APP_KEYS.DESKTOP, { timeoutMs: 800 }),
    }).then((result) => {
      console.info("[packaged desktop handoff]", result);
    }).catch((error: unknown) => {
      console.warn("[packaged desktop handoff] execute failed", error);
    });
  }
  await client.waitUntilStopped();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
