import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceInvite } from '../src/collab/invite-create.js';

const SESSION = {
  profile: 'prod',
  apiUrl: 'https://vela.example',
  controlKey: 'ck-1',
  user: null,
  configMtimeMs: null,
};

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe('createWorkspaceInvite', () => {
  it('POSTs to B with the session bearer + { email, role, workspaceId } body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, { inviteId: 'inv-9' })) as unknown as typeof fetch;
    const out = await createWorkspaceInvite(
      { email: '  new@company.com ', role: 'admin', workspaceId: 'ws-team-1' },
      { fetch: fetchImpl, readSession: () => SESSION },
    );
    expect(out).toEqual({ ok: true, inviteId: 'inv-9' });

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toBe('https://vela.example/api/v1/workspaces/ws-team-1/invites');
    const request = init as RequestInit;
    expect(request.method).toBe('POST');
    expect(request.headers).toMatchObject({ authorization: 'Bearer ck-1' });
    expect(JSON.parse(String(request.body))).toEqual({
      invitedEmail: 'new@company.com',
      role: 'admin',
    });
  });

  it('returns no_session without calling B when signed out', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, {})) as unknown as typeof fetch;
    const out = await createWorkspaceInvite(
      { email: 'new@company.com', role: 'member', workspaceId: 'ws-team-1' },
      { fetch: fetchImpl, readSession: () => null },
    );
    expect(out).toEqual({ ok: false, status: 401, error: 'no_session' });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('returns no_workspace without calling B when there is no workspace to scope to', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(201, {})) as unknown as typeof fetch;
    const out = await createWorkspaceInvite(
      { email: 'new@company.com', role: 'member', workspaceId: '   ' },
      { fetch: fetchImpl, readSession: () => SESSION },
    );
    expect(out).toEqual({ ok: false, status: 409, error: 'no_workspace' });
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it("degrades to a typed create_<status> when B's endpoint is absent (404) or forbids (403)", async () => {
    for (const status of [404, 403]) {
      const out = await createWorkspaceInvite(
        { email: 'new@company.com', role: 'member', workspaceId: 'ws-team-1' },
        {
          fetch: (async () => jsonResponse(status, { error: 'x' })) as unknown as typeof fetch,
          readSession: () => SESSION,
        },
      );
      expect(out).toEqual({ ok: false, status, error: `create_${status}` });
    }
  });

  it('degrades to create_unreachable on a transport error, never throwing', async () => {
    const out = await createWorkspaceInvite(
      { email: 'new@company.com', role: 'member', workspaceId: 'ws-team-1' },
      {
        fetch: (async () => {
          throw new Error('network down');
        }) as unknown as typeof fetch,
        readSession: () => SESSION,
      },
    );
    expect(out).toEqual({ ok: false, status: 502, error: 'create_unreachable' });
  });
});
