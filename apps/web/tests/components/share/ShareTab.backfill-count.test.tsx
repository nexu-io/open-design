// @vitest-environment jsdom

/**
 * K1: the first-publication comment-backfill progress bar names the initial
 * batch size ("同步已有评论 · {count} 条") when CommentBackfillState reports a
 * real, measured `total`/`synced` — and falls back to the old indeterminate
 * sentence when an older daemon build omits those fields.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommentSyncState, WorkspaceCollabContext } from '@open-design/contracts';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary } from '@open-design/contracts';
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

function renderShareTab(state: CommentSyncState) {
  fetchMock.mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/comment-sync-state')) return Response.json(state);
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
      />
    </I18nProvider>,
  );
}

const base: CommentSyncState = { pending: 1, lastError: null, sessionMissing: false, shareStopped: false };

beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); resetWorkspaceAccountGeneration(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetWorkspaceAccountGeneration(); });

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
    expect(screen.getByText('关闭面板不会中断上传。')).toBeInTheDocument();
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

  it('K4 reopened busy button is unaffected by the count field', async () => {
    renderShareTab({
      ...base,
      backfill: { state: 'pending', filePath: 'index.html', publicationRevision: 'r2', retryable: true, reopened: true, total: 3, synced: 1 },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await screen.findByText('正在同步评论…');
    expect(screen.queryByText(/同步已有评论 ·/)).toBeNull();
  });
});
