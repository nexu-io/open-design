// @vitest-environment jsdom

// Regression: while a chat run is in flight the comment popover must queue
// instead of showing a stuck "Sending..." state with a disabled primary action.

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

const labels: Record<string, string> = {
  'chat.comments.sendToChat': 'Send to chat',
  'chat.comments.sending': 'Sending…',
  'chat.annotationQueue': 'Queue',
  'chat.comments.placeholder': 'Comment on this element…',
  'chat.comments.comment': 'Comment',
};

describe('BoardComposerPopover queue on busy conversation', () => {
  it('shows Queue and stays clickable while a run is in flight', () => {
    const onSendBatch = vi.fn();
    render(
      <BoardComposerPopover
        target={target}
        existing={null}
        draft="Make this text white"
        notes={[]}
        onDraft={() => {}}
        onAddDraft={() => {}}
        onRemoveQueuedNote={() => {}}
        onClose={() => {}}
        onSaveComment={() => {}}
        onSendBatch={onSendBatch}
        onRemoveMember={() => {}}
        sending={false}
        queueOnSend
        sendDisabled={false}
        t={((key: string) => labels[key] ?? key) as never}
      />,
    );

    const send = screen.getByTestId('comment-add-send') as HTMLButtonElement;
    expect(send.textContent).toBe('Queue');
    expect(send.disabled).toBe(false);

    fireEvent.click(send);
    expect(onSendBatch).toHaveBeenCalledTimes(1);
  });

  it('shows Sending… only while the batch submit is in flight', () => {
    render(
      <BoardComposerPopover
        target={target}
        existing={null}
        draft="Make this text white"
        notes={[]}
        onDraft={() => {}}
        onAddDraft={() => {}}
        onRemoveQueuedNote={() => {}}
        onClose={() => {}}
        onSaveComment={() => {}}
        onSendBatch={() => {}}
        onRemoveMember={() => {}}
        sending
        queueOnSend
        sendDisabled={false}
        t={((key: string) => labels[key] ?? key) as never}
      />,
    );

    const send = screen.getByTestId('comment-add-send') as HTMLButtonElement;
    expect(send.textContent).toBe('Sending…');
    expect(send.disabled).toBe(true);
  });
});
