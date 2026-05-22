// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function typeDraft(value: string): HTMLTextAreaElement {
  const textarea = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;
  fireEvent.change(textarea, {
    target: { value, selectionStart: value.length, selectionEnd: value.length },
  });
  return textarea;
}

describe('ChatComposer send key (Settings → General: Enter to send)', () => {
  it('default (Enter to send): bare Enter sends, Shift+Enter does not', async () => {
    const onSend = vi.fn();
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );
    const textarea = typeDraft('hi there');

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith('hi there', [], [], undefined);
  });

  it('default: ⌘/Ctrl + Enter inserts a newline instead of sending', async () => {
    const onSend = vi.fn();
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );
    const textarea = typeDraft('line one');
    textarea.selectionStart = textarea.selectionEnd = textarea.value.length;

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    expect(onSend).not.toHaveBeenCalled();
    await waitFor(() => expect(textarea.value).toBe('line one\n'));
  });

  it('legacy (enterToSend=false): ⌘/Ctrl + Enter sends, bare Enter does not', async () => {
    const onSend = vi.fn();
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={onSend}
        onStop={vi.fn()}
        enterToSend={false}
      />,
    );
    const textarea = typeDraft('hello');

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith('hello', [], [], undefined);
  });

  it('does not send while an IME composition is in progress, sends once it finishes', async () => {
    const onSend = vi.fn();
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );
    const textarea = typeDraft('안녕');

    // macOS Korean: the Enter that commits the composing syllable arrives with
    // isComposing=true. We must not send (that would strand the last char).
    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();

    // Composition finished — the next Enter sends cleanly.
    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith('안녕', [], [], undefined);
  });

  it('Escape stops an in-flight run', () => {
    const onStop = vi.fn();
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={onStop}
      />,
    );
    const textarea = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('Escape does nothing when no run is in flight', () => {
    const onStop = vi.fn();
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={onStop}
      />,
    );
    const textarea = screen.getByTestId('chat-composer-input') as HTMLTextAreaElement;
    fireEvent.keyDown(textarea, { key: 'Escape' });
    expect(onStop).not.toHaveBeenCalled();
  });
});
