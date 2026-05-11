// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { AgentEvent, ChatMessage } from '../../src/types';

function messageWithText(text: string): ChatMessage {
  const events: AgentEvent[] = [{ kind: 'text', text }];
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    events,
    startedAt: 1_000,
    endedAt: 3_000,
    runStatus: 'succeeded',
  };
}

describe('AssistantMessage — chat file-link routing (#1239)', () => {
  afterEach(() => cleanup());

  it('routes a relative file-link click through onRequestOpenFile and suppresses the default new-window behavior', () => {
    // Before this fix, the rendered <a> kept its target="_blank" and
    // Electron's setWindowOpenHandler created a new app window with a
    // relative href it couldn't resolve, dumping the user on the home
    // screen. The fix detects in-project file paths and routes them
    // through the existing workspace tab opener instead.
    const onRequestOpenFile = vi.fn();
    const { container } = render(
      <AssistantMessage
        message={messageWithText('Open [template.html](template.html) to preview.')}
        streaming={false}
        projectId="project-1"
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    const anchor = container.querySelector('a.md-link');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('template.html');

    // Dispatch a real DOM MouseEvent so we can check defaultPrevented
    // on the underlying native event — that's the signal Electron's
    // setWindowOpenHandler reads to decide whether to open a new
    // window.
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor!.dispatchEvent(clickEvent);

    expect(onRequestOpenFile).toHaveBeenCalledTimes(1);
    expect(onRequestOpenFile).toHaveBeenCalledWith('template.html');
    expect(clickEvent.defaultPrevented).toBe(true);
  });

  it('normalizes a ./ prefix and a nested subdirectory path before opening', () => {
    const onRequestOpenFile = vi.fn();
    const { container } = render(
      <AssistantMessage
        message={messageWithText('Inspect [hero](./subdir/hero.html) section.')}
        streaming={false}
        projectId="project-1"
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    const anchor = container.querySelector('a.md-link')!;
    fireEvent.click(anchor);
    expect(onRequestOpenFile).toHaveBeenCalledTimes(1);
    expect(onRequestOpenFile).toHaveBeenCalledWith('subdir/hero.html');
  });

  it('does not intercept external https:// URLs — keeps default target="_blank"', () => {
    // We must not regress on the original chat behavior for legitimate
    // outbound URLs (documentation links, search results, etc.). The
    // anchor still uses target="_blank" and onRequestOpenFile is not
    // called for these.
    const onRequestOpenFile = vi.fn();
    const { container } = render(
      <AssistantMessage
        message={messageWithText('See [the docs](https://docs.example.com/guide) for context.')}
        streaming={false}
        projectId="project-1"
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    const anchor = container.querySelector('a.md-link')!;
    expect(anchor.getAttribute('href')).toBe('https://docs.example.com/guide');
    expect(anchor.getAttribute('target')).toBe('_blank');

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(clickEvent);

    expect(onRequestOpenFile).not.toHaveBeenCalled();
    expect(clickEvent.defaultPrevented).toBe(false);
  });

  it('does not intercept bare-URL autolinks either', () => {
    const onRequestOpenFile = vi.fn();
    const { container } = render(
      <AssistantMessage
        message={messageWithText('Reference: https://example.com/page')}
        streaming={false}
        projectId="project-1"
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    const anchor = container.querySelector('a.md-link')!;
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(clickEvent);

    expect(onRequestOpenFile).not.toHaveBeenCalled();
    expect(clickEvent.defaultPrevented).toBe(false);
  });

  it('does not intercept #fragment anchors', () => {
    const onRequestOpenFile = vi.fn();
    const { container } = render(
      <AssistantMessage
        message={messageWithText('Jump to [section](#section) above.')}
        streaming={false}
        projectId="project-1"
        onRequestOpenFile={onRequestOpenFile}
      />,
    );

    const anchor = container.querySelector('a.md-link')!;
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(clickEvent);
    expect(onRequestOpenFile).not.toHaveBeenCalled();
    expect(clickEvent.defaultPrevented).toBe(false);
  });

  it('falls back to default behavior when no onRequestOpenFile is provided', () => {
    // The component should remain usable in surfaces that have no
    // project context (no workspace tabs). Clicks on file-shaped
    // links must NOT silently no-op when there is no handler; they
    // should hit the underlying default link behavior.
    const { container } = render(
      <AssistantMessage
        message={messageWithText('Open [template.html](template.html) to preview.')}
        streaming={false}
        projectId="project-1"
      />,
    );

    const anchor = container.querySelector('a.md-link')!;
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(clickEvent);
    expect(clickEvent.defaultPrevented).toBe(false);
  });
});
