// @vitest-environment jsdom
//
// Regression for 飞书 "personal workspace 展示了全部项目入口，提示没有团队项目".
// All-projects is fed by EntryShell.tsx's `teamProjects` — a TEAM-scoped
// catalog with no personal-workspace equivalent — but the nav item rendered
// for any workspace context, landing a personal-workspace user on a
// "还没有团队项目" empty state that names a concept their workspace cannot have.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '../../src/types';
import { EntryNavRail } from '../../src/components/EntryNavRail';
import { PrimaryNavigationRail } from '../../src/components/PrimaryNavigationRail';
import { I18nProvider, type Locale } from '../../src/i18n';

function contextFor(workspaceType: 'team' | 'personal'): WorkspaceCollabContext {
  return {
    workspaceId: workspaceType === 'team' ? 'ws-team' : 'ws-personal',
    workspaceType,
    workspaceMemberId: 'wm-1',
    teamName: workspaceType === 'team' ? 'OD Feature Team' : undefined,
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    permissions: { canInviteMembers: true, canViewWorkspaceSettings: true },
  } as unknown as WorkspaceCollabContext;
}

function renderRail(workspaceType: 'team' | 'personal', locale: Locale = 'en', open = true) {
  return render(
    <I18nProvider initial={locale}>
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open={open}
        context={contextFor(workspaceType)}
        recentProjects={[{ id: 'recent-1', name: 'Recent project', updatedAt: 1 } as Project]}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('EntryNavRail all-projects visibility', () => {
  it('keeps the shared destinations in the project chat rail', () => {
    const onViewChange = vi.fn();
    render(
      <I18nProvider initial="en">
        <PrimaryNavigationRail
          view={null}
          homeActive
          placement="overlay"
          testIdPrefix="project-nav"
          onHome={() => {}}
          onViewChange={onViewChange}
          context={null}
          accountHostRef={null}
        />
      </I18nProvider>,
    );

    const rail = document.querySelector('.project-destinations');
    for (const destination of ['home', 'community', 'design-systems', 'plugins']) {
      expect(rail?.contains(screen.getByTestId(`project-nav-${destination}`))).toBe(true);
    }
    fireEvent.click(screen.getByTestId('project-nav-design-systems'));
    expect(onViewChange).toHaveBeenCalledWith('design-systems');
  });

  it('shows the all-projects nav item for a team workspace', () => {
    renderRail('team');
    expect(screen.queryByTestId('entry-nav-all-projects')).toBeTruthy();
  });

  it('hides the all-projects nav item for a personal workspace', () => {
    renderRail('personal');
    expect(screen.queryByTestId('entry-nav-all-projects')).toBeNull();
  });

  it('still shows drafts for a personal workspace', () => {
    renderRail('personal', 'zh-CN');
    const allProjects = screen.getByTestId('entry-nav-drafts');
    expect(allProjects.textContent).toBe('项目');
    expect(allProjects.getAttribute('aria-expanded')).toBe('false');
  });

  it('places the primary destinations in the left icon rail', () => {
    renderRail('personal');
    const modules = document.querySelector('.entry-destinations__modules');
    expect(modules).toBeTruthy();
    for (const testId of ['entry-nav-community', 'entry-nav-design-systems', 'entry-nav-plugins']) {
      const button = screen.getByTestId(testId);
      expect(modules?.contains(button)).toBe(true);
      expect(document.querySelector('.entry-nav-rail')?.contains(button)).toBe(false);
      expect(button.getAttribute('title')).toBeTruthy();
    }
  });

  it('keeps the primary destinations accessible when the sidebar is collapsed', () => {
    renderRail('personal', 'en', false);
    for (const name of ['Home', 'Community', 'Design systems', 'Plugins']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });
});

it('places personal projects above recently viewed inside the same sidebar card', () => {
  renderRail('personal');
  const personal = screen.getByRole('button', { name: 'Projects' });
  const recent = screen.getByRole('button', { name: 'Conversations' });
  const card = personal.closest('.entry-nav-rail__panel');
  expect(card?.contains(recent)).toBe(true);
  expect(personal.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(document.querySelector('.primary-navigation-rail')?.contains(personal)).toBe(false);
});

it('expands personal projects in place independently of recently viewed', async () => {
  localStorage.removeItem('od.entry.railPersonalOpen');
  const onViewChange = vi.fn();
  const onOpenRecentProject = vi.fn();
  render(<I18nProvider initial="en"><EntryNavRail view="home" open context={contextFor('personal')} onNewProject={vi.fn()} onViewChange={onViewChange}
    personalProjects={[{ id: 'personal-1', name: 'My personal project', updatedAt: 1 } as Project]}
    recentProjects={[{ id: 'recent-1', name: 'Recently opened project', updatedAt: 2 } as Project]}
    onOpenRecentProject={onOpenRecentProject} /></I18nProvider>);
  const personal = screen.getByRole('button', { name: 'Projects' });
  const recent = screen.getByRole('button', { name: 'Conversations' });
  const recentExpanded = recent.getAttribute('aria-expanded');
  expect(personal.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(personal);
  expect(personal.getAttribute('aria-expanded')).toBe('true');
  expect(recent.getAttribute('aria-expanded')).toBe(recentExpanded);
  expect(onViewChange).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'My personal project' })); });
  expect(onOpenRecentProject).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'My personal project' }).getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(personal);
  expect(personal.getAttribute('aria-expanded')).toBe('false');
  expect(localStorage.getItem('od.entry.railPersonalOpen')).toBe('false');
});
