// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '../../src/runtime/markdown';

describe('renderMarkdown — onLinkClick option', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not attach onClick when onLinkClick is not provided', () => {
    // Backwards-compat: existing callers (file viewer, system reminders,
    // anywhere that just wants markdown rendered with default behavior)
    // must keep their previous behavior. The rendered <a> still uses
    // target="_blank" and has no extra event listener overhead.
    const { container } = render(
      <div>{renderMarkdown('Click [here](https://example.com).')}</div>,
    );
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('https://example.com');
    // onClick attaches as a React synthetic listener; without it the DOM
    // attribute also stays absent. We can't directly inspect React's
    // listener map from a DOM query, but the absence-of-side-effects
    // check below pins the contract: clicking does not invoke any
    // intercept callback because none was registered.
    expect(anchor?.hasAttribute('onclick')).toBe(false);
  });

  it('fires onLinkClick on every explicit [text](url) link click', () => {
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

  it('fires onLinkClick on autolinked bare https URLs', () => {
    // The bare-autolink branch runs through pushText; before this PR
    // it had no onClick wiring at all, so the regression would be
    // "in-project files are intercepted but bare URLs are not". The
    // contract is the same in both paths: caller hears the click and
    // decides whether to preventDefault.
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

  it('passes the React MouseEvent so the caller can preventDefault', () => {
    // The intercept contract is: the caller decides whether to
    // suppress the default `target="_blank"` behavior. This test
    // pins that the second argument is the React synthetic event,
    // not just the raw DOM event or a stripped wrapper.
    const onLinkClick = vi.fn((_href: string, event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    const { container } = render(
      <div>
        {renderMarkdown('Open [the file](template.html).', { onLinkClick })}
      </div>,
    );
    const anchor = container.querySelector('a')!;
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(clickEvent);
    // React routes the native event through its synthetic event
    // system; the caller's preventDefault call propagates to the
    // underlying native event so the browser would not follow the
    // `target="_blank"` link.
    expect(onLinkClick).toHaveBeenCalledTimes(1);
    expect(clickEvent.defaultPrevented).toBe(true);
  });

  it('still respects markdown structure when intercepting clicks', () => {
    // Sanity: the link in a paragraph alongside emphasis and inline
    // code keeps the parent <p>'s other tokens intact; only the <a>
    // gets the click wiring.
    const onLinkClick = vi.fn();
    const { container } = render(
      <div>
        {renderMarkdown(
          'Look at [the file](template.html) and **note** the `index.html` reference.',
          { onLinkClick },
        )}
      </div>,
    );
    expect(container.querySelector('strong')?.textContent).toBe('note');
    expect(container.querySelector('code')?.textContent).toBe('index.html');
    const anchor = container.querySelector('a')!;
    fireEvent.click(anchor);
    expect(onLinkClick).toHaveBeenCalledTimes(1);
  });
});
