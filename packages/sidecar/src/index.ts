import { lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createConnection, createServer as createNetServer, type Server } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";

export type SidecarStampShape = {
  app: string;
  ipc: string;
  mode: string;
  namespace: string;
  source: string;
};

export type SidecarContractDescriptor<TStamp extends SidecarStampShape = SidecarStampShape> = {
  defaults: {
    host: string;
    ipcBase: string;
    namespace: string;
    projectTmpDirName: string;
    windowsPipePrefix: string;
  };
  env: {
    base: string;
    ipcBase: string;
    ipcPath: string;
    namespace: string;
    source: string;
  };
  normalizeApp(app: unknown): TStamp["app"];
  normalizeNamespace(namespace: unknown): string;
  normalizeSource(source: unknown): TStamp["source"];
  normalizeStamp(input: unknown): TStamp;
};

export type NamespaceResolutionOptions<TStamp extends SidecarStampShape = SidecarStampShape> = {
  contract: SidecarContractDescriptor<TStamp>;
  env?: NodeJS.ProcessEnv;
  namespace?: string | null;
};

export type ProjectRuntimePathRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  contract: SidecarContractDescriptor<TStamp>;
  projectRoot: string;
  source: TStamp["source"] | string;
};

export type BaseResolutionOptions<TStamp extends SidecarStampShape = SidecarStampShape> = {
  base?: string | null;
  contract: SidecarContractDescriptor<TStamp>;
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
  source: TStamp["source"] | string;
};

export type RuntimePathRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  base: string;
  contract: SidecarContractDescriptor<TStamp>;
  namespace: string;
};

export type RuntimeRootRequest<TStamp extends SidecarStampShape = SidecarStampShape> = RuntimePathRequest<TStamp> & {
  runId: string;
};

export type AppIpcPathRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  app: TStamp["app"] | string;
  contract: SidecarContractDescriptor<TStamp>;
  env?: NodeJS.ProcessEnv;
  namespace: string;
};

export type AppRuntimePathRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  app: TStamp["app"] | string;
  contract: SidecarContractDescriptor<TStamp>;
  namespaceRoot: string;
};

export type SidecarRuntimeContext<TStamp extends SidecarStampShape = SidecarStampShape> = {
  app: TStamp["app"];
  base: string;
  ipc: string;
  mode: TStamp["mode"];
  namespace: string;
  source: TStamp["source"];
};

export type SidecarLaunchEnvRequest<TStamp extends SidecarStampShape = SidecarStampShape> = {
  base: string;
  contract: SidecarContractDescriptor<TStamp>;
  extraEnv?: NodeJS.ProcessEnv;
  stamp: TStamp;
};

export type BootstrapSidecarRuntimeOptions<TStamp extends SidecarStampShape = SidecarStampShape> = {
  app: TStamp["app"] | string;
  base?: string | null;
  contract: SidecarContractDescriptor<TStamp>;
  projectRoot?: string;
};

export type PortAllocation = {
  port: number;
  source: "dynamic" | "forced";
};

export type PortRequest = {
  host?: string;
  label?: string;
  port?: number | string | null;
  reserved?: Set<number>;
};

export type JsonIpcHandler = (message: any) => unknown | Promise<unknown>;

export type JsonIpcServerHandle = {
  close(): Promise<void>;
};

export function isWindowsNamedPipePath(value: unknown): boolean {
  return typeof value === "string" && value.startsWith("\\\\.\\pipe\\");
}

export function normalizeIpcPath(ipc: unknown): string {
  if (typeof ipc !== "string") throw new Error("sidecar ipc path must be a string");
  if (ipc.length === 0) throw new Error("sidecar ipc path must not be empty");
  if (ipc.trim() !== ipc) throw new Error("sidecar ipc path must not contain leading or trailing whitespace");
  if (ipc.includes("\0")) throw new Error("sidecar ipc path must not contain null bytes");
  if (isWindowsNamedPipePath(ipc)) return ipc;
  if (!isAbsolute(ipc)) throw new Error(`sidecar ipc path must be absolute: ${ipc}`);
  return ipc;
}

export function resolveNamespace<TStamp extends SidecarStampShape>(options: NamespaceResolutionOptions<TStamp>): string {
  return options.contract.normalizeNamespace(
    options.namespace ??
      options.env?.[options.contract.env.namespace] ??
      options.contract.defaults.namespace,
  );
}

export function resolveProjectRoot(projectRoot: string): string {
  if (typeof projectRoot !== "string" || projectRoot.trim().length === 0) {
    throw new Error("projectRoot must be a non-empty string");
  }
  return resolve(projectRoot);
}

export function resolveProjectTmpRoot<TStamp extends SidecarStampShape>({
  contract,
  projectRoot,
}: {
  contract: SidecarContractDescriptor<TStamp>;
  projectRoot: string;
}): string {
  return join(resolveProjectRoot(projectRoot), contract.defaults.projectTmpDirName);
}

export function resolveSourceRuntimeRoot<TStamp extends SidecarStampShape>({
  contract,
  projectRoot,
  source,
}: ProjectRuntimePathRequest<TStamp>): string {
  return join(resolveProjectTmpRoot({ contract, projectRoot }), contract.normalizeSource(source));
}

export function resolveSidecarBase<TStamp extends SidecarStampShape>({
  base,
  contract,
  env = process.env,
  projectRoot = process.cwd(),
  source,
}: BaseResolutionOptions<TStamp>): string {
  return resolve(base ?? env[contract.env.base] ?? resolveSourceRuntimeRoot({ contract, projectRoot, source }));
}

export function resolveNamespaceRoot<TStamp extends SidecarStampShape>({
  base,
  contract,
  namespace,
}: RuntimePathRequest<TStamp>): string {
  return join(resolve(base), contract.normalizeNamespace(namespace));
}

export function resolveRuntimeRoot<TStamp extends SidecarStampShape>({
  base,
  contract,
  namespace,
  runId,
}: RuntimeRootRequest<TStamp>): string {
  return join(resolveNamespaceRoot({ base, contract, namespace }), "runs", runId);
}

export function resolvePointerPath<TStamp extends SidecarStampShape>({ base, contract, namespace }: RuntimePathRequest<TStamp>): string {
  return join(resolveNamespaceRoot({ base, contract, namespace }), "current.json");
}

export function resolveManifestPath({ runtimeRoot }: { runtimeRoot: string }): string {
  return join(runtimeRoot, "manifest.json");
}

export function resolveLogsDir<TStamp extends SidecarStampShape>({
  app,
  contract,
  runtimeRoot,
}: {
  app: TStamp["app"] | string;
  contract: SidecarContractDescriptor<TStamp>;
  runtimeRoot: string;
}): string {
  return join(runtimeRoot, "logs", contract.normalizeApp(app));
}

export function resolveLogFilePath<TStamp extends SidecarStampShape>({
  app,
  contract,
  fileName = "latest.log",
  runtimeRoot,
}: {
  app: TStamp["app"] | string;
  contract: SidecarContractDescriptor<TStamp>;
  fileName?: string;
  runtimeRoot: string;
}): string {
  return join(resolveLogsDir({ app, contract, runtimeRoot }), fileName);
}

export function resolveAppRuntimeDir<TStamp extends SidecarStampShape>({
  app,
  contract,
  namespaceRoot,
}: AppRuntimePathRequest<TStamp>): string {
  return join(namespaceRoot, contract.normalizeApp(app));
}

export function resolveAppRuntimePath<TStamp extends SidecarStampShape>({
  app,
  contract,
  fileName,
  namespaceRoot,
}: AppRuntimePathRequest<TStamp> & { fileName: string }): string {
  if (fileName.length === 0 || fileName.includes("\0") || /[\\/]/.test(fileName)) {
    throw new Error(`app runtime fileName must be a simple path segment: ${fileName}`);
  }
  return join(resolveAppRuntimeDir({ app, contract, namespaceRoot }), fileName);
}

export function resolveAppIpcPath<TStamp extends SidecarStampShape>({
  app,
  contract,
  env = process.env,
  namespace,
}: AppIpcPathRequest<TStamp>): string {
  const normalizedApp = contract.normalizeApp(app);
  const normalizedNamespace = contract.normalizeNamespace(namespace);

  if (process.platform === "win32") {
    return `\\\\.\\pipe\\${contract.defaults.windowsPipePrefix}-${normalizedNamespace}-${normalizedApp}`;
  }

  const ipcBase = resolve(env[contract.env.ipcBase] ?? contract.defaults.ipcBase);
  return join(ipcBase, normalizedNamespace, `${normalizedApp}.sock`);
}

export function createSidecarLaunchEnv<TStamp extends SidecarStampShape>({
  base,
  contract,
  extraEnv = process.env,
  stamp,
}: SidecarLaunchEnvRequest<TStamp>): NodeJS.ProcessEnv {
  const normalizedStamp = contract.normalizeStamp(stamp);
  return {
    ...extraEnv,
    [contract.env.base]: resolveSidecarBase({ base, contract, env: extraEnv, source: normalizedStamp.source }),
    [contract.env.ipcPath]: normalizedStamp.ipc,
    [contract.env.namespace]: normalizedStamp.namespace,
    [contract.env.source]: normalizedStamp.source,
  };
}

function assertMatchingEnv(env: NodeJS.ProcessEnv, key: string, expected: string): void {
  const current = env[key];
  if (current != null && current !== expected) {
    throw new Error(`sidecar env mismatch for ${key}: expected ${expected}, received ${current}`);
  }
}

export function bootstrapSidecarRuntime<TStamp extends SidecarStampShape>(
  stampInput: unknown,
  env: NodeJS.ProcessEnv,
  options: BootstrapSidecarRuntimeOptions<TStamp>,
): SidecarRuntimeContext<TStamp> {
  const stamp = options.contract.normalizeStamp(stampInput);
  const expectedApp = options.contract.normalizeApp(options.app);
  if (stamp.app !== expectedApp) {
    throw new Error(`sidecar stamp app mismatch: expected ${expectedApp}, received ${stamp.app}`);
  }

  const base = resolveSidecarBase({
    base: options.base,
    contract: options.contract,
    env,
    projectRoot: options.projectRoot,
    source: stamp.source,
  });
  const ipc = resolveAppIpcPath({ app: stamp.app, contract: options.contract, env, namespace: stamp.namespace });
  if (stamp.ipc !== ipc) {
    throw new Error(`sidecar ipc path mismatch: expected ${ipc}, received ${stamp.ipc}`);
  }

  assertMatchingEnv(env, options.contract.env.ipcPath, stamp.ipc);
  assertMatchingEnv(env, options.contract.env.namespace, stamp.namespace);
  assertMatchingEnv(env, options.contract.env.source, stamp.source);

  env[options.contract.env.ipcPath] = ipc;
  env[options.contract.env.namespace] = stamp.namespace;
  env[options.contract.env.source] = stamp.source;

  return {
    app: stamp.app,
    base,
    ipc,
    mode: stamp.mode,
    namespace: stamp.namespace,
    source: stamp.source,
  };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
  });
}

async function listenOnPort(port: number, host: string): Promise<Server> {
  const server = createNetServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen({ port, host, exclusive: true }, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  return server;
}

function parsePort(value: number | string | null | undefined, label: string): number | null {
  if (value == null || value === "") return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${label} port must be an integer between 1 and 65535`);
  }
  return port;
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error == null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function jsonIpcError(error: unknown): { code?: string; message: string } {
  return {
    ...(errorCode(error) == null ? {} : { code: errorCode(error) as string }),
    message: errorMessage(error),
  };
}

async function allocateForcedPort(port: number, label: string, host: string, reserved: Set<number>): Promise<PortAllocation> {
  if (reserved.has(port)) {
    throw new Error(`forced ${label} port ${port} conflicts with another managed port`);
  }
  let server: Server | null = null;
  try {
    server = await listenOnPort(port, host);
  } catch (error) {
    throw new Error(`forced ${label} port ${port} is not available (${errorCode(error) ?? errorMessage(error)})`);
  } finally {
    if (server) await closeServer(server);
  }
  reserved.add(port);
  return { port, source: "forced" };
}

async function allocateDynamicPort(label: string, host: string, reserved: Set<number>): Promise<PortAllocation> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = await listenOnPort(0, host);
    const address = server.address();
    await closeServer(server);
    if (address == null || typeof address === "string") {
      throw new Error(`failed to allocate dynamic ${label} port`);
    }
    if (!reserved.has(address.port)) {
      reserved.add(address.port);
      return { port: address.port, source: "dynamic" };
    }
  }
  throw new Error(`failed to allocate dynamic ${label} port without conflict`);
}

export async function allocatePort({
  host = "127.0.0.1",
  label = "runtime",
  port,
  reserved = new Set<number>(),
}: PortRequest = {}): Promise<PortAllocation> {
  const forcedPort = parsePort(port, label);
  return forcedPort == null
    ? await allocateDynamicPort(label, host, reserved)
    : await allocateForcedPort(forcedPort, label, host, reserved);
}

export async function readJsonFile<T = any>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tmpPath, filePath);
}

export async function removeFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

export async function removePointerIfCurrent(pointerPath: string, runId: string): Promise<void> {
  const pointer = await readJsonFile<{ runId?: string }>(pointerPath);
  if (pointer?.runId === runId) await removeFile(pointerPath);
}

async function staleUnixSocketExists(socketPath: string): Promise<boolean> {
  try {
    const stat = await lstat(socketPath);
    if (!stat.isSocket()) return false;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }

  return await new Promise<boolean>((resolveStale, rejectStale) => {
    const socket = createConnection(socketPath);
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      callback();
    };

    socket.once("connect", () => settle(() => resolveStale(false)));
    socket.once("error", (error) => {
      const code = errorCode(error);
      if (code === "ENOENT" || code === "ECONNREFUSED") {
        settle(() => resolveStale(true));
        return;
      }
      settle(() => rejectStale(error));
    });
  });
}

async function prepareIpcPath(socketPath: string): Promise<void> {
  if (isWindowsNamedPipePath(socketPath)) return;
  await mkdir(dirname(socketPath), { recursive: true });
  if (await staleUnixSocketExists(socketPath)) await rm(socketPath, { force: true });
}

export async function createJsonIpcServer({
  handler,
  socketPath,
}: {
  handler: JsonIpcHandler;
  socketPath: string;
}): Promise<JsonIpcServerHandle> {
  await prepareIpcPath(socketPath);
  const server = createNetServer((socket) => {
    let buffer = "";
    socket.on("data", async (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) return;
      const frame = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      try {
        const result = await handler(JSON.parse(frame));
        socket.end(`${JSON.stringify({ ok: true, result })}\n`);
      } catch (error) {
        socket.end(
          `${JSON.stringify({
            ok: false,
            error: jsonIpcError(error),
          })}\n`,
        );
      }
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(socketPath, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  return {
    async close() {
      await closeServer(server);
      if (!isWindowsNamedPipePath(socketPath)) await rm(socketPath, { force: true });
    },
  };
}

export async function requestJsonIpc<T = any>(
  socketPath: string,
  payload: unknown,
  { timeoutMs = 1500 }: { timeoutMs?: number } = {},
): Promise<T> {
  return await new Promise<T>((resolveRequest, rejectRequest) => {
    const socket = createConnection(socketPath);
    let settled = false;
    let buffer = "";
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      socket.destroy();
      settle(() => rejectRequest(new Error(`IPC request timed out: ${socketPath}`)));
    }, timeoutMs);

    socket.on("connect", () => {
      socket.write(`${JSON.stringify(payload)}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) return;
      socket.end();
      settle(() => {
        const response = JSON.parse(buffer.slice(0, newlineIndex)) as { error?: { message?: string }; ok: boolean; result?: T };
        if (!response.ok) {
          rejectRequest(new Error(response.error?.message ?? "IPC request failed"));
          return;
        }
        resolveRequest(response.result as T);
      });
    });
    socket.on("error", (error) => {
      settle(() => rejectRequest(error));
    });
  });
}
