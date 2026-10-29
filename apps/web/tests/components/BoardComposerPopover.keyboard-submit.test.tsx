// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BoardComposerPopover } from '../../src/components/BoardComposerPopover';
import type { PreviewCommentSnapshot } from '../../src/comments';

afterEach(() => {
  cleanup();
});

const target: PreviewCommentSnapshot = {
  filePath: 'index.html',
  elementId: 'hero-title',
  selector: '#hero-title',
  label: 'Hero title',
  text: '',
  position: { x: 0, y: 0, width: 100, height: 24 },
  htmlHint: '',
  selectionKind: 'element',
};

function renderPopover({
  onSaveComment = () => {},
  onSendBatch = () => {},
  sending = false,
  selectionKind = 'element',
  targetOverride = {},
  draft = 'Tighten this heading',
  existingImages = [],
  images = [],
  bounds,
  onClose = () => {},
}: {
  onClose?: () => void;
  onSaveComment?: () => void;
  onSendBatch?: () => void;
  sending?: boolean;
  selectionKind?: PreviewCommentSnapshot['selectionKind'];
  targetOverride?: Partial<PreviewCommentSnapshot>;
  draft?: string;
  existingImages?: { url: string; name: string }[];
  images?: { file: File; url: string }[];
  bounds?: { width: number; height: number; scrollLeft?: number; scrollTop?: number };
} = {}) {
  return render(
    <BoardComposerPopover
      target={{ ...target, ...targetOverride, selectionKind }}
      existing={null}
      draft={draft}
      notes={[]}
      onDraft={() => {}}
      onAddDraft={() => {}}
      onRemoveQueuedNote={() => {}}
      onClose={onClose}
      onSaveComment={onSaveComment}
      onSendBatch={onSendBatch}
      onRemoveMember={() => {}}
      existingImages={existingImages}
      images={images}
      sending={sending}
      t={((key: string) => String(key)) as never}
      bounds={bounds}
    />,
  );
}

describe('BoardComposerPopover keyboard submit', () => {
  it('keeps ordinary Escape closing behavior when the menu is closed', () => {
    const onClose = vi.fn();
    renderPopover({ onClose });
    fireEvent.keyDown(screen.getByTestId('comment-popover-input'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the nested native menu on first Escape and retains the draft and attachment', () => {
    const onClose = vi.fn();
    renderPopover({ onClose, images: [{ url: 'blob:reference', file: new File(['image'], 'reference.png', { type: 'image/png' }) }] });
    const menu = screen.getByRole('menu', { hidden: true });
    let menuOpen = false;
    vi.spyOn(menu, 'matches').mockImplementation(selector => selector === ':popover-open' && menuOpen);
    const hide = vi.fn(() => { menuOpen = false; });
    Object.assign(menu, { togglePopover: () => { menuOpen = !menuOpen; }, hidePopover: hide });
    fireEvent.click(screen.getByLabelText('comment.moreActions'));
    fireEvent.keyDown(screen.getByTestId('comment-popover-input'), { key: 'Escape' });
    expect(hide).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('comment-popover-input')).toHaveValue('Tighten this heading');
    expect(screen.getByRole('button', { name: 'reference.png' }).querySelector('img')).toHaveAttribute('src', 'blob:reference');
    fireEvent.keyDown(screen.getByTestId('comment-popover-input'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('saves an element comment with Enter and keeps Shift+Enter for multiline text', () => {
    const onSaveComment = vi.fn();
    renderPopover({ onSaveComment });

    fireEvent.keyDown(screen.getByTestId('comment-popover-input'), { key: 'Enter' });

    expect(onSaveComment).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByTestId('comment-popover-input'), { key: 'Enter', shiftKey: true });
    expect(onSaveComment).toHaveBeenCalledTimes(1);
  });

  it('sends a pod comment with Enter', () => {
    const onSendBatch = vi.fn();
    renderPopover({ onSendBatch, selectionKind: 'pod' });

    fireEvent.keyDown(screen.getByTestId('comment-popover-input'), { key: 'Enter' });

    expect(onSendBatch).toHaveBeenCalledTimes(1);
  });

  it('allows existing saved images to submit without typed text', () => {
    const onSaveComment = vi.fn();
    const onSendBatch = vi.fn();
    renderPopover({
      draft: '',
      existingImages: [{ url: '/api/projects/project-1/raw/uploads/ref.png', name: 'ref.png' }],
      onSaveComment,
      onSendBatch,
    });

    fireEvent.keyDown(screen.getByTestId('comment-popover-input'), { key: 'Enter' });
    expect(onSaveComment).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('comment-add-send'));
    expect(onSendBatch).toHaveBeenCalledTimes(1);
  });

  it('does not submit while disabled or while IME text is composing', () => {
    const onSaveComment = vi.fn();
    const { rerender } = renderPopover({ onSaveComment, sending: true });
    const input = screen.getByTestId('comment-popover-input');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSaveComment).not.toHaveBeenCalled();

    rerender(
      <BoardComposerPopover
        target={target}
        existing={null}
        draft="Tighten this heading"
        notes={[]}
        onDraft={() => {}}
        onAddDraft={() => {}}
        onRemoveQueuedNote={() => {}}
        onClose={() => {}}
        onSaveComment={onSaveComment}
        onSendBatch={() => {}}
        onRemoveMember={() => {}}
        sending={false}
        t={((key: string) => String(key)) as never}
      />,
    );

    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSaveComment).not.toHaveBeenCalled();
  });

  it('keeps the full composer inside the visible preview bounds for low targets', () => {
    renderPopover({
      targetOverride: {
        position: { x: 24, y: 560, width: 120, height: 40 },
      },
      bounds: { width: 800, height: 600 },
    });

    const popover = screen.getByTestId('comment-popover');
    const top = Number.parseInt(popover.style.top, 10);

    expect(top).toBeLessThanOrEqual(266);
    expect(Number.parseInt(popover.style.maxHeight, 10)).toBeGreaterThan(0);
  });

  it('places the composer beside the avatar instead of the wide selected element', () => {
    renderPopover({
      targetOverride: {
        hoverPoint: { x: 400, y: 250 },
        position: { x: 80, y: 220, width: 640, height: 100 },
      },
      bounds: { width: 800, height: 600 },
    });

    const popover = screen.getByTestId('comment-popover');
    const top = Number.parseInt(popover.style.top, 10);

    expect(top).toBe(222);
    expect(Number.parseInt(popover.style.left, 10)).toBe(440);
    expect(Number.parseInt(popover.style.maxHeight, 10)).toBe(568);
  });

  it('does not mount the retired drag handle', () => {
    renderPopover();
    expect(screen.queryByLabelText('Move comment box')).toBeNull();
  });
});
