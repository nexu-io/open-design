// @vitest-environment jsdom

// Sibling of ExtensionsMarketplace.team-scope for the workspace-team P0 (飞书
// rec recvq3NXctqR6L): the 团队 collection on 设计体系 disappeared for a real
// team workspace on a free/unpaid tier. Same root cause and same fix — the tab
// is gated on team IDENTITY (`workspaceContextHasTeamIdentity`), the predicate
// the daemon uses to accept a hub share, not on the billing plan.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { DesignSystemSummary } from '@open-design/contracts';

import { DesignSystemsTab } from '../../src/components/DesignSystemsTab';
import { I18nProvider } from '../../src/i18n';

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return { ...actual, useAnalytics: () => ({ track: vi.fn() }) };
});

// A real team workspace on a FREE tier (see the extensions sibling for the shape
// rationale). billingState 'free' / planId null must NOT hide the team tab.
const FREE_TEAM_CONTEXT = {
  workspaceId: 'ws-team',
  workspaceType: 'team',
  workspaceMemberId: 'mem-1',
  role: 'owner',
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

const PERSONAL_CONTEXT = {
  workspaceId: 'ws-personal',
  workspaceType: 'personal',
  workspaceMemberId: 'mem-1',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'free',
  planId: null,
  permissions: {
    canManageMembers: false,
    canManageBilling: false,
    canInviteMembers: false,
    canManageAutoRecharge: false,
    canShareProjects: false,
    canWriteSyncedFiles: true,
    canViewWorkspaceSettings: false,
    canManageSharedResources: false,
  },
};

let workspaceContext: unknown = FREE_TEAM_CONTEXT;

vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => ({ context: workspaceContext, loading: false, refresh: vi.fn() }),
  useWorkspaceBilling: () => ({ membershipTier: '' }),
}));

const SYSTEMS: DesignSystemSummary[] = [
  {
    id: 'user:acme',
    title: 'Acme Design System',
    category: 'Custom',
    summary: 'Internal product system.',
    surface: 'web',
    source: 'user',
    status: 'draft',
    isEditable: true,
    updatedAt: '2026-05-13T03:19:00.000Z',
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/workspace/')) return jsonResponse({ ids: [], resources: [] });
    return jsonResponse({});
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  workspaceContext = FREE_TEAM_CONTEXT;
});

function renderTab() {
  return render(
    <I18nProvider initial="en">
      <DesignSystemsTab
        loading={false}
        systems={SYSTEMS}
        selectedId={null}
        onSelect={() => {}}
        onCreate={() => {}}
        onOpenSystem={() => {}}
      />
    </I18nProvider>,
  );
}

describe('DesignSystemsTab 团队 collection visibility', () => {
  it('offers the Team collection for a real team workspace even on a free tier', async () => {
    renderTab();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Your systems' })).toBeTruthy();
    });
    expect(screen.queryByRole('tab', { name: 'Team' })).toBeTruthy();
  });

  it('does not offer the Team collection for a personal workspace', async () => {
    workspaceContext = PERSONAL_CONTEXT;
    renderTab();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Your systems' })).toBeTruthy();
    });
    expect(screen.queryByRole('tab', { name: 'Team' })).toBeNull();
  });

  it('does not offer the Team collection when signed out', async () => {
    workspaceContext = null;
    renderTab();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Your systems' })).toBeTruthy();
    });
    expect(screen.queryByRole('tab', { name: 'Team' })).toBeNull();
  });
});
