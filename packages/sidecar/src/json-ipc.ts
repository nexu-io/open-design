/**
 * @module json-ipc
 *
 * Newline-delimited JSON IPC over a unix socket / Windows named pipe. Provides a
 * server that decodes one JSON frame per connection (UTF-8 safe across chunk
 * boundaries), runs a handler, and replies `{ok,result}`/`{ok:false,error}`, plus
 * a client request with timeout. Includes opt-in structured tracing (gated by
 * `OD_JSON_IPC_TRACE`) and stale-socket cleanup before binding. The trace
 * sequence counter is module-private singleton state. Depends on `node:fs`,
 * `node:net`, `node:path`, `node:string_decoder`, the shared net close helper,
 * the IPC-path recognizer, and the public IPC types.
 */

import { lstat, mkdir, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { createServer as createNetServer } from "node:net";
import { dirname } from "node:path";
import { StringDecoder } from "node:string_decoder";

import { isWindowsNamedPipePath } from "./ipc-path.js";
import { closeServer } from "./net.js";
import type { JsonIpcHandler, JsonIpcServerHandle } from "./types.js";

let jsonIpcTraceSeq = 0;

/**
 * @internal Whether JSON-IPC tracing is enabled via `OD_JSON_IPC_TRACE`.
 */
function jsonIpcTraceEnabled(): boolean {
  const value = process.env.OD_JSON_IPC_TRACE;
  return value === "1" || value === "true" || value === "yes";
}

/**
 * @internal Allocate a per-connection trace id.
 */
function nextJsonIpcTraceId(): string {
  jsonIpcTraceSeq += 1;
  return `ipc-${process.pid}-${jsonIpcTraceSeq}`;
}

/**
 * @internal Elapsed milliseconds since `startedAt` (an hrtime bigint).
 */
function jsonIpcTraceDurationMs(startedAt: bigint): number {
  return Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
}

/**
 * @internal Produce a compact, PII-light summary of a message for tracing.
 */
function summarizeJsonIpcMessage(message: unknown): Record<string, unknown> {
  if (message == null || typeof message !== "object") return { type: typeof message };
  const input = message as { input?: unknown; type?: unknown };
  const summary: Record<string, unknown> = { type: typeof input.type === "string" ? input.type : typeof input.type };
  if ("input" in input) {
    summary.hasInput = true;
    if (input.input != null && typeof input.input === "object") {
      summary.inputKeys = Object.keys(input.input as Record<string, unknown>).sort();
    } else {
      summary.inputType = typeof input.input;
    }
  }
  return summary;
}

/**
 * @internal Emit a trace line to stderr when tracing is enabled.
 */
function traceJsonIpc(event: string, details: Record<string, unknown>): void {
  if (!jsonIpcTraceEnabled()) return;
  console.error("[open-design sidecar] json ipc trace", { event, ...details });
}

/**
 * @internal Extract a Node error `code` string from an unknown thrown value.
 */
function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error == null || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return code == null ? null : String(code);
}

/**
 * @internal Extract a human-readable message from an unknown thrown value.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @internal Shape an unknown error into the `{code?,message}` IPC error payload.
 */
function jsonIpcError(error: unknown): { code?: string; message: string } {
  return {
    ...(errorCode(error) == null ? {} : { code: errorCode(error) as string }),
    message: errorMessage(error),
  };
}

/**
 * @internal Decide whether a unix socket path is a stale (dead) endpoint safe to
 * unlink: it exists as a socket but refuses/ENOENTs on connect.
 */
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

/**
 * @internal Prepare a socket path for binding: ensure the parent dir exists and
 * unlink a stale socket (no-op for Windows named pipes).
 */
async function prepareIpcPath(socketPath: string): Promise<void> {
  if (isWindowsNamedPipePath(socketPath)) return;
  await mkdir(dirname(socketPath), { recursive: true });
  if (await staleUnixSocketExists(socketPath)) await rm(socketPath, { force: true });
}

/**
 * Start a newline-delimited JSON IPC server on a unix socket / named pipe: each
 * connection carries one JSON request, the handler's result is written back as
 * `{ok:true,result}` (or `{ok:false,error}` on parse/handler failure).
 * @returns A handle whose `close()` stops the server and unlinks the socket.
 */
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
    // Decode UTF-8 across chunk boundaries: a multibyte character (e.g. CJK,
    // 3 bytes) can be split across two `data` events. `chunk.toString()` per
    // chunk would turn each half into U+FFFD, corrupting the payload (observed
    // as `???`/`◆?◆?◆?` in exported CJK artifacts). StringDecoder holds an
    // incomplete trailing sequence until the next chunk completes it.
    const decoder = new StringDecoder("utf8");
    const traceId = nextJsonIpcTraceId();
    const startedAt = process.hrtime.bigint();
    traceJsonIpc("server.connection", { socketPath, traceId });
    socket.on("error", (error) => {
      traceJsonIpc("server.socket_error", {
        durationMs: jsonIpcTraceDurationMs(startedAt),
        error: error instanceof Error ? error.message : String(error),
        socketPath,
        traceId,
      });
    });
    socket.on("close", () => {
      traceJsonIpc("server.socket_close", {
        durationMs: jsonIpcTraceDurationMs(startedAt),
        socketPath,
        traceId,
      });
    });
    socket.on("data", async (chunk) => {
      traceJsonIpc("server.data", {
        bytes: chunk.byteLength,
        durationMs: jsonIpcTraceDurationMs(startedAt),
        socketPath,
        traceId,
      });
      buffer += decoder.write(chunk);
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) return;
      const frame = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      let message: unknown;
      try {
        message = JSON.parse(frame);
      } catch (error) {
        traceJsonIpc("server.frame_parse_failed", {
          durationMs: jsonIpcTraceDurationMs(startedAt),
          error: error instanceof Error ? error.message : String(error),
          frameBytes: Buffer.byteLength(frame),
          socketPath,
          traceId,
        });
        socket.end(
          `${JSON.stringify({
            ok: false,
            error: jsonIpcError(error),
          })}\n`,
        );
        return;
      }
      const messageSummary = summarizeJsonIpcMessage(message);
      traceJsonIpc("server.frame_parsed", {
        durationMs: jsonIpcTraceDurationMs(startedAt),
        frameBytes: Buffer.byteLength(frame),
        message: messageSummary,
        socketPath,
        traceId,
      });
      try {
        traceJsonIpc("server.handler_start", {
          durationMs: jsonIpcTraceDurationMs(startedAt),
          message: messageSummary,
          socketPath,
          traceId,
        });
        const result = await handler(message);
        traceJsonIpc("server.handler_success", {
          durationMs: jsonIpcTraceDurationMs(startedAt),
          message: messageSummary,
          socketPath,
          traceId,
        });
        socket.end(`${JSON.stringify({ ok: true, result })}\n`);
      } catch (error) {
        traceJsonIpc("server.handler_failed", {
          durationMs: jsonIpcTraceDurationMs(startedAt),
          error: error instanceof Error ? error.message : String(error),
          message: messageSummary,
          socketPath,
          traceId,
        });
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

/**
 * Send one newline-delimited JSON request over a unix socket / named pipe and
 * resolve with the server's `result`, rejecting on error response or timeout.
 * @returns The server's `result` payload.
 */
export async function requestJsonIpc<T = any>(
  socketPath: string,
  payload: unknown,
  { timeoutMs = 1500 }: { timeoutMs?: number } = {},
): Promise<T> {
  return await new Promise<T>((resolveRequest, rejectRequest) => {
    const socket = createConnection(socketPath);
    const traceId = nextJsonIpcTraceId();
    const startedAt = process.hrtime.bigint();
    let settled = false;
    let buffer = "";
    // See the server reader above: decode UTF-8 across chunk boundaries so a
    // multibyte character split across two `data` events is not corrupted.
    const decoder = new StringDecoder("utf8");
    const messageSummary = summarizeJsonIpcMessage(payload);
    traceJsonIpc("client.connect_start", { message: messageSummary, socketPath, timeoutMs, traceId });
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      traceJsonIpc("client.timeout", {
        durationMs: jsonIpcTraceDurationMs(startedAt),
        message: messageSummary,
        socketPath,
        timeoutMs,
        traceId,
      });
      socket.destroy();
      settle(() => rejectRequest(new Error(`IPC request timed out: ${socketPath}`)));
    }, timeoutMs);

    socket.on("connect", () => {
      traceJsonIpc("client.connected", {
        durationMs: jsonIpcTraceDurationMs(startedAt),
        message: messageSummary,
        socketPath,
        traceId,
      });
      const frame = `${JSON.stringify(payload)}\n`;
      traceJsonIpc("client.write_start", {
        bytes: Buffer.byteLength(frame),
        durationMs: jsonIpcTraceDurationMs(startedAt),
        message: messageSummary,
        socketPath,
        traceId,
      });
      const flushed = socket.write(frame, () => {
        traceJsonIpc("client.write_callback", {
          durationMs: jsonIpcTraceDurationMs(startedAt),
          message: messageSummary,
          socketPath,
          traceId,
        });
      });
      if (!flushed) {
        socket.once("drain", () => {
          traceJsonIpc("client.drain", {
            durationMs: jsonIpcTraceDurationMs(startedAt),
            message: messageSummary,
            socketPath,
            traceId,
          });
        });
      }
    });
    socket.on("data", (chunk) => {
      traceJsonIpc("client.data", {
        bytes: chunk.byteLength,
        durationMs: jsonIpcTraceDurationMs(startedAt),
        message: messageSummary,
        socketPath,
        traceId,
      });
      buffer += decoder.write(chunk);
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) return;
      socket.end();
      settle(() => {
        const response = JSON.parse(buffer.slice(0, newlineIndex)) as { error?: { message?: string }; ok: boolean; result?: T };
        if (!response.ok) {
          traceJsonIpc("client.response_error", {
            durationMs: jsonIpcTraceDurationMs(startedAt),
            error: response.error?.message ?? "IPC request failed",
            message: messageSummary,
            socketPath,
            traceId,
          });
          rejectRequest(new Error(response.error?.message ?? "IPC request failed"));
          return;
        }
        traceJsonIpc("client.response_success", {
          durationMs: jsonIpcTraceDurationMs(startedAt),
          message: messageSummary,
          socketPath,
          traceId,
        });
        resolveRequest(response.result as T);
      });
    });
    socket.on("error", (error) => {
      traceJsonIpc("client.socket_error", {
        durationMs: jsonIpcTraceDurationMs(startedAt),
        error: error instanceof Error ? error.message : String(error),
        message: messageSummary,
        socketPath,
        traceId,
      });
      settle(() => rejectRequest(error));
    });
    socket.on("close", () => {
      traceJsonIpc("client.socket_close", {
        durationMs: jsonIpcTraceDurationMs(startedAt),
        message: messageSummary,
        socketPath,
        traceId,
      });
    });
  });
}
