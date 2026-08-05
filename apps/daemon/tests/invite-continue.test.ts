import { describe, expect, it, vi } from 'vitest';
import { consumeInviteContinuation } from '../src/collab/invite-continue.js';

const SESSION = { profile: 'prod', apiUrl: 'https://vela.example', controlKey: 'ck-1', user: null, configMtimeMs: null };

const B_CONTEXT = {
  userId: 'auth-user-1',
  appUserId: 'app-user-1',
  workspaceId: 'ws-team-1',
  workspaceType: 'team',
  workspaceMemberId: 'wm-1',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: 'team-pro',
  providerMode: 'platform_credits',
  seatSummary: { seatLimit: 5, usedSeats: 2, availableSeats: 3, isSeatFull: false },
  permissions: {
    canManageMembers: false,
    canManageBilling: false,
    canInviteMembers: false,
    canManageAutoRecharge: false,
    canShareProjects: true,
    canWriteSyncedFiles: true,
    canViewWorkspaceSettings: true,
    canManageSharedResources: false,
  },
};

const CONSUME_BODY = {
  workspaceId: 'ws-team-1',
  workspaceMemberId: 'wm-1',
  memberId: 'wm-1',
  inviteId: 'inv-1',
  currentWorkspaceContext: B_CONTEXT,
};

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe('consumeInviteContinuation', () => {
  it('consumes the nonce with the session bearer and maps the returned context', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, CONSUME_BODY)) as unknown as typeof fetch;
    const out = await consumeInviteContinuation('nonce-1', { fetch: fetchImpl, readSession: () => SESSION });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.context?.workspaceMemberId).toBe('wm-1');
      expect(out.context?.teamId).toBe('ws-team-1');
      expect(out.workspaceMemberId).toBe('wm-1');
    }
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toBe('https://vela.example/api/v1/workspace-invites/continuations/nonce-1/consume');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer ck-1' });
  });

  it('returns no_session without calling B when signed out', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, CONSUME_BODY)) as unknown as typeof fetch;
    const out = await consumeInviteContinuation('nonce-1', { fetch: fetchImpl, readSession: () => null });
    expect(out).toEqual({ ok: false, status: 401, error: 'no_session' });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("maps B's rejections verbatim (403 mismatch, 409 consumed, 410 expired)", async () => {
    for (const status of [403, 409, 410]) {
      const out = await consumeInviteContinuation('n', {
        fetch: (async () => jsonResponse(status, { error: 'x' })) as unknown as typeof fetch,
        readSession: () => SESSION,
      });
      expect(out).toEqual({ ok: false, status, error: `continuation_${status}` });
    }
  });

  it('degrades to 502 on a transport error and 400 on an empty nonce', async () => {
    const broken = await consumeInviteContinuation('n', {
      fetch: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch,
      readSession: () => SESSION,
    });
    expect(broken).toEqual({ ok: false, status: 502, error: 'continuation_unreachable' });

    const empty = await consumeInviteContinuation('   ', { readSession: () => SESSION });
    expect(empty).toEqual({ ok: false, status: 400, error: 'missing_nonce' });
  });
});
