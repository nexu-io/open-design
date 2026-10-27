// @vitest-environment jsdom
//
// OPEND-3108: the rail has ONE project destination, 全部项目 (`entry-nav-drafts`),
// in every workspace. 团队项目 is a tab inside that page, so the second
// `entry-nav-all-projects` entry a team workspace used to render is gone —
// this withdraws the earlier "show all-projects for a team workspace" spec.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    workspaceSettingsUrl: 'https://open-design.ai/cloud/workspace/settings',
  } as unknown as WorkspaceCollabContext;
}

function renderRail(
  workspaceType: 'team' | 'personal',
  view: React.ComponentProps<typeof EntryNavRail>['view'] = 'home',
) {
  const onViewChange = vi.fn();
  render(
    <I18nProvider initial="en">
      <EntryNavRail
        view={view}
        onViewChange={onViewChange}
        onNewProject={() => {}}
        open
        context={contextFor(workspaceType)}
      />
    </I18nProvider>,
  );
  return { onViewChange };
}

afterEach(() => {
  cleanup();
});

describe('EntryNavRail project destinations (OPEND-3108)', () => {
  it.each(['team', 'personal'] as const)(
    '%s workspace: one 全部项目 entry, no separate 团队项目 entry',
    (workspaceType) => {
      renderRail(workspaceType);
      const drafts = screen.getByTestId('entry-nav-drafts');
      expect(drafts.textContent).toContain('All projects');
      expect(drafts.getAttribute('aria-label')).toBe('All projects');
      expect(screen.queryByTestId('entry-nav-all-projects')).toBeNull();
    },
  );

  it('routes the entry to the projects page', () => {
    const { onViewChange } = renderRail('team');
    fireEvent.click(screen.getByTestId('entry-nav-drafts'));
    expect(onViewChange).toHaveBeenCalledWith('drafts');
  });

  it('reads as the current destination while the legacy /all-projects view is open', () => {
    // The team-tab deep link keeps its URL; the rail must not lose its
    // highlight because the route names the old view.
    renderRail('team', 'all-projects');
    expect(screen.getByTestId('entry-nav-drafts').getAttribute('aria-current')).toBe('page');
  });
});

describe('EntryNavRail has no Workspace settings entry (OPEND-3257)', () => {
  // The rail used to link out to the console's workspace settings under the
  // recent-projects list (product decision 2026-07-20). OPEND-3257 removes it
  // in BOTH spaces even when the member may view settings and the console URL
  // is present; the account menu's billing row remains the way out.
  it.each(['team', 'personal'] as const)('%s workspace: no settings entry below recent projects', (workspaceType) => {
    renderRail(workspaceType);
    expect(screen.queryByTestId('entry-nav-workspace-settings')).toBeNull();
    expect(screen.queryByLabelText('Workspace settings')).toBeNull();
  });
});
