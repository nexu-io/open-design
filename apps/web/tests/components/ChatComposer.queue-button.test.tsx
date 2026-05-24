// @vitest-environment jsdom

// Composer Send-Queue button — appears next to Stop while a run is in
// flight and the textarea carries unsent draft text. Lets the user
// stack the next prompt without aborting the current run; ChatPane
// owns the queue and auto-fires the first item when streaming flips
// false. Covers: button visibility (gated on streaming + draft),
// click forwards draft to onQueue and clears the textarea, and the
// non-streaming default has no Queue button at all.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';

afterEach(() => {
  cleanup();
});

function baseProps() {
  return {
    projectId: 'project-1',
    projectFiles: [],
    onEnsureProject: vi.fn(async () => 'project-1'),
    onSend: vi.fn(),
    onStop: vi.fn(),
  } as const;
}

function getTextarea(): HTMLTextAreaElement {
  // ChatComposer renders exactly one textarea (the prompt input).
  return document.querySelector('textarea') as HTMLTextAreaElement;
}

describe('ChatComposer Send-Queue button', () => {
  it('hides the Queue button when not streaming', () => {
    render(<ChatComposer {...baseProps()} streaming={false} onQueue={vi.fn()} />);
    expect(screen.queryByTestId('chat-queue')).toBeNull();
  });

  it('hides the Queue button while streaming if the draft is empty', () => {
    render(<ChatComposer {...baseProps()} streaming={true} onQueue={vi.fn()} />);
    // No draft typed yet — nothing to queue.
    expect(screen.queryByTestId('chat-queue')).toBeNull();
  });

  it('hides the Queue button if no onQueue handler is provided (opt-in surface)', () => {
    render(<ChatComposer {...baseProps()} streaming={true} />);
    fireEvent.change(getTextarea(), { target: { value: 'follow-up prompt' } });
    expect(screen.queryByTestId('chat-queue')).toBeNull();
  });

  it('shows the Queue button when streaming and the draft has text', () => {
    render(<ChatComposer {...baseProps()} streaming={true} onQueue={vi.fn()} />);
    fireEvent.change(getTextarea(), { target: { value: 'follow-up prompt' } });
    // getByTestId throws if not found, so a successful lookup is the assertion.
    expect(screen.getByTestId('chat-queue').tagName).toBe('BUTTON');
  });

  it('forwards the trimmed draft to onQueue and clears the textarea on click', () => {
    const onQueue = vi.fn();
    render(<ChatComposer {...baseProps()} streaming={true} onQueue={onQueue} />);
    const textarea = getTextarea();
    fireEvent.change(textarea, { target: { value: '  next thing to do  ' } });

    fireEvent.click(screen.getByTestId('chat-queue'));

    expect(onQueue).toHaveBeenCalledTimes(1);
    expect(onQueue).toHaveBeenCalledWith('next thing to do');
    expect(textarea.value).toBe('');
    // Cleared textarea hides the button again.
    expect(screen.queryByTestId('chat-queue')).toBeNull();
  });

  it('Cmd+Shift+Enter while streaming queues the draft (keyboard mirror of the button)', () => {
    const onQueue = vi.fn();
    const onSend = vi.fn();
    render(
      <ChatComposer {...baseProps()} onSend={onSend} streaming={true} onQueue={onQueue} />,
    );
    const textarea = getTextarea();
    fireEvent.change(textarea, { target: { value: 'follow-up via shortcut' } });

    fireEvent.keyDown(textarea, {
      key: 'Enter',
      shiftKey: true,
      metaKey: true,
    });

    expect(onQueue).toHaveBeenCalledTimes(1);
    expect(onQueue).toHaveBeenCalledWith('follow-up via shortcut');
    expect(textarea.value).toBe('');
    // The shortcut must not also trigger a send — send and queue are distinct.
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not queue on plain Shift+Enter (newline) or unsupported combos', () => {
    const onQueue = vi.fn();
    render(<ChatComposer {...baseProps()} streaming={true} onQueue={onQueue} />);
    const textarea = getTextarea();
    fireEvent.change(textarea, { target: { value: 'some text' } });

    // Plain Shift+Enter is the newline shortcut; it must not queue.
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    // Alt+Cmd+Shift+Enter is not in the supported set.
    fireEvent.keyDown(textarea, {
      key: 'Enter',
      shiftKey: true,
      metaKey: true,
      altKey: true,
    });

    expect(onQueue).not.toHaveBeenCalled();
  });
});
