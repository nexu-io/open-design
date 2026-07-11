// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CommentTargetOverlay } from '../../../src/features/file-viewer/components/CommentTargetOverlay';
import type { PreviewCommentSnapshot } from '../../../src/comments';

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

describe('CommentTargetOverlay', () => {
  it('renders a single overlay box for a non-pod snapshot', () => {
    render(
      <CommentTargetOverlay snapshot={makeSnapshot()} scale={1} selected={false} />,
    );
    const boxes = screen.getAllByTestId('comment-target-overlay');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.className).not.toContain('selected');
  });

  it('applies the selected class when selected', () => {
    render(
      <CommentTargetOverlay snapshot={makeSnapshot()} scale={1} selected />,
    );
    expect(screen.getByTestId('comment-target-overlay').className).toContain('selected');
  });

  it('renders one box per pod member for a pod snapshot', () => {
    const pod = makeSnapshot({
      selectionKind: 'pod',
      podMembers: [
        { elementId: 'a', selector: '[data-od-id="a"]', label: 'A', text: '', position: { x: 0, y: 0, width: 10, height: 10 }, htmlHint: '' },
        { elementId: 'b', selector: '[data-od-id="b"]', label: 'B', text: '', position: { x: 20, y: 0, width: 10, height: 10 }, htmlHint: '' },
      ],
    } as Partial<PreviewCommentSnapshot>);
    render(
      <CommentTargetOverlay snapshot={pod} scale={1} selected={false} />,
    );
    expect(screen.getAllByTestId('comment-target-overlay')).toHaveLength(2);
  });

  it('marks the hover-focused member with is-hover-focused', () => {
    const pod = makeSnapshot({
      selectionKind: 'pod',
      podMembers: [
        { elementId: 'a', selector: '[data-od-id="a"]', label: 'A', text: '', position: { x: 0, y: 0, width: 10, height: 10 }, htmlHint: '' },
      ],
    } as Partial<PreviewCommentSnapshot>);
    render(
      <CommentTargetOverlay snapshot={pod} scale={1} selected={false} hoveredMemberId="a" />,
    );
    expect(screen.getByTestId('comment-target-overlay').className).toContain('is-hover-focused');
  });
});
