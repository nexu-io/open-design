import express, { type ErrorRequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';

import { localhostHostValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import {
  createMcpDaemonConnection,
  createOpenDesignMcpServer,
} from '../mcp.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 7457;
const DEFAULT_MAX_SESSIONS = 64;
const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1_000;
const MAX_JSON_BODY_SIZE = '4mb';

interface McpHttpSession {
  closePromise: Promise<void> | null;
  inFlight: number;
  lastActivityAt: number;
  server: ReturnType<typeof createOpenDesignMcpServer>;
  transport: StreamableHTTPServerTransport;
}

export interface RunMcpHttpOptions {
  daemonUrl: string | URL;
  host?: string;
  maxSessions?: number;
  port?: number;
  rediscoverDaemonUrl?: () => Promise<string | URL>;
  sessionIdleTimeoutMs?: number;
}

export interface StartMcpHttpServerOptions extends RunMcpHttpOptions {
  now?: () => number;
  /** Internal lifecycle hook for deterministic concurrency tests. */
  onSessionInitialized?: (sessionId: string) => void | Promise<void>;
}

export interface McpHttpServerHandle {
  close(): Promise<void>;
  readonly port: number;
  sessionCount(): number;
  sweepIdleSessions(): Promise<void>;
  readonly url: string;
}

function jsonRpcError(
  status: number,
  message: string,
  code = -32000,
) {
  return {
    body: {
      error: { code, message },
      id: null,
      jsonrpc: '2.0',
    },
    status,
  };
}

function validateOptions({
  host,
  maxSessions,
  port,
  sessionIdleTimeoutMs,
}: {
  host: string;
  maxSessions: number;
  port: number;
  sessionIdleTimeoutMs: number;
}, allowEphemeralPort: boolean) {
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `refusing non-loopback MCP HTTP bind (${host}); use 127.0.0.1, localhost, or ::1`,
    );
  }
  const minimumPort = allowEphemeralPort ? 0 : 1;
  if (!Number.isInteger(port) || port < minimumPort || port > 65_535) {
    throw new Error('--port must be an integer between 1 and 65535');
  }
  if (!Number.isInteger(maxSessions) || maxSessions < 1) {
    throw new Error('--max-sessions must be a positive integer');
  }
  if (!Number.isFinite(sessionIdleTimeoutMs) || sessionIdleTimeoutMs < 1_000) {
    throw new Error('--session-idle-timeout must be at least 1 second');
  }
}

export function validateMcpHttpOptions({
  host = DEFAULT_HOST,
  maxSessions = DEFAULT_MAX_SESSIONS,
  port = DEFAULT_PORT,
  sessionIdleTimeoutMs = DEFAULT_SESSION_IDLE_TIMEOUT_MS,
}: Omit<RunMcpHttpOptions, 'daemonUrl' | 'rediscoverDaemonUrl'> = {}): void {
  validateOptions(
    { host, maxSessions, port, sessionIdleTimeoutMs },
    false,
  );
}

function endpointUrl(host: string, port: number): string {
  const urlHost = host === '::1' ? '[::1]' : host;
  return `http://${urlHost}:${port}/mcp`;
}

export async function startMcpHttpServer({
  daemonUrl,
  host = DEFAULT_HOST,
  maxSessions = DEFAULT_MAX_SESSIONS,
  now = Date.now,
  onSessionInitialized,
  port = DEFAULT_PORT,
  rediscoverDaemonUrl,
  sessionIdleTimeoutMs = DEFAULT_SESSION_IDLE_TIMEOUT_MS,
}: StartMcpHttpServerOptions): Promise<McpHttpServerHandle> {
  validateOptions(
    { host, maxSessions, port, sessionIdleTimeoutMs },
    true,
  );

  const app = express();
  app.disable('x-powered-by');
  app.use(localhostHostValidation());
  app.use(express.json({ limit: MAX_JSON_BODY_SIZE }));
  const handleJsonBodyError: ErrorRequestHandler = (error, _req, res, next) => {
    const bodyError = error as { status?: unknown; type?: unknown };
    if (
      bodyError.type === 'entity.parse.failed'
      || bodyError.type === 'entity.too.large'
    ) {
      const response = jsonRpcError(
        bodyError.status === 413 ? 413 : 400,
        bodyError.status === 413
          ? 'MCP request body is too large'
          : 'MCP request body is not valid JSON',
      );
      res.status(response.status).json(response.body);
      return;
    }
    next(error);
  };
  app.use(handleJsonBodyError);

  const sessions = new Map<string, McpHttpSession>();
  let pendingSessions = 0;
  let listener: HttpServer | null = null;
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;
  let closePromise: Promise<void> | null = null;
  let closing = false;
  const daemonConnection = createMcpDaemonConnection({
    daemonUrl,
    ...(rediscoverDaemonUrl ? { rediscoverDaemonUrl } : {}),
  });

  const closeSession = (sessionId: string): Promise<void> => {
    const session = sessions.get(sessionId);
    if (!session) return Promise.resolve();
    if (session.closePromise) return session.closePromise;

    sessions.delete(sessionId);
    session.closePromise = session.server.close().catch(() => {});
    return session.closePromise;
  };

  const sweepIdleSessions = async () => {
    const cutoff = now() - sessionIdleTimeoutMs;
    const expired: Promise<void>[] = [];
    for (const [sessionId, session] of sessions) {
      if (session.inFlight === 0 && session.lastActivityAt <= cutoff) {
        expired.push(closeSession(sessionId));
      }
    }
    await Promise.all(expired);
  };

  app.all('/mcp', async (req, res) => {
    if (closing) {
      const error = jsonRpcError(503, 'MCP HTTP server is shutting down');
      res.status(error.status).json(error.body);
      return;
    }
    const rawSessionId = req.headers['mcp-session-id'];
    const sessionId =
      typeof rawSessionId === 'string' && rawSessionId.length > 0
        ? rawSessionId
        : undefined;

    if (sessionId) {
      const session = sessions.get(sessionId);
      if (!session) {
        const error = jsonRpcError(404, 'MCP session not found', -32001);
        res.status(error.status).json(error.body);
        return;
      }

      // A long-lived GET is the passive server-to-client SSE channel. It must
      // not keep an otherwise idle session alive forever; POST/DELETE work is
      // active protocol traffic and is protected from idle cleanup.
      const protectsFromIdle = req.method !== 'GET';
      if (protectsFromIdle) session.inFlight += 1;
      session.lastActivityAt = now();
      try {
        await session.transport.handleRequest(req, res, req.body);
      } catch (error) {
        if (!res.headersSent) {
          const response = jsonRpcError(
            500,
            error instanceof Error ? error.message : 'MCP request failed',
          );
          res.status(response.status).json(response.body);
        }
      } finally {
        if (protectsFromIdle) {
          session.inFlight -= 1;
          session.lastActivityAt = now();
        }
      }
      return;
    }

    if (req.method !== 'POST' || !isInitializeRequest(req.body)) {
      const error = jsonRpcError(
        400,
        req.method === 'POST'
          ? 'A valid MCP initialize request is required to create a session'
          : 'MCP session ID required',
      );
      res.status(error.status).json(error.body);
      return;
    }

    if (sessions.size + pendingSessions >= maxSessions) {
      const error = jsonRpcError(
        503,
        `maximum MCP session count reached (${maxSessions})`,
      );
      res.status(error.status).json(error.body);
      return;
    }

    pendingSessions += 1;
    let pendingReservationActive = true;
    const releasePendingReservation = () => {
      if (!pendingReservationActive) return;
      pendingReservationActive = false;
      pendingSessions -= 1;
    };
    let initializedSessionId: string | undefined;
    let session: McpHttpSession | null = null;
    try {
      const server = createOpenDesignMcpServer({
        daemonConnection,
        daemonUrl,
      });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        onsessioninitialized: async (newSessionId) => {
          initializedSessionId = newSessionId;
          if (session) {
            releasePendingReservation();
            sessions.set(newSessionId, session);
          }
          await onSessionInitialized?.(newSessionId);
        },
      });
      session = {
        closePromise: null,
        inFlight: 1,
        lastActivityAt: now(),
        server,
        transport,
      };
      transport.onclose = () => {
        if (initializedSessionId) sessions.delete(initializedSessionId);
      };
      await server.connect(transport as unknown as Transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        const response = jsonRpcError(
          500,
          error instanceof Error ? error.message : 'MCP initialization failed',
        );
        res.status(response.status).json(response.body);
      }
    } finally {
      releasePendingReservation();
      if (session) {
        session.inFlight -= 1;
        session.lastActivityAt = now();
      }
      if (!initializedSessionId && session) {
        session.closePromise ??= session.server.close().catch(() => {});
        await session.closePromise;
      } else if (closing && initializedSessionId) {
        await closeSession(initializedSessionId);
      }
    }
  });

  listener = await new Promise<HttpServer>((resolve, reject) => {
    const candidate = app.listen(port, host);
    const onError = (error: Error) => {
      candidate.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      candidate.off('error', onError);
      resolve(candidate);
    };
    candidate.once('error', onError);
    candidate.once('listening', onListening);
  });

  const address = listener.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve) => listener?.close(() => resolve()));
    throw new Error('could not determine the MCP HTTP listener address');
  }
  const actualPort = address.port;

  cleanupTimer = setInterval(
    () => void sweepIdleSessions(),
    Math.min(sessionIdleTimeoutMs, 60_000),
  );
  cleanupTimer.unref();

  const close = () => {
    closing = true;
    closePromise ??= (async () => {
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
      const listenerClosed = new Promise<void>((resolve) => {
        if (!listener?.listening) {
          resolve();
          return;
        }
        listener.close(() => resolve());
      });
      await Promise.all([...sessions.keys()].map(closeSession));
      listener?.closeAllConnections();
      await listenerClosed;
    })();
    return closePromise;
  };

  return {
    close,
    port: actualPort,
    sessionCount: () => sessions.size,
    sweepIdleSessions,
    url: endpointUrl(host, actualPort),
  };
}

export async function runMcpHttp(options: RunMcpHttpOptions): Promise<void> {
  validateMcpHttpOptions(options);
  const server = await startMcpHttpServer(options);
  process.stderr.write(`Open Design MCP listening on ${server.url}\n`);

  await new Promise<void>((resolve) => {
    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      void server.close().catch(() => {}).finally(() => {
        process.off('SIGINT', shutdown);
        process.off('SIGTERM', shutdown);
        resolve();
      });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
