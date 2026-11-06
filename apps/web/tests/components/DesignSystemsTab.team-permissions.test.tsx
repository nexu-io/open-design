// @vitest-environment jsdom

// recvqb6mfyqXLD: viewing a teammate's shared design system in the 团队 tab
// showed a fully-live "Edit with agent" button, a clickable "已发布" toggle,
// and a "删除" menu item — none of which a plain member (not the sharer, not
// a workspace owner/admin) may actually use. `canManageTeamSynced` in
// DesignSystemsTab.tsx gates all three off the same signal the daemon already
// uses for "who can unshare" (`canManageSharedResource`).

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemSummary } from '@open-design/contracts';

import { DesignSystemsTab } from '../../src/components/DesignSystemsTab';
import { I18nProvider } from '../../src/i18n';

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return { ...actual, useAnalytics: () => ({ track: vi.fn() }) };
});

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchDesignSystem: vi.fn(async (id: string) => ({
      id,
      title: 'Teammate Design System',
      summary: 'Shared by a teammate.',
      category: 'Custom',
      body: `# ${id}\n\n## Colors\n- Primary #111111`,
    })),
    updateDesignSystemDraft: vi.fn(async () => null),
    deleteDesignSystemDraft: vi.fn(async () => true),
  };
});

const TEAM_CONTEXT = {
  workspaceId: 'ws-team',
  workspaceType: 'team',
  workspaceMemberId: 'mem-viewer',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'free',
  planId: null,
  teamId: 'ws-team',
  permissions: {
    canManageMembers: false,
    canManageBilling: false,
    canInviteMembers: false,
    canManageAutoRecharge: false,
    canShareProjects: true,
    canWriteSyncedFiles: true,
    canViewWorkspaceSettings: false,
    canManageSharedResources: true,
  },
};

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({ context: TEAM_CONTEXT, loading: false, refresh: vi.fn() }),
  useWorkspaceBilling: () => ({ membershipTier: '' }),
}));

// The system as it reads for a member who merely has a teammate's shared copy
// synced locally: `teamSynced: true` (server.ts `markTeamSynced`), never set
// on anything the caller authored themselves.
const TEAMMATE_SYSTEM: DesignSystemSummary = {
  id: 'user:teammate-ds',
  title: 'Teammate Design System',
  category: 'Custom',
  summary: 'Shared by a teammate.',
  surface: 'web',
  source: 'user',
  status: 'draft',
  isEditable: true,
  teamSynced: true,
  updatedAt: '2026-05-13T03:19:00.000Z',
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockTeamFetch(canUnshare: boolean) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/workspace/design-systems/team')) {
      return jsonResponse({
        ids: ['user:teammate-ds'],
        resources: [{ id: 'user:teammate-ds', canUnshare, ownerMemberId: 'mem-owner' }],
      });
    }
    return jsonResponse({});
  }) as typeof fetch;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderTab() {
  return render(
    <I18nProvider initial="en">
      <DesignSystemsTab
        loading={false}
        systems={[TEAMMATE_SYSTEM]}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />
    </I18nProvider>,
  );
}

async function openTeamTabAndSelect() {
  await waitFor(() => expect(screen.getByRole('tab', { name: /Team/i })).toBeTruthy());
  fireEvent.click(screen.getByRole('tab', { name: /Team/i }));
  await screen.findByTestId('design-kit-view-user:teammate-ds');
}

describe('DesignSystemsTab team-synced permission gating', () => {
  it('hides edit/publish/delete for a teammate-shared system the caller may not manage', async () => {
    mockTeamFetch(false);
    renderTab();
    await openTeamTabAndSelect();

    // Edit with agent is a real write surface into the authoring flow — fully
    // hidden, not just disabled.
    expect(screen.queryByRole('button', { name: /Edit with agent/i })).toBeNull();

    // Published/draft status stays visible (parity with the sidebar status
    // dot) but is no longer an interactive toggle.
    const toggle = screen.getByRole('button', { name: 'Draft' });
    expect(toggle).toBeDisabled();

    // The overflow menu keeps download (a read action) but drops delete.
    fireEvent.click(await screen.findByTestId('design-kit-more-actions'));
    expect(screen.getByRole('menuitem', { name: 'Download design system (.zip + SKILLS.md)' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /^Delete /i })).toBeNull();
  });

  it('keeps edit/publish/delete live for the original sharer or a workspace owner/admin', async () => {
    mockTeamFetch(true);
    renderTab();
    await openTeamTabAndSelect();

    expect(screen.getByRole('button', { name: /Edit with agent/i })).toBeTruthy();

    const toggle = screen.getByRole('button', { name: 'Draft' });
    expect(toggle).not.toBeDisabled();

    fireEvent.click(await screen.findByTestId('design-kit-more-actions'));
    expect(screen.getByRole('menuitem', { name: /^Delete /i })).toBeTruthy();
  });
});
