// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrimaryNavigationRail } from '../../src/components/PrimaryNavigationRail';
import { I18nProvider } from '../../src/i18n';

afterEach(cleanup);

describe('shared primary navigation', () => {
  it.each(['flow', 'overlay'] as const)('owns settings and the account slot in %s placement', (placement) => {
    const onOpenSettings = vi.fn();
    const accountHostRef = vi.fn();
    render(<I18nProvider initial="en"><PrimaryNavigationRail view={null} context={null}
      placement={placement} onHome={vi.fn()} onViewChange={vi.fn()}
      onOpenSettings={onOpenSettings} settingsActive accountHostRef={accountHostRef} /></I18nProvider>);
    const footer = screen.getByTestId('primary-navigation-footer');
    const settings = screen.getByTestId('entry-settings-button');
    // Settings sits directly under 插件, not in the footer with the account.
    expect(footer.contains(settings)).toBe(false);
    expect(settings.previousElementSibling).toBe(screen.getByTestId('entry-nav-plugins'));
    expect(settings).toHaveAttribute('aria-current', 'page');
    expect(settings).toHaveAttribute('data-tooltip');
    expect(settings).toHaveAttribute('data-tooltip-tone', 'inverse');
    fireEvent.click(settings);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    // A click event must not become the parent callback's settings section.
    expect(onOpenSettings).toHaveBeenCalledWith();
    expect(accountHostRef).toHaveBeenCalledWith(screen.getByTestId('primary-navigation-account-host'));
  });
  it.each([null, 'personal', 'team'] as const)('keeps destinations consistent across page placements for %s', (workspaceType) => {
    const context = workspaceType ? { workspaceType } as WorkspaceCollabContext : null;
    render(
      <I18nProvider initial="en">
        <PrimaryNavigationRail view="home" context={context} onHome={vi.fn()} onViewChange={vi.fn()} />
        <PrimaryNavigationRail view={null} homeActive placement="overlay" testIdPrefix="project-nav" context={context} onHome={vi.fn()} onViewChange={vi.fn()} />
      </I18nProvider>,
    );
    const rails = screen.getAllByRole('navigation');
    const labels = rails.map((rail) => within(rail).getAllByRole('button').map((button) => button.getAttribute('aria-label')));
    expect(labels[1]).toEqual(labels[0]);
    for (const rail of rails) {
      for (const button of within(rail).getAllByRole('button')) {
        expect(button.textContent).toBe('');
        expect(button.getAttribute('data-tooltip')).toBeTruthy();
        expect(button.getAttribute('aria-label')).toBeTruthy();
      }
    }
    expect(screen.queryAllByTestId(/-drafts$/)).toHaveLength(workspaceType ? 2 : 0);
    expect(screen.queryAllByTestId(/-all-projects$/)).toHaveLength(workspaceType === 'team' ? 2 : 0);
  });

  it('keeps selection and navigation callbacks attached to the current page', () => {
    const onHome = vi.fn();
    const onViewChange = vi.fn();
    const accountHostRef = vi.fn();
    const props = { context: null, onHome, onViewChange, accountHostRef };
    const { rerender } = render(
      <I18nProvider initial="en"><PrimaryNavigationRail {...props} view="plugins" /></I18nProvider>,
    );
    expect(screen.getByRole('button', { name: 'Plugins' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Home' }).hasAttribute('aria-current')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(onHome).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Design systems' }));
    expect(onViewChange).toHaveBeenCalledWith('design-systems');
    expect(accountHostRef).toHaveBeenCalledWith(expect.any(HTMLDivElement));

    rerender(<I18nProvider initial="en"><PrimaryNavigationRail {...props} view={null} placement="overlay" homeActive={false} /></I18nProvider>);
    expect(screen.getAllByRole('button').some((button) => button.hasAttribute('aria-current'))).toBe(false);
  });
});

it('omits the personal-project icon when the project card owns that destination', () => {
  render(<I18nProvider initial="en"><PrimaryNavigationRail view={null} context={{ workspaceType: 'personal' } as WorkspaceCollabContext} hidePersonalProjects onHome={vi.fn()} onViewChange={vi.fn()} /></I18nProvider>);
  expect(screen.queryByTestId('entry-nav-drafts')).toBeNull();
  expect(screen.getByRole('button', { name: 'Design systems' })).toBeTruthy();
});
