// @vitest-environment jsdom
//
// The account menu's 账单 row: the one entry point from the identity menu to the
// membership surface (plan, seats, balance) in B's console.
//
// It resolves its destination in two steps, and both matter. A context that
// carries `workspaceSettingsUrl` wins, because that URL already holds the
// deep-link param pinning the console to THIS workspace. A context without one
// — a local runtime hands out exactly that — falls back to the workspace-scoped
// dashboard built from the workspace id alone, so the row can never silently
// disappear from the menu because of a field the backend did not fill in.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EntryNavRail, resetWorkspaceDirectoryCache } from '../../src/components/EntryNavRail';
import { I18nProvider } from '../../src/i18n';

const analytics = vi.hoisted(() => ({ track: vi.fn() }));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: analytics.track }),
}));

const originalFetch = globalThis.fetch;

function context(overrides: Record<string, unknown> = {}): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-team',
    workspaceType: 'team',
    workspaceMemberId: 'wm-1',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    displayName: 'Leaf',
    permissions: { canInviteMembers: true, canViewWorkspaceSettings: true },
    ...overrides,
  } as unknown as WorkspaceCollabContext;
}

function renderRail(ctx: WorkspaceCollabContext) {
  render(
    <I18nProvider initial="zh-CN">
      <EntryNavRail
        view="home"
        onViewChange={() => {}}
        onNewProject={() => {}}
        open
        context={ctx}
        billing={null}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByTestId('entry-nav-account'));
  return screen.getByTestId('entry-account-billing') as HTMLAnchorElement;
}

beforeEach(() => {
  analytics.track.mockClear();
  resetWorkspaceDirectoryCache();
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ items: [] }), { status: 200 }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

describe('account menu 账单 row', () => {
  it("targets the context's own console when it carries a settings URL", () => {
    const row = renderRail(context({
      workspaceSettingsUrl: 'https://web.example.com/console/settings?workspaceId=ws-team',
    }));

    expect(row.textContent).toContain('账单');
    // `settings` is swapped for `dashboard` in place, so the workspace deep-link
    // param the context supplied survives.
    expect(row.href).toBe('https://web.example.com/console/dashboard?workspaceId=ws-team');
    // Opens away from the app, so it must carry the same rel the menu's other
    // outbound links do.
    expect(row.target).toBe('_blank');
    expect(row.rel).toContain('noopener');
  });

  it('still renders, scoped to the workspace, when the context has no settings URL', () => {
    const row = renderRail(context());

    const url = new URL(row.href);
    expect(url.pathname.endsWith('/dashboard')).toBe(true);
    expect(url.searchParams.get('workspaceId')).toBe('ws-team');
  });

  it('reports its own analytics element rather than reusing the 额度 row', () => {
    fireEvent.click(renderRail(context()));

    expect(analytics.track).toHaveBeenCalledWith(
      'ui_click',
      expect.objectContaining({ area: 'account_menu', element: 'billing' }),
      undefined,
    );
  });
});
