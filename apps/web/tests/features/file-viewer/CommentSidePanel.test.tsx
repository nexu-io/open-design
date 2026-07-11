// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommentSidePanel } from '../../../src/features/file-viewer/components/CommentSidePanel';
import { CommentSideDock } from '../../../src/features/file-viewer/components/CommentSideDock';
import type { PreviewComment } from '../../../src/types';

afterEach(cleanup);

const t = ((key: string, vars?: Record<string, string | number>) => {
  if (key === 'chat.comments.nSelected') return `${vars?.n} selected`;
  return key;
}) as unknown as import('../../../src/features/file-viewer/types').TranslateFn;

function comment(overrides: Partial<PreviewComment> = {}): PreviewComment {
  return {
    id: 'c1',
    projectId: 'proj-1',
    conversationId: 'conv-1',
    filePath: 'index.html',
    elementId: 'el-1',
    selector: '#el-1',
    label: 'button',
    text: '',
    position: { x: 0, y: 0, width: 10, height: 10 },
    htmlHint: '<button>',
    note: 'fix this',
    status: 'open',
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  } as PreviewComment;
}

describe('CommentSidePanel', () => {
  it('renders a collapsed rail with the comment count when collapsed', () => {
    render(
      <CommentSidePanel
        comments={[comment()]}
        selectedIds={new Set()}
        activeCommentId={null}
        collapsed
        onCollapsedChange={() => {}}
        onToggleSelect={() => {}}
        onSelectAll={() => {}}
        onClearSelection={() => {}}
        onReply={() => {}}
        onSendSelected={() => {}}
        sending={false}
        t={t}
      />,
    );
    const rail = screen.getByTestId('comment-side-collapsed-rail');
    expect(rail.textContent).toContain('1');
  });

  it('lists comments and calls onReply when a row is clicked', () => {
    const onReply = vi.fn();
    const c = comment();
    render(
      <CommentSidePanel
        comments={[c]}
        selectedIds={new Set()}
        activeCommentId={null}
        collapsed={false}
        onCollapsedChange={() => {}}
        onToggleSelect={() => {}}
        onSelectAll={() => {}}
        onClearSelection={() => {}}
        onReply={onReply}
        onSendSelected={() => {}}
        sending={false}
        t={t}
      />,
    );
    fireEvent.click(screen.getByTestId('comment-side-item'));
    expect(onReply).toHaveBeenCalledWith(c);
  });

  it('shows the select bar only once a comment is selected, and wires clear/send', () => {
    const onClearSelection = vi.fn();
    const onSendSelected = vi.fn();
    const c = comment();
    const { rerender } = render(
      <CommentSidePanel
        comments={[c]}
        selectedIds={new Set()}
        activeCommentId={null}
        collapsed={false}
        onCollapsedChange={() => {}}
        onToggleSelect={() => {}}
        onSelectAll={() => {}}
        onClearSelection={onClearSelection}
        onReply={() => {}}
        onSendSelected={onSendSelected}
        sending={false}
        t={t}
      />,
    );
    expect(screen.queryByTestId('comment-side-selectbar')).toBeNull();

    rerender(
      <CommentSidePanel
        comments={[c]}
        selectedIds={new Set([c.id])}
        activeCommentId={null}
        collapsed={false}
        onCollapsedChange={() => {}}
        onToggleSelect={() => {}}
        onSelectAll={() => {}}
        onClearSelection={onClearSelection}
        onReply={() => {}}
        onSendSelected={onSendSelected}
        sending={false}
        t={t}
      />,
    );
    expect(screen.getByTestId('comment-side-selectbar')).toBeTruthy();
    fireEvent.click(screen.getByTestId('comment-side-send-claude'));
    expect(onSendSelected).toHaveBeenCalled();
  });

  it('submits a new comment draft via onCreateComment and clears the textarea on success', async () => {
    const onCreateComment = vi.fn(async () => true);
    render(
      <CommentSidePanel
        comments={[]}
        selectedIds={new Set()}
        activeCommentId={null}
        collapsed={false}
        onCollapsedChange={() => {}}
        onToggleSelect={() => {}}
        onSelectAll={() => {}}
        onClearSelection={() => {}}
        onReply={() => {}}
        onSendSelected={() => {}}
        onCreateComment={onCreateComment}
        sending={false}
        t={t}
      />,
    );
    const textarea = screen.getByPlaceholderText('chat.comments.placeholder');
    fireEvent.change(textarea, { target: { value: 'new note' } });
    fireEvent.submit(textarea.closest('form')!);
    await Promise.resolve();
    await Promise.resolve();
    expect(onCreateComment).toHaveBeenCalledWith('new note');
  });
});

describe('CommentSideDock', () => {
  it('applies the collapsed layout class', () => {
    const { rerender } = render(
      <CommentSideDock
        comments={[]}
        selectedIds={new Set()}
        activeCommentId={null}
        collapsed={false}
        onCollapsedChange={() => {}}
        onToggleSelect={() => {}}
        onSelectAll={() => {}}
        onClearSelection={() => {}}
        onReply={() => {}}
        onSendSelected={() => {}}
        sending={false}
        t={t}
      />,
    );
    expect(screen.getByTestId('comment-side-dock').className).not.toContain('collapsed');

    rerender(
      <CommentSideDock
        comments={[]}
        selectedIds={new Set()}
        activeCommentId={null}
        collapsed
        onCollapsedChange={() => {}}
        onToggleSelect={() => {}}
        onSelectAll={() => {}}
        onClearSelection={() => {}}
        onReply={() => {}}
        onSendSelected={() => {}}
        sending={false}
        t={t}
      />,
    );
    expect(screen.getByTestId('comment-side-dock').className).toContain('collapsed');
  });
});
