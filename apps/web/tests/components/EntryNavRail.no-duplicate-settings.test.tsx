// @vitest-environment jsdom
//
// Settings-entry invariant: exactly one RAIL settings entry per identity state.
//
// History: 飞书 recvq4hGF7BJkI ("Personal 用户，左侧栏有 2 个设置入口") removed
// the rail's own signed-out settings item because EntryShell's footer carried
// an `entry-settings-chip` for the same falsy-context condition. #5517 then
// dropped that footer chip (the footer only hosts the updater popup now) — and
// a signed-out rail has no account menu either, so the rail item is back as
// the ONLY signed-out settings entry. #7635 (OPEND-2553) then put 设置 under
// 插件 on the signed-in branch too (per product: 设置的按钮在插件下边), so both
// branches render the item ONCE, in the same slot, and never together.
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

/** The rail item that follows 插件 in the destination column, by testId. */
function testIdAfterPlugins(): string | null {
  const items = Array.from(document.querySelectorAll('.entry-nav-rail__btn'));
  const pluginsIndex = items.findIndex(
    (el) => el.getAttribute('data-testid') === 'entry-nav-plugins',
  );
  if (pluginsIndex < 0) return null;
  return items[pluginsIndex + 1]?.getAttribute('data-testid') ?? null;
}

describe('EntryNavRail settings entry', () => {
  it('renders the settings item below 扩展 when there is no cloud identity', () => {
    const onOpenSettings = renderRail(null);

    const settings = screen.getByTestId('entry-settings-button');
    expect(settings).toBeTruthy();
    expect(testIdAfterPlugins()).toBe('entry-settings-button');
    fireEvent.click(settings);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('renders exactly one rail settings item when signed in, under the destinations', () => {
    const onOpenSettings = renderRail(signedInContext);
    const settings = screen.getAllByTestId('entry-settings-button');
    expect(settings).toHaveLength(1);
    // Under 插件, above 最近项目: a destination, not an account-menu row.
    const group = settings[0]!.closest('.entry-nav-rail__team-section');
    expect(group).not.toBeNull();
    expect(group?.querySelector('[data-testid="entry-nav-plugins"]')).not.toBeNull();
    // Directly under 插件 in BOTH identity states (per product: 设置的按钮在插件下边);
    // the account menu carries no 设置 row, so the count stays exactly one.
    expect(testIdAfterPlugins()).toBe('entry-settings-button');
    fireEvent.click(settings[0]!);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
