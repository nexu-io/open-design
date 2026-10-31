// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StrictMode } from 'react';
import { InviteDialog, OnboardingInviteView } from '../../src/components/InviteDialog';
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

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'private@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /发送邀请|send invitations|确认并邀请|confirm.*invite/i }));

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


describe('seats invitation journey', () => {
  it('reports one onboarding page in StrictMode and an explicit skip, never the ordinary modal', () => {
    const finish = vi.fn();
    const view = render(<StrictMode><OnboardingInviteView workspaceContext={TEAM_CONTEXT} onFinish={finish} /></StrictMode>);
    view.rerender(<StrictMode><OnboardingInviteView workspaceContext={{ ...TEAM_CONTEXT }} onFinish={finish} /></StrictMode>);
    expect(analytics.track.mock.calls.filter(([event]) => event === 'page_view')).toHaveLength(1);
    expect(analytics.track.mock.calls.filter(([event]) => event === 'surface_view')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /暂时跳过|skip/i }));
    expect(analytics.track).toHaveBeenCalledWith('ui_click', expect.objectContaining({ page_name: 'onboarding', area: 'onboarding_invite_step', element: 'skip_invite', entry_from: 'onboarding', invite_surface_id: expect.any(String) }), undefined);
    expect(analytics.track.mock.calls.filter(([event]) => event.endsWith('_result'))).toHaveLength(0);
    expect(finish).toHaveBeenCalledWith(0, 'skipped');
  });

  it('links home-banner exposure, effective submit and an unknown transport result without claiming failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('private transport details')));
    render(<InviteDialog open onClose={() => {}} workspaceContext={TEAM_CONTEXT} entryFrom="home_banner" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'private@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /发送邀请|send invitations/i }));
    await waitFor(() => expect(analytics.track).toHaveBeenCalledWith('workspace_invite_result', expect.objectContaining({ result: 'unknown', failed_count: 0, unknown_count: 1, succeeded_count: 0, entry_from: 'home_banner' }), expect.anything()));
    const result = analytics.track.mock.calls.find(([event]) => event === 'workspace_invite_result')![1];
    const submit = analytics.track.mock.calls.find(([event, props]) => event === 'ui_click' && props.element === 'submit')![1];
    const view = analytics.track.mock.calls.find(([event]) => event === 'surface_view')![1];
    expect(result.invite_batch_id).toBe(submit.invite_batch_id);
    expect(result.invite_surface_id).toBe(view.invite_surface_id);
    expect(JSON.stringify(analytics.track.mock.calls)).not.toMatch(/private@example|private transport/);
  });

  it('starts a new modal instance after close/reopen but not after a context refresh', () => {
    const props = { onClose: vi.fn(), workspaceContext: TEAM_CONTEXT };
    const view = render(<StrictMode><InviteDialog {...props} open /></StrictMode>);
    view.rerender(<StrictMode><InviteDialog {...props} workspaceContext={{ ...TEAM_CONTEXT }} open /></StrictMode>);
    expect(analytics.track.mock.calls.filter(([event]) => event === 'surface_view')).toHaveLength(1);
    view.rerender(<StrictMode><InviteDialog {...props} open={false} /></StrictMode>);
    view.rerender(<StrictMode><InviteDialog {...props} open /></StrictMode>);
    const exposures = analytics.track.mock.calls.filter(([event]) => event === 'surface_view');
    expect(exposures).toHaveLength(2);
    expect(exposures[0]![1].invite_surface_id).not.toBe(exposures[1]![1].invite_surface_id);
  });
});
