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
  measurement.track.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ deployments: [] })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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

  it.each(['unchanged', 'edited', 'queued-notes', 'image'] as const)(
    'observes only the actual unchanged saved-comment composer submission: %s', async kind => {
      const send = vi.fn().mockResolvedValue({ status: 'rejected', commentIds: [] });
      const saved = { ...comment('A'), ...(kind === 'queued-notes' ? { selectionKind: 'pod' as const } : {}) };
      render(<FileViewer projectId="p" projectKind="prototype" file={file}
        liveHtml="<html><body>Hello</body></html>" previewComments={[saved]}
        onSendBoardCommentAttachments={send} />);
      fireEvent.click(screen.getByTestId('comment-panel-toggle'));
      fireEvent.click(screen.getByRole('button', { name: /Open comment for/ }));
      const input = await screen.findByTestId('comment-popover-input');
      if (kind === 'edited') fireEvent.change(input, { target: { value: 'changed private feedback' } });
      if (kind === 'queued-notes') fireEvent.click(screen.getByTestId('comment-popover-add-note'));
      const image = new File(['image'], 'fixture.png', { type: 'image/png' });
      if (kind === 'image') {
        vi.stubGlobal('URL', Object.assign(class extends URL {}, {
          createObjectURL: () => 'blob:comment-observation', revokeObjectURL: vi.fn(),
        }));
        const upload = screen.getByTestId('comment-popover').querySelector('input[type="file"]');
        if (!upload) throw new Error('missing real image attachment control');
        fireEvent.change(upload, { target: { files: [image] } });
      }
      measurement.track.mockClear();
      fireEvent.click(screen.getByTestId('comment-add-send'));
      await waitFor(() => expect(send).toHaveBeenCalledOnce());
      const submitted = send.mock.calls[0]?.[0];
      if (kind === 'unchanged') expect(submitted).toEqual([
        expect.objectContaining({ id: 'A', source: 'saved-comment', comment: 'private-A' }),
      ]);
      else {
        expect(submitted).toEqual([expect.objectContaining({ source: 'board-batch' })]);
        expect(submitted[0].id).not.toBe('A');
        if (kind === 'edited') expect(submitted[0].comment).toBe('changed private feedback');
        if (kind === 'image') expect(send.mock.calls[0]?.[1]).toEqual([image]);
      }
      const clicks = measurement.track.mock.calls.filter(([name, props]) => name === 'ui_click' && props.element === 'send_to_chat');
      expect(clicks).toHaveLength(1);
      if (kind === 'unchanged') expect(clicks[0]?.[1]).toMatchObject({ submitted_comment_ids: ['A'] });
      else expect(clicks[0]?.[1]).not.toHaveProperty('submitted_comment_ids');
      expect(screen.getByTestId('comment-popover-input')).toBeVisible();
    },
  );
});
