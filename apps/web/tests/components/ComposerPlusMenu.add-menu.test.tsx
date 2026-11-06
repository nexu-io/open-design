// @vitest-environment jsdom

// OPEND-3085: the shared composer Add menu ("+") follows the Demo on both the
// home hero and the project composer — one plus glyph on the trigger, a
// paperclip on the attach row, the project context actions right below it,
// and the resource submenus rendered only for callers that wire them up.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { ComposerPlusMenu } from '../../src/components/ComposerPlusMenu';
import { Icon, type IconName } from '../../src/components/Icon';
import { I18nProvider } from '../../src/i18n';
import type { Locale } from '../../src/i18n/types';

/** Path data of the shared `<Icon>` glyph, to compare against a rendered row. */
function sharedIconPaths(name: IconName, size: number): Array<string | null> {
  const { container, unmount } = render(<Icon name={name} size={size} />);
  const paths = Array.from(container.querySelectorAll('path')).map((p) => p.getAttribute('d'));
  unmount();
  return paths;
}

function pathsOf(svg: Element | null | undefined): Array<string | null> {
  return Array.from(svg?.querySelectorAll('path') ?? []).map((p) => p.getAttribute('d'));
}

afterEach(() => {
  cleanup();
});

const CONNECTOR = { id: 'c1', name: 'Notion', status: 'connected' } as never;
const PLUGIN = { id: 'p1', title: 'Deck Maker', manifest: {} } as never;
const MCP_SERVER = { id: 'm1', label: 'Linear', enabled: true } as never;

const SOURCE = readFileSync(
  join(process.cwd(), 'src/components/ComposerPlusMenu.tsx'),
  'utf8',
);

function renderMenu(overrides: Partial<ComponentProps<typeof ComposerPlusMenu>> = {}) {
  const props: ComponentProps<typeof ComposerPlusMenu> = {
    onAttachFiles: vi.fn(),
    triggerTestId: 'plus-trigger',
    ...overrides,
  };
  return { props, ...render(
    <I18nProvider initial={'en' as Locale}>
      <ComposerPlusMenu {...props} />
    </I18nProvider>,
  ) };
}

function fullMenuProps(): Partial<ComponentProps<typeof ComposerPlusMenu>> {
  return {
    connectors: [CONNECTOR],
    onPickConnector: vi.fn(),
    onAddConnector: vi.fn(),
    plugins: [PLUGIN],
    onPickPlugin: vi.fn(),
    onAddPlugin: vi.fn(),
    mcpServers: [MCP_SERVER],
    onPickMcp: vi.fn(),
    onAddMcp: vi.fn(),
    onReferenceProject: vi.fn(),
    onLinkLocalCode: vi.fn(),
    onImportFigma: vi.fn(),
  };
}

function openMenu(): HTMLElement {
  fireEvent.click(screen.getByTestId('plus-trigger'));
  return screen.getAllByRole('menu')[0] as HTMLElement;
}

/** Test ids of the popup's top-level rows, in DOM order. */
function topLevelRowIds(menu: HTMLElement): Array<string | null> {
  return Array.from(
    menu.querySelectorAll<HTMLElement>(
      ':scope > .plus-menu__item, :scope > .plus-menu__submenu-row > .plus-menu__parent',
    ),
  ).map((row) => row.getAttribute('data-testid'));
}

describe('ComposerPlusMenu trigger', () => {
  it('renders the shared plus glyph as a bare disc with the Add tooltip on every surface', () => {
    renderMenu();
    const trigger = screen.getByTestId('plus-trigger');
    // The Demo trigger owns its own geometry through `.plus-menu__trigger`
    // instead of borrowing the chat toolbar's generic `icon-btn` sizing.
    expect(trigger.classList.contains('icon-btn')).toBe(false);
    expect(trigger.classList.contains('plus-menu__trigger')).toBe(true);
    expect(trigger.getAttribute('title')).toBe('Add context');
    const glyph = trigger.querySelector('svg.od-icon');
    expect(glyph).not.toBeNull();
    expect(glyph?.getAttribute('width')).toBe('16');
    // The shared `<Icon name="plus">` (Remix add-line), not the chat-panel
    // outline plus (`ChatPlusIcon`, a single `M12 5v14M5 12h14` stroke).
    expect(pathsOf(glyph)).toEqual(sharedIconPaths('plus', 16));
    expect(pathsOf(glyph)).not.toEqual(['M12 5v14M5 12h14']);
  });

  it('has no per-caller glyph switch or toolbox flyout left in the component', () => {
    expect(SOURCE).not.toContain('strokeGlyph');
    expect(SOURCE).not.toContain('ChatPlusIcon');
    expect(SOURCE).not.toContain('renderToolbox');
    expect(SOURCE).not.toContain('toolboxLabel');
    expect(SOURCE).not.toMatch(/PlusMenuSubmenu = [^;]*'toolbox'/);
  });
});

describe('ComposerPlusMenu rows', () => {
  it('shows the paperclip on the attach row and a spinner while uploading', () => {
    const { rerender, props } = renderMenu();
    openMenu();
    const attachIcon = screen.getByTestId('composer-plus-attach').querySelector('svg');
    expect(attachIcon?.classList.contains('icon-spin')).toBe(false);
    expect(pathsOf(attachIcon)).toEqual(sharedIconPaths('attach', 15));
    expect(pathsOf(attachIcon)).not.toEqual(sharedIconPaths('plus', 15));

    rerender(
      <I18nProvider initial={'en' as Locale}>
        <ComposerPlusMenu {...props} attachLoading />
      </I18nProvider>,
    );
    const loadingIcon = screen.getByTestId('composer-plus-attach').querySelector('svg');
    expect(loadingIcon?.classList.contains('icon-spin')).toBe(true);
  });

  it('lists the Demo order when no working-directory picker is wired', () => {
    renderMenu(fullMenuProps());
    const menu = openMenu();
    expect(topLevelRowIds(menu)).toEqual([
      'composer-plus-attach',
      'composer-plus-reference-project',
      'composer-plus-local-code',
      'composer-plus-plugins',
      'composer-plus-figma',
      'composer-plus-connectors',
      'composer-plus-mcp',
    ]);
    expect(screen.queryByTestId('composer-plus-working-dir')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Design toolbox/i })).toBeNull();
  });

  it('keeps the context actions inside the working-directory group when a picker is wired', () => {
    renderMenu({ ...fullMenuProps(), onPickWorkingDir: vi.fn() });
    const menu = openMenu();
    expect(topLevelRowIds(menu)).toEqual([
      'composer-plus-attach',
      'composer-plus-plugins',
      'composer-plus-figma',
      'composer-plus-connectors',
      'composer-plus-mcp',
      'composer-plus-working-dir',
    ]);
    expect(screen.queryByTestId('composer-plus-reference-project')).toBeNull();

    fireEvent.click(screen.getByTestId('composer-plus-working-dir'));
    expect(screen.getByTestId('composer-plus-working-dir-pick')).toBeTruthy();
    expect(screen.getByTestId('composer-plus-reference-project')).toBeTruthy();
    expect(screen.getByTestId('composer-plus-local-code')).toBeTruthy();
  });

  it('omits the plugin, connector, and MCP rows whose pick handlers are absent', () => {
    renderMenu();
    openMenu();
    expect(screen.queryByTestId('composer-plus-plugins')).toBeNull();
    expect(screen.queryByTestId('composer-plus-connectors')).toBeNull();
    expect(screen.queryByTestId('composer-plus-mcp')).toBeNull();

    cleanup();
    renderMenu({ connectors: [CONNECTOR], onPickConnector: vi.fn() });
    openMenu();
    expect(screen.getByTestId('composer-plus-connectors')).toBeTruthy();
    expect(screen.queryByTestId('composer-plus-plugins')).toBeNull();
    expect(screen.queryByTestId('composer-plus-mcp')).toBeNull();
  });

  it('ends each resource submenu with a divider and its "Add …" row', () => {
    const { props } = renderMenu(fullMenuProps());
    openMenu();
    fireEvent.click(screen.getByTestId('composer-plus-plugins'));
    const pluginFlyout = document.querySelector('.plus-menu__flyout--plugins') as HTMLElement;
    expect(pluginFlyout).not.toBeNull();
    expect(pluginFlyout.querySelector('input[aria-label="Plugins"]')).not.toBeNull();
    expect(pluginFlyout.querySelector('.plus-menu__preview')).not.toBeNull();
    expect(pluginFlyout.querySelector('.plus-menu__divider')).not.toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add plugin' }));
    expect(props.onAddPlugin).toHaveBeenCalledTimes(1);

    openMenu();
    fireEvent.click(screen.getByTestId('composer-plus-connectors'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add connectors' }));
    expect(props.onAddConnector).toHaveBeenCalledTimes(1);

    openMenu();
    fireEvent.click(screen.getByTestId('composer-plus-mcp'));
    expect(screen.getByPlaceholderText('MCP')).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add MCP server' }));
    expect(props.onAddMcp).toHaveBeenCalledTimes(1);
  });
});
