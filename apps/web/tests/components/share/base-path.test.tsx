// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';

let history: typeof import('../../../src/components/share/useProjectShareHistory');
let comments: typeof import('../../../src/components/share/useCommentSyncState');
let deletion: typeof import('../../../src/components/project-actions/activeFileSharesBeforeDelete');
let batch: typeof import('../../../src/components/project-actions/useBatchProjectShareCount');
let notices: typeof import('../../../src/components/project-actions/useDeletedShareNotices');
const context: WorkspaceCollabContext = {
  workspaceId: 'workspace', workspaceType: 'personal', workspaceMemberId: 'member', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null,
  providerMode: 'platform_credits', seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
const shareHistory = { projectId: 'p', bindingExists: true, hasEverShared: true,
  publications: [{ sourceFilePath: 'page.html', slug: 'stable', status: 'active' }] };
const headers = expect.objectContaining({ 'x-od-workspace-id': 'workspace', 'x-od-workspace-member-id': 'member' });

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_OD_WEB_BASE_PATH', '/open-design');
  vi.resetModules();
  history = await import('../../../src/components/share/useProjectShareHistory');
  comments = await import('../../../src/components/share/useCommentSyncState');
  deletion = await import('../../../src/components/project-actions/activeFileSharesBeforeDelete');
  batch = await import('../../../src/components/project-actions/useBatchProjectShareCount');
  notices = await import('../../../src/components/project-actions/useDeletedShareNotices');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => vi.unstubAllEnvs());

describe('sharing under a configured browser base path', () => {
  it('reads share history from the public mount with workspace authority', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(shareHistory));
    vi.stubGlobal('fetch', request);
    const { result } = renderHook(() => history.useProjectShareHistory('p', context, 'page.html'));
    await waitFor(() => expect(result.current).toEqual(shareHistory));
    expect(request).toHaveBeenCalledWith('/open-design/api/projects/p/share-state', expect.objectContaining({ headers }));
  });

  it('reads per-file comment sync state from the public mount', async () => {
    const state = { pending: 0, lastError: null, sessionMissing: false, shareStopped: false };
    const request = vi.fn().mockResolvedValue(Response.json(state));
    vi.stubGlobal('fetch', request);
    const { result } = renderHook(() => comments.useCommentSyncState('p', context, { filePath: 'docs/page.html' }));
    await waitFor(() => expect(result.current).toEqual(state));
    expect(request).toHaveBeenCalledWith('/open-design/api/projects/p/comment-sync-state?filePath=docs%2Fpage.html', expect.objectContaining({ headers }));
  });

  it('checks active file shares before deletion through the public mount', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(shareHistory));
    vi.stubGlobal('fetch', request);
    expect(await deletion.activeFileSharesBeforeDelete('p', ['page.html'], context)).toBe(1);
    expect(request).toHaveBeenCalledWith('/open-design/api/projects/p/share-state', expect.objectContaining({ headers }));
  });

  it('recovers and retries deleted share links through the public mount', async () => {
    const task = { projectId: 'p', filePath: 'page.html', slug: 'stable', retrying: false };
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ tasks: [task] }))
      .mockResolvedValueOnce(Response.json({ ...task, status: 'stopped' }));
    vi.stubGlobal('fetch', request);
    const { result } = renderHook(() => notices.useDeletedShareNotices(context, 'verified'));
    await waitFor(() => expect(result.current.notices).toHaveLength(1));
    const notice = result.current.notices[0]!;
    await act(async () => result.current.retry(notice, notice.rows[0]!));
    expect(result.current.notices).toHaveLength(0);
    expect(request).toHaveBeenNthCalledWith(1, '/open-design/api/public-file-stops', expect.objectContaining({ headers }));
    expect(request).toHaveBeenNthCalledWith(2, '/open-design/api/public-file-stops/retry', expect.objectContaining({ method: 'POST', headers }));
  });

  it('counts batch project shares through the public mount', async () => {
    const request = vi.fn().mockResolvedValue(Response.json(shareHistory));
    vi.stubGlobal('fetch', request);
    const { result } = renderHook(() => batch.useBatchProjectShareCount(['p'], context));
    await waitFor(() => expect(result.current.count).toBe(1));
    expect(request).toHaveBeenCalledWith('/open-design/api/projects/p/share-state', expect.objectContaining({ headers }));
  });
});
