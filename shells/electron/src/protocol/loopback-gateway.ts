import { fetch as undiciFetch, Pool, type RequestInit as UndiciRequestInit } from "undici";

const DEFAULT_CONNECTIONS = 12;
const MAX_CONNECTIONS = 64;

export type LoopbackGateway = Readonly<{
  close(): Promise<void>;
  fetch(request: Request): Promise<Response>;
}>;

export type LoopbackGatewayOptions = Readonly<{
  connections?: number;
}>;

type ActivePool = Readonly<{
  origin: string;
  pool: Pool;
}>;

function normalizeConnections(value: number | undefined): number {
  const connections = value ?? DEFAULT_CONNECTIONS;
  if (!Number.isSafeInteger(connections) || connections < 1 || connections > MAX_CONNECTIONS) {
    throw new Error(`loopback gateway connections must be an integer between 1 and ${MAX_CONNECTIONS}`);
  }
  return connections;
}

function assertLoopbackTarget(request: Request): URL {
  const target = new URL(request.url);
  if (target.protocol !== "http:" || (target.hostname !== "127.0.0.1" && target.hostname !== "[::1]")) {
    throw new Error(`loopback gateway only accepts loopback HTTP targets: ${target.origin}`);
  }
  if (target.username.length > 0 || target.password.length > 0) {
    throw new Error("loopback gateway targets must not contain credentials");
  }
  return target;
}

function createPool(origin: string, connections: number): Pool {
  return new Pool(origin, {
    bodyTimeout: 0,
    connections,
    connectTimeout: 10_000,
    headersTimeout: 30_000,
    keepAliveMaxTimeout: 30_000,
    keepAliveTimeout: 10_000,
    pipelining: 1,
  });
}

function toUndiciRequestInit(request: Request, pool: Pool): UndiciRequestInit {
  const headers = new Headers(request.headers);
  headers.set("accept-encoding", "identity");
  return {
    body: request.body as unknown as UndiciRequestInit["body"],
    dispatcher: pool,
    duplex: "half",
    headers: [...headers.entries()],
    method: request.method,
    redirect: request.redirect,
    signal: request.signal,
  };
}

/**
 * One bounded transport from the stable od:// renderer origin to the current
 * loopback Web sidecar. The pool is an implementation detail of the Electron
 * Shell: a sidecar port change atomically installs a fresh pool and destroys
 * the retired origin so stale streams cannot pin the previous generation.
 */
export function createLoopbackGateway(options: LoopbackGatewayOptions = {}): LoopbackGateway {
  const connections = normalizeConnections(options.connections);
  let active: ActivePool | null = null;
  let closed = false;

  const replacePool = (origin: string): Pool => {
    if (active?.origin === origin) return active.pool;
    const retired = active?.pool ?? null;
    const pool = createPool(origin, connections);
    active = { origin, pool };
    if (retired != null) void retired.destroy().catch(() => undefined);
    return pool;
  };

  return Object.freeze({
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      const current = active?.pool ?? null;
      active = null;
      if (current != null) await current.destroy();
    },
    async fetch(request: Request): Promise<Response> {
      if (closed) throw new Error("loopback gateway is closed");
      const target = assertLoopbackTarget(request);
      const pool = replacePool(target.origin);
      const response = await undiciFetch(request.url, toUndiciRequestInit(request, pool));
      return response as unknown as Response;
    },
  });
}
