import type { ChildProcess } from 'node:child_process';

type JsonRecord = Record<string, unknown>;

export type ZcodeProtocolRequest = {
  id: string;
  method: string;
  params: JsonRecord;
};

export type ZcodeProtocolResponse = JsonRecord;

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (response: ZcodeProtocolResponse) => void;
  timer: ReturnType<typeof setTimeout>;
  // Detaches the AbortSignal listener (if any) once the request settles by
  // response/timeout/close, so an abort after settle is a no-op and the
  // listener does not leak.
  cleanup: () => void;
};

/**
 * Receives any stdout frame that is NOT a response to one of our own requests:
 * async notifications (`session/event`, `state.updated`) and server→client
 * requests (`method` + a non-pending `id`, e.g.
 * `interaction/requestProviderRuntimeHeaders` and
 * `session/requestRuntimePreferences`). The consumer decides how to map or
 * answer each frame; the transport stays agnostic.
 */
export type ZcodeNotificationListener = (frame: ZcodeProtocolResponse) => void;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessageFromPayload(error: JsonRecord): string {
  return typeof error.message === 'string' ? error.message : JSON.stringify(error);
}

function abortReason(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  if (typeof reason === 'string' && reason.length > 0) return new Error(reason);
  return new Error('zcode app-server request aborted');
}

export function createZcodeProtocolClient(child: ChildProcess) {
  const pending = new Map<string, PendingRequest>();
  const notificationListeners = new Set<ZcodeNotificationListener>();
  let disposed = false;
  let stdoutBuffer = '';
  let stderrTail = '';

  const dispatchNotification = (frame: ZcodeProtocolResponse) => {
    for (const listener of notificationListeners) {
      try {
        listener(frame);
      } catch {
        // A listener throwing must not break stdout parsing for the others.
      }
    }
  };

  const writeFrame = (frame: JsonRecord): void => {
    const stdin = child.stdin;
    if (!stdin) {
      throw new Error('zcode app-server stdin is not available');
    }
    stdin.write(`${JSON.stringify(frame)}\n`);
  };

  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');

  const rejectPending = (error: Error) => {
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.cleanup();
      pending.delete(id);
      entry.reject(error);
    }
  };

  const onStdout = (chunk: string | Buffer) => {
    stdoutBuffer += String(chunk);
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!isRecord(parsed)) continue;

      // A response to one of our own requests carries a string `id` that matches
      // a pending entry. Route it back to the awaiting request.
      const id = parsed.id;
      if (typeof id === 'string') {
        const match = pending.get(id);
        if (match) {
          clearTimeout(match.timer);
          match.cleanup();
          pending.delete(id);
          if (isRecord(parsed.error)) {
            match.reject(
              new Error(
                `zcode app-server returned error: ${errorMessageFromPayload(parsed.error)}`,
              ),
            );
          } else {
            match.resolve(parsed);
          }
          continue;
        }
      }

      // Everything else with a `method` is an async notification or a
      // server→client request. Surface it to notification listeners; stray
      // responses with an unknown id (no method) are dropped as before.
      if (typeof parsed.method === 'string') {
        dispatchNotification(parsed);
      }
    }
  };

  const onStderr = (chunk: string | Buffer) => {
    stderrTail = (stderrTail + String(chunk)).slice(-400);
  };

  const onError = (error: Error) => {
    rejectPending(error);
  };

  const onStdinError = (error: Error) => {
    rejectPending(
      new Error(`zcode app-server stdin failed: ${error.message}`),
    );
  };

  const onClose = () => {
    rejectPending(
      new Error(`zcode app-server exited before responding. stderr: ${stderrTail}`),
    );
  };

  child.stdout?.on('data', onStdout);
  child.stderr?.on('data', onStderr);
  child.stdin?.on('error', onStdinError);
  child.on('error', onError);
  child.on('close', onClose);

  return {
    request(
      request: ZcodeProtocolRequest,
      timeoutMs = 10_000,
      signal?: AbortSignal,
    ): Promise<ZcodeProtocolResponse> {
      if (disposed) {
        return Promise.reject(new Error('zcode protocol client already disposed'));
      }
      const stdin = child.stdin;
      if (!stdin) {
        return Promise.reject(new Error('zcode app-server stdin is not available'));
      }
      // An already-aborted signal short-circuits before anything is sent.
      if (signal?.aborted) {
        return Promise.reject(abortReason(signal));
      }

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const entry = pending.get(request.id);
          entry?.cleanup();
          pending.delete(request.id);
          reject(
            new Error(`Timed out waiting for zcode app-server response. stderr: ${stderrTail}`),
          );
        }, timeoutMs);

        let onAbort: (() => void) | undefined;
        // Removes the abort listener; runs on response/timeout/close so an abort
        // after the request has settled is a no-op.
        const cleanup = () => {
          if (onAbort) signal?.removeEventListener('abort', onAbort);
        };

        if (signal) {
          onAbort = () => {
            clearTimeout(timer);
            pending.delete(request.id);
            reject(abortReason(signal));
          };
          signal.addEventListener('abort', onAbort, { once: true });
        }

        pending.set(request.id, { resolve, reject, timer, cleanup });

        try {
          stdin.write(`${JSON.stringify(request)}\n`);
        } catch (error) {
          clearTimeout(timer);
          cleanup();
          pending.delete(request.id);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },

    /**
     * Subscribe to async notification frames and server→client requests.
     * Returns an unsubscribe function. Listeners are dropped on `dispose()`.
     */
    onNotification(listener: ZcodeNotificationListener): () => void {
      notificationListeners.add(listener);
      return () => {
        notificationListeners.delete(listener);
      };
    },

    /**
     * Answer a server→client request (surfaced via `onNotification`) by writing
     * an `{ id, result }` frame back to the app-server. For these requests the
     * "failure" case is encoded inside `result` (e.g.
     * `{ headersApplied: false, errorMessage }`), not a JSON-RPC error frame.
     */
    respond(id: string, result: JsonRecord): void {
      if (disposed) {
        throw new Error('zcode protocol client already disposed');
      }
      writeFrame({ id, result });
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      child.stdout?.off('data', onStdout);
      child.stderr?.off('data', onStderr);
      child.stdin?.off('error', onStdinError);
      child.off('error', onError);
      child.off('close', onClose);
      notificationListeners.clear();
      rejectPending(new Error('zcode protocol client disposed'));
    },
  };
}
