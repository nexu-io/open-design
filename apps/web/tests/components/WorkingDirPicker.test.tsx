// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WorkingDirPicker } from '../../src/components/WorkingDirPicker';
import { I18nProvider, type Locale } from '../../src/i18n';

afterEach(() => {
  cleanup();
});

function renderPicker(overrides: Partial<ComponentProps<typeof WorkingDirPicker>> = {}) {
  const props: ComponentProps<typeof WorkingDirPicker> = {
    workingDir: null,
    recentDirs: [],
    onPickDirectory: vi.fn(),
    onSelectRecent: vi.fn(),
    ...overrides,
  };
  render(
    <I18nProvider initial={'en' as Locale}>
      <WorkingDirPicker {...props} />
    </I18nProvider>,
  );
  return props;
}

describe('WorkingDirPicker recent folders submenu', () => {
  // With nothing to list, the submenu row used to render anyway and open onto
  // a faint "No recent folders" line — a menu whose only content was that it
  // was empty.
  it('does not render the submenu row when there are no recent folders', () => {
    renderPicker();

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    expect(screen.getByTestId('working-dir-panel')).toBeTruthy();
    expect(screen.getByTestId('working-dir-pick')).toBeTruthy();
    expect(screen.queryByTestId('working-dir-recent')).toBeNull();
    expect(screen.queryByTestId('working-dir-recent-list')).toBeNull();
  });

  it('lists the recent folders in the submenu once there are some', () => {
    const props = renderPicker({ recentDirs: ['/Users/me/work/site', '/Users/me/work/deck'] });

    fireEvent.click(screen.getByTestId('working-dir-trigger'));
    const row = screen.getByTestId('working-dir-recent');
    expect(row.textContent).toContain('Recent folders');

    fireEvent.click(row);
    const list = screen.getByTestId('working-dir-recent-list');
    const items = list.querySelectorAll('[role="menuitem"]');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('site');
    expect(items[1]?.textContent).toContain('deck');

    fireEvent.click(items[1]!);
    expect(props.onSelectRecent).toHaveBeenCalledWith('/Users/me/work/deck');
    expect(screen.queryByTestId('working-dir-panel')).toBeNull();
  });
});
