import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  normalizeWebSidecarMessage,
  type SidecarStamp,
  type WebStatusSnapshot,
} from "@open-design/sidecar-proto";
import {
  createJsonIpcServer,
  type JsonIpcServerHandle,
  type SidecarRuntimeContext,
} from "@open-design/sidecar";

const HOST = "127.0.0.1";
const WEB_PORT_ENV = SIDECAR_ENV.WEB_PORT;
const TOOLS_DEV_PARENT_PID_ENV = SIDECAR_ENV.TOOLS_DEV_PARENT_PID;
const require = createRequire(import.meta.url);
const createNextServer = require("next") as (options: { dev: boolean; dir: string }) => {
  close?: () => Promise<void>;
  getRequestHandler(): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  prepare(): Promise<void>;
};

export type WebSidecarHandle = {
  status(): Promise<WebStatusSnapshot>;
  stop(): Promise<void>;
  waitUntilStopped(): Promise<void>;
};

function resolveWebRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 8; depth += 1) {
    try {
      const packageJson = JSON.parse(readFileSync(join(current, "package.json"), "utf8")) as { name?: unknown };
      if (packageJson.name === "@open-design/web") return current;
    } catch {
      // Keep walking until the package root is found. This must work from both
      // sidecar/*.ts under tsx and dist/sidecar/*.js in packaged installs.
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error("failed to resolve @open-design/web package root");
}

function parsePort(value: string | undefined): number {
  if (value == null || value.trim().length === 0) return 0;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`${WEB_PORT_ENV} must be an integer between 0 and 65535`);
  }
  return port;
}

async function prepareNextApp(app: { prepare(): Promise<void> }, dir: string): Promise<void> {
  const nextEnvPath = join(dir, "next-env.d.ts");
  const previousNextEnv = await readFile(nextEnvPath, "utf8").catch(() => null);
  await app.prepare();
  if (previousNextEnv == null) {
    await rm(nextEnvPath, { force: true }).catch(() => undefined);
    return;
  }
  await writeFile(nextEnvPath, previousNextEnv, "utf8").catch(() => undefined);
}

async function listen(server: Server, port: number): Promise<number> {
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen({ host: HOST, port }, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address() as AddressInfo | string | null;
  if (address == null || typeof address === "string") {
    throw new Error("failed to resolve Next.js server address");
  }
  return address.port;
}

async function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
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

export async function startWebSidecar(runtime: SidecarRuntimeContext<SidecarStamp>): Promise<WebSidecarHandle> {
  const dir = resolveWebRoot();
  const app = createNextServer({ dev: runtime.mode === "dev", dir });
  await prepareNextApp(app, dir);

  const handleRequest = app.getRequestHandler();
  const httpServer = createHttpServer((request, response) => {
    void handleRequest(request, response).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  const port = await listen(httpServer, parsePort(process.env[WEB_PORT_ENV]));
  const state: WebStatusSnapshot = {
    pid: process.pid,
    state: "running",
    updatedAt: new Date().toISOString(),
    url: `http://${HOST}:${port}`,
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
    await ipcServer?.close().catch(() => undefined);
    await closeHttpServer(httpServer).catch(() => undefined);
    await (app as unknown as { close?: () => Promise<void> }).close?.().catch(() => undefined);
    resolveStopped();
  }

  attachParentMonitor(stop);

  ipcServer = await createJsonIpcServer({
    socketPath: runtime.ipc,
    handler: async (message: unknown) => {
      const request = normalizeWebSidecarMessage(message);
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
