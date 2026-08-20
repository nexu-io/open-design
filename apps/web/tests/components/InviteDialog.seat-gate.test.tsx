// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { InviteDialog } from '../../src/components/InviteDialog';
import { workspaceContextFixture } from '../helpers/workspace-context';

const TEAM_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-team',
  workspaceMemberId: 'member-inviter',
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function typeAnInvite() {
  const email = screen.getAllByRole('textbox')[0]!;
  fireEvent.change(email, { target: { value: 'teammate@example.com' } });
}

async function submitWithError(error: string) {
  const fetchSpy = vi.fn(async () =>
    new Response(JSON.stringify({ results: [{ ok: false, error }] }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchSpy);

  render(<InviteDialog open onClose={() => {}} workspaceContext={TEAM_CONTEXT} />);
  typeAnInvite();
  fireEvent.click(screen.getByRole('button', { name: /确认并邀请|invite/i }));
  await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
  return screen.findByRole('alert');
}

describe('InviteDialog — seat gate (#115)', () => {
  it('refuses to send and offers the upgrade path when the workspace is out of seats', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const onUpgrade = vi.fn();

    render(
      <InviteDialog
        open
        onClose={() => {}}
        workspaceContext={TEAM_CONTEXT}
        availableSeats={0}
        onUpgrade={onUpgrade}
      />,
    );
    typeAnInvite();

    // The plan limit is the reason the user cannot invite, so it has to be
    // visible before they press send — not delivered as a per-row send error.
    const confirm = screen.getByRole('button', { name: /确认并邀请|invite/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirm);
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /查看席位|seats/i }));
    expect(onUpgrade).toHaveBeenCalled();
  });

  it('still sends when seats remain', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ ok: true }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <InviteDialog
        open
        onClose={() => {}}
        workspaceContext={TEAM_CONTEXT}
        availableSeats={3}
      />,
    );
    typeAnInvite();
    fireEvent.click(screen.getByRole('button', { name: /确认并邀请|invite/i }));

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const firstCall = fetchSpy.mock.calls[0] as unknown[] | undefined;
    expect(String(firstCall?.[0])).toContain('/api/workspace/invite');
    const init = firstCall?.[1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get('x-od-workspace-id')).toBe(TEAM_CONTEXT.workspaceId);
    expect(headers.get('x-od-workspace-member-id')).toBe(
      TEAM_CONTEXT.workspaceMemberId,
    );
  });

  it('stays permissive while the seat count is still unknown', () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ ok: true }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    // A context that has not loaded yet must not look like "no seats".
    render(<InviteDialog open onClose={() => {}} workspaceContext={TEAM_CONTEXT} />);
    typeAnInvite();
    const confirm = screen.getByRole('button', { name: /确认并邀请|invite/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
  });

  // The two 409 duplicate variants must read differently: "already on the team"
  // and "already invited" call for different next steps. `invite_existing_member`
  // is B's wire code for the first one (V0.19.1 acceptance bug recvrovm9Bcyy0) —
  // it used to fall through to the generic retry copy.
  it.each(['already_member', 'invite_existing_member'])(
    'names the already-a-member reason for explicit %s',
    async (error) => {
      const alert = await submitWithError(error);
      expect(alert).toHaveTextContent(/已是团队成员|already a team member/i);
      expect(alert).not.toHaveTextContent(/发送失败|failed to send/i);
    },
  );

  it.each(['active_pending_invite', 'invite_duplicate'])(
    'names the pending-invite reason for explicit %s',
    async (error) => {
      const alert = await submitWithError(error);
      expect(alert).toHaveTextContent(/已有待接受的邀请|pending invitation/i);
      expect(alert).not.toHaveTextContent(/发送失败|failed to send/i);
    },
  );

  it.each([
    'workspace_seat_limit_reached',
    'workspace_subscription_seat_allocation_unavailable',
  ])('shows actionable seat copy for %s', async (error) => {
    expect(await submitWithError(error)).toHaveTextContent(
      /席位已用完|no seats left/i,
    );
  });

  it.each(['create_409', 'unknown_conflict'])(
    'keeps unknown conflict %s generic instead of claiming a duplicate',
    async (error) => {
      const alert = await submitWithError(error);
      expect(alert).toHaveTextContent(/发送失败|failed to send/i);
      expect(alert).not.toHaveTextContent(/已有待接受的邀请|pending invitation/i);
      expect(alert).not.toHaveTextContent(/已是团队成员|already a team member/i);
    },
  );
});
