// @vitest-environment jsdom

/**
 * Coverage for the three additional CommentSyncBanner branches restored
 * alongside K8: `shareStopped`, `backfill` (K2), and `align`. Each must
 * respect the hard semantics documented on `CommentSyncState`:
 * - `backfill` absent, `pending`, or `succeeded` never renders a warning.
 * - `align` absent or `unknown` never renders as aligned OR as a problem.
 * - `shareStopped: null` (could not be read) never renders as stopped or as
 *   healthy.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommentSyncState, WorkspaceCollabContext } from '@open-design/contracts';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary } from '@open-design/contracts';
import { CommentSyncBanner } from '../../../src/components/share/CommentSyncBanner';
import { I18nProvider } from '../../../src/i18n';
import { resetWorkspaceAccountGeneration } from '../../../src/collab/workspace-identity';

vi.mock('../../../src/components/AmrLoginPill', () => ({
  AmrLoginPill: () => <div data-testid="login-pill" />,
}));

const personalContext: WorkspaceCollabContext = {
  workspaceId: 'workspace', workspaceType: 'personal', workspaceMemberId: 'member', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null,
  providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};

const base: CommentSyncState = { pending: 0, lastError: null, sessionMissing: false, shareStopped: null };

const fetchMock = vi.fn<typeof fetch>();

function renderBanner(state: CommentSyncState | null) {
  fetchMock.mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/comment-sync-state')) return Response.json(state);
    return Response.json({ state: 'unknown', reason: 'unavailable' });
  });
  return render(
    <I18nProvider initial="zh-CN">
      <CommentSyncBanner projectId="p" workspaceContext={personalContext} filePath="index.html" />
    </I18nProvider>,
  );
}

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); resetWorkspaceAccountGeneration(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetWorkspaceAccountGeneration(); });

describe('CommentSyncBanner — restored branches', () => {
  it('renders nothing when the state is unknown (null)', async () => {
    renderBanner(null);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('scopes the request to the current file so backfill can be computed', async () => {
    renderBanner(base);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('/api/projects/p/comment-sync-state?filePath=index.html');
  });

  it('does not render a share-stopped banner when shareStopped is null (unknown, not "not stopped")', async () => {
    renderBanner({ ...base, shareStopped: null });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not render a share-stopped banner when shareStopped is false', async () => {
    renderBanner({ ...base, shareStopped: false });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders the personal share-stopped copy when shareStopped is true', async () => {
    renderBanner({ ...base, shareStopped: true });
    await screen.findByText('链接已停用，评论暂停同步到分享页。');
  });

  it('does not render a backfill warning when backfill is absent (never attempted, not success)', async () => {
    renderBanner({ ...base });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not render a backfill warning while backfill is pending or already succeeded', async () => {
    renderBanner({ ...base, backfill: { state: 'pending', filePath: 'index.html', publicationRevision: 'r1', retryable: false } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    renderBanner({ ...base, backfill: { state: 'succeeded', filePath: 'index.html', publicationRevision: 'r1', retryable: false } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders the approved backfill-failed copy with a retry button when not auto-retrying', async () => {
    renderBanner({ ...base, backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'r1', retryable: false } });
    await screen.findByText('分享已发布');
    await screen.findByText('已有评论暂未同步，访客暂时看不到');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('omits the manual retry button when the server is already auto-retrying (retryable: true)', async () => {
    renderBanner({ ...base, backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'r1', retryable: true } });
    await screen.findByText('分享已发布');
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
  });

  it('does not render an align warning for absent or unknown align (not checked is not a verdict)', async () => {
    renderBanner({ ...base, align: undefined });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    renderBanner({ ...base, align: { state: 'unknown', reason: 'unavailable' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
    cleanup();
    renderBanner({ ...base, align: { state: 'aligned' } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders the approved align-diverged copy with a retry action', async () => {
    renderBanner({ ...base, align: { state: 'diverged' } });
    await screen.findByText('评论对齐未完成，可能有评论没显示出来');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('lets sessionMissing (K8) outrank shareStopped/backfill/align', async () => {
    renderBanner({
      pending: 1, lastError: null, sessionMissing: true, shareStopped: true,
      backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'r1', retryable: false },
      align: { state: 'diverged' },
    });
    await screen.findByText('未登录，评论暂停同步，访客的新评论暂时看不到。');
    expect(screen.queryByText('分享已发布')).toBeNull();
    expect(screen.queryByText('链接已停用，评论暂停同步到分享页。')).toBeNull();
  });
});
