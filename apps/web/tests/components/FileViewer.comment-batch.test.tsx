// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FileViewer } from '../../src/components/FileViewer';
import type { PreviewComment, ProjectFile } from '../../src/types';

const file: ProjectFile = { name: 'index.html', path: 'index.html', type: 'file', size: 100, mtime: 1, kind: 'html', mime: 'text/html' };
function comment(id: string, status: PreviewComment['status'] = 'open'): PreviewComment {
  return { id, projectId: 'p', conversationId: 'c', filePath: file.name, elementId: id,
    selector: `[data-od-id="${id}"]`, label: id, text: '', htmlHint: '',
    position: { x: 0, y: 0, width: 10, height: 10 }, note: id,
    status, createdAt: 1, updatedAt: 1 };
}
beforeEach(() => { vi.stubGlobal('fetch', vi.fn(async () => Response.json({ deployments: [] }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('toggles select-all and preserves the selection through rail collapse', () => {
  render(<FileViewer projectId="p" projectKind="prototype" file={file} liveHtml="<html><body>Hello</body></html>"
    previewComments={[comment('A'), comment('B')]} onSendBoardCommentAttachments={vi.fn()} />);
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
  expect(screen.getAllByRole('button', { name: /^Deselect$/ })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Hide Comments' }));
  fireEvent.click(within(screen.getByTestId('comment-side-collapsed-rail')).getAllByRole('button')[0]!);
  expect(screen.getAllByRole('button', { name: /^Deselect$/ })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Deselect all' }));
  expect(screen.getAllByRole('button', { name: /^Select$/ })).toHaveLength(2);
});

it('excludes queued comments from both visible selection and submitted snapshots', async () => {
  const send = vi.fn().mockResolvedValue({ status: 'queued', commentIds: ['A'] });
  render(<FileViewer projectId="p" projectKind="prototype" file={file} liveHtml="<html><body>Hello</body></html>"
    previewComments={[comment('A'), comment('queued', 'applying')]} onSendBoardCommentAttachments={send} />);
  fireEvent.click(screen.getByTestId('comment-panel-toggle'));
  expect(screen.getAllByTestId('comment-side-item')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
  await act(async () => { fireEvent.click(screen.getByTestId('comment-side-send-claude')); });
  expect(send).toHaveBeenCalledWith([expect.objectContaining({ id: 'A', comment: 'A' })]);
});
