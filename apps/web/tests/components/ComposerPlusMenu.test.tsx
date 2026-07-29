// @vitest-environment jsdom

// Regression coverage for the shared composer "+" menu (replaces the deleted
// ChatComposer.tools-menu-caret.test.tsx, #3195): the connector / plugin / MCP
// pick rows must cancel `mousedown` so the editor keeps focus and the caller's
// insertMention lands at the caret instead of the draft end.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { ComposerPlusMenu } from '../../src/components/ComposerPlusMenu';
import { I18nProvider } from '../../src/i18n';
import type { Locale } from '../../src/i18n/types';

afterEach(() => {
  cleanup();
});

const CONNECTOR = { id: 'c1', name: 'Notion', status: 'connected' } as never;
const PLUGIN = { id: 'p1', title: 'Deck Maker', manifest: {} } as never;
const MCP_SERVER = { id: 'm1', label: 'Linear', enabled: true } as never;

function renderMenu(
  overrides: Partial<ComponentProps<typeof ComposerPlusMenu>> = {},
  options: { chatBoundary?: Pick<DOMRect, 'left' | 'right'> } = {},
) {
  const props: ComponentProps<typeof ComposerPlusMenu> = {
    connectors: [CONNECTOR],
    onPickConnector: vi.fn(),
    plugins: [PLUGIN],
    onPickPlugin: vi.fn(),
    mcpServers: [MCP_SERVER],
    onPickMcp: vi.fn(),
    onAttachFiles: vi.fn(),
    triggerTestId: 'plus-trigger',
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

describe('ComposerPlusMenu pick-row caret protection', () => {
  it('cancels mousedown on the connector / plugin / MCP pick rows', () => {
    renderMenu();
    fireEvent.click(screen.getByTestId('plus-trigger'));

    fireEvent.click(screen.getByRole('menuitem', { name: /Connectors/i }));
    expectPickRowPreventsMousedown(/Notion/i);

    fireEvent.click(screen.getByRole('menuitem', { name: /Plugins/i }));
    expectPickRowPreventsMousedown(/Deck Maker/i);

    fireEvent.click(screen.getByRole('menuitem', { name: /^MCP/i }));
    expectPickRowPreventsMousedown(/Linear/i);
  });

  it('resets the shared search query when switching submenus', () => {
    renderMenu();
    fireEvent.click(screen.getByTestId('plus-trigger'));

    fireEvent.click(screen.getByRole('menuitem', { name: /Plugins/i }));
    const pluginSearch = screen.getByPlaceholderText('Plugins') as HTMLInputElement;
    fireEvent.change(pluginSearch, { target: { value: 'deck' } });
    expect(pluginSearch.value).toBe('deck');

    // Moving to the MCP submenu must clear the query so it doesn't cross-filter.
    fireEvent.click(screen.getByRole('menuitem', { name: /^MCP/i }));
    const mcpSearch = screen.getByPlaceholderText('MCP') as HTMLInputElement;
    expect(mcpSearch.value).toBe('');
    expect(screen.getByText('Linear')).toBeTruthy();
  });

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
      expect(screen.getByRole('menuitem', { name: /Connectors/i })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: /Plugins/i })).toBeTruthy();
      expect(screen.getByRole('menuitem', { name: /^MCP/i })).toBeTruthy();
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

      fireEvent.click(screen.getByRole('menuitem', { name: /Plugins/i }));
      expect(screen.getByRole('menuitem', { name: /Deck Maker/i })).toBeTruthy();
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

      fireEvent.click(screen.getByRole('menuitem', { name: /Plugins/i }));
      expect(screen.getByRole('menuitem', { name: /Deck Maker/i })).toBeTruthy();
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

      fireEvent.click(screen.getByRole('menuitem', { name: /Plugins/i }));
      expect(screen.getByRole('menuitem', { name: /Deck Maker/i })).toBeTruthy();
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
      const pluginParent = screen.getByRole('menuitem', { name: /Plugins/i });
      const pluginRow = pluginParent.closest('.plus-menu__submenu-row') as HTMLDivElement;
      pluginRow.getBoundingClientRect = () =>
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

      fireEvent.click(pluginParent);

      const menu = screen.getAllByRole('menu')[0];
      expect(menu).toBeDefined();
      expect(menu?.className).toContain('plus-menu__popup--flyout-y-down');
      expect(menu?.style.getPropertyValue('--plus-menu-flyout-max-height')).toBe('303px');
      expect(screen.getByRole('menuitem', { name: /Deck Maker/i })).toBeTruthy();
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
      renderMenu({
        toolboxLabel: 'Design toolbox',
        renderToolbox: () => <div>Toolbox content</div>,
      });
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
      const toolboxParent = screen.getByRole('menuitem', { name: /Design toolbox/i });
      const toolboxRow = toolboxParent.closest('.plus-menu__submenu-row') as HTMLDivElement;
      toolboxRow.getBoundingClientRect = () =>
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

      fireEvent.click(toolboxParent);

      const menu = screen.getAllByRole('menu')[0];
      expect(menu).toBeDefined();
      expect(menu?.className).toContain('plus-menu__popup--flyout-y-up');
      expect(menu?.style.getPropertyValue('--plus-menu-flyout-max-height')).toBe('320px');
      expect(screen.getByText('Toolbox content')).toBeTruthy();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });

  it('keeps contained design toolbox flyouts within the popup width', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 420 });

    try {
      renderMenu({
        toolboxLabel: 'Design toolbox',
        renderToolbox: () => (
          <div className="composer-design-toolbox-menu">Contained toolbox</div>
        ),
      });
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

      fireEvent.click(screen.getByRole('menuitem', { name: /Design toolbox/i }));
      expect(screen.getByText('Contained toolbox')).toBeTruthy();

      const css = readFileSync(join(process.cwd(), 'src/styles/home/plus-menu.css'), 'utf8');
      expect(css).toContain('.plus-menu__popup--flyout-contained .plus-menu__flyout .composer-design-toolbox-menu');
      expect(css).toContain('width: 100%;');
      expect(css).toContain('max-width: 100%;');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    }
  });
});
