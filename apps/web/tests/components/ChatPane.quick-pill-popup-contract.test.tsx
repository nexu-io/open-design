// @vitest-environment jsdom
//
// The 插件 / 设计百宝箱 quick pills above the composer input open the standalone
// `role="menu"` popovers in ChatComposer. They replaced rows that used to live
// in ComposerPlusMenu, but arrived without that surface's keyboard/AT contract:
// no `aria-haspopup` / `aria-expanded` on the pill, no Escape handler, and no
// focus return — so Escape pressed inside the plugin search did nothing and
// keyboard users could not tell the popup was open.
//
// This pins the contract ComposerPlusMenu already ships (`aria-haspopup="menu"`
// plus `aria-expanded`, Escape closes) and the focus return the pills need on
// top of it: the popovers move focus inside themselves, so closing has to hand
// it back to the pill that opened them.

// jsdom has no HTMLElement.scrollTo; ChatPane's log calls it on mount.
if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function () {};
}

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';

function renderChatPane() {
  return render(
    <ChatPane
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={() => {}}
      onStop={() => {}}
      conversations={[]}
      activeConversationId={null}
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
    />,
  );
}

function pill(which: 'plugins' | 'toolbox'): HTMLElement {
  return screen.getByTestId(`next-step-quick-pill-${which}`);
}

function standalonePopup(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.composer-toolbox-standalone-popup');
}

afterEach(() => {
  cleanup();
});

describe.each([
  { which: 'plugins' as const, label: '插件' },
  { which: 'toolbox' as const, label: '设计百宝箱' },
])('composer quick pill popup contract — $label', ({ which }) => {
  it('advertises the menu it owns and flips expanded as it opens', () => {
    renderChatPane();
    const trigger = pill(which);

    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      fireEvent.click(trigger);
    });

    expect(standalonePopup()).not.toBeNull();
    expect(pill(which).getAttribute('aria-expanded')).toBe('true');
  });

  it('closes on Escape from inside the menu and returns focus to the pill', () => {
    renderChatPane();
    const trigger = pill(which);

    act(() => {
      fireEvent.click(trigger);
    });
    const popup = standalonePopup();
    expect(popup).not.toBeNull();

    // Focus starts inside the popover (the plugin pane autofocuses its search
    // box), which is exactly why the close path has to restore it.
    act(() => {
      popup!.focus();
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(standalonePopup()).toBeNull();
    expect(pill(which).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(pill(which));
  });

  it('returns focus to the pill when the backdrop dismisses the menu', () => {
    renderChatPane();

    act(() => {
      fireEvent.click(pill(which));
    });
    const backdrop = document.querySelector<HTMLElement>('.composer-toolbox-standalone-backdrop');
    expect(backdrop).not.toBeNull();

    act(() => {
      fireEvent.click(backdrop!);
    });

    expect(standalonePopup()).toBeNull();
    expect(document.activeElement).toBe(pill(which));
  });
});
