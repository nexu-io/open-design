// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InviteDialog } from '../../src/components/InviteDialog';
import { workspaceContextFixture } from '../helpers/workspace-context';

const analytics = vi.hoisted(() => ({
  track: vi.fn(),
  newRequestId: vi.fn(() => 'request-invite-1'),
}));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    track: analytics.track,
    newRequestId: analytics.newRequestId,
  }),
}));

const TEAM_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-team',
  workspaceMemberId: 'member-inviter',
  workspaceType: 'team',
});

afterEach(cleanup);

beforeEach(() => {
  analytics.track.mockReset();
  analytics.newRequestId.mockClear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    results: [{ ok: true }],
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })));
});

describe('InviteDialog analytics', () => {
  it('links submit and authoritative success without sending the email', async () => {
    render(
      <InviteDialog
        open
        onClose={() => {}}
        workspaceContext={TEAM_CONTEXT}
        availableSeats={3}
        entryFrom="all_projects"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/email/i), {
      target: { value: 'private@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /确认并邀请|confirm.*invite/i }));

    await waitFor(() => {
      expect(analytics.track).toHaveBeenCalledWith(
        'workspace_invite_result',
        expect.objectContaining({
          page_name: 'all_projects',
          entry_from: 'all_projects',
          result: 'success',
          requested_count: 1,
          succeeded_count: 1,
          failed_count: 0,
          workspace_key: 'workspace-team',
          $groups: { workspace: 'workspace-team' },
        }),
        { requestId: 'request-invite-1' },
      );
    });
    expect(analytics.track).toHaveBeenCalledWith(
      'ui_click',
      expect.objectContaining({
        element: 'submit',
        invite_count_bucket: '1',
      }),
      { requestId: 'request-invite-1' },
    );
    expect(JSON.stringify(analytics.track.mock.calls)).not.toContain('private@example.com');
  });
});
