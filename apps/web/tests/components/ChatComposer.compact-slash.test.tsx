// @vitest-environment jsdom

// `/compact` slash command (manual context compaction). Typed = deliberate:
// the composer intercepts a bare `/compact` at submit and routes it to
// `onCompactContext` instead of sending a chat turn — like `/mcp`, the
// command string must never reach the agent as a prompt. The palette entry
// only shows when the current runtime supports manual compaction; without
// support (or with trailing text) the draft falls through to a normal send
// so prose is never swallowed.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';
import { composerText, typeAndSettle } from '../helpers/lexical-composer';

type ChatComposerProps = ComponentProps<typeof ChatComposer>;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderComposer(props: {
  onSend?: ChatComposerProps['onSend'];
  onCompactContext?: ChatComposerProps['onCompactContext'];
  compactContextAvailable?: boolean;
}) {
  return render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={props.onSend ?? vi.fn()}
      onStop={vi.fn()}
      {...(props.onCompactContext ? { onCompactContext: props.onCompactContext } : {})}
      {...(props.compactContextAvailable !== undefined
        ? { compactContextAvailable: props.compactContextAvailable }
        : {})}
    />,
  );
}

describe('ChatComposer /compact command', () => {
  it('lists /compact in the slash palette when the runtime supports it', async () => {
    renderComposer({
      onCompactContext: vi.fn(),
      compactContextAvailable: true,
    });

    await typeAndSettle('/comp');
    await waitFor(() => expect(screen.getByTestId('slash-popover')).toBeTruthy());
    expect(screen.getByText('/compact')).toBeTruthy();
  });

  it('omits /compact from the palette when the runtime does not support it', async () => {
    renderComposer({
      onCompactContext: vi.fn(),
      compactContextAvailable: false,
    });

    await typeAndSettle('/comp');
    // The palette itself may still open for other commands; the compact row
    // must not be offered.
    expect(screen.queryByText('/compact')).toBeNull();
  });

  it('intercepts a bare /compact at submit: fires the handler, sends nothing, clears the draft', async () => {
    const onSend = vi.fn();
    const onCompactContext = vi.fn();
    renderComposer({
      onSend,
      onCompactContext,
      compactContextAvailable: true,
    });

    await typeAndSettle('/compact');
    fireEvent.click(screen.getByTestId('chat-send'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(onCompactContext).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
    // The cleared Lexical editor keeps one empty paragraph whose <br>
    // serializes as '\n' in the helper — trim before asserting emptiness.
    expect(composerText().trim()).toBe('');
  });

  it('falls through to a normal send when the runtime does not support compaction', async () => {
    const onSend = vi.fn();
    const onCompactContext = vi.fn();
    renderComposer({
      onSend,
      onCompactContext,
      compactContextAvailable: false,
    });

    await typeAndSettle('/compact');
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith('/compact', [], [], undefined);
    expect(onCompactContext).not.toHaveBeenCalled();
  });

  it('does not swallow prose that merely starts with /compact', async () => {
    const onSend = vi.fn();
    const onCompactContext = vi.fn();
    renderComposer({
      onSend,
      onCompactContext,
      compactContextAvailable: true,
    });

    await typeAndSettle('/compact the hero section spacing');
    fireEvent.click(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend).toHaveBeenCalledWith('/compact the hero section spacing', [], [], undefined);
    expect(onCompactContext).not.toHaveBeenCalled();
  });
});
