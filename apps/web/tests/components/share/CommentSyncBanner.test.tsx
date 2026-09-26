// @vitest-environment jsdom

/**
 * Coverage for the three additional CommentSyncBanner branches restored
 * alongside K8: `shareStopped`, `backfill` (K2), and `align`. Each must
 * respect the hard semantics documented on `CommentSyncState`:
 * - `backfill` absent or succeeded never renders a warning; pending is
 *   informational, but verified reopened pending warns about stale visible comments.
 * - `align` absent or `unknown` never renders as aligned OR as a problem.
 * - `shareStopped: null` (could not be read) never renders as stopped or as
 *   healthy.
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); resetWorkspaceAccountGeneration(); });

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

  it('renders first-publication backfill as progress and clears it when sync succeeds', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(async () => Response.json({ ...base, backfill: { state: 'pending', filePath: 'index.html', publicationRevision: 'r1', retryable: true, reopened: false } }))
      .mockImplementationOnce(async () => Response.json({ ...base, backfill: { state: 'succeeded', filePath: 'index.html', publicationRevision: 'r1', retryable: false, reopened: false } }));
    render(<I18nProvider initial="zh-CN"><CommentSyncBanner projectId="p" workspaceContext={personalContext} filePath="index.html" /></I18nProvider>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText('正在同步已有评论，访客暂时可能看不到。')).toBeInTheDocument();
    expect(document.querySelector('[class*="backfillProgress"]')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(screen.queryByRole('status')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('K4 shows stale deleted/resolved risk as the same single dark-line progress treatment as K1, while a verified reopened revision is still pending', async () => {
    renderBanner({ ...base, backfill: { state: 'pending', filePath: 'index.html', publicationRevision: 'resume-r2', retryable: false, reopened: true } });
    await screen.findByText(/已删除或已处理的评论/);
    expect(screen.queryByText('正在同步已有评论，访客暂时可能看不到。')).toBeNull();
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
    expect(document.querySelector('[class*="backfillProgress"]')).toBeInTheDocument();
  });

  it('shows no pending banner for an immediately succeeded empty-comment backfill', async () => {
    renderBanner({ ...base, backfill: { state: 'succeeded', filePath: 'index.html', publicationRevision: 'r1', retryable: false } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('polls an automatically retrying backfill until success without focus or manual retry', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(async () => Response.json({ ...base, backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'r1', retryable: true } }))
      .mockImplementationOnce(async () => Response.json({ ...base, backfill: { state: 'succeeded', filePath: 'index.html', publicationRevision: 'r1', retryable: false } }));
    render(<I18nProvider initial="zh-CN"><CommentSyncBanner projectId="p" workspaceContext={personalContext} filePath="index.html" /></I18nProvider>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByText('已有评论还没同步，访问者暂时看不到。正在自动重试。')).toBeInTheDocument();
    expect(screen.queryByText('分享已发布')).toBeNull();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(screen.queryByRole('status')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows an accurate terminal backfill outcome without offering a manual retry', async () => {
    renderBanner({ ...base, backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'r1', retryable: false } });
    await screen.findByText('部分已有评论未能同步到分享页，系统不会自动重试。分享链接仍可使用。');
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
  });

  it('K5 terminal failure retains the original link-risk warning without pretending automatic retry continues', async () => {
    renderBanner({ ...base, backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'resume-r2', retryable: false, reopened: true } });
    await screen.findByText(/已删除或已处理的评论/);
    expect(screen.getByText(/自动重试已停止/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
  });

  it('K5 renders the retry button in the red retry-error style for a retryable reopened backfill failure', async () => {
    renderBanner({ ...base, backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'resume-r2', retryable: true, reopened: true } });
    const retry = await screen.findByRole('button', { name: '重试' });
    expect(retry.className).toMatch(/retryError/);
    // Round-3 audit (K5): the design's retry glyph precedes the label.
    const glyph = retry.querySelector('svg[aria-hidden="true"] path');
    expect(glyph).toHaveAttribute('d', 'M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16m0 4v-4h-4');
    expect(retry.firstElementChild?.tagName.toLowerCase()).toBe('svg');
  });

  it('keeps the plain (non-red) retry style for a retryable non-reopened backfill failure', async () => {
    renderBanner({ ...base, backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'r1', retryable: true, reopened: false } });
    const retry = await screen.findByRole('button', { name: '重试' });
    expect(retry.className).not.toMatch(/retryError/);
  });

  it('keeps retry disabled while the POST is pending and reports a failed POST', async () => {
    let release!: (response: Response) => void;
    const post = new Promise<Response>(resolve => { release = resolve; });
    fetchMock.mockImplementationOnce(async () => Response.json({ ...base, backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'r1', retryable: true } }))
      .mockImplementationOnce(async (_input, init) => {
        expect(init?.method).toBe('POST');
        return post;
      })
      .mockImplementation(async () => Response.json({ ...base, backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'r1', retryable: true } }));
    render(<I18nProvider initial="zh-CN"><CommentSyncBanner projectId="p" workspaceContext={personalContext} filePath="index.html" /></I18nProvider>);
    const retry = await screen.findByRole('button', { name: '重试' });
    await act(async () => { retry.click(); });
    expect(retry).toBeDisabled();
    await act(async () => { release(new Response(null, { status: 503 })); });
    expect(await screen.findByRole('alert')).toHaveTextContent('已有评论暂未同步，访客暂时看不到');
    expect(screen.getByRole('button', { name: '重试' })).toBeEnabled();
  });
  it('offers retry for retryable failed backfill and reloads server state after POST', async () => {
    fetchMock.mockImplementationOnce(async () => Response.json({ ...base, backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'r1', retryable: true } }))
      .mockImplementationOnce(async (_input, init) => {
        expect(init?.method).toBe('POST');
        return Response.json({ ...base, backfill: { state: 'failed', filePath: 'index.html', publicationRevision: 'r1', retryable: true } });
      })
      .mockImplementationOnce(async () => Response.json({ ...base, backfill: { state: 'succeeded', filePath: 'index.html', publicationRevision: 'r1', retryable: false } }));
    render(<I18nProvider initial="zh-CN"><CommentSyncBanner projectId="p" workspaceContext={personalContext} filePath="index.html" /></I18nProvider>);
    const retry = await screen.findByRole('button', { name: '重试' });
    await act(async () => { retry.click(); });
    expect(fetchMock.mock.calls.map(([url, options]) => [url, options?.method])).toEqual([
      ['/api/projects/p/comment-sync-state?filePath=index.html', undefined],
      ['/api/projects/p/comment-sync-state?filePath=index.html', 'POST'],
      ['/api/projects/p/comment-sync-state?filePath=index.html', undefined],
    ]);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
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
