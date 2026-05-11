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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
});
