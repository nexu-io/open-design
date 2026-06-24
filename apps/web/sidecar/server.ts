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
import { readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createConnection, createServer as createTcpServer, type AddressInfo, type Server as TcpServer } from "node:net";
import { dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const STANDALONE_READINESS_POLL_MS = 150;
const STANDALONE_TCP_READINESS_GRACE_MS = STANDALONE_READINESS_POLL_MS;
const require = createRequire(import.meta.url);

type NextApp = {
  close?: () => Promise<void>;
  getRequestHandler(): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  prepare(): Promise<void>;
};

type NextBundlerOptions = {
  turbopack?: boolean;
  webpack?: boolean;
};

type StandaloneBackend = {
  exitReason(): string | null;
  isRunning(): boolean;
  origin: string;
  stop(): Promise<void>;
};

function createNextApp(options: { dev: boolean; dir: string } & NextBundlerOptions): NextApp {
  const createNextServer = require("next") as (nextOptions: { dev: boolean; dir: string } & NextBundlerOptions) => NextApp;
  return createNextServer(options);
}

export function resolveNextBundlerOptions(isDev: boolean): NextBundlerOptions {
  if (!isDev) return {};
  const configured = (process.env.OD_WEB_DEV_BUNDLER ?? "webpack").trim().toLowerCase();
  if (configured === "turbopack" || configured === "turbo") return { turbopack: true };
  return { webpack: true };
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
  requestHost?: string | string[];
  webPort: number;
}): string | undefined {
  if (options.origin == null || options.origin.length === 0) return options.origin;

  const schemes = ["http", "https"];
  const loopbackHosts = ["127.0.0.1", "localhost", "[::1]", HOST];
  const allowedWebOrigins = new Set(
    schemes.flatMap((scheme) => loopbackHosts.map((host) => `${scheme}://${host}:${options.webPort}`)),
  );

  if (allowedWebOrigins.has(options.origin)) return options.daemonOrigin;

  const parsedOrigin = parseHttpOrigin(options.origin);
  if (
    parsedOrigin != null &&
    isSameBrowserHostOrigin({
      origin: parsedOrigin,
      requestHost: options.requestHost,
      webPort: options.webPort,
    })
  ) {
    return options.daemonOrigin;
  }

  return options.origin;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseHostHeader(value: string | string[] | undefined): URL | null {
  const raw = firstHeaderValue(value)?.trim();
  if (raw == null || raw.length === 0) return null;
  try {
    return new URL(`http://${raw}`);
  } catch {
    return null;
  }
}

function parseHttpOrigin(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function parseAllowedDevHost(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    try {
      return new URL(`http://${trimmed}`).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}

function configuredAllowedDevHosts(): Set<string> {
  return new Set(
    (process.env.OD_ALLOWED_DEV_ORIGINS ?? "")
      .split(",")
      .map(parseAllowedDevHost)
      .filter((host): host is string => host != null),
  );
}

function isAllowedDevHost(hostname: string, allowedHosts: Set<string>): boolean {
  const host = hostname.toLowerCase();
  if (allowedHosts.has(host)) return true;

  for (const allowedHost of allowedHosts) {
    if (!allowedHost.startsWith("*.")) continue;
    const suffix = allowedHost.slice(1);
    if (host.endsWith(suffix) && host.length > suffix.length) return true;
  }

  return false;
}

function parseIpv4(value: string): [number, number, number, number] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  if (!parts.every((part) => /^\d+$/.test(part))) return null;
  const octets = parts.map((part) => Number(part));
  if (!octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) return null;
  return octets as [number, number, number, number];
}

function isPrivateLanIpv4(value: string): boolean {
  const octets = parseIpv4(value);
  if (octets == null) return false;
  const [a, b] = octets;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function isLoopbackOrPrivateLanHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host === "0.0.0.0" ||
    host === "::" ||
    isPrivateLanIpv4(host)
  );
}

function defaultPortForProtocol(protocol: string): string {
  return protocol === "https:" ? "443" : "80";
}

function isSameBrowserHostOrigin(options: {
  origin: URL;
  requestHost?: string | string[];
  webPort: number;
}): boolean {
  const requestHost = parseHostHeader(options.requestHost);
  if (requestHost == null) return false;

  const originPort = options.origin.port || defaultPortForProtocol(options.origin.protocol);
  const requestPort = requestHost.port || "80";
  if (originPort !== String(options.webPort) || requestPort !== originPort) return false;
  if (requestHost.hostname.toLowerCase() !== options.origin.hostname.toLowerCase()) return false;

  const allowedDevHosts = configuredAllowedDevHosts();
  const originHost = options.origin.hostname.toLowerCase();
  return isLoopbackOrPrivateLanHost(originHost) || isAllowedDevHost(originHost, allowedDevHosts);
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
      requestHost: request.headers.host,
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

type StandaloneBackendProbeResult = "http" | "tcp" | null;

async function probeStandaloneBackend(origin: string): Promise<StandaloneBackendProbeResult> {
  if (await probeStandaloneBackendPort(origin)) return "tcp";
  if (await probeStandaloneBackendHttp(origin)) return "http";
  return null;
}

async function probeStandaloneBackendHttp(origin: string): Promise<boolean> {
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

async function probeStandaloneBackendPort(origin: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const port = Number(parsed.port || defaultPortForProtocol(parsed.protocol));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return false;
  const host = parsed.hostname.replace(/^\[(.*)\]$/, "$1");

  return await new Promise<boolean>((resolveProbe) => {
    const socket = createConnection({ host, port });
    let settled = false;
    const settle = (ready: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolveProbe(ready);
    };
    socket.setTimeout(800, () => settle(false));
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
  });
}

function createStandaloneChildExitError(child: ChildProcess, startedAt: number): Error {
  const elapsedMs = Date.now() - startedAt;
  const likelyPortRace = elapsedMs <= 200;
  return new Error(
    `standalone Next.js server exited before readiness after ${elapsedMs}ms: code=${child.exitCode} signal=${child.signalCode}`
    + (likelyPortRace
      ? "; the reserved startup port may have been claimed before the child process bound it, retry the launch"
      : ""),
  );
}

function throwIfStandaloneChildExited(child: ChildProcess, startedAt: number): void {
  if (child.exitCode == null && child.signalCode == null) return;
  throw createStandaloneChildExitError(child, startedAt);
}

async function waitForStandaloneTcpReadinessGrace(child: ChildProcess): Promise<void> {
  if (child.exitCode != null || child.signalCode != null) return;

  await new Promise<void>((resolveWait) => {
    let timeout: NodeJS.Timeout | undefined;
    const finish = () => {
      if (timeout != null) clearTimeout(timeout);
      child.off("exit", finish);
      resolveWait();
    };
    timeout = setTimeout(finish, STANDALONE_TCP_READINESS_GRACE_MS);
    timeout.unref();
    child.once("exit", finish);
  });
}

async function waitForStandaloneBackendReady(
  child: ChildProcess,
  origin: string,
  timeoutMs = resolveStandaloneStartupTimeoutMs(),
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    throwIfStandaloneChildExited(child, startedAt);
    const readiness = await probeStandaloneBackend(origin);
    if (readiness != null) {
      if (readiness === "tcp") {
        await waitForStandaloneTcpReadinessGrace(child);
      }
      throwIfStandaloneChildExited(child, startedAt);
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, STANDALONE_READINESS_POLL_MS));
  }

  throw new Error(`timed out after ${timeoutMs}ms waiting for standalone Next.js server at ${origin}; override with ${STANDALONE_STARTUP_TIMEOUT_ENV}`);
}

async function waitForInProcessStandaloneBackendReady(
  origin: string,
  timeoutMs = resolveStandaloneStartupTimeoutMs(),
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await probeStandaloneBackend(origin)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, STANDALONE_READINESS_POLL_MS));
  }

  throw new Error(`timed out after ${timeoutMs}ms waiting for in-process standalone Next.js server at ${origin}; override with ${STANDALONE_STARTUP_TIMEOUT_ENV}`);
}

function shouldStartStandaloneBackendInProcess(): boolean {
  return process.env.ELECTRON_RUN_AS_NODE === "1" && process.versions.electron != null;
}

async function startStandaloneBackendInProcess(entryPath: string, port: number, origin: string): Promise<StandaloneBackend> {
  Object.assign(process.env, createStandaloneBackendEnv({ port }));
  console.log(`[open-design web] starting in-process standalone Next.js server from ${entryPath}`);
  const restoreChdir = await installInProcessStandaloneChdirAlias(dirname(entryPath));
  try {
    await import(pathToFileURL(entryPath).href);
  } finally {
    restoreChdir();
  }
  await waitForInProcessStandaloneBackendReady(origin);

  return {
    exitReason() {
      return null;
    },
    isRunning() {
      return true;
    },
    origin,
    async stop() {
      // The standalone server shares this web sidecar process in packaged
      // Electron-as-Node mode. Process shutdown is the close boundary.
    },
  };
}

async function installInProcessStandaloneChdirAlias(aliasRoot: string): Promise<() => void> {
  if (process.platform !== "win32") return () => {};

  const realRoot = await realpath(aliasRoot).catch(() => null);
  if (realRoot == null || normalizeWindowsPath(realRoot) === normalizeWindowsPath(aliasRoot)) return () => {};

  const originalChdir = process.chdir.bind(process);
  process.chdir = ((directory: string): void => {
    const mapped = mapWindowsPathIntoAlias(directory, realRoot, aliasRoot);
    originalChdir(mapped ?? directory);
  }) as typeof process.chdir;

  return () => {
    process.chdir = originalChdir as typeof process.chdir;
  };
}

function mapWindowsPathIntoAlias(candidate: string, realRoot: string, aliasRoot: string): string | null {
  const normalizedCandidate = normalizeWindowsPath(candidate);
  const normalizedRealRoot = normalizeWindowsPath(realRoot);
  if (normalizedCandidate !== normalizedRealRoot && !normalizedCandidate.startsWith(`${normalizedRealRoot}\\`)) return null;
  return join(aliasRoot, relative(realRoot, candidate));
}

function normalizeWindowsPath(path: string): string {
  return path.replaceAll("/", "\\").replace(/[\\]+$/, "").toLowerCase();
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
  if (shouldStartStandaloneBackendInProcess()) {
    return await startStandaloneBackendInProcess(entryPath, port, origin);
  }

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
  const dev = process.env.OD_WEB_PROD !== "1" && runtime.mode === "dev";
  const app = createNextApp({ dev, dir: webRoot, ...resolveNextBundlerOptions(dev) });
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
