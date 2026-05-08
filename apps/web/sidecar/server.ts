import { spawn, type ChildProcess } from "node:child_process";
import {
  createServer as createHttpServer,
  request as createHttpRequest,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
import { request as createHttpsRequest } from "node:https";
import { existsSync, readFileSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer as createTcpServer, type AddressInfo, type Server as TcpServer } from "node:net";
import { dirname, isAbsolute, join } from "node:path";
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
const STANDALONE_BACKEND_HOST = "127.0.0.1";
const DAEMON_PORT_ENV = SIDECAR_ENV.DAEMON_PORT;
const WEB_DIST_DIR_ENV = SIDECAR_ENV.WEB_DIST_DIR;
const WEB_PORT_ENV = SIDECAR_ENV.WEB_PORT;
const TOOLS_DEV_PARENT_PID_ENV = SIDECAR_ENV.TOOLS_DEV_PARENT_PID;
const WEB_OUTPUT_MODE_ENV = "OD_WEB_OUTPUT_MODE";
const WEB_STANDALONE_ROOT_ENV = "OD_WEB_STANDALONE_ROOT";
const STANDALONE_PARENT_PID_ENV = "OD_STANDALONE_PARENT_PID";
const STANDALONE_STARTUP_TIMEOUT_ENV = "OD_STANDALONE_STARTUP_TIMEOUT_MS";
const SHUTDOWN_TIMEOUT_MS = 3000;
const require = createRequire(import.meta.url);

type NextApp = {
  close?: () => Promise<void>;
  getRequestHandler(): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  prepare(): Promise<void>;
};

type StandaloneBackend = {
  exitReason(): string | null;
  isRunning(): boolean;
  origin: string;
  stop(): Promise<void>;
};

function createNextApp(options: { dev: boolean; dir: string }): NextApp {
  const createNextServer = require("next") as (nextOptions: { dev: boolean; dir: string }) => NextApp;
  return createNextServer(options);
}

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

function parsePositiveIntegerEnv(envName: string, defaultValue: number): number {
  const value = process.env[envName];
  if (value == null || value.trim().length === 0) return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive integer`);
  }
  return parsed;
}

function resolveStandaloneStartupTimeoutMs(): number {
  return parsePositiveIntegerEnv(STANDALONE_STARTUP_TIMEOUT_ENV, 35_000);
}

export function createStandaloneParentMonitorImport(parentPidEnv = STANDALONE_PARENT_PID_ENV): string {
  const source = `
const parentPid = Number(process.env[${JSON.stringify(parentPidEnv)}]);
if (Number.isInteger(parentPid) && parentPid > 0) {
  const isParentAlive = () => {
    try {
      process.kill(parentPid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const timer = setInterval(() => {
    if (process.ppid === parentPid && isParentAlive()) return;
    process.exit(0);
  }, 1000);
  timer.unref?.();
}
`;
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

export function createStandaloneServerArgs(entryPath: string): string[] {
  return ["--import", createStandaloneParentMonitorImport(), entryPath];
}

export function resolveStandaloneBackendOrigin(port: number): string {
  return `http://${STANDALONE_BACKEND_HOST}:${port}`;
}

export function createStandaloneBackendEnv(options: {
  baseEnv?: NodeJS.ProcessEnv;
  parentPid?: number;
  port: number;
}): NodeJS.ProcessEnv {
  return {
    ...(options.baseEnv ?? process.env),
    HOSTNAME: STANDALONE_BACKEND_HOST,
    NODE_ENV: "production",
    PORT: String(options.port),
    [STANDALONE_PARENT_PID_ENV]: String(options.parentPid ?? process.pid),
  };
}

function resolveWebDistDir(webRoot: string): string {
  const configured = process.env[WEB_DIST_DIR_ENV];
  if (configured == null || configured.length === 0) return join(webRoot, ".next");
  return isAbsolute(configured) ? configured : join(webRoot, configured);
}

function resolveConfiguredStandaloneRoot(): string | null {
  const configured = process.env[WEB_STANDALONE_ROOT_ENV];
  if (configured == null || configured.length === 0) return null;
  return isAbsolute(configured) ? configured : join(process.cwd(), configured);
}

export function resolveStandaloneServerEntry(
  webRoot: string | null = resolveWebRoot(),
  standaloneRoot: string | null = resolveConfiguredStandaloneRoot(),
): string | null {
  const configuredRoot = standaloneRoot == null || standaloneRoot.length === 0
    ? null
    : isAbsolute(standaloneRoot)
      ? standaloneRoot
      : join(process.cwd(), standaloneRoot);
  const candidates = [
    ...(configuredRoot == null
      ? []
      : [
        join(configuredRoot, "apps", "web", "server.js"),
        join(configuredRoot, "server.js"),
      ]),
    ...(webRoot == null
      ? []
      : [
        join(resolveWebDistDir(webRoot), "standalone", "apps", "web", "server.js"),
        join(resolveWebDistDir(webRoot), "standalone", "server.js"),
      ]),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function shouldUseStandaloneOutput(runtime: SidecarRuntimeContext<SidecarStamp>): boolean {
  return runtime.mode !== "dev" && process.env[WEB_OUTPUT_MODE_ENV] === "standalone";
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
  const target = resolveHttpProxyTarget(daemonOrigin, requestUrl);
  if (target == null || !isDaemonProxyPathname(target.pathname)) return null;
  return target;
}

function resolveHttpProxyTarget(
  origin: string,
  requestUrl: string | undefined,
): URL | null {
  if (requestUrl == null) return null;

  let parsedRequestUrl: URL;
  try {
    parsedRequestUrl = new URL(requestUrl, `http://${HOST}`);
  } catch {
    return null;
  }

  return new URL(`${parsedRequestUrl.pathname}${parsedRequestUrl.search}`, origin);
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

async function proxyHttpRequest(
  target: URL,
  request: IncomingMessage,
  response: ServerResponse,
  options: { daemonWebPort?: number } = {},
): Promise<void> {
  const proxyRequestFactory = target.protocol === "https:" ? createHttpsRequest : createHttpRequest;
  const headers = { ...request.headers, host: target.host };
  if (options.daemonWebPort != null) {
    const origin = normalizeDaemonProxyOriginHeader({
      daemonOrigin: target.origin,
      origin: typeof request.headers.origin === "string" ? request.headers.origin : undefined,
      webPort: options.daemonWebPort,
    });
    if (origin == null || origin.length === 0) {
      delete headers.origin;
    } else {
      headers.origin = origin;
    }
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

async function listen(server: HttpServer | TcpServer, port: number, host = HOST): Promise<number> {
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen({ host, port }, () => {
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

async function closeServer(server: HttpServer | TcpServer): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
  });
}

async function reserveTcpPort(host = HOST): Promise<number> {
  const server = createTcpServer();
  try {
    return await listen(server, 0, host);
  } finally {
    await closeServer(server).catch(() => undefined);
  }
}

async function waitForChildExit(child: ChildProcess): Promise<void> {
  if (child.exitCode != null || child.signalCode != null) return;

  await new Promise<void>((resolveExit) => {
    child.once("exit", () => resolveExit());
  });
}

async function stopStandaloneChild(child: ChildProcess): Promise<void> {
  if (child.exitCode != null || child.signalCode != null) return;

  child.kill("SIGTERM");
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      waitForChildExit(child),
      new Promise<void>((resolveTimeout) => {
        timeout = setTimeout(resolveTimeout, SHUTDOWN_TIMEOUT_MS);
        timeout.unref();
      }),
    ]);
  } finally {
    if (timeout != null) clearTimeout(timeout);
  }

  if (child.exitCode == null && child.signalCode == null) {
    child.kill("SIGKILL");
    await waitForChildExit(child).catch(() => undefined);
  }
}

async function probeStandaloneBackend(origin: string): Promise<boolean> {
  return await new Promise<boolean>((resolveProbe) => {
    const request = createHttpRequest(new URL("/", origin), { method: "HEAD", timeout: 800 }, (response) => {
      response.resume();
      resolveProbe(true);
    });
    request.on("timeout", () => {
      request.destroy();
      resolveProbe(false);
    });
    request.on("error", () => resolveProbe(false));
    request.end();
  });
}

async function waitForStandaloneBackendReady(
  child: ChildProcess,
  origin: string,
  timeoutMs = resolveStandaloneStartupTimeoutMs(),
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode != null || child.signalCode != null) {
      const elapsedMs = Date.now() - startedAt;
      const likelyPortRace = elapsedMs <= 200;
      throw new Error(
        `standalone Next.js server exited before readiness after ${elapsedMs}ms: code=${child.exitCode} signal=${child.signalCode}`
        + (likelyPortRace
          ? "; the reserved startup port may have been claimed before the child process bound it, retry the launch"
          : ""),
      );
    }
    if (await probeStandaloneBackend(origin)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }

  throw new Error(`timed out after ${timeoutMs}ms waiting for standalone Next.js server at ${origin}; override with ${STANDALONE_STARTUP_TIMEOUT_ENV}`);
}

async function startStandaloneBackend(webRoot: string | null): Promise<StandaloneBackend> {
  const entryPath = resolveStandaloneServerEntry(webRoot);
  if (entryPath == null) {
    throw new Error(
      webRoot == null
        ? `missing Next.js standalone server under ${WEB_STANDALONE_ROOT_ENV}; configure ${WEB_STANDALONE_ROOT_ENV} or install @open-design/web`
        : `missing Next.js standalone server under ${resolveWebDistDir(webRoot)}; rebuild with ${WEB_OUTPUT_MODE_ENV}=standalone`,
    );
  }

  const port = await reserveTcpPort(STANDALONE_BACKEND_HOST);
  const origin = resolveStandaloneBackendOrigin(port);
  console.log(`[open-design web] starting standalone Next.js server from ${entryPath}`);
  const child = spawn(process.execPath, createStandaloneServerArgs(entryPath), {
    cwd: dirname(entryPath),
    env: createStandaloneBackendEnv({ port }),
    stdio: ["ignore", "inherit", "inherit"],
    ...(process.platform === "win32" ? { windowsHide: true } : {}),
  });
  await new Promise<void>((resolveSpawn, rejectSpawn) => {
    child.once("error", rejectSpawn);
    child.once("spawn", resolveSpawn);
  });
  let standaloneRunning = true;
  let standaloneExitReason: string | null = null;
  child.once("exit", (code, signal) => {
    standaloneRunning = false;
    standaloneExitReason = `code=${code ?? "null"} signal=${signal ?? "null"}`;
    console.error(`[open-design web] standalone Next.js server exited ${standaloneExitReason}`);
  });

  try {
    await waitForStandaloneBackendReady(child, origin);
  } catch (error) {
    await stopStandaloneChild(child).catch(() => undefined);
    throw error;
  }

  return {
    exitReason() {
      return standaloneExitReason;
    },
    isRunning() {
      return standaloneRunning && child.exitCode == null && child.signalCode == null;
    },
    origin,
    async stop() {
      await stopStandaloneChild(child);
    },
  };
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

async function createWebSidecarHandle(
  runtime: SidecarRuntimeContext<SidecarStamp>,
  httpServer: HttpServer,
  closeRuntime: () => Promise<void> | void,
  isRuntimeRunning?: () => boolean,
): Promise<WebSidecarHandle> {
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

  function refreshRuntimeState(): void {
    if (stopped || isRuntimeRunning == null || isRuntimeRunning()) return;
    state.state = "stopped";
    state.url = null;
    state.updatedAt = new Date().toISOString();
  }

  async function stop(): Promise<void> {
    if (stopped) return;
    stopped = true;
    state.state = "stopped";
    state.updatedAt = new Date().toISOString();
    await settleShutdownTask(ipcServer?.close());
    await settleShutdownTask(closeServer(httpServer));
    await settleShutdownTask(Promise.resolve().then(closeRuntime));
    resolveStopped();
  }

  attachParentMonitor(stop);

  ipcServer = await createJsonIpcServer({
    socketPath: runtime.ipc,
    handler: async (message: unknown) => {
      const request = normalizeWebSidecarMessage(message);
      switch (request.type) {
        case SIDECAR_MESSAGES.STATUS:
          refreshRuntimeState();
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
      refreshRuntimeState();
      return { ...state };
    },
    stop,
    waitUntilStopped() {
      return stoppedPromise;
    },
  };
}

function createDaemonProxyHandler(
  daemonOrigin: string | null,
  fallback: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    const daemonProxyTarget = daemonOrigin == null ? null : resolveDaemonProxyTarget(daemonOrigin, request.url);
    if (daemonProxyTarget != null) {
      const localPort = request.socket.localPort;
      void proxyHttpRequest(daemonProxyTarget, request, response, {
        daemonWebPort: typeof localPort === "number" ? localPort : 0,
      }).catch((error: unknown) => {
        response.statusCode = 502;
        response.end(error instanceof Error ? error.message : String(error));
      });
      return;
    }

    void fallback(request, response).catch((error: unknown) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    });
  };
}

async function startRegularNextSidecar(
  runtime: SidecarRuntimeContext<SidecarStamp>,
  webRoot: string,
): Promise<WebSidecarHandle> {
  const app = createNextApp({ dev: process.env.OD_WEB_PROD !== "1" && runtime.mode === "dev", dir: webRoot });
  await prepareNextApp(app, webRoot);

  const daemonOrigin = resolveDaemonOrigin();
  const handleRequest = app.getRequestHandler();
  const httpServer = createHttpServer(createDaemonProxyHandler(daemonOrigin, handleRequest));

  return await createWebSidecarHandle(runtime, httpServer, async () => {
    await app.close?.();
  });
}

async function startStandaloneNextSidecar(
  runtime: SidecarRuntimeContext<SidecarStamp>,
  webRoot: string | null,
): Promise<WebSidecarHandle> {
  const daemonOrigin = resolveDaemonOrigin();
  const backend = await startStandaloneBackend(webRoot);
  const httpServer = createHttpServer(createDaemonProxyHandler(daemonOrigin, async (request, response) => {
    if (!backend.isRunning()) {
      response.statusCode = 502;
      response.end(`standalone Next.js server is not running${backend.exitReason() == null ? "" : ` (${backend.exitReason()})`}`);
      return;
    }
    const target = resolveHttpProxyTarget(backend.origin, request.url);
    if (target == null) {
      response.statusCode = 400;
      response.end("invalid request URL");
      return;
    }
    await proxyHttpRequest(target, request, response);
  }));

  try {
    return await createWebSidecarHandle(runtime, httpServer, backend.stop, backend.isRunning);
  } catch (error) {
    await backend.stop().catch(() => undefined);
    throw error;
  }
}

export async function startWebSidecar(runtime: SidecarRuntimeContext<SidecarStamp>): Promise<WebSidecarHandle> {
  if (shouldUseStandaloneOutput(runtime)) {
    const webRoot = resolveConfiguredStandaloneRoot() == null ? resolveWebRoot() : null;
    return await startStandaloneNextSidecar(runtime, webRoot);
  }

  const webRoot = resolveWebRoot();
  return await startRegularNextSidecar(runtime, webRoot);
}
