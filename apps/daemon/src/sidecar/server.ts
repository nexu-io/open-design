import type { Server } from "node:http";

import {
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  normalizeDaemonSidecarMessage,
  type DaemonStatusSnapshot,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import {
  createJsonIpcServer,
  type JsonIpcServerHandle,
  type SidecarRuntimeContext,
} from "@open-design/sidecar";

import { startServer } from "../server.js";

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
  const started = await startServer({ port: parsePort(process.env[DAEMON_PORT_ENV]), returnServer: true }) as
    | string
    | StartedDaemonServer;
  if (typeof started === "string") {
    throw new Error("daemon startServer did not return a server handle");
  }
  const serverHandle = started;

  const state: DaemonStatusSnapshot = {
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
          return { ...state };
        case SIDECAR_MESSAGES.SHUTDOWN:
          setImmediate(() => {
            void stop().finally(() => process.exit(0));
          });
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
      return { ...state };
    },
    stop,
    waitUntilStopped() {
      return stoppedPromise;
    },
  };
}
