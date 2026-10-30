// @vitest-environment jsdom
//
// Settings-entry invariant: exactly one settings entry per identity state.
// Settings lives in the shared navigation, directly under 插件, in both identity states.
//
// History: 飞书 recvq4hGF7BJkI ("Personal 用户，左侧栏有 2 个设置入口") removed
// the rail's own signed-out settings item because EntryShell's footer carried
// an `entry-settings-chip` for the same falsy-context condition. #5517 then
// dropped that footer chip (the footer only hosts the updater popup now) — and
// a signed-out rail has no account menu either, so the rail item came back as
// the only signed-out settings entry. Signed-in then had NO visible entry at
// all: settings hid inside the account hover menu, two interactions deep.
// The signed-in rail keeps that visible entry immediately above the avatar
// without adding it back to the account menu, so the count stays exactly one.
// (Upstream #5971 restored the same entry as `entry-nav-settings`; this repo
// keeps the `entry-settings-button` testId the e2e suite contracts on.)

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, EntryTopRightCluster } from '../../src/components/EntryNavRail';
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

function renderRail(context: WorkspaceCollabContext | null, onOpenSettings = vi.fn(), open = true) {
  render(
    <I18nProvider initial="en">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open={open}
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
  it('keeps settings and the account menu outside the collapsed workspace panel', () => {
    const onOpenSettings = renderRail(signedInContext, vi.fn(), false);
    const footer = screen.getByTestId('primary-navigation-footer');
    const account = screen.getByTestId('entry-nav-account');
    expect(footer.contains(account)).toBe(true);
    expect(footer.closest('[aria-hidden="true"], [inert]')).toBeNull();
    fireEvent.click(screen.getByTestId('entry-settings-button'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    fireEvent.click(account);
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('renders one settings item in the shared navigation when signed out', () => {
    const onOpenSettings = renderRail(null);

    const settings = screen.getByTestId('entry-settings-button');
    expect(screen.getAllByTestId('entry-settings-button')).toHaveLength(1);
    expect(settings.previousElementSibling).toBe(screen.getByTestId('entry-nav-plugins'));
    fireEvent.click(settings);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('renders settings directly under plugins when signed in', () => {
    const onOpenSettings = renderRail(signedInContext);

    const settings = screen.getByTestId('entry-settings-button');
    const stack = screen.getByTestId('primary-navigation-footer');
    expect(screen.getAllByTestId('entry-settings-button')).toHaveLength(1);
    expect(settings.previousElementSibling).toBe(screen.getByTestId('entry-nav-plugins'));
    expect(stack.contains(settings)).toBe(false);
    expect(stack.lastElementChild).toBe(screen.getByTestId('primary-navigation-account-host'));
    expect(document.querySelector('.entry-nav-rail__team-section')?.contains(settings)).toBe(false);
    fireEvent.click(settings);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps the account menu open when a click follows hover', () => {
    renderRail(signedInContext);

    const trigger = screen.getByTestId('entry-nav-account');
    fireEvent.mouseEnter(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });
});


it('renders project workspace controls in the sidebar footer even before the preview toolbar mounts', () => {
  const avatarHost = document.createElement('div');
  const footerHost = document.createElement('div');
  document.body.append(avatarHost, footerHost);
  try {
    render(<I18nProvider initial="en"><EntryTopRightCluster page="project" context={signedInContext}
      accountHost={avatarHost} controlsHost={footerHost}
      workspaceSwitcherSlot={<button>Switch workspace</button>} /></I18nProvider>);
    expect(footerHost.contains(screen.getByText('Switch workspace'))).toBe(true);
    expect(footerHost.contains(screen.getByTestId('entry-nav-account-message-center'))).toBe(true);
    expect(avatarHost.contains(screen.getByTestId('entry-nav-account'))).toBe(true);
    expect(screen.getAllByTestId('entry-nav-account-message-center')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('entry-nav-account-message-center'));
    expect(screen.getByTestId('message-center-dialog')).toBeTruthy();
  } finally { avatarHost.remove(); footerHost.remove(); }
});

it('hides project footer controls when its sidebar is collapsed without removing the avatar', () => {
  const avatarHost = document.createElement('div');
  document.body.append(avatarHost);
  try {
    render(<I18nProvider initial="en"><EntryTopRightCluster page="project" context={signedInContext}
      accountHost={avatarHost} controlsHost={null}
      workspaceSwitcherSlot={<button>Switch workspace</button>} /></I18nProvider>);
    expect(screen.queryByText('Switch workspace')).toBeNull();
    expect(screen.queryByTestId('entry-nav-account-message-center')).toBeNull();
    expect(avatarHost.contains(screen.getByTestId('entry-nav-account'))).toBe(true);
  } finally { avatarHost.remove(); }
});
