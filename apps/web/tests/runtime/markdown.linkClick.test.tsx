// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '../../src/runtime/markdown';

describe('renderMarkdown — onLinkClick option', () => {
  afterEach(() => cleanup());

  it('omits onClick when the option is absent (backwards-compat for existing callers)', () => {
    // Existing surfaces — file viewer, system reminders, anywhere that
    // just renders markdown for display — must keep their previous
    // target="_blank" behavior with no extra event wiring.
    const { container } = render(
      <div>{renderMarkdown('Click [here](https://example.com).')}</div>,
    );
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('https://example.com');
    expect(anchor?.getAttribute('target')).toBe('_blank');
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor!.dispatchEvent(clickEvent);
    expect(clickEvent.defaultPrevented).toBe(false);
  });

  it('fires onLinkClick on explicit [text](url) link click', () => {
    const onLinkClick = vi.fn();
    const { container } = render(
      <div>
        {renderMarkdown('Open [the file](template.html) to inspect.', { onLinkClick })}
      </div>,
    );
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('template.html');
    fireEvent.click(anchor!);
    expect(onLinkClick).toHaveBeenCalledTimes(1);
    expect(onLinkClick.mock.calls[0]?.[0]).toBe('template.html');
  });

  it('fires onLinkClick on autolinked bare https URLs found inline', () => {
    // The bare-URL branch in `renderInline` (`m[6]`) — separate code
    // path from the explicit `[text](url)` branch, must wire onClick
    // the same way.
    const onLinkClick = vi.fn();
    const { container } = render(
      <div>{renderMarkdown('See https://example.com/page for context.', { onLinkClick })}</div>,
    );
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    fireEvent.click(anchor!);
    expect(onLinkClick).toHaveBeenCalledTimes(1);
    expect(onLinkClick.mock.calls[0]?.[0]).toBe('https://example.com/page');
  });

  it('fires onLinkClick on URLs that fall to the pushText autolink path', () => {
    // Text emitted between other inline tokens flows through `pushText`,
    // which runs its own URL autolink scan. That third `<a>` creation
    // site needs the same onClick wiring as the other two.
    const onLinkClick = vi.fn();
    const { container } = render(
      <div>
        {renderMarkdown('**bold** https://example.com/page then more text.', { onLinkClick })}
      </div>,
    );
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    fireEvent.click(anchor!);
    expect(onLinkClick).toHaveBeenCalledTimes(1);
    expect(onLinkClick.mock.calls[0]?.[0]).toBe('https://example.com/page');
  });

  it('passes the React MouseEvent so the caller can preventDefault()', () => {
    const onLinkClick = vi.fn<(href: string, event: { preventDefault(): void }) => void>(
      (_href, event) => {
        event.preventDefault();
      },
    );
    const { container } = render(
      <div>{renderMarkdown('Open [file](template.html).', { onLinkClick })}</div>,
    );
    const anchor = container.querySelector('a')!;
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(clickEvent);
    expect(onLinkClick).toHaveBeenCalledTimes(1);
    expect(clickEvent.defaultPrevented).toBe(true);
  });
});
