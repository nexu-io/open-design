// @vitest-environment jsdom

/**
 * K1: the first-publication comment-backfill progress bar names the initial
 * batch size ("同步已有评论 · {count} 条") when CommentBackfillState reports a
 * real, measured `total`/`synced` — and falls back to the old indeterminate
 * sentence when an older daemon build omits those fields.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommentSyncState, WorkspaceCollabContext } from '@open-design/contracts';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary } from '@open-design/contracts';
import type { ComponentProps } from 'react';
import { ShareTab } from '../../../src/components/share/ShareTab';
import { I18nProvider } from '../../../src/i18n';
import { zhCN } from '../../../src/i18n/locales/zh-CN';
import type { Dict } from '../../../src/i18n/types';
import { resetWorkspaceAccountGeneration } from '../../../src/collab/workspace-identity';

vi.mock('../../../src/components/AmrLoginPill', () => ({
  AmrLoginPill: () => <div data-testid="login-pill" />,
}));

const workspaceContext: WorkspaceCollabContext = {
  workspaceId: 'ws', workspaceType: 'personal', workspaceMemberId: 'member', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};

const fetchMock = vi.fn<typeof fetch>();

/** Real `t()` interpolates `{name}` placeholders; the plain `key => zhCN[key]`
 * shorthand used by other ShareTab tests does not, which would leave this
 * count key rendering its literal `{count}` template. */
function tZh(key: keyof Dict, vars?: Record<string, string | number>): string {
  const raw = zhCN[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_match: string, name: string) => {
    const value = vars[name];
    return value == null ? `{${name}}` : String(value);
  });
}

function renderShareTab(state: CommentSyncState | null | (() => CommentSyncState | null), overrides: Partial<ComponentProps<typeof ShareTab>> = {}) {
  fetchMock.mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/comment-sync-state')) return Response.json(typeof state === 'function' ? state() : state);
    return Response.json({ state: 'unknown', reason: 'unavailable' });
  });
  return render(
    <I18nProvider initial="zh-CN">
      <ShareTab
        menuOrigin="artifact-card"
        workspaceContext={workspaceContext}
        t={tZh}
        shareAccess="private"
        shareAccessMenuOpen={false}
        shareAccessBusy={false}
        viewerOnly={false}
        setShareAccessMenuOpen={vi.fn()}
        setWorkspaceShareAccess={vi.fn()}
        canPublishPublic
        filePublished
        publishedFileUrl="https://example.test/artifact/p/s"
        copyPublishedFileLink={vi.fn().mockResolvedValue(undefined)}
        publishLinkFeedback={null}
        publishingPublicFile={false}
        publishProgress={null}
        unpublishCurrentFilePublic={vi.fn().mockResolvedValue(undefined)}
        viewerOnlyDisabledTitle="read only"
        publishCurrentFilePublic={vi.fn().mockResolvedValue(undefined)}
        publishFailureKey={null}
        streaming={false}
        sharePageUrl=""
        canCopyShareLink={false}
        shareUnavailableHint=""
        copyShareLink={vi.fn().mockResolvedValue(true)}
        copyShareLinkLabel=""
        canOpenSharePage={false}
        shareLinkStatusHint=""
        projectId="p"
        filePath="index.html"
        {...overrides}
      />
    </I18nProvider>,
  );
}

const base: CommentSyncState = { pending: 1, lastError: null, sessionMissing: false, shareStopped: false };

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); resetWorkspaceAccountGeneration(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); resetWorkspaceAccountGeneration(); });

describe('K1 comment-sync progress count', () => {
  it('renders the design copy with the real batch count and a determinate fill', async () => {
    renderShareTab({
      ...base,
      backfill: { state: 'pending', filePath: 'index.html', publicationRevision: 'r1', retryable: true, reopened: false, total: 12, synced: 6 },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await screen.findByText('同步已有评论 · 12 条');
    expect(screen.queryByText('正在同步已有评论，访客暂时可能看不到。')).toBeNull();
    const fill = document.querySelector('[class*="syncProgressFill"]') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.className).toContain('syncProgressFillDeterminate');
    expect(fill.style.width).toBe('50%');
    expect(screen.queryByText('关闭面板不会中断上传。')).toBeNull();
    expect(screen.getByText('https://example.test/artifact/p/s')).toBeVisible();
  });

  it('falls back to the indeterminate sweep and generic copy when the daemon omits the count', async () => {
    renderShareTab({
      ...base,
      backfill: { state: 'pending', filePath: 'index.html', publicationRevision: 'r1', retryable: true, reopened: false },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await screen.findByText('正在同步已有评论，访客暂时可能看不到。');
    expect(screen.queryByText(/同步已有评论 ·/)).toBeNull();
    const fill = document.querySelector('[class*="syncProgressFill"]') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.className).not.toContain('syncProgressFillDeterminate');
    expect(fill.style.width).toBe('');
  });

  it('K4 reopened comment status remains separate from the published link', async () => {
    renderShareTab({
      ...base,
      backfill: { state: 'pending', filePath: 'index.html', publicationRevision: 'r2', retryable: true, reopened: true, total: 3, synced: 1 },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await screen.findByText('正在同步评论…');
    expect(screen.queryByText(/同步已有评论 ·/)).toBeNull();
    expect(screen.getByText('https://example.test/artifact/p/s')).toBeVisible();
    expect(screen.queryByRole('button', { name: '正在同步评论…' })).toBeNull();
  });
});


describe.each(['artifact-card', 'toolbar'] as const)('independent publication actions in %s', menuOrigin => {
  it.each(['pending', 'reopened', 'failed', 'terminal', 'succeeded', 'unattempted', 'unknown'] as const)(
    'keeps the committed link and update action available while comment state is %s', async phase => {
      const backfill: CommentSyncState['backfill'] = phase === 'unattempted' ? undefined : {
        state: phase === 'failed' || phase === 'terminal' ? 'failed' : phase === 'succeeded' ? 'succeeded' : 'pending',
        filePath: 'index.html', publicationRevision: 'r1', reopened: phase === 'reopened',
        retryable: phase !== 'terminal', total: 12, synced: phase === 'succeeded' ? 12 : 6,
        ...(phase === 'failed' ? { code: 'BACKFILL_ENQUEUE_FAILED' } : {}),
      };
      const state: CommentSyncState | null = phase === 'unknown' ? null : {
        ...base, pending: phase === 'pending' || phase === 'reopened' ? 6 : 0,
        ...(backfill ? { backfill } : {}),
      };
      const copy = vi.fn().mockResolvedValue(undefined);
      const update = vi.fn().mockResolvedValue(undefined);
      const publish = vi.fn().mockResolvedValue(undefined);
      const stop = vi.fn().mockResolvedValue(undefined);
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      renderShareTab(state, { menuOrigin, publicationStatus: 'active', publicationFreshness: 'outdated',
        copyPublishedFileLink: copy, updateCurrentFilePublic: update, publishCurrentFilePublic: publish,
        unpublishCurrentFilePublic: stop, sharePageUrl: 'https://example.test/artifact/p/s', canOpenSharePage: true });
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      if (phase === 'pending') await screen.findByText('同步已有评论 · 12 条');
      if (phase === 'reopened') await screen.findByText('正在同步评论…');
      if (phase === 'failed') {
        await screen.findByText('已有评论暂未同步，访客暂时看不到');
        expect(screen.queryByText(/正在自动重试/)).toBeNull();
      }
      if (phase === 'terminal') await screen.findByText(tZh('fileViewer.commentSync.backfillTerminalBody'));
      const copyButton = screen.getByRole('button', { name: tZh('fileViewer.copyShareLink') });
      const updateButton = screen.getByRole('button', { name: tZh('fileViewer.shareUpdateLink') });
      expect(screen.getByText('https://example.test/artifact/p/s')).toBeVisible();
      expect(copyButton).toBeEnabled();
      expect(updateButton).toBeEnabled();
      fireEvent.click(copyButton);
      await waitFor(() => expect(copy).toHaveBeenCalledOnce());
      fireEvent.click(updateButton);
      expect(update).toHaveBeenCalledOnce();
      if (menuOrigin === 'toolbar') {
        fireEvent.click(screen.getByRole('menuitem', { name: tZh('fileViewer.openSharePage') }));
        expect(open).toHaveBeenCalledWith('https://example.test/artifact/p/s', '_blank', 'noopener,noreferrer');
      }
      if (phase === 'failed') {
        fireEvent.click(screen.getByRole('button', { name: tZh('preview.retry') }));
        await waitFor(() => expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1));
        const retry = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')!;
        expect(retry[0]).toBe('/api/projects/p/comment-sync-state?filePath=index.html');
        expect(retry[1]?.headers).toMatchObject({ 'x-od-workspace-id': 'ws', 'x-od-workspace-member-id': 'member' });
        expect(update).toHaveBeenCalledOnce();
      } else {
        expect(screen.queryByRole('button', { name: tZh('preview.retry') })).toBeNull();
      }
      expect(publish).not.toHaveBeenCalled();
      expect(stop).not.toHaveBeenCalled();
    },
  );

  it('disables an update only for its own publication request while comment sync remains independent', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    renderShareTab({ ...base, backfill: { state: 'pending', filePath: 'index.html', publicationRevision: 'r1', retryable: false, total: 2, synced: 1 } }, {
      menuOrigin, publicationStatus: 'active', publicationFreshness: 'outdated',
      updateCurrentFilePublic: update, publishingPublicFile: true, publicOperation: 'update',
    });
    await screen.findByText('同步已有评论 · 2 条');
    const updateButton = screen.getByRole('button', { name: tZh('fileViewer.shareUpdatingLink') });
    expect(updateButton).toBeDisabled();
    fireEvent.click(updateButton);
    expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: tZh('fileViewer.copyShareLink') })).toBeEnabled();
  });
});


it('a failed comment retry stays within the comment endpoint and preserves the published link until recovery', async () => {
  const failed: CommentSyncState = { ...base, pending: 0, lastError: 'COMMENT_SYNC_DELIVERY_FAILED', backfill: {
    state: 'failed', filePath: 'index.html', publicationRevision: 'r1', retryable: true,
    reopened: false, code: 'BACKFILL_ENQUEUE_FAILED',
  } };
  let current = failed;
  const copy = vi.fn().mockResolvedValue(undefined);
  const publish = vi.fn().mockResolvedValue(undefined);
  const stop = vi.fn().mockResolvedValue(undefined);
  renderShareTab(() => current, { copyPublishedFileLink: copy, publishCurrentFilePublic: publish, unpublishCurrentFilePublic: stop });
  await screen.findByText('已有评论暂未同步，访客暂时看不到');
  let retryFails = true;
  fetchMock.mockImplementation(async (_input, options) => {
    if (options?.method === 'POST') {
      if (retryFails) return new Response(null, { status: 503 });
      current = { ...base, pending: 0, backfill: { ...failed.backfill!, state: 'succeeded', retryable: false } };
    }
    return Response.json(current);
  });
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  // A failed POST leaves both the failure and retry affordance recoverable.
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('已有评论暂未同步，访客暂时看不到'));
  expect(screen.getByRole('button', { name: '复制链接' })).toBeEnabled();
  retryFails = false;
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: '重试' })).toBeNull());
  expect(screen.getByText('https://example.test/artifact/p/s')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '复制链接' }));
  await waitFor(() => expect(copy).toHaveBeenCalledOnce());
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST').map(([url]) => url))
    .toEqual(['/api/projects/p/comment-sync-state?filePath=index.html', '/api/projects/p/comment-sync-state?filePath=index.html']);
  expect(publish).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
});
