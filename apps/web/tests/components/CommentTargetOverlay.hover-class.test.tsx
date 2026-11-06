// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CommentTargetOverlay } from '../../src/components/FileViewer';
import type { PreviewCommentSnapshot } from '../../src/comments';
import type { PreviewCommentMember } from '../../src/types';

afterEach(() => {
  cleanup();
});

function member(elementId: string, x: number): PreviewCommentMember {
  return {
    elementId,
    selector: `#${elementId}`,
    label: elementId,
    text: '',
    position: { x, y: 0, width: 10, height: 10 },
    htmlHint: '',
  };
}

function podSnapshot(members: PreviewCommentMember[]): PreviewCommentSnapshot {
  return {
    filePath: 'index.html',
    elementId: 'pod-1',
    selector: '',
    label: 'Pod',
    text: '',
    position: { x: 0, y: 0, width: 100, height: 60 },
    htmlHint: '',
    selectionKind: 'pod',
    memberCount: members.length,
    podMembers: members,
  };
}

describe('CommentTargetOverlay hover-focus class wiring', () => {
  it('puts is-hover-focused only on the member overlay whose elementId matches hoveredMemberId', () => {
    const snapshot = podSnapshot([member('alpha', 0), member('beta', 50)]);
    const { container, rerender } = render(
      <CommentTargetOverlay snapshot={snapshot} scale={1} selected={false} hoveredMemberId="alpha" />,
    );

    const overlays = container.querySelectorAll<HTMLElement>('[data-testid="comment-target-overlay"]');
    expect(overlays).toHaveLength(2);
    expect(overlays[0]?.classList.contains('is-hover-focused')).toBe(true);
    expect(overlays[1]?.classList.contains('is-hover-focused')).toBe(false);

    rerender(<CommentTargetOverlay snapshot={snapshot} scale={1} selected={false} hoveredMemberId="beta" />);
    const swapped = container.querySelectorAll<HTMLElement>('[data-testid="comment-target-overlay"]');
    expect(swapped[0]?.classList.contains('is-hover-focused')).toBe(false);
    expect(swapped[1]?.classList.contains('is-hover-focused')).toBe(true);

    rerender(<CommentTargetOverlay snapshot={snapshot} scale={1} selected={false} hoveredMemberId={null} />);
    expect(container.querySelectorAll('.is-hover-focused')).toHaveLength(0);
  });

  it('does not put is-hover-focused on the non-member fallback overlay even if hoveredMemberId is set', () => {
    const elementSnapshot: PreviewCommentSnapshot = {
      filePath: 'index.html',
      elementId: 'single-target',
      selector: '#single-target',
      label: 'Single',
      text: '',
      position: { x: 0, y: 0, width: 20, height: 20 },
      htmlHint: '',
      selectionKind: 'element',
    };
    const { container } = render(
      <CommentTargetOverlay snapshot={elementSnapshot} scale={1} selected={false} hoveredMemberId="single-target" />,
    );
    expect(container.querySelectorAll('.is-hover-focused')).toHaveLength(0);
  });
});
