// @vitest-environment jsdom
//
// Regression for 飞书 "personal workspace 展示了全部项目入口，提示没有团队项目".
// All-projects is fed by EntryShell.tsx's `teamProjects` — a TEAM-scoped
// catalog with no personal-workspace equivalent — but the nav item rendered
// for any workspace context, landing a personal-workspace user on a
// "还没有团队项目" empty state that names a concept their workspace cannot have.

import { cleanup, render, screen } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { EntryNavRail } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

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

function renderRail(workspaceType: 'team' | 'personal') {
  return render(
    <I18nProvider initial="en">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={contextFor(workspaceType)}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('EntryNavRail all-projects visibility', () => {
  it('shows the all-projects nav item for a team workspace', () => {
    renderRail('team');
    expect(screen.queryByTestId('entry-nav-all-projects')).toBeTruthy();
  });

  it('hides the all-projects nav item for a personal workspace', () => {
    renderRail('personal');
    expect(screen.queryByTestId('entry-nav-all-projects')).toBeNull();
  });

  it('still shows drafts for a personal workspace', () => {
    renderRail('personal');
    expect(screen.queryByTestId('entry-nav-drafts')).toBeTruthy();
  });
});
