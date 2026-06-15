// @vitest-environment jsdom

// Regression for #4367: the "Queue" action only does something distinct from
// "Send" while a run is in flight — it stages the mark for the next turn. When
// the conversation is idle, queuing immediately drains and executes, which is
// indistinguishable from Send and misled users into expecting a batch-hold.
// So the overlay must only surface Queue while sending is disabled (busy),
// mirroring the comment composer (BoardComposerPopover), which only shows Queue
// when sendDisabled. At idle, Send is the single submit affordance.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PreviewDrawOverlay } from '../../src/components/PreviewDrawOverlay';

afterEach(() => {
  cleanup();
});

describe('PreviewDrawOverlay queue affordance is busy-only (#4367)', () => {
  it('hides Queue when the conversation is idle so it cannot be misread as a batch-hold', () => {
    render(
      <PreviewDrawOverlay active>
        <div data-testid="content" />
      </PreviewDrawOverlay>,
    );

    const note = document.querySelector('.preview-draw-note-input') as HTMLInputElement;
    fireEvent.change(note, { target: { value: 'looks good' } });

    // Send is the only submit affordance while idle...
    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    expect(send.disabled).toBe(false);
    // ...and there is no separate Queue button to confuse with an immediate send.
    expect(screen.queryByRole('button', { name: 'Queue' })).toBeNull();
  });

  it('shows Queue only while sending is disabled (a run is in flight)', () => {
    render(
      <PreviewDrawOverlay active sendDisabled sendDisabledReason="Task running">
        <div data-testid="content" />
      </PreviewDrawOverlay>,
    );

    const note = document.querySelector('.preview-draw-note-input') as HTMLInputElement;
    fireEvent.change(note, { target: { value: 'looks good' } });

    const send = screen.getByRole('button', { name: 'Send' }) as HTMLButtonElement;
    const queue = screen.getByRole('button', { name: 'Queue' }) as HTMLButtonElement;
    // Send is held (cannot run mid-task) and Queue takes over to stage for the next turn.
    expect(send.disabled).toBe(true);
    expect(queue.disabled).toBe(false);
  });

  it('routes the Enter shortcut to Queue while a run is in flight', async () => {
    const annotation = vi.fn();
    window.addEventListener('opendesign:annotation', annotation);
    try {
      render(
        <PreviewDrawOverlay active sendDisabled sendDisabledReason="Task running">
          <div data-testid="content" />
        </PreviewDrawOverlay>,
      );

      const note = document.querySelector('.preview-draw-note-input') as HTMLInputElement;
      fireEvent.change(note, { target: { value: 'stage this for next turn' } });
      fireEvent.keyDown(note, { key: 'Enter' });

      // Send is disabled mid-run, so Enter must stage via Queue rather than no-op.
      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      expect(annotation.mock.calls[0]?.[0].detail).toMatchObject({
        action: 'queue',
        note: 'stage this for next turn',
      });
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
    }
  });
});
