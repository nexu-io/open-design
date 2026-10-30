// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileViewer } from '../../src/components/FileViewer';
import type { PreviewComment, ProjectFile } from '../../src/types';

const measurement = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: measurement.track, newRequestId: () => 'existing-request' }),
}));
const file: ProjectFile = { name: 'index.html', path: 'index.html', type: 'file', size: 100, mtime: 1, kind: 'html', mime: 'text/html' };
function comment(id: string): PreviewComment {
  return {
    id, projectId: 'p', conversationId: 'c', filePath: file.name,
    elementId: `pin-${id}`, selector: `[data-od-id="${id}"]`, label: id, text: '', htmlHint: '',
    position: { x: 0, y: 0, width: 10, height: 10 }, note: `private-${id}`,
    status: 'open', createdAt: 1, updatedAt: 1,
  };
}
beforeEach(() => {
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.matches('.viewer-body, .comment-preview-canvas')) return new DOMRect(0, 0, 900, 700);
    if (this.matches('.comment-saved-marker, .comment-active-pin')) {
      return new DOMRect(Number.parseFloat(this.style.left), Number.parseFloat(this.style.top), 28, 28);
    }
    return original.call(this);
  });
  measurement.track.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ deployments: [] })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('real saved-comment selection observer', () => {
  it.each(['disabled', 'enabled', 'throws', 'pending'] as const)(
    'preserves selected submissions and partial completion when measurement is %s', async mode => {
      const send = vi.fn()
        .mockResolvedValueOnce({ status: 'rejected', commentIds: ['A'] })
        .mockResolvedValueOnce({ status: 'queued', commentIds: ['B'] });
      render(<FileViewer projectId="p" projectKind="prototype" file={file}
        liveHtml="<html><body>Hello</body></html>" previewComments={[comment('A'), comment('B')]}
        onSendBoardCommentAttachments={send} />);
      fireEvent.click(screen.getByTestId('comment-panel-toggle'));
      for (const button of screen.getAllByRole('button', { name: 'Select' })) fireEvent.click(button);
      measurement.track.mockClear();
      measurement.track.mockImplementation(() => {
        if (mode === 'throws') throw new Error('measurement unavailable');
        if (mode === 'pending') return new Promise<void>(() => {});
      });
      fireEvent.click(screen.getByTestId('comment-side-send-claude'));
      await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
      expect(send.mock.calls[0]?.[0]).toEqual([
        expect.objectContaining({ id: 'A', source: 'saved-comment', comment: 'private-A' }),
        expect.objectContaining({ id: 'B', source: 'saved-comment', comment: 'private-B' }),
      ]);
      await waitFor(() => expect(screen.getByTestId('comment-side-send-claude')).not.toBeDisabled());
      const clicks = measurement.track.mock.calls.filter(([name, props]) => name === 'ui_click' && props.element === 'send_to_chat');
      expect(clicks).toHaveLength(1);
      expect(clicks[0]?.[1]).toMatchObject({ submitted_comment_ids: ['A', 'B'], project_id: 'p' });
      expect(JSON.stringify(clicks)).not.toContain('private-');
      expect(clicks[0]?.[2]).toBeUndefined();
      fireEvent.click(screen.getByTestId('comment-side-send-claude'));
      await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
      expect(send.mock.calls[1]?.[0]).toEqual([expect.objectContaining({ id: 'B' })]);
    },
  );

  it('sends the saved snapshot from a read-only detail without exposing editing controls', async () => {
    const send = vi.fn().mockResolvedValue({ status: 'rejected', commentIds: [] });
    render(<FileViewer projectId="p" projectKind="prototype" file={file}
      liveHtml="<html><body>Hello</body></html>" previewComments={[comment('A')]}
      onSendBoardCommentAttachments={send} />);
    fireEvent.click(screen.getByTestId('comment-panel-toggle'));
    fireEvent.click(screen.getByTestId('comment-side-item'));
    expect(await screen.findByTestId('comment-popover-detail')).toHaveTextContent('private-A');
    expect(screen.queryByTestId('comment-popover-input')).toBeNull();
    expect(screen.queryByTestId('comment-popover-save')).toBeNull();
    expect(screen.queryByTestId('comment-popover-add-note')).toBeNull();
    expect(screen.getByTestId('comment-popover').querySelector('input[type="file"]')).toBeNull();
    measurement.track.mockClear();
    fireEvent.click(screen.getByTestId('comment-add-send'));
    await waitFor(() => expect(send).toHaveBeenCalledOnce());
    expect(send.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ id: 'A', source: 'saved-comment', comment: 'private-A' }),
    ]);
    const clicks = measurement.track.mock.calls.filter(([name, props]) => name === 'ui_click' && props.element === 'send_to_chat');
    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.[1]).toMatchObject({ submitted_comment_ids: ['A'] });
    expect(JSON.stringify(clicks)).not.toContain('private-');
    expect(screen.getByTestId('comment-popover-detail')).toBeVisible();
  });
});
