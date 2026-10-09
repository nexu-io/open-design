// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { zhCN } from '../../../src/i18n/locales/zh-CN';
import { ShareTab } from '../../../src/components/share/ShareTab';

afterEach(cleanup);

type Props = ComponentProps<typeof ShareTab>;
function props(overrides: Partial<Props> = {}): Props {
  return {
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
  it.each(['artifact-card', 'toolbar'] as const)('offers valid recovery from %s without adding deployment controls', (menuOrigin) => {
    const input = props({ menuOrigin, filePublished: false, publishFailureKey: 'fileViewer.publishFileFailed', t: (key) => zhCN[key] });
    const { rerender } = render(<ShareTab {...input} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('上传失败，请检查网络后重试。');
    const retry = screen.getByRole('menuitem', { name: zhCN['preview.retry'] });
    expect(status.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(retry);
    expect(input.publishCurrentFilePublic).toHaveBeenCalledTimes(1);
    rerender(<ShareTab {...input} publishingPublicFile publishFailureKey={null} publishProgress={0.4} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('progressbar')).toBeVisible();
    rerender(<ShareTab {...input} filePublished publishFailureKey={null} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: zhCN['preview.retry'] })).toBeNull();
    expect(screen.getByRole('button', { name: zhCN['fileViewer.copyShareLink'] })).toBeEnabled();
  });
  it.each(['fileViewer.publishFileFailed', 'fileViewer.publishFileTooLarge'] as const)('shows %s and preserves retry without copying', (publishFailureKey) => {
    const input = props({ filePublished: false, publishFailureKey, t: (key) => zhCN[key] });
    render(<ShareTab {...input} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toBe(zhCN[publishFailureKey]);
    const retry = screen.getByRole('menuitem', { name: zhCN['preview.retry'] });
    expect(status.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(input.publishCurrentFilePublic).toHaveBeenCalledTimes(1);
    expect(input.copyPublishedFileLink).not.toHaveBeenCalled();
  });

  it('keeps generic and size messages distinct, without attributing unknown failures to the network', () => {
    expect(zhCN['fileViewer.publishFileFailed']).toBe('上传失败，请检查网络后重试。');
    expect(zhCN['fileViewer.publishFileTooLarge']).toBe('项目超过 20 MiB 分享上限。请减小 HTML 和引用资源的总大小后重试。');
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

});
