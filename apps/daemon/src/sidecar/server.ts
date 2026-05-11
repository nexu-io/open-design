import type { Server } from "node:http";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  normalizeDaemonSidecarMessage,
  type DaemonStatusSnapshot,
  type DesktopExportPdfInput,
  type DesktopExportPdfResult,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import {
  createJsonIpcServer,
  requestJsonIpc,
  resolveAppIpcPath,
  type JsonIpcServerHandle,
  type SidecarRuntimeContext,
} from "@open-design/sidecar";

import { isDesktopAuthGateActive, setDesktopAuthSecret, startServer } from "../server.js";

/**
 * PR #974 round 6 (mrcfps): pure wrapper that overlays the live
 * `desktopAuthGateActive` flag on a cached startup snapshot. The
 * STATUS IPC handler and the public `status()` method both call this
 * so the gate flag is always read fresh (it flips after
 * REGISTER_DESKTOP_AUTH and stays sticky), even though the rest of
 * the snapshot is captured once at boot. Exported so the daemon
 * test suite can pin the wiring without booting a real IPC server.
 */
export function withCurrentDesktopAuthGate(snapshot: DaemonStatusSnapshot): DaemonStatusSnapshot {
  return { ...snapshot, desktopAuthGateActive: isDesktopAuthGateActive() };
}

const DAEMON_PORT_ENV = SIDECAR_ENV.DAEMON_PORT;
const TOOLS_DEV_PARENT_PID_ENV = SIDECAR_ENV.TOOLS_DEV_PARENT_PID;

type StartedDaemonServer = {
  server: Server;
  url: string;
  shutdown?: () => Promise<void>;
};

export type DaemonSidecarHandle = {
  status(): Promise<DaemonStatusSnapshot>;
  stop(): Promise<void>;
  waitUntilStopped(): Promise<void>;
};

function parsePort(value: string | undefined): number {
  if (value == null || value.trim().length === 0) return 0;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`${DAEMON_PORT_ENV} must be an integer between 0 and 65535`);
  }
  return port;
}

export async function closeHttpServer(
  server: Server,
  { closeTimeoutMs = 5_000, idleCloseMs = 1_000 } = {},
): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    let resolved = false;
    const resolveOnce = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
      resolveClose();
    };
    const rejectOnce = (error: Error) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
      rejectClose(error);
    };
    const idleTimer = setTimeout(() => {
      server.closeIdleConnections?.();
    }, Math.min(idleCloseMs, closeTimeoutMs));
    const hardTimer = setTimeout(() => {
      server.closeAllConnections?.();
      resolveOnce();
    }, closeTimeoutMs);
    idleTimer.unref?.();
    hardTimer.unref?.();
    server.close((error) => (error == null ? resolveOnce() : rejectOnce(error)));
  }).finally(() => {
    server.closeIdleConnections?.();
  });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function attachParentMonitor(stop: () => Promise<void>): void {
  const parentPid = Number(process.env[TOOLS_DEV_PARENT_PID_ENV]);
  if (!Number.isInteger(parentPid) || parentPid <= 0) return;

  const timer = setInterval(() => {
    if (isProcessAlive(parentPid)) return;
    clearInterval(timer);
    void stop().finally(() => process.exit(0));
  }, 1000);
  timer.unref();
}

export async function startDaemonSidecar(runtime: SidecarRuntimeContext<SidecarStamp>): Promise<DaemonSidecarHandle> {
  const started = await startServer({
    desktopPdfExporter: async (input: DesktopExportPdfInput): Promise<DesktopExportPdfResult> => {
      const desktopIpc = resolveAppIpcPath({
        app: APP_KEYS.DESKTOP,
        contract: OPEN_DESIGN_SIDECAR_CONTRACT,
        namespace: runtime.namespace,
      });
      return await requestJsonIpc<DesktopExportPdfResult>(
        desktopIpc,
        { input, type: SIDECAR_MESSAGES.EXPORT_PDF },
        { timeoutMs: 600_000 },
      );
    },
    port: parsePort(process.env[DAEMON_PORT_ENV]),
    returnServer: true,
  }) as
    | string
    | StartedDaemonServer;
  if (typeof started === "string") {
    throw new Error("daemon startServer did not return a server handle");
  }
  const serverHandle = started;

  // PR #974 round 6 (mrcfps): tools-dev's split-start hardening reads
  // `desktopAuthGateActive` from the STATUS IPC. The flag is dynamic
  // (flips to true on REGISTER_DESKTOP_AUTH) so the STATUS handler and
  // the public `status()` method below recompute it from
  // `isDesktopAuthGateActive()` per request — the value cached here is
  // a startup snapshot only.
  const state: DaemonStatusSnapshot = {
    desktopAuthGateActive: isDesktopAuthGateActive(),
    pid: process.pid,
    state: "running",
    updatedAt: new Date().toISOString(),
    url: serverHandle.url,
  };
  let ipcServer: JsonIpcServerHandle | null = null;
  let stopped = false;
  let resolveStopped!: () => void;
  const stoppedPromise = new Promise<void>((resolveStop) => {
    resolveStopped = resolveStop;
  });

  async function stop(): Promise<void> {
    if (stopped) return;
    stopped = true;
    state.state = "stopped";
    state.updatedAt = new Date().toISOString();
    const closePromise = closeHttpServer(serverHandle.server).catch(() => undefined);
    const shutdownPromise = serverHandle.shutdown?.().catch((error: unknown) => {
      console.error("daemon shutdown cleanup failed", error);
    }) ?? Promise.resolve();
    await ipcServer?.close().catch(() => undefined);
    await Promise.allSettled([closePromise, shutdownPromise]);
    resolveStopped();
  }

  attachParentMonitor(stop);

  ipcServer = await createJsonIpcServer({
    socketPath: runtime.ipc,
    handler: async (message: unknown) => {
      const request = normalizeDaemonSidecarMessage(message);
      switch (request.type) {
        case SIDECAR_MESSAGES.STATUS:
          // PR #974 round 6 (mrcfps): recompute the gate flag per
          // request so `tools-dev start desktop` sees the live value
          // (the flag flips after REGISTER_DESKTOP_AUTH and stays sticky).
          return withCurrentDesktopAuthGate(state);
        case SIDECAR_MESSAGES.SHUTDOWN:
          setImmediate(() => {
            void stop().finally(() => process.exit(0));
          });
          return { accepted: true };
        case SIDECAR_MESSAGES.REGISTER_DESKTOP_AUTH:
          // PR #974: the desktop main process registers its per-process
          // auth secret here at startup. From this point on the HTTP
          // server's POST /api/import/folder middleware requires a valid
          // HMAC token signed with this secret, closing the
          // renderer→arbitrary-baseDir→shell.openPath bypass.
          setDesktopAuthSecret(Buffer.from(request.input.secret, "base64"));
          return { accepted: true };
      }
    },
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void stop().finally(() => process.exit(0));
    });
  }

  return {
    async status() {
      return withCurrentDesktopAuthGate(state);
    },
    stop,
    waitUntilStopped() {
      return stoppedPromise;
    },
  };
}
