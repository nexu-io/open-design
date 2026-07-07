// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// The moved body is untyped JS-in-TS; typing it is a later effort and new
// sibling code must NOT copy this.
/** @module http/sse
 * Server-Sent Events transport helper.
 *
 * `createSseResponse` turns an Express `res` into an SSE stream: it writes the
 * event-stream headers, runs a keep-alive heartbeat, wires socket cleanup, and
 * returns a small `{ send, writeKeepAlive, cleanup, end }` handle that assembles
 * each `id/event/data` frame into a single write (so partial-event readers see
 * whole events). `SSE_KEEPALIVE_INTERVAL_MS` is the default heartbeat cadence.
 *
 * Extracted verbatim from apps/daemon/src/server.ts (strangler-fig slice 2).
 * server.ts imports `createSseResponse` back for its route deps objects and
 * re-exports both names to keep its public surface identical.
 */

/** Default keep-alive heartbeat cadence for {@link createSseResponse}, in ms. */
export const SSE_KEEPALIVE_INTERVAL_MS = 25_000;

/**
 * Wrap an Express `res` as a Server-Sent Events stream.
 *
 * Sets the event-stream headers, starts an unref'd keep-alive heartbeat (unless
 * `keepAliveIntervalMs <= 0`), and registers cleanup on socket close/finish.
 * @param res Express response to stream over.
 * @param opts `{ keepAliveIntervalMs }` — heartbeat cadence; defaults to
 *   {@link SSE_KEEPALIVE_INTERVAL_MS}, `0` disables the heartbeat.
 * @returns Handle `{ send(event, data, id?), writeKeepAlive, cleanup, end }`.
 *   `send` returns false once the socket is no longer writable.
 */
export function createSseResponse(
  res,
  { keepAliveIntervalMs = SSE_KEEPALIVE_INTERVAL_MS } = {},
) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const canWrite = () => !res.destroyed && !res.writableEnded;
  const writeKeepAlive = () => {
    if (canWrite()) {
      res.write(': keepalive\n\n');
      return true;
    }
    return false;
  };

  let heartbeat = null;
  if (keepAliveIntervalMs > 0) {
    heartbeat = setInterval(writeKeepAlive, keepAliveIntervalMs);
    heartbeat.unref?.();
  }

  const cleanup = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
  };

  res.on('close', cleanup);
  res.on('finish', cleanup);

  return {
    /** @param {ChatSseEvent['event'] | ProxySseEvent['event'] | string} event */
    send(event, data, id: string | number | null | undefined = null) {
      if (!canWrite()) return false;
      // Assemble the full SSE event into a single write so id/event/data land
      // in one TCP chunk. Three separate writes would let `event: <type>` flush
      // ahead of the `data:` payload, which produces partial events for
      // consumers that read chunk-by-chunk (e.g. tests using a Response body
      // reader with a substring marker).
      const idLine = id !== null && id !== undefined ? `id: ${id}\n` : '';
      res.write(`${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    },
    writeKeepAlive,
    cleanup,
    end() {
      cleanup();
      if (canWrite()) {
        res.end();
      }
    },
  };
}
