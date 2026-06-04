import { requestJsonIpc } from "@open-design/sidecar";
import { SIDECAR_MESSAGES } from "@open-design/sidecar-proto";

import { isNotRunningIpcError } from "./config.js";

// The IPC request shape probeWebuiStatus depends on. Injectable so the
// classify-vs-rethrow behavior can be unit-tested without a real socket.
export type WebuiIpcRequester = (
  socketPath: string,
  payload: unknown,
  opts: { timeoutMs: number },
) => Promise<unknown>;

// One desktop IPC STATUS probe. Returns the live instance's URLs, null when
// nothing is listening on the namespace (a missing/refused socket), and RETHROWS
// every other failure (timeout, permission, malformed/ok:false reply). The
// rethrow is the point: callers must distinguish "no worker" from "a wedged live
// worker". Swallowing the latter would let `start` race into a duplicate launch
// on the same namespace/ports, and let the readiness poll hide a real failure
// behind the generic startup timeout.
export async function probeWebuiStatus(
  ipcPath: string,
  request: WebuiIpcRequester = requestJsonIpc,
): Promise<{ url: string; daemonUrl: string | null } | null> {
  let reply: { url?: string; daemonUrl?: string | null };
  try {
    reply = (await request(ipcPath, { type: SIDECAR_MESSAGES.STATUS }, { timeoutMs: 800 })) as typeof reply;
  } catch (error) {
    if (isNotRunningIpcError(error)) return null;
    throw error;
  }
  // request() resolved → the socket is live, so the STATUS reply shape is now the
  // invariant. A missing/empty url is a protocol failure (wedged or regressed
  // worker), NOT a not-running state — returning null here would let callers
  // treat the namespace as free (duplicate launch) or keep polling (hidden
  // error), the exact bugs this helper exists to prevent. So throw instead.
  if (reply?.url == null || reply.url.length === 0) {
    throw new Error(`invalid STATUS reply from ${ipcPath}: missing url`);
  }
  return { url: reply.url, daemonUrl: reply.daemonUrl ?? null };
}
