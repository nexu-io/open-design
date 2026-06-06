// @vitest-environment jsdom

// Regression coverage for the shared composer "+" menu (replaces the deleted
// ChatComposer.tools-menu-caret.test.tsx, #3195): the connector / plugin / MCP
// pick rows must cancel `mousedown` so the editor keeps focus and the caller's
// insertMention lands at the caret instead of the draft end.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { ComposerPlusMenu } from '../../src/components/ComposerPlusMenu';
import { computeComposerPlusFlyoutPosition } from '../../src/components/composerPlusFlyoutPosition';
import { I18nProvider } from '../../src/i18n';
import type { Locale } from '../../src/i18n/types';

afterEach(() => {
  cleanup();
});

const CONNECTOR = { id: 'c1', name: 'Notion', status: 'connected' } as never;
const PLUGIN = { id: 'p1', title: 'Deck Maker', manifest: {} } as never;
const MCP_SERVER = { id: 'm1', label: 'Linear', enabled: true } as never;

function renderMenu(overrides: Partial<ComponentProps<typeof ComposerPlusMenu>> = {}) {
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
  render(
    <I18nProvider initial={'en' as Locale}>
      <ComposerPlusMenu {...props} />
    </I18nProvider>,
  );
  return props;
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

  it('renders the design toolbox flyout as a viewport-aware fixed layer', () => {
    renderMenu({
      renderToolbox: () => (
        <div
          className="composer-design-toolbox-menu"
          data-testid="design-toolbox-panel"
        >
          Design toolbox content
        </div>
      ),
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 420 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 });

    fireEvent.click(screen.getByTestId('plus-trigger'));
    const row = screen.getByRole('menuitem', { name: /Design toolbox/i });
    Object.defineProperty(row.parentElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 250,
        right: 390,
        bottom: 282,
        left: 250,
        width: 140,
        height: 32,
        x: 250,
        y: 250,
        toJSON: () => ({}),
      }),
    });

    fireEvent.mouseEnter(row.parentElement!);

    const floatingFlyout = document.querySelector<HTMLElement>(
      '[data-plus-menu-floating="true"]',
    );
    expect(floatingFlyout).toBeTruthy();
    expect(floatingFlyout?.style.position).toBe('fixed');
    expect(floatingFlyout?.dataset.placement).toBe('left');
    expect(parseFloat(floatingFlyout?.style.top ?? '0')).toBeLessThan(250);
    expect(
      screen.getByTestId('plus-trigger').closest('.plus-menu')?.contains(floatingFlyout),
    ).toBe(false);
    expect(floatingFlyout?.contains(screen.getByTestId('design-toolbox-panel'))).toBe(
      true,
    );
  });
});

describe('computeComposerPlusFlyoutPosition', () => {
  it('keeps oversized flyouts inside narrow viewports', () => {
    const position = computeComposerPlusFlyoutPosition(
      { top: 140, right: 176, bottom: 172, left: 28 },
      { width: 360, height: 320 },
      { width: 180, height: 160 },
    );

    expect(position.left).toBeGreaterThanOrEqual(8);
    expect(position.left + position.width).toBeLessThanOrEqual(172);
    expect(position.top).toBeGreaterThanOrEqual(8);
    expect(position.top + position.maxHeight).toBeLessThanOrEqual(152);
  });
});
