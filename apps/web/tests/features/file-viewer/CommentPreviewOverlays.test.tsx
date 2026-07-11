// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommentPreviewOverlays } from '../../../src/features/file-viewer/components/CommentPreviewOverlays';
import type { PreviewCommentSnapshot } from '../../../src/comments';
import type { PreviewComment } from '../../../src/types';

afterEach(cleanup);

function makeSnapshot(overrides: Partial<PreviewCommentSnapshot> = {}): PreviewCommentSnapshot {
  return {
    filePath: 'index.html',
    elementId: 'el-1',
    selector: '[data-od-id="el-1"]',
    label: 'Button',
    text: '',
    position: { x: 0, y: 0, width: 100, height: 20 },
    htmlHint: '',
    selectionKind: 'element',
    ...overrides,
  } as PreviewCommentSnapshot;
}

function makeComment(overrides: Partial<PreviewComment> = {}): PreviewComment {
  return {
    id: 'c1',
    filePath: 'index.html',
    elementId: 'el-1',
    note: 'hello',
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  } as PreviewComment;
}

describe('CommentPreviewOverlays', () => {
  it('renders a saved marker per comment with a live target', () => {
    const comment = makeComment();
    const liveTargets = new Map([['el-1', makeSnapshot()]]);
    render(
      <CommentPreviewOverlays
        comments={[comment]}
        liveTargets={liveTargets}
        hoveredTarget={null}
        hoveredPodMemberId={null}
        activeTarget={null}
        boardTool="inspect"
        scale={1}
        offsetX={0}
        offsetY={0}
        strokePoints={[]}
        onOpenComment={() => {}}
      />,
    );
    expect(screen.getByTestId('comment-saved-marker-el-1')).toBeTruthy();
  });

  it('omits a comment whose live target has vanished', () => {
    render(
      <CommentPreviewOverlays
        comments={[makeComment()]}
        liveTargets={new Map()}
        hoveredTarget={null}
        hoveredPodMemberId={null}
        activeTarget={null}
        boardTool="inspect"
        scale={1}
        offsetX={0}
        offsetY={0}
        strokePoints={[]}
        onOpenComment={() => {}}
      />,
    );
    expect(screen.queryByTestId('comment-saved-marker-el-1')).toBeNull();
  });

  it('calls onOpenComment when a saved pin is clicked', () => {
    const onOpenComment = vi.fn();
    const comment = makeComment();
    const snapshot = makeSnapshot();
    const liveTargets = new Map([['el-1', snapshot]]);
    render(
      <CommentPreviewOverlays
        comments={[comment]}
        liveTargets={liveTargets}
        hoveredTarget={null}
        hoveredPodMemberId={null}
        activeTarget={null}
        boardTool="inspect"
        scale={1}
        offsetX={0}
        offsetY={0}
        strokePoints={[]}
        onOpenComment={onOpenComment}
      />,
    );
    fireEvent.click(screen.getByTestId('comment-saved-marker-el-1'));
    expect(onOpenComment).toHaveBeenCalledWith(comment, snapshot);
  });

  it('shows the active pin only when showActivePin and an active target are both set', () => {
    const { rerender } = render(
      <CommentPreviewOverlays
        comments={[]}
        liveTargets={new Map()}
        hoveredTarget={null}
        hoveredPodMemberId={null}
        activeTarget={makeSnapshot()}
        showActivePin={false}
        boardTool="inspect"
        scale={1}
        offsetX={0}
        offsetY={0}
        strokePoints={[]}
        onOpenComment={() => {}}
      />,
    );
    expect(screen.queryByTestId('comment-active-pin')).toBeNull();

    rerender(
      <CommentPreviewOverlays
        comments={[]}
        liveTargets={new Map()}
        hoveredTarget={null}
        hoveredPodMemberId={null}
        activeTarget={makeSnapshot()}
        showActivePin
        boardTool="inspect"
        scale={1}
        offsetX={0}
        offsetY={0}
        strokePoints={[]}
        onOpenComment={() => {}}
      />,
    );
    expect(screen.getByTestId('comment-active-pin')).toBeTruthy();
  });

  it('draws the pod-lasso stroke only in pod mode with 2+ points', () => {
    const { container, rerender } = render(
      <CommentPreviewOverlays
        comments={[]}
        liveTargets={new Map()}
        hoveredTarget={null}
        hoveredPodMemberId={null}
        activeTarget={null}
        boardTool="pod"
        scale={1}
        offsetX={0}
        offsetY={0}
        strokePoints={[{ x: 0, y: 0 }]}
        onOpenComment={() => {}}
      />,
    );
    expect(container.querySelector('.board-pod-stroke')).toBeNull();

    rerender(
      <CommentPreviewOverlays
        comments={[]}
        liveTargets={new Map()}
        hoveredTarget={null}
        hoveredPodMemberId={null}
        activeTarget={null}
        boardTool="pod"
        scale={1}
        offsetX={0}
        offsetY={0}
        strokePoints={[{ x: 0, y: 0 }, { x: 10, y: 10 }]}
        onOpenComment={() => {}}
      />,
    );
    expect(container.querySelector('.board-pod-stroke')).toBeTruthy();
  });
});
