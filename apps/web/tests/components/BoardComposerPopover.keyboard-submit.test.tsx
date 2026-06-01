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

function renderPopover(onSendBatch: () => void, sending = false) {
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
      onSendBatch={onSendBatch}
      onRemoveMember={() => {}}
      sending={sending}
      t={((key: string) => String(key)) as never}
    />,
  );
}

describe('BoardComposerPopover keyboard submit', () => {
  it('sends the drafted comment with the primary Enter shortcut', () => {
    const onSendBatch = vi.fn();
    renderPopover(onSendBatch);

    fireEvent.keyDown(screen.getByTestId('comment-popover-input'), { key: 'Enter', metaKey: true });

    expect(onSendBatch).toHaveBeenCalledTimes(1);
  });

  it('does not send while disabled or while IME text is composing', () => {
    const onSendBatch = vi.fn();
    const { rerender } = renderPopover(onSendBatch, true);
    const input = screen.getByTestId('comment-popover-input');

    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    expect(onSendBatch).not.toHaveBeenCalled();

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
        onSaveComment={() => {}}
        onSendBatch={onSendBatch}
        onRemoveMember={() => {}}
        sending={false}
        t={((key: string) => String(key)) as never}
      />,
    );

    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });

    expect(onSendBatch).not.toHaveBeenCalled();
  });
});
