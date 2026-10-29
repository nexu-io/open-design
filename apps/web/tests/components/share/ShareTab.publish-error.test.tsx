// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { buildWorkspacePermissions, buildWorkspaceSeatSummary, type WorkspaceCollabContext } from '@open-design/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zhCN } from '../../../src/i18n/locales/zh-CN';
import { ShareTab } from '../../../src/components/share/ShareTab';

const plan = { fileCount: 1, totalBytes: 12, exceedsSizeLimit: false, exclusions: [] };
const request = vi.fn<typeof fetch>();
beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async () => Response.json(plan));
  vi.stubGlobal('fetch', request);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Props = ComponentProps<typeof ShareTab>;
const authenticatedWorkspace: WorkspaceCollabContext = {
  workspaceId: 'ws', workspaceType: 'personal', workspaceMemberId: 'member', role: 'owner',
  memberStatus: 'active', lifecycleState: 'active', billingState: 'active', planId: null, providerMode: 'platform_credits',
  seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
  permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
};
function props(overrides: Partial<Props> = {}): Props {
  return {
    projectId: 'p1', filePath: 'index.html',
    menuOrigin: 'artifact-card', workspaceContext: null, t: (key) => key,
    shareAccess: 'private', shareAccessMenuOpen: false, shareAccessBusy: false,
    viewerOnly: false, setShareAccessMenuOpen: vi.fn(), setWorkspaceShareAccess: vi.fn(),
    canPublishPublic: true, filePublished: true, publishedFileUrl: 'https://example.test/artifact/p/s',
    copyPublishedFileLink: vi.fn().mockResolvedValue(undefined), publishLinkFeedback: null,
    publishingPublicFile: false, publishProgress: null,
    unpublishCurrentFilePublic: vi.fn().mockResolvedValue(undefined), viewerOnlyDisabledTitle: 'read only',
    publishCurrentFilePublic: vi.fn().mockResolvedValue(undefined), publishFailureKey: null,
    streaming: false,
    sharePageUrl: '', canCopyShareLink: false, shareUnavailableHint: '',
    copyShareLink: vi.fn().mockResolvedValue(true), copyShareLinkLabel: '',
    canOpenSharePage: false, shareLinkStatusHint: '', ...overrides,
  };
}


describe('S7 publish failure visual seam', () => {
  it('submits directly without a preflight request even when the network is unavailable', async () => {
    request.mockRejectedValue(new Error('offline'));
    const input = props({ filePublished: false, t: key => zhCN[key] });
    render(<ShareTab {...input} />);
    const generate = screen.getByRole('menuitem', { name: zhCN['fileViewer.generateAndCopyLink'] });
    expect(generate).toBeEnabled();
    fireEvent.click(generate);
    await waitFor(() => expect(input.publishCurrentFilePublic).toHaveBeenCalledOnce());
    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['artifact-card', 'toolbar'] as const)('offers valid recovery from %s without adding deployment controls', async (menuOrigin) => {
    const input = props({ menuOrigin, filePublished: false, publishFailureKey: 'fileViewer.publishFileFailed', t: (key) => zhCN[key] });
    const { rerender } = render(<ShareTab {...input} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('生成分享链接失败，请稍后重试。');
    const retry = screen.getByRole('menuitem', { name: zhCN['preview.retry'] });
    expect(status.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(retry);
    await waitFor(() => expect(input.publishCurrentFilePublic).toHaveBeenCalledTimes(1));
    expect(request).not.toHaveBeenCalled();
    rerender(<ShareTab {...input} publishingPublicFile publishFailureKey={null} publishProgress={0.4} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('progressbar')).toBeVisible();
    rerender(<ShareTab {...input} filePublished publishFailureKey={null} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: zhCN['preview.retry'] })).toBeNull();
    expect(screen.getByRole('button', { name: zhCN['fileViewer.copyShareLink'] })).toBeEnabled();
  });
  it.each([
    'fileViewer.publishFileFailed', 'fileViewer.publishFileTooLarge',
    'fileViewer.publishFileConnectionFailed', 'fileViewer.publishFileSignInRequired',
    'fileViewer.publishFileAccessDenied', 'fileViewer.publishFileServiceRejected',
    'fileViewer.publishFileLocalSessionFailed', 'fileViewer.publishFileUnconfirmed',
  ] as const)('shows %s and preserves retry without copying', async (publishFailureKey) => {
    const input = props({ filePublished: false, publishFailureKey, t: (key) => zhCN[key] });
    render(<ShareTab {...input} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe(zhCN[publishFailureKey]);
    const retry = screen.getByRole('menuitem', { name: zhCN['preview.retry'] });
    expect(status.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await waitFor(() => expect(input.publishCurrentFilePublic).toHaveBeenCalledTimes(1));
    expect(input.copyPublishedFileLink).not.toHaveBeenCalled();
  });

  it('keeps generic and size messages distinct, without attributing unknown failures to the network', () => {
    expect(zhCN['fileViewer.publishFileFailed']).toBe('生成分享链接失败，请稍后重试。');
    expect(zhCN['fileViewer.publishFileFailed']).not.toMatch(/网络|上传/);
    expect(zhCN['fileViewer.publishFileFailed']).not.toBe(zhCN['fileViewer.publishFileTooLarge']);
    expect(zhCN['fileViewer.publishFileTooLarge']).toBe('内容超过服务端分享容量上限，请减少文件大小后重试。');
  });

  it.each([{ publishFailureKey: null }, { canPublishPublic: false, filePublished: false }])('omits the error when absent or gated: %j', (overrides) => {
    render(<ShareTab {...props({ publishFailureKey: 'fileViewer.publishFileFailed', ...overrides })} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each(['streaming', 'viewerOnly', 'publishingPublicFile'] as const)('retains %s disablement during a failure', (restriction) => {
    const input = props({ filePublished: false, publishFailureKey: 'fileViewer.publishFileFailed', [restriction]: true });
    render(<ShareTab {...input} />);
    const button = screen.getByRole('menuitem');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(input.publishCurrentFilePublic).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('fileViewer.publishFileFailed');
  });

  it('retries the failed public operation independently of its error message and workspace busy state', () => {
    const retryPublicShare = vi.fn().mockResolvedValue(undefined);
    const updateCurrentFilePublic = vi.fn().mockResolvedValue(undefined);
    const input = props({ workspaceContext: authenticatedWorkspace, publishFailureKey: 'fileViewer.publishFileConnectionFailed',
      retryPublicShare, updateCurrentFilePublic, shareAccessBusy: true, t: key => zhCN[key] });
    render(<ShareTab {...input} />);
    const retry = screen.getByRole('button', { name: zhCN['preview.retry'] });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(retryPublicShare).toHaveBeenCalledOnce();
    expect(updateCurrentFilePublic).not.toHaveBeenCalled();
    expect(input.unpublishCurrentFilePublic).not.toHaveBeenCalled();
  });

  it('keeps workspace retry usable while publishing and does not call the public handler', () => {
    const retryWorkspaceShareAccess = vi.fn();
    const input = props({ workspaceContext: {...authenticatedWorkspace, workspaceType:'team', teamId:'ws'},
      publishingPublicFile:true, shareAccessFailureKey:'fileViewer.workspaceShareFailed', retryWorkspaceShareAccess, t:key=>zhCN[key] });
    render(<ShareTab {...input} />);
    const retry = screen.getByRole('button', {name:zhCN['preview.retry']});
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(retryWorkspaceShareAccess).toHaveBeenCalledOnce();
    expect(input.publishCurrentFilePublic).not.toHaveBeenCalled();
    expect(screen.getByRole('button', {name:zhCN['fileViewer.copyShareLink']})).toBeEnabled();
  });

});
