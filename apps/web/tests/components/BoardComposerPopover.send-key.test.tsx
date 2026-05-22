// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BoardComposerPopover } from '../../src/components/BoardComposerPopover';
import type { PreviewCommentSnapshot } from '../../src/comments';

const STORAGE_KEY = 'open-design:config';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function target(): PreviewCommentSnapshot {
  return {
    filePath: 'index.html',
    elementId: 'el-1',
    selector: '#el-1',
    label: 'Button',
    text: '',
    position: { x: 0, y: 0, width: 100, height: 40 },
    htmlHint: '',
    selectionKind: 'element',
    memberCount: 1,
    podMembers: [],
  };
}

function renderPopover(onSendBatch: () => void) {
  return render(
    <BoardComposerPopover
      target={target()}
      existing={null}
      draft="looks good"
      notes={[]}
      onDraft={() => {}}
      onAddDraft={() => {}}
      onRemoveQueuedNote={() => {}}
      onClose={() => {}}
      onSaveComment={() => {}}
      onSendBatch={onSendBatch}
      onRemove={() => {}}
      onRemoveMember={() => {}}
      sending={false}
      t={((key: string) => String(key)) as never}
    />,
  );
}

describe('BoardComposerPopover send key (honors Settings → General)', () => {
  it('default (Enter to send): bare Enter sends, Shift+Enter does not', () => {
    const onSendBatch = vi.fn();
    renderPopover(onSendBatch);
    const input = screen.getByTestId('comment-popover-input');

    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSendBatch).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSendBatch).toHaveBeenCalledTimes(1);
  });

  it('does not send while an IME composition is in progress', () => {
    const onSendBatch = vi.fn();
    renderPopover(onSendBatch);
    const input = screen.getByTestId('comment-popover-input');

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(onSendBatch).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSendBatch).toHaveBeenCalledTimes(1);
  });

  it('legacy (enterToSend=false): ⌘/Ctrl+Enter sends, bare Enter does not', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ enterToSend: false }));
    const onSendBatch = vi.fn();
    renderPopover(onSendBatch);
    const input = screen.getByTestId('comment-popover-input');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSendBatch).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    expect(onSendBatch).toHaveBeenCalledTimes(1);
  });
});
