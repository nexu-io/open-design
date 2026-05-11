// @vitest-environment jsdom

/**
 * Render-level coverage for `<MessageFeedback>` (issue #1288). Drives
 * the widget's three states (idle, submitted positive, submitted
 * negative + comment) end to end through the real
 * `useMessageFeedback` hook so the localStorage round-trip is
 * exercised at the same time. The visibility gate (only after the
 * assistant message finishes successfully) lives in
 * `AssistantMessage.tsx` and is not the responsibility of this
 * component, so it is not asserted here.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageFeedback } from '../../src/components/MessageFeedback';
import { readMessageFeedback } from '../../src/state/message-feedback';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('MessageFeedback (issue #1288)', () => {
  it('shows the helpful-prompt and two thumb buttons in the idle state', () => {
    render(<MessageFeedback messageId="msg-idle" />);
    expect(screen.getByText('Was this response helpful?')).toBeTruthy();
    expect(screen.getByTestId('message-feedback-positive')).toBeTruthy();
    expect(screen.getByTestId('message-feedback-negative')).toBeTruthy();
  });

  it('persists a positive rating and flips to the confirmation chip on click', () => {
    render(<MessageFeedback messageId="msg-pos" now={() => 1700000001} />);
    fireEvent.click(screen.getByTestId('message-feedback-positive'));

    expect(screen.getByText('Thanks for the feedback.')).toBeTruthy();
    expect(readMessageFeedback('msg-pos')).toEqual({
      rating: 'positive',
      submittedAt: 1700000001,
      comment: undefined,
    });
  });

  it('persists a negative rating and surfaces the optional comment textarea', () => {
    render(<MessageFeedback messageId="msg-neg" now={() => 1700000002} />);
    fireEvent.click(screen.getByTestId('message-feedback-negative'));

    expect(screen.getByText("Thanks, we'll use this to improve.")).toBeTruthy();
    expect(screen.getByTestId('message-feedback-comment')).toBeTruthy();
    expect(readMessageFeedback('msg-neg')).toEqual({
      rating: 'negative',
      submittedAt: 1700000002,
      comment: undefined,
    });
  });

  it('records a negative comment on submit and shows the saved confirmation', () => {
    render(<MessageFeedback messageId="msg-neg-c" now={() => 1700000003} />);
    fireEvent.click(screen.getByTestId('message-feedback-negative'));

    const textarea = screen.getByTestId('message-feedback-comment') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'preview opened the pointer file' } });
    fireEvent.click(screen.getByTestId('message-feedback-comment-submit'));

    expect(screen.getByText('Comment saved')).toBeTruthy();
    expect(readMessageFeedback('msg-neg-c')).toEqual({
      rating: 'negative',
      comment: 'preview opened the pointer file',
      submittedAt: 1700000003,
    });
  });

  it('disables the Send button when the textarea is empty (no blank-comment writes)', () => {
    render(<MessageFeedback messageId="msg-neg-blank" />);
    fireEvent.click(screen.getByTestId('message-feedback-negative'));

    const submit = screen.getByTestId('message-feedback-comment-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('clears feedback when Change is clicked, returning to the idle state', () => {
    // Issue Open Question 2 ("should users be able to change feedback
    // after submitting it?") — answered yes in this v1: clicking
    // Change unsticks the rating so the user can re-rate.
    render(<MessageFeedback messageId="msg-change" />);
    fireEvent.click(screen.getByTestId('message-feedback-positive'));
    expect(readMessageFeedback('msg-change')).not.toBeNull();

    fireEvent.click(screen.getByTestId('message-feedback-change'));

    expect(screen.getByText('Was this response helpful?')).toBeTruthy();
    expect(readMessageFeedback('msg-change')).toBeNull();
  });

  it('rehydrates the submitted state when storage already has a value at mount time', () => {
    // Reload-survival: the issue's "feedback state is visually clear
    // after submission" criterion implies the chip stays visible after
    // a refresh.
    window.localStorage.setItem(
      'open-design:message-feedback:msg-rehydrate',
      JSON.stringify({ rating: 'positive', submittedAt: 1700000010 }),
    );
    render(<MessageFeedback messageId="msg-rehydrate" />);
    expect(screen.getByText('Thanks for the feedback.')).toBeTruthy();
    // The idle prompt must NOT also appear.
    expect(screen.queryByText('Was this response helpful?')).toBeNull();
  });

  it('lets the user clear a saved comment by erasing the textarea and clicking Send', () => {
    // Lefarcen P3 (#1308 review): the prior `draftComment ||
    // feedback.comment || ''` controlled value made the textarea
    // snap back to the saved comment whenever the draft was empty,
    // so the user could never erase a saved comment without
    // clicking Change first. With the draft-only value the user
    // can erase + Send to clear.
    window.localStorage.setItem(
      'open-design:message-feedback:msg-clear-comment',
      JSON.stringify({
        rating: 'negative',
        comment: 'preview opened the pointer file',
        submittedAt: 1700000020,
      }),
    );
    render(<MessageFeedback messageId="msg-clear-comment" />);

    const textarea = screen.getByTestId('message-feedback-comment') as HTMLTextAreaElement;
    expect(textarea.value).toBe('preview opened the pointer file');
    fireEvent.change(textarea, { target: { value: '' } });
    expect(textarea.value).toBe('');

    fireEvent.click(screen.getByTestId('message-feedback-comment-submit'));
    expect(readMessageFeedback('msg-clear-comment')).toEqual({
      rating: 'negative',
      comment: undefined,
      submittedAt: 1700000020,
    });
  });

  it('keeps the in-session confirmation visible when localStorage writes fail (private mode / quota)', () => {
    // Codex + lefarcen P2 (#1308 review): a failing setItem used to
    // unstick the just-submitted rating because the CustomEvent
    // listener re-read storage (now null) and overrode the in-memory
    // state. The fix puts the new value in the event detail so
    // listeners apply it directly.
    const setItemSpy = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    render(<MessageFeedback messageId="msg-quota" now={() => 1700000030} />);
    fireEvent.click(screen.getByTestId('message-feedback-positive'));

    expect(screen.getByText('Thanks for the feedback.')).toBeTruthy();
    expect(screen.queryByText('Was this response helpful?')).toBeNull();
    setItemSpy.mockRestore();
  });

  it('keeps two mounts of the same messageId in sync (positive submit + Change)', () => {
    // Siri-Ray (#1308 review): the previous implementation broke the
    // same-tab sync contract on the clear path because it early-
    // returned before dispatching the CustomEvent. Two mounts of the
    // same message must reach the same state on both Submit and Clear.
    render(
      <div>
        <div data-testid="mount-a">
          <MessageFeedback messageId="msg-shared" now={() => 1700000040} />
        </div>
        <div data-testid="mount-b">
          <MessageFeedback messageId="msg-shared" now={() => 1700000040} />
        </div>
      </div>,
    );

    // Both start in idle.
    expect(screen.getAllByText('Was this response helpful?')).toHaveLength(2);

    // Click positive on mount A: both mounts flip to submitted.
    const positiveButtons = screen.getAllByTestId('message-feedback-positive');
    fireEvent.click(positiveButtons[0]!);
    expect(screen.getAllByText('Thanks for the feedback.')).toHaveLength(2);
    expect(screen.queryByText('Was this response helpful?')).toBeNull();

    // Click Change on mount B: both mounts return to idle.
    const changeButtons = screen.getAllByTestId('message-feedback-change');
    fireEvent.click(changeButtons[1]!);
    expect(screen.getAllByText('Was this response helpful?')).toHaveLength(2);
    expect(screen.queryByText('Thanks for the feedback.')).toBeNull();
  });
});
