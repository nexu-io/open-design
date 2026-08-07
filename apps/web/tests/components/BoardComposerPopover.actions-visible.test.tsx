// @vitest-environment jsdom

// Acceptance defect #89: with the inspect/comment tool active, clicking an
// element low in the preview stage opened the annotation popover with its
// action row (cancel / send-to-chat) cut off — the card's height is clamped to
// the space left below the anchor, and the whole card was the scroller, so the
// buttons sat below the fold with no way to reach them.
//
// The invariant this locks in: the action row lives OUTSIDE the scrolling
// region, so no height clamp can ever scroll it out of the card.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BoardComposerPopover } from '../../src/components/BoardComposerPopover';
import type { PreviewCommentSnapshot } from '../../src/comments';

afterEach(() => {
  cleanup();
});

const target: PreviewCommentSnapshot = {
  filePath: 'index.html',
  elementId: 'ag',
  selector: 'div.ag',
  label: 'div.ag',
  text: '',
  // Anchored near the bottom of the stage, which is what forces the clamp.
  position: { x: 40, y: 460, width: 1200, height: 64 },
  htmlHint: '',
  selectionKind: 'element',
};

function renderPopover() {
  return render(
    <BoardComposerPopover
      target={target}
      existing={null}
      draft="Tighten this heading"
      notes={[]}
      onDraft={() => {}}
      onAddDraft={() => {}}
      onRemoveQueuedNote={() => {}}
      onClose={() => {}}
      onSaveComment={() => {}}
      onSendBatch={() => {}}
      onRemoveMember={() => {}}
      sending={false}
      t={((key: string) => String(key)) as never}
      // A short stage: the card cannot fit below the anchor, so the host clamps
      // its height — the exact condition that used to hide the actions.
      bounds={{ width: 760, height: 520 }}
    />,
  );
}

describe('BoardComposerPopover action row', () => {
  it('renders the action row', () => {
    renderPopover();
    expect(screen.getByTestId('comment-add-send')).toBeTruthy();
    expect(screen.getByTestId('comment-popover-save')).toBeTruthy();
  });

  it('keeps the action row outside the scrolling body so a height clamp cannot hide it', () => {
    renderPopover();
    const popover = screen.getByTestId('comment-popover');
    const body = popover.querySelector('.comment-popover-body');
    const actions = popover.querySelector('.comment-popover-actions');

    expect(body).not.toBeNull();
    expect(actions).not.toBeNull();
    // The scroller is the body, not the card, and the actions are not in it.
    expect(body!.contains(actions!)).toBe(false);
    // ...they are a direct child of the card, so they always occupy the frame.
    expect(actions!.parentElement).toBe(popover);
  });

  it('clamps the card height, which is what made the clipping reachable', () => {
    renderPopover();
    const popover = screen.getByTestId('comment-popover');
    // The host caps the card to the space left in the stage; the fix has to
    // survive that cap rather than depend on the card being tall enough.
    expect(popover.style.maxHeight).not.toBe('');
  });
});
