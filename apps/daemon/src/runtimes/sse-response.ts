import type { Response } from 'express';

export interface SseResponse {
  send(event: string, data: unknown, id?: string | number | null): boolean;
  writeKeepAlive(): boolean;
  cleanup(): void;
  end(): void;
}

export interface SseResponseOptions {
  keepAliveIntervalMs?: number;
}

/** Own SSE framing, heartbeat lifecycle, and response cleanup at one boundary. */
export function createSseResponse(
  res: Response,
  { keepAliveIntervalMs = 25_000 }: SseResponseOptions = {},
): SseResponse {
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

  let heartbeat: ReturnType<typeof setInterval> | null = null;
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
    send(event, data, id = null) {
      if (!canWrite()) return false;
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
