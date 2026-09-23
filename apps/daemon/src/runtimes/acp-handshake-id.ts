/** @module runtimes/acp-handshake-id
 * Reads *when* an ACP failure happened out of its JSON-RPC request id.
 *
 * `agent-protocol/acp/session.ts` numbers the handshake deterministically:
 * request id 1 is `initialize`, id 2 is `session/new` (or `session/load` when
 * resuming), and ids from 3 up belong to model selection and `session/prompt`.
 * So a JSON-RPC error carrying id 1 or 2 is, by construction, a handshake
 * failure: nothing has streamed yet. Anything numbered 3 or higher happened
 * after a session existed.
 *
 * This module answers ONLY that structural question, and it has no imports on
 * purpose. The matching question — *why* the handshake failed, and therefore
 * what the user should do about it — belongs to `run-failure-classification.ts`,
 * which owns every cause signature the daemon knows. Keeping the two apart is
 * what lets the classifier read the id without the id-reader having to reach
 * back into the classifier.
 */

/** Highest JSON-RPC request id the ACP handshake can use (`initialize`, then `session/new` / `session/load`). */
export const ACP_HANDSHAKE_MAX_RPC_ID = 2;

/**
 * Reads the JSON-RPC request id out of an ACP failure line.
 *
 * @param text - Failure text as surfaced by the ACP session (`rpcErrorMessage`).
 * @returns The request id, or `null` when the text carries no `json-rpc id N:` prefix.
 */
export function acpRpcErrorId(text: string | null | undefined): number | null {
  if (typeof text !== 'string' || !text) return null;
  const match = /\bjson-rpc id (\d+):/i.exec(text);
  if (!match?.[1]) return null;
  const id = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * True when a failure text is a JSON-RPC error raised during the ACP
 * handshake, i.e. before any session existed. Structural only: it reports
 * *when* the failure happened and says nothing about its cause.
 *
 * @param text - Failure text as surfaced by the ACP session.
 */
export function isAcpHandshakeRpcErrorText(text: string | null | undefined): boolean {
  const id = acpRpcErrorId(text);
  return id !== null && id >= 1 && id <= ACP_HANDSHAKE_MAX_RPC_ID;
}
