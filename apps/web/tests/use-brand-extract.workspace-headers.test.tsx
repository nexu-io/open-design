// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

vi.mock('../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (key: string) => key }),
}));

import { useBrandExtract } from '../src/runtime/useBrandExtract';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const TEAM_WORKSPACE_CONTEXT: WorkspaceCollabContext = {
  workspaceId: 'ws-team-1',
  workspaceType: 'team',
  workspaceMemberId: 'member-owner',
  role: 'member',
  memberStatus: 'active',
  lifecycleState: 'active',
  billingState: 'active',
  planId: null,
  providerMode: 'platform_credits',
  seatSummary: { seatLimit: 5, usedSeats: 2, availableSeats: 3, isSeatFull: false },
  permissions: {
    canManageMembers: false,
    canManageBilling: false,
    canInviteMembers: false,
    canManageAutoRecharge: false,
    canShareProjects: true,
    canWriteSyncedFiles: true,
    canViewWorkspaceSettings: true,
    canManageSharedResources: false,
  },
};

function stubFetch() {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    const rawHeaders = init?.headers;
    if (rawHeaders instanceof Headers) {
      rawHeaders.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (rawHeaders && typeof rawHeaders === 'object') {
      for (const [key, value] of Object.entries(rawHeaders as Record<string, string>)) {
        headers[key.toLowerCase()] = value;
      }
    }
    calls.push({ url: String(input), headers });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'brand-1',
        projectId: 'brand-project-1',
        conversationId: 'conversation-1',
        sourceUrl: 'https://example.com',
        status: 'extracting',
      }),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchImpl as unknown as typeof fetch);
  return { calls };
}

describe('useBrandExtract workspace headers', () => {
  // Red-spec companion to the daemon-side fix in brand-routes.ts
  // (bindBrandProjectIntoRequestWorkspace): the daemon can only bind a freshly
  // extracted brand/design-system project into the caller's team workspace
  // when the POST /api/brands request actually carries the x-od-workspace-*
  // headers. Before this fix, `run()` never attached them at all — DesignSystem-
  // Flow.tsx had `workspaceContext` in scope (used a few lines later for
  // `prepareCreatedDesignSystemProject`) but never threaded it into
  // `brandExtract.run(...)`, so every team member's design-system creation
  // request looked identical to a signed-out/single-player one server-side.
  it('attaches workspace headers to POST /api/brands when a workspace context is provided', async () => {
    const { calls } = stubFetch();
    const { result } = renderHook(() => useBrandExtract());

    await act(async () => {
      await result.current.run('https://example.com', { workspaceContext: TEAM_WORKSPACE_CONTEXT });
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/brands');
    expect(calls[0]?.headers['x-od-workspace-id']).toBe('ws-team-1');
    expect(calls[0]?.headers['x-od-workspace-member-id']).toBe('member-owner');
    expect(calls[0]?.headers['x-od-workspace-type']).toBe('team');
  });

  it('omits workspace headers when no workspace context is provided (signed-out / single-player)', async () => {
    const { calls } = stubFetch();
    const { result } = renderHook(() => useBrandExtract());

    await act(async () => {
      await result.current.run('https://example.com');
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers['x-od-workspace-id']).toBeUndefined();
  });
});
