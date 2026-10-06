import type { Writable } from 'node:stream';
import { asObject } from './json.js';
import { sendRpc } from './rpc.js';
import type { JsonObject, JsonRpcId } from './types.js';

const PROBE_CLEANUP_TIMEOUT_MS = 1000;

/** Only a negotiated object advertises delete; null, booleans and arrays do not. */
export function supportsSessionDelete(initializeResult: JsonObject): boolean {
  const capabilities = asObject(initializeResult.agentCapabilities);
  const sessions = asObject(capabilities?.sessionCapabilities);
  const deletion = sessions?.delete;
  return deletion !== null && typeof deletion === 'object' && !Array.isArray(deletion);
}

/** Keep a disposable probe's transport alive until deletion settles, without changing its verdict. */
export function createProbeSessionCleanup(stdin: Writable, allocateId: () => JsonRpcId) {
  let requestId: JsonRpcId | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let complete: (() => void) | null = null;
  let pending = Promise.resolve();

  const settle = (outcome: 'deleted' | 'rejected' | 'timeout' | 'transport_closed') => {
    if (!complete) return;
    if (timer) clearTimeout(timer);
    timer = null;
    requestId = null;
    const done = complete;
    complete = null;
    // Do not log the session id or the agent-controlled error payload.
    if (outcome !== 'deleted') console.warn(`[acp] probe session cleanup: ${outcome}`);
    done();
  };

  return {
    start(sessionId: string | null, advertised: boolean, afterCleanup: () => void) {
      if (!sessionId || stdin.destroyed || stdin.writableEnded) {
        afterCleanup();
        return;
      }
      if (!advertised) {
        console.info('[acp] probe session cleanup skipped: session/delete not advertised');
        afterCleanup();
        return;
      }
      pending = new Promise<void>((resolve) => {
        complete = () => {
          try { afterCleanup(); } finally { resolve(); }
        };
      });
      requestId = allocateId();
      timer = setTimeout(() => settle('timeout'), PROBE_CLEANUP_TIMEOUT_MS);
      try {
        sendRpc(stdin, requestId, 'session/delete', { sessionId });
      } catch {
        settle('transport_closed');
      }
    },
    consume(frame: JsonObject): boolean {
      if (requestId === null || frame.id !== requestId || frame.method !== undefined) return false;
      if (asObject(frame.error)) {
        settle('rejected');
      } else if (asObject(frame.result)) {
        settle('deleted');
      }
      return true;
    },
    transportClosed() { settle('transport_closed'); },
    completed() { return pending; },
  };
}
