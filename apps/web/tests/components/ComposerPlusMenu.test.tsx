// @vitest-environment jsdom

// Regression coverage for the shared composer "+" menu: how the popup and its
// submenu flyout are placed and clamped against the viewport, and which rows
// the menu does and does not surface.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { ComposerPlusMenu } from '../../src/components/ComposerPlusMenu';
import { I18nProvider } from '../../src/i18n';
import type { Locale } from '../../src/i18n/types';

afterEach(() => {
  cleanup();
});

// The working directory is the menu's only remaining submenu, so the flyout
// placement specs below drive it as their representative flyout.
const SUBMENU_LABEL = 'Working directory';
const SUBMENU_CONTENT = 'Choose folder';

function renderMenu(
  overrides: Partial<ComponentProps<typeof ComposerPlusMenu>> = {},
  options: { chatBoundary?: Pick<DOMRect, 'left' | 'right'> } = {},
) {
  const props: ComponentProps<typeof ComposerPlusMenu> = {
    onAttachFiles: vi.fn(),
    triggerTestId: 'plus-trigger',
    onPickWorkingDir: vi.fn(),
    ...overrides,
  };
  const view = render(
    <I18nProvider initial={'en' as Locale}>
      <div className={options.chatBoundary ? 'split-chat-slot' : undefined} data-testid="menu-host">
        <ComposerPlusMenu {...props} />
      </div>
    </I18nProvider>,
  );
  if (options.chatBoundary) {
    const host = screen.getByTestId('menu-host');
    host.getBoundingClientRect = () =>
      ({
        x: options.chatBoundary?.left ?? 0,
        y: 0,
        top: 0,
        left: options.chatBoundary?.left ?? 0,
        right: options.chatBoundary?.right ?? 0,
        bottom: 420,
        width: (options.chatBoundary?.right ?? 0) - (options.chatBoundary?.left ?? 0),
        height: 420,
        toJSON: () => ({}),
      }) as DOMRect;
  }
  return { props, ...view };
}

// A pick row cancels mousedown so focus stays on the editor; assert the
// dispatched mousedown event is defaultPrevented.
function expectPickRowPreventsMousedown(name: RegExp) {
  const row = screen.getByRole('menuitem', { name });
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  row.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
}

describe('ComposerPlusMenu placement', () => {
  it('portals the menu and constrains it to the available viewport height', async () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 280 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 420 });

    try {
      renderMenu();
      const trigger = screen.getByTestId('plus-trigger') as HTMLButtonElement;
      trigger.getBoundingClientRect = () =>
        ({
          x: 8,
          y: 376,
          top: 376,
          left: 8,
          right: 36,
          bottom: 404,
          width: 28,
          height: 28,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.click(trigger);

      const menu = screen.getByRole('menu');
      expect(menu.parentElement).toBe(document.body);
      expect(menu.style.left).toBe('12px');
      expect(menu.style.width).toBe('190px');
      expect(menu.style.maxHeight).toBe('356px');
      expect(menu.style.top).toBe('auto');
      expect(menu.style.bottom).toBe('52px');
      expect(screen.getByRole('menuitem', { name: new RegExp(SUBMENU_LABEL, 'i') })).toBeTruthy();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  it('can open downward for the home surface even when there is enough room above', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });

    try {
      renderMenu({ placementPreference: 'down' });
      const trigger = screen.getByTestId('plus-trigger') as HTMLButtonElement;
      trigger.getBoundingClientRect = () =>
        ({
          x: 280,
          y: 320,
          top: 320,
          left: 280,
          right: 312,
          bottom: 352,
          width: 32,
          height: 32,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.click(trigger);

      const menu = screen.getByRole('menu');
      expect(menu.style.top).toBe('360px');
      expect(menu.style.bottom).toBe('auto');
      expect(menu.style.width).toBe('190px');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  it('opens flyouts to the left when the right edge would overflow', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 420 });

    try {
      renderMenu();
      const trigger = screen.getByTestId('plus-trigger') as HTMLButtonElement;
      trigger.getBoundingClientRect = () =>
        ({
          x: 620,
          y: 376,
          top: 376,
          left: 620,
          right: 648,
          bottom: 404,
          width: 28,
          height: 28,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.click(trigger);
      const menu = screen.getByRole('menu');
      expect(menu.className).toContain('plus-menu__popup--flyout-left');

      fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(SUBMENU_LABEL, 'i') }));
      expect(screen.getByText(SUBMENU_CONTENT)).toBeTruthy();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  it('contains flyouts inside the menu when neither side has enough room', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 420 });

    try {
      renderMenu();
      const trigger = screen.getByTestId('plus-trigger') as HTMLButtonElement;
      trigger.getBoundingClientRect = () =>
        ({
          x: 220,
          y: 376,
          top: 376,
          left: 220,
          right: 248,
          bottom: 404,
          width: 28,
          height: 28,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.click(trigger);
      const menu = screen.getByRole('menu');
      expect(menu.className).toContain('plus-menu__popup--flyout-contained');

      fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(SUBMENU_LABEL, 'i') }));
      expect(screen.getByText(SUBMENU_CONTENT)).toBeTruthy();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  it('contains flyouts inside the menu when the chat pane clips the right side', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 640 });

    try {
      renderMenu({}, { chatBoundary: { left: 0, right: 460 } });
      const trigger = screen.getByTestId('plus-trigger') as HTMLButtonElement;
      trigger.getBoundingClientRect = () =>
        ({
          x: 24,
          y: 576,
          top: 576,
          left: 24,
          right: 52,
          bottom: 604,
          width: 28,
          height: 28,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.click(trigger);
      const menu = screen.getByRole('menu');
      expect(menu.className).toContain('plus-menu__popup--flyout-contained');

      fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(SUBMENU_LABEL, 'i') }));
      expect(screen.getByText(SUBMENU_CONTENT)).toBeTruthy();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  it('limits flyout height to the visible viewport below the hovered row', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 520 });

    try {
      renderMenu();
      const trigger = screen.getByTestId('plus-trigger') as HTMLButtonElement;
      trigger.getBoundingClientRect = () =>
        ({
          x: 24,
          y: 468,
          top: 468,
          left: 24,
          right: 52,
          bottom: 496,
          width: 28,
          height: 28,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.click(trigger);
      const submenuParent = screen.getByRole('menuitem', { name: new RegExp(SUBMENU_LABEL, 'i') });
      const submenuRow = submenuParent.closest('.plus-menu__submenu-row') as HTMLDivElement;
      submenuRow.getBoundingClientRect = () =>
        ({
          x: 24,
          y: 210,
          top: 210,
          left: 24,
          right: 214,
          bottom: 242,
          width: 190,
          height: 32,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.click(submenuParent);

      const menu = screen.getAllByRole('menu')[0];
      expect(menu).toBeDefined();
      expect(menu?.className).toContain('plus-menu__popup--flyout-y-down');
      expect(menu?.style.getPropertyValue('--plus-menu-flyout-max-height')).toBe('303px');
      expect(screen.getByText(SUBMENU_CONTENT)).toBeTruthy();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  it('opens low flyouts upward when the hovered row is near the viewport bottom', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 520 });

    try {
      renderMenu();
      const trigger = screen.getByTestId('plus-trigger') as HTMLButtonElement;
      trigger.getBoundingClientRect = () =>
        ({
          x: 24,
          y: 468,
          top: 468,
          left: 24,
          right: 52,
          bottom: 496,
          width: 28,
          height: 28,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.click(trigger);
      const submenuParent = screen.getByRole('menuitem', { name: new RegExp(SUBMENU_LABEL, 'i') });
      const submenuRow = submenuParent.closest('.plus-menu__submenu-row') as HTMLDivElement;
      submenuRow.getBoundingClientRect = () =>
        ({
          x: 24,
          y: 330,
          top: 330,
          left: 24,
          right: 214,
          bottom: 362,
          width: 190,
          height: 32,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.click(submenuParent);

      const menu = screen.getAllByRole('menu')[0];
      expect(menu).toBeDefined();
      expect(menu?.className).toContain('plus-menu__popup--flyout-y-up');
      expect(menu?.style.getPropertyValue('--plus-menu-flyout-max-height')).toBe('320px');
      expect(screen.getByText(SUBMENU_CONTENT)).toBeTruthy();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  // Acceptance #50, part 2: hovering a submenu row must open its flyout right
  // next to that row. Writing viewport coordinates into the flyout's inline
  // style is the bug — the stylesheet positions it `position: absolute;
  // left: 100%` inside the row, so a viewport-space `left` is re-anchored to
  // the row's own left edge and throws the panel across the screen.
  it('leaves submenu flyout placement to the stylesheet instead of viewport-space inline coords', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });

    try {
      renderMenu({ placementPreference: 'down' });
      const trigger = screen.getByTestId('plus-trigger') as HTMLButtonElement;
      trigger.getBoundingClientRect = () =>
        ({
          x: 369,
          y: 548,
          top: 548,
          left: 369,
          right: 405,
          bottom: 584,
          width: 36,
          height: 36,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.click(trigger);

      const submenuParent = screen.getByRole('menuitem', { name: new RegExp(SUBMENU_LABEL, 'i') });
      const submenuRow = submenuParent.closest('.plus-menu__submenu-row') as HTMLDivElement;
      submenuRow.getBoundingClientRect = () =>
        ({
          x: 375,
          y: 800,
          top: 800,
          left: 375,
          right: 571,
          bottom: 828,
          width: 196,
          height: 28,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.click(submenuParent);

      const menu = screen.getAllByRole('menu')[0];
      expect(menu?.className).toContain('plus-menu__popup--flyout-right');

      const flyout = document.querySelector<HTMLElement>('.plus-menu__flyout');
      expect(flyout).not.toBeNull();
      // No inline geometry at all: side, offset and width all come from
      // plus-menu.css, which anchors the flyout to its parent row.
      expect(flyout?.style.left).toBe('');
      expect(flyout?.style.right).toBe('');
      expect(flyout?.style.top).toBe('');
      expect(flyout?.style.bottom).toBe('');
      expect(flyout?.style.width).toBe('');

      const css = readFileSync(join(process.cwd(), 'src/styles/home/plus-menu.css'), 'utf8');
      expect(css).toContain('.plus-menu__submenu-row {\n  position: relative;\n}');
      expect(css).toContain('.plus-menu__flyout {\n  position: absolute;\n  left: 100%;');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  // Acceptance #50, part 1: the popup uses `overflow: visible` so its side
  // flyouts can escape, which means a stack taller than the room under the
  // trigger spills off the viewport with no way to scroll it back. The
  // surface's `down` preference must therefore yield to the measured height.
  it('flips a down-preferred menu upward when the measured stack cannot fit below', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    const scrollHeightDescriptor = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollHeight',
    );
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    // jsdom never lays out, so stand in for a real 9-row stack.
    Object.defineProperty(Element.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return (this as Element).classList.contains('plus-menu__popup') ? 418 : 0;
      },
    });

    try {
      renderMenu({ placementPreference: 'down' });
      const trigger = screen.getByTestId('plus-trigger') as HTMLButtonElement;
      // The real 1440x900 home composer: 296px below, 528px above.
      trigger.getBoundingClientRect = () =>
        ({
          x: 369,
          y: 548,
          top: 548,
          left: 369,
          right: 405,
          bottom: 584,
          width: 36,
          height: 36,
          toJSON: () => ({}),
        }) as DOMRect;

      fireEvent.click(trigger);

      const menu = screen.getAllByRole('menu')[0] as HTMLElement;
      expect(menu.style.top).toBe('auto');
      expect(menu.style.bottom).toBe('360px');
      // 528px of headroom — the whole stack is reachable without scrolling.
      expect(menu.style.maxHeight).toBe('528px');
    } finally {
      if (scrollHeightDescriptor) {
        Object.defineProperty(Element.prototype, 'scrollHeight', scrollHeightDescriptor);
      }
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });
});

// Usability guard (user request): every module offered by the "+" menu must be
// wired to a working handler, not just rendered. These tests open the menu and
// click each row — direct items and every submenu's pick + "Add …" row — and
// assert the corresponding callback fires. A row that renders but no longer
// calls its handler (a refactor dropping the onClick, a mis-wired prop) turns
// this red.
describe('ComposerPlusMenu module wiring', () => {
  function openMenu() {
    fireEvent.click(screen.getByTestId('plus-trigger'));
  }

  it('invokes each direct row handler', () => {
    const { props } = renderMenu({
      onReferenceProject: vi.fn(),
      onLinkLocalCode: vi.fn(),
      onImportFigma: vi.fn(),
      onShowFigmaHelp: vi.fn(),
    });

    // Each row closes the menu, so re-open before clicking the next one.
    const clickRow = (testId: string) => {
      openMenu();
      fireEvent.click(screen.getByTestId(testId));
    };

    // Reference-project / local-code moved under the working-dir group, so the
    // row that opens them is the group, not the popup's top level.
    const clickWorkingDirRow = (testId: string) => {
      openMenu();
      fireEvent.click(screen.getByTestId('composer-plus-working-dir'));
      fireEvent.click(screen.getByTestId(testId));
    };

    clickRow('composer-plus-attach');
    expect(props.onAttachFiles).toHaveBeenCalledTimes(1);

    clickWorkingDirRow('composer-plus-reference-project');
    expect(props.onReferenceProject).toHaveBeenCalledTimes(1);

    clickWorkingDirRow('composer-plus-local-code');
    expect(props.onLinkLocalCode).toHaveBeenCalledTimes(1);

    clickRow('composer-plus-figma');
    expect(props.onImportFigma).toHaveBeenCalledTimes(1);
  });

  // The "+" menu lists things to ATTACH to the message. 「查看方法」 (the .fig
  // download guide) was a help article wedged into that list, so it is gone —
  // even when a caller still passes the handler, which both composers do.
  it('does not offer the Figma help article as a row', () => {
    renderMenu({
      onImportFigma: vi.fn(),
      onShowFigmaHelp: vi.fn(),
    });
    openMenu();

    expect(screen.queryByTestId('composer-plus-figma-help')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Learn how/i })).toBeNull();
    // The import row it sat beside is untouched.
    expect(screen.getByTestId('composer-plus-figma')).toBeTruthy();
  });

  // Skills and design systems are deliberately NOT "+" menu rows: skills are
  // picked through the composer's `@` mention popover and the design system
  // through the picker already sitting in the same composer footer. Both used
  // to be duplicated here, which pushed the stack past the viewport (#50).
  it('does not duplicate the skills or design-system surfaces as rows', () => {
    renderMenu({
      skills: [{ id: 's1', name: 'Wireframe Kit', description: 'Skill fixture.' } as never],
      onPickSkill: vi.fn(),
      onOpenDesignSystems: vi.fn(),
    });
    openMenu();
    expect(screen.queryByTestId('composer-plus-skills')).toBeNull();
    expect(screen.queryByTestId('composer-plus-design-system')).toBeNull();
  });

  it('renders the working-directory submenu when a picker handler is provided', () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(SUBMENU_LABEL, 'i') }));
    expect(screen.getByText(SUBMENU_CONTENT)).toBeTruthy();
  });

  it('does not surface connector or MCP rows', () => {
    renderMenu();
    openMenu();
    expect(screen.queryByTestId('composer-plus-connectors')).toBeNull();
    expect(screen.queryByTestId('composer-plus-mcp')).toBeNull();
  });
});
