import { dirname, join } from "node:path";
import { BrowserWindow, app } from "electron";
import { inspectElectronCdp } from "@open-design/electron-kit/runtime";

import { APP_KEYS } from "@open-design/sidecar-proto";
import {
  bootstrapSidecarProcessWithSupervisor,
  isCurrentSidecarLauncher,
  readOptionalCurrentSidecarStamp,
  registerSidecarProcess,
  SidecarFactory,
  type SidecarResources,
} from "@open-design/sidecar/authority";

const CONTROL_RESOURCES_ENV = "OD_ELECTRON_CONTROL_RESOURCES";

function resources(): Readonly<Pick<SidecarResources, "dataRoot" | "ownerPid" | "port" | "runtimeRoot">> {
  const serialized = process.env[CONTROL_RESOURCES_ENV];
  if (serialized == null) throw new Error(`${CONTROL_RESOURCES_ENV} is required for a supervised Electron Shell`);
  let value: unknown;
  try { value = JSON.parse(serialized); }
  catch (error) { throw new Error(`${CONTROL_RESOURCES_ENV} must be JSON`, { cause: error }); }
  if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${CONTROL_RESOURCES_ENV} is invalid`);
  const candidate = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(candidate).sort()) !== JSON.stringify(["dataRoot", "ownerPid", "port", "runtimeRoot"])
    || candidate.dataRoot !== null || (candidate.ownerPid !== null && (!Number.isSafeInteger(candidate.ownerPid) || Number(candidate.ownerPid) <= 0))
    || candidate.port !== 0 || typeof candidate.runtimeRoot !== "string" || candidate.runtimeRoot.length === 0) throw new Error(`${CONTROL_RESOURCES_ENV} values are invalid`);
  return Object.freeze({ dataRoot: null, ownerPid: candidate.ownerPid as number | null, port: 0, runtimeRoot: candidate.runtimeRoot });
}

export async function runControlledElectronShell(run: () => Promise<void>): Promise<void> {
  const stamp = readOptionalCurrentSidecarStamp();
  if (stamp == null) return await run();
  if (stamp.app !== APP_KEYS.ELECTRON) throw new Error(`Electron Shell cannot run Sidecar app ${stamp.app}`);
  const controlResources = resources();
  if (isCurrentSidecarLauncher()) {
    const resourceRoot = app.isPackaged ? process.resourcesPath : app.getAppPath();
    await bootstrapSidecarProcessWithSupervisor(stamp, controlResources, { supervisor: { command: process.execPath, entrypoint: join(resourceRoot, "supervisor.mjs") } });
    app.exit(0);
    return;
  }
  // Registration is deliberately synchronous in a supervised Electron
  // generation: Shell preflight must execute before Chromium reports ready.
  registerSidecarProcess(stamp, controlResources);
  const cdpBootstrapUserDataRoot = app.getPath("userData");
  const running = run();
  const client = SidecarFactory.create<{ startedAt: string }>({
    lifecycle: {
      async start() { await running; return Object.freeze({ startedAt: new Date().toISOString() }); },
      status(runtime) {
        const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed()) ?? null;
        const namespaceRoot = dirname(app.getPath("userData"));
        return Object.freeze({
          pid: process.pid,
          startedAt: runtime.startedAt,
          state: "running",
          title: window?.getTitle() ?? null,
          url: window?.webContents.getURL() ?? null,
          windowVisible: window?.isVisible() ?? false,
          cdp: inspectElectronCdp(app, cdpBootstrapUserDataRoot),
          logRoots: Object.freeze([
            Object.freeze({ scope: "shell", path: join(namespaceRoot, "runtime", "electron", "logs") }),
            Object.freeze({ scope: "product", path: join(namespaceRoot, "logs", "product") }),
          ]),
        });
      },
      async stop() {
        if (!app.isReady()) return;
        app.quit();
        await new Promise<void>((resolve) => app.once("will-quit", () => resolve()));
      },
    },
  });
  await client.start();
  await client.waitUntilStopped();
}
