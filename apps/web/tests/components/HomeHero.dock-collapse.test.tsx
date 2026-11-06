// @vitest-environment jsdom
//
// The docked composer's collapse contract (community view's bottom bar).
//
// `HomeHero variant="dock"` folds down to a one-line pill and unfolds back;
// FIVE things decide that, and every one of them has been changed by product
// in the last few days:
//   • it opens collapsed — the bar's resting state (per product: 用户进来的
//     时候是收起的);
//   • the host folds it when the community view switches tabs (`collapseSignal`)
//     and when the page scrolls;
//   • a pointer landing ANYWHERE on the bar opens it — including when the
//     caret never left the field, which is the case no focus event can cover;
//   • folding never clears what is already in the field.
//
// The fourth one is why this file exists. Scrolling folds the bar WITHOUT
// blurring the editor (deliberate — a blur would take the caret with it), so
// clicking the folded bar fires no focus event, and while `onFocus` was the
// only thing that could unfold it the bar could not be reopened at all. That
// bug is invisible to any test that reaches for `element.click()`.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { HomeHero } from '../../src/components/HomeHero';

afterEach(cleanup);

function heroProps(
  overrides: Partial<React.ComponentProps<typeof HomeHero>> = {},
): React.ComponentProps<typeof HomeHero> {
  return {
    prompt: '',
    onPromptChange: () => undefined,
    onSubmit: () => undefined,
    activePluginTitle: null,
    activeChipId: null,
    onClearActivePlugin: () => undefined,
    pluginOptions: [],
    pluginsLoading: false,
    pendingPluginId: null,
    pendingChipId: null,
    onPickPlugin: () => undefined,
    onPickChip: () => undefined,
    contextItemCount: 0,
    error: null,
    ...overrides,
  } as React.ComponentProps<typeof HomeHero>;
}

function renderDock(overrides: Partial<React.ComponentProps<typeof HomeHero>> = {}) {
  return render(<HomeHero {...heroProps({ variant: 'dock', collapseSignal: 0, ...overrides })} />);
}

/** The bar's own state, read off the section the CSS keys on. */
function collapsed(): boolean {
  return screen.getByTestId('home-hero').getAttribute('data-collapsed') === 'true';
}

/** The composer's grouping tray — the box the pointer handler sits on. */
function composerCard(): HTMLElement {
  return screen.getByTestId('home-hero-composer-card');
}

/** The card that owns `onFocus`. React 17+ maps onFocus to focusin, so the
 *  tests raise `focusIn` rather than `focus` — a bare `focus` event does not
 *  reach React's root listener. */
function inputCard(): HTMLElement {
  const card = composerCard().querySelector('.home-hero__input-card');
  if (!(card instanceof HTMLElement)) throw new Error('input card not rendered');
  return card;
}

describe('docked composer collapse contract', () => {
  it('opens collapsed, and only in the dock variant', () => {
    renderDock();
    expect(collapsed()).toBe(true);

    cleanup();
    // Home's own composer is never folded: `data-collapsed` is dock-only, so
    // the page hero must not carry it in any state.
    render(<HomeHero {...heroProps()} />);
    expect(screen.getByTestId('home-hero').hasAttribute('data-collapsed')).toBe(false);
  });

  it('unfolds on focus and folds again when the host bumps collapseSignal', () => {
    const { rerender } = renderDock();

    fireEvent.focusIn(inputCard());
    expect(collapsed()).toBe(false);

    // What a community tab change does: EntryShell counts up, HomeView passes
    // it through, the bar returns to its resting state.
    rerender(<HomeHero {...heroProps({ variant: 'dock', collapseSignal: 1 })} />);
    expect(collapsed()).toBe(true);
  });

  it('folds when the page scrolls', () => {
    renderDock();
    fireEvent.focusIn(inputCard());
    expect(collapsed()).toBe(false);

    // jsdom has no `.entry-main--scroll` pane, so this exercises the window
    // fallback the component binds alongside it.
    fireEvent.scroll(window);
    expect(collapsed()).toBe(true);
  });

  it('reopens on a pointer down even though the caret never left the field', () => {
    renderDock();

    fireEvent.focusIn(inputCard());
    fireEvent.scroll(window);
    expect(collapsed()).toBe(true);

    // The whole point: NO focus event here. A scroll folds the bar without
    // blurring the editor, so a user clicking back into a field they never
    // left produces a pointerdown and nothing else.
    fireEvent.pointerDown(inputCard());
    expect(collapsed()).toBe(false);
  });

  it('holds the bar open while focus moves to a control outside the input card', () => {
    // The 工作目录 trigger, the execution switcher and the pickers' panels are
    // SIBLINGS of the input card, one level up on the tray. While focus was
    // tracked on the input card alone, a click on any of them read as a blur:
    // on an empty field the carousel branch folded the bar, `display: none`
    // took the row away mid-click, and the panel never opened (per product:
    // 没有输入时点工作目录，面板没弹出，直接收起来了).
    renderDock({ onPickWorkingDir: () => undefined, workingDir: null, recentDirs: [] });

    fireEvent.focusIn(inputCard());
    expect(collapsed()).toBe(false);

    // What clicking the trigger actually raises: the editor gives focus up
    // toward the trigger, then the trigger takes it.
    const trigger = screen.getByTestId('working-dir-trigger');
    fireEvent.focusOut(inputCard(), { relatedTarget: trigger });
    fireEvent.focusIn(trigger);
    expect(collapsed()).toBe(false);

    // And leaving the bar entirely still folds it — the guard is `contains`,
    // not "never fold again".
    fireEvent.focusOut(composerCard(), { relatedTarget: document.body });
    expect(collapsed()).toBe(true);
  });

  it('stays folded when an untouched bar is pressed', () => {
    renderDock();

    fireEvent.pointerDown(screen.getByTestId('home-hero-submit'));

    // Clearing the host's fold is not the same as forcing the bar open: an
    // empty, unfocused composer is folded on its own account (the carousel
    // branch), and a pointer alone does not prise it open.
    //
    // The other half of the pointer handler — that pressing a CONTROL does not
    // hand the caret to the editor underneath it — is not assertable here:
    // Lexical's imperative focus is inert under jsdom, so removing the guard
    // leaves this file green. That guard is covered by the browser layer.
    expect(collapsed()).toBe(true);
  });

  it('keeps the draft when the host folds the bar', () => {
    const { rerender } = renderDock({ prompt: 'half-written brief' });

    fireEvent.focusIn(inputCard());
    rerender(<HomeHero {...heroProps({ variant: 'dock', collapseSignal: 1, prompt: 'half-written brief' })} />);

    expect(collapsed()).toBe(true);
    // Folded, the text is still in the bar — it rides along in the one-line
    // pill instead of being cleared.
    expect(composerCard().textContent).toContain('half-written brief');
  });
});
