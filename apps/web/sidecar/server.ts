import {
  createServer as createHttpServer,
  request as createHttpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { request as createHttpsRequest } from "node:https";
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

const HOST = process.env.OD_HOST || "127.0.0.1";
if (process.env.OD_HOST != null && !/^[a-zA-Z0-9._\-:[\]@]+$/.test(process.env.OD_HOST)) {
  throw new Error(`OD_HOST contains invalid characters: ${process.env.OD_HOST}`);
}
const DAEMON_HOST = "127.0.0.1";
const DAEMON_PORT_ENV = SIDECAR_ENV.DAEMON_PORT;
const WEB_PORT_ENV = SIDECAR_ENV.WEB_PORT;
const TOOLS_DEV_PARENT_PID_ENV = SIDECAR_ENV.TOOLS_DEV_PARENT_PID;
const SHUTDOWN_TIMEOUT_MS = 3000;
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

function resolveDaemonOrigin(): string | null {
  const port = parsePort(process.env[DAEMON_PORT_ENV]);
  return port === 0 ? null : `http://${DAEMON_HOST}:${port}`;
}

function isDaemonProxyPathname(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/artifacts" ||
    pathname.startsWith("/artifacts/") ||
    pathname === "/frames" ||
    pathname.startsWith("/frames/")
  );
}

export function resolveDaemonProxyTarget(
  daemonOrigin: string,
  requestUrl: string | undefined,
): URL | null {
  if (requestUrl == null) return null;

  let parsedRequestUrl: URL;
  try {
    parsedRequestUrl = new URL(requestUrl, `http://${HOST}`);
  } catch {
    return null;
  }

  if (!isDaemonProxyPathname(parsedRequestUrl.pathname)) return null;

  return new URL(`${parsedRequestUrl.pathname}${parsedRequestUrl.search}`, daemonOrigin);
}

export function normalizeDaemonProxyOriginHeader(options: {
  daemonOrigin: string;
  origin: string | undefined;
  webPort: number;
}): string | undefined {
  if (options.origin == null || options.origin.length === 0) return options.origin;

  const schemes = ["http", "https"];
  const loopbackHosts = ["127.0.0.1", "localhost", "[::1]", HOST];
  const allowedWebOrigins = new Set(
    schemes.flatMap((scheme) => loopbackHosts.map((host) => `${scheme}://${host}:${options.webPort}`)),
  );

  return allowedWebOrigins.has(options.origin) ? options.daemonOrigin : options.origin;
}

async function proxyToDaemon(
  target: URL,
  request: IncomingMessage,
  response: ServerResponse,
  webPort: number,
): Promise<void> {
  const proxyRequestFactory = target.protocol === "https:" ? createHttpsRequest : createHttpRequest;
  const headers = { ...request.headers, host: target.host };
  const origin = normalizeDaemonProxyOriginHeader({
    daemonOrigin: target.origin,
    origin: typeof request.headers.origin === "string" ? request.headers.origin : undefined,
    webPort,
  });
  if (origin == null || origin.length === 0) {
    delete headers.origin;
  } else {
    headers.origin = origin;
  }

  await new Promise<void>((resolveProxy) => {
    const proxyRequest = proxyRequestFactory(
      target,
      {
        headers,
        method: request.method,
      },
      (proxyResponse) => {
        response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
        proxyResponse.pipe(response);
        proxyResponse.on("end", resolveProxy);
      },
    );

    proxyRequest.on("error", (error) => {
      if (!response.headersSent) {
        response.statusCode = 502;
        response.setHeader("content-type", "text/plain; charset=utf-8");
      }
      response.end(error instanceof Error ? error.message : String(error));
      resolveProxy();
    });

    request.pipe(proxyRequest);
  });
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

async function settleShutdownTask(task: Promise<unknown> | undefined): Promise<void> {
  if (task == null) return;
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      task.catch(() => undefined),
      new Promise<void>((resolveTimeout) => {
        timeout = setTimeout(resolveTimeout, SHUTDOWN_TIMEOUT_MS);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout != null) clearTimeout(timeout);
  }
}

function stopThenExit(stop: () => Promise<void>): void {
  const hardExit = setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS + 1000);
  hardExit.unref();
  void stop().finally(() => {
    clearTimeout(hardExit);
    process.exit(0);
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
    stopThenExit(stop);
  }, 1000);
  timer.unref();
}

export async function startWebSidecar(runtime: SidecarRuntimeContext<SidecarStamp>): Promise<WebSidecarHandle> {
  const dir = resolveWebRoot();
  const app = createNextServer({ dev: process.env.OD_WEB_PROD !== "1" && runtime.mode === "dev", dir });
  await prepareNextApp(app, dir);

  const daemonOrigin = resolveDaemonOrigin();
  const handleRequest = app.getRequestHandler();
  let webPort = 0;
  const httpServer = createHttpServer((request, response) => {
    const daemonProxyTarget = daemonOrigin == null ? null : resolveDaemonProxyTarget(daemonOrigin, request.url);
    if (daemonProxyTarget != null) {
      void proxyToDaemon(daemonProxyTarget, request, response, webPort).catch((error: unknown) => {
        response.statusCode = 502;
        response.end(error instanceof Error ? error.message : String(error));
      });
      return;
    }

    void handleRequest(request, response).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  });
  const port = await listen(httpServer, parsePort(process.env[WEB_PORT_ENV]));
  webPort = port;
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
    await settleShutdownTask(ipcServer?.close());
    await settleShutdownTask(closeHttpServer(httpServer));
    await settleShutdownTask((app as unknown as { close?: () => Promise<void> }).close?.());
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
            stopThenExit(stop);
          });
          return { accepted: true };
      }
    },
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      stopThenExit(stop);
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
