// @vitest-environment jsdom
//
// Settings-entry invariant: exactly one settings entry per identity state.
//
// History: 飞书 recvq4hGF7BJkI ("Personal 用户，左侧栏有 2 个设置入口") removed
// the rail's own signed-out settings item because EntryShell's footer carried
// an `entry-settings-chip` for the same falsy-context condition. #5517 then
// dropped that footer chip (the footer only hosts the updater popup now) — and
// a signed-out rail has no account menu either, so the rail item is back as
// the ONLY signed-out settings entry. Signed-in keeps settings inside the
// account menu, so the rail item must not render on that branch.
// (Upstream #5971 restored the same entry as `entry-nav-settings`; this repo
// keeps the `entry-settings-button` testId the e2e suite contracts on.)

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

const signedInContext = {
  workspaceId: 'ws-personal',
  workspaceType: 'personal',
  workspaceMemberId: 'wm-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  permissions: { canInviteMembers: false, canViewWorkspaceSettings: false },
} as unknown as WorkspaceCollabContext;

function renderRail(context: WorkspaceCollabContext | null, onOpenSettings = vi.fn()) {
  render(
    <I18nProvider initial="en">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={context}
        onOpenSettings={onOpenSettings}
      />
    </I18nProvider>,
  );
  return onOpenSettings;
}

afterEach(() => {
  cleanup();
});

describe('EntryNavRail settings entry', () => {
  it('renders the settings item below 扩展 when there is no cloud identity', () => {
    const onOpenSettings = renderRail(null);

    const settings = screen.getByTestId('entry-settings-button');
    expect(settings).toBeTruthy();
    fireEvent.click(settings);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('does not render the rail settings item when signed in (account menu owns it)', () => {
    renderRail(signedInContext);
    expect(screen.queryByTestId('entry-settings-button')).toBeNull();
  });
});
