import type { WorkspaceCollabContext } from '@open-design/contracts';
import { readVelaControlApiContext } from '../integrations/vela.js';
import { mapVelaWorkspaceContext } from './vela-workspace-context.js';

// Daemon half of the desktop invite hand-off ("桌面唤起和本地恢复", C's lane in
// the B-C invite contract). The desktop app receives an
// `opendesign://workspace/invite/continue?...&nonce=...` deeplink, parses it, and
// forwards the nonce here. The daemon proves identity with the SAME signed-in vela
// session (never a client-supplied one) and consumes the one-time continuation on
// B, which finalizes the membership and returns the current workspace context so
// the client can switch into the team workspace. Any failure degrades to a typed
// outcome the route maps onto HTTP — it never throws into the caller.

const DEFAULT_TIMEOUT_MS = 8_000;

function consumePath(nonce: string): string {
  return `/api/v1/workspace-invites/continuations/${encodeURIComponent(nonce)}/consume`;
}

export type InviteContinueOutcome =
  | { ok: true; context: WorkspaceCollabContext | null; workspaceMemberId: string }
  | { ok: false; status: number; error: string };

export interface ConsumeInviteContinuationOptions {
  /** Injectable for tests. */
  fetch?: typeof fetch;
  /** Injectable for tests; defaults to reading ~/.amr / env. */
  readSession?: typeof readVelaControlApiContext;
  timeoutMs?: number;
}

/**
 * Consume an invite continuation nonce against B using the local vela session,
 * returning the mapped workspace context on success. Errors are typed, not
 * thrown: `no_session` (401) when the client is not signed in, `continuation_<n>`
 * for B's 401/403/409/410 (subject mismatch / already consumed / expired), and
 * `continuation_unreachable` (502) on a transport failure.
 */
export async function consumeInviteContinuation(
  nonce: string,
  options: ConsumeInviteContinuationOptions = {},
): Promise<InviteContinueOutcome> {
  const fetchImpl = options.fetch ?? fetch;
  const readSession = options.readSession ?? readVelaControlApiContext;
  const trimmed = nonce.trim();
  if (!trimmed) return { ok: false, status: 400, error: 'missing_nonce' };

  const session = readSession();
  if (!session || !session.controlKey || !session.apiUrl) {
    return { ok: false, status: 401, error: 'no_session' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(new URL(consumePath(trimmed), session.apiUrl), {
      method: 'POST',
      headers: { authorization: `Bearer ${session.controlKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: `continuation_${response.status}` };
    }
    const body = (await response.json()) as {
      workspaceMemberId?: unknown;
      currentWorkspaceContext?: unknown;
    };
    return {
      ok: true,
      context: mapVelaWorkspaceContext(body.currentWorkspaceContext),
      workspaceMemberId: typeof body.workspaceMemberId === 'string' ? body.workspaceMemberId : '',
    };
  } catch {
    return { ok: false, status: 502, error: 'continuation_unreachable' };
  } finally {
    clearTimeout(timeout);
  }
}
