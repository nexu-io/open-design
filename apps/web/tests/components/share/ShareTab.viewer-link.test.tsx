// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShareTab } from '../../../src/components/share/ShareTab';

type Props = ComponentProps<typeof ShareTab>;
const props = (overrides: Partial<Props> = {}): Props => ({
  menuOrigin: 'toolbar', workspaceContext: null, t: (key) => key,
  shareAccess: 'private', shareAccessMenuOpen: false, shareAccessBusy: false, viewerOnly: false,
  setShareAccessMenuOpen: vi.fn(), setWorkspaceShareAccess: vi.fn(), canPublishPublic: true,
  filePublished: true, publishedLinkUnavailable: true, publishedFileUrl: 'https://console.invalid/old',
  copyPublishedFileLink: vi.fn(), publishLinkFeedback: null, publishingPublicFile: false,
  publishProgress: null, unpublishCurrentFilePublic: vi.fn(), viewerOnlyDisabledTitle: '',
  publishCurrentFilePublic: vi.fn(), publishFailureKey: null, streaming: false, sharePageUrl: '',
  canCopyShareLink: false, shareUnavailableHint: '', copyShareLink: vi.fn(), copyShareLinkLabel: '',
  canOpenSharePage: false, shareLinkStatusHint: '', ...overrides,
});
describe('canonical Viewer link consumption', () => {
  it('does not expose stale console URL copy controls for a durable publication with unavailable link', () => {
    // Stopping needs a signed-in workspace (a retained link alone is read-only).
    const input = props({ workspaceContext: { workspaceId: 'w', workspaceType: 'personal' } as Props['workspaceContext'] });
    render(<ShareTab {...input} />);
    expect(screen.getByRole('status')).toHaveTextContent('fileViewer.publicLinkUnavailable');
    expect(screen.queryByText(input.publishedFileUrl)).toBeNull();
    expect(screen.queryByRole('button', { name: 'fileViewer.copyShareLink' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'fileViewer.generateAndCopyLink' })).toBeNull();
    // The Link access switch stays ON: toggling it stops the live publication
    // instead of publishing (uploading) again.
    const toggle = screen.getByRole('switch', { name: 'fileViewer.linkAccessTitle' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(input.unpublishCurrentFilePublic).toHaveBeenCalledTimes(1);
    expect(input.publishCurrentFilePublic).not.toHaveBeenCalled();
  });
  it('keeps the healthy canonical Viewer link available for display and copy', () => {
    const input = props({ publishedLinkUnavailable: false, publishedFileUrl: 'https://viewer.example/artifact/p/s' });
    render(<ShareTab {...input} />);
    expect(screen.getByText(input.publishedFileUrl)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'fileViewer.copyShareLink' }));
    expect(input.copyPublishedFileLink).toHaveBeenCalledOnce();
  });
});
