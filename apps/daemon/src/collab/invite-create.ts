import type { WorkspaceInviteRole } from '@open-design/contracts';
import { readVelaControlApiContext } from '../integrations/vela.js';

// Daemon half of the invite CREATE flow (the inviter/host side of the B-C invite
// contract). The team switcher's "邀请同事" dialog collects { email, role } rows
// and POSTs them to `/api/workspace/invite`; that route derives the current
// workspaceId from the workspace context and calls this helper once per invite.
// The helper proves identity with the SAME signed-in vela session the rest of C
// uses (never a client-supplied one) and POSTs to B's create-invite endpoint.
// Any failure degrades to a typed outcome the route maps onto HTTP — it never
// throws into the caller. In particular, B's create endpoint may not exist on a
// local backend yet, so a 404 (or any non-2xx) is reported as `create_<status>`,
// not a crash.

const DEFAULT_TIMEOUT_MS = 8_000;

function createInvitePath(workspaceId: string): string {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/invites`;
}

export interface CreateWorkspaceInviteInput {
  email: string;
  role: WorkspaceInviteRole;
  /** The workspace the invite is scoped to (derived from the caller's context). */
  workspaceId: string;
}

export type CreateInviteOutcome =
  | { ok: true; inviteId: string }
  | { ok: false; status: number; error: string };

export interface CreateWorkspaceInviteOptions {
  /** Injectable for tests. */
  fetch?: typeof fetch;
  /** Injectable for tests; defaults to reading ~/.amr / env. */
  readSession?: typeof readVelaControlApiContext;
  timeoutMs?: number;
}

/**
 * Create a single workspace invite on B using the local vela session.
 *
 * Errors are typed, not thrown: `no_session` (401) when the client is not signed
 * in, `no_workspace` (409) when there is no workspace to scope the invite to,
 * `create_<n>` for B's non-2xx (e.g. `create_404` when the endpoint is absent
 * locally, `create_403` when forbidden), and `create_unreachable` (502) on a
 * transport failure.
 */
export async function createWorkspaceInvite(
  input: CreateWorkspaceInviteInput,
  options: CreateWorkspaceInviteOptions = {},
): Promise<CreateInviteOutcome> {
  const fetchImpl = options.fetch ?? fetch;
  const readSession = options.readSession ?? readVelaControlApiContext;

  const email = input.email.trim();
  if (!email) return { ok: false, status: 400, error: 'missing_email' };
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) return { ok: false, status: 409, error: 'no_workspace' };

  const session = readSession();
  if (!session || !session.controlKey || !session.apiUrl) {
    return { ok: false, status: 401, error: 'no_session' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetchImpl(new URL(createInvitePath(workspaceId), session.apiUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.controlKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ invitedEmail: email, role: input.role }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, status: response.status, error: `create_${response.status}` };
    }
    const body = (await response.json().catch(() => null)) as
      | { inviteId?: unknown; id?: unknown }
      | null;
    const inviteId =
      typeof body?.inviteId === 'string'
        ? body.inviteId
        : typeof body?.id === 'string'
          ? body.id
          : '';
    return { ok: true, inviteId };
  } catch {
    return { ok: false, status: 502, error: 'create_unreachable' };
  } finally {
    clearTimeout(timeout);
  }
}
