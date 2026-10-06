// @vitest-environment jsdom
//
// OPEND-2624: a personal, local-only project the viewer created must never be
// presented as "This is a shared project — you can view and comment" with
// chat/upload/edit/export disabled.
//
// Every fixture below is copied from what the daemon at
// http://127.0.0.1:17466 actually answers (0.21.1-beta line). In particular:
//
//  * `/api/workspace/context` reports the member's REAL directory role
//    (`owner` for a workspace owner) and `planId: null` — the workspace
//    directory rows Vela hands the daemon carry no plan field, so production
//    never fills it.
//  * `/api/projects/:id/workspace-scope` synthesises its context through
//    `resolveLocalProjectWorkspaceScope`, which hardcodes `role: 'member'`.
//    So in production the SAME workspace is described with two different roles
//    depending on which endpoint answered. Tests that build one context object
//    and hand it to both surfaces cannot see that, which is why this fixture
//    keeps the two apart.
//  * `/api/workspace/projects/team` answers `{"projects": []}` for a workspace
//    with nothing shared.

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectCollab } from '../../src/collab/useProjectCollab';
import {
  resetTeamProjectsCache,
  resetWorkspaceContextCache,
  useTeamProjects,
  useWorkspaceContext,
} from '../../src/collab/useWorkspaceContext';

const WORKSPACE_ID = 'l5hy8nbnym3pi07aasqekiz0';
const WORKSPACE_MEMBER_ID = 'dn87ohicuyq4o839pgi37op4';
const PROJECT_ID = '3c73bd04-ed0c-4aca-9a7a-85600977d5d8';

/**
 * `GET /api/workspace/context` — the shell/navigation authority. `role` is the
 * member's real directory role; a workspace owner reads back `owner`.
 */
function shellWorkspaceContext(): WorkspaceCollabContext {
  const role = 'owner' as const;
  const lifecycleState = 'active' as const;
  return {
    workspaceId: WORKSPACE_ID,
    workspaceType: 'team',
    workspaceMemberId: WORKSPACE_MEMBER_ID,
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    // Directory rows carry no plan; production always answers null here.
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 0, usedSeats: 0 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
    teamId: WORKSPACE_ID,
  };
}

/**
 * `GET /api/projects/:id/workspace-scope` — the project-bound authority
 * ProjectView actually hands to `useProjectCollab`. Its role is hardcoded to
 * `member` by `resolveLocalProjectWorkspaceScope`, independent of the member's
 * real workspace role.
 */
function projectScopeContext(): WorkspaceCollabContext {
  const role = 'member' as const;
  const lifecycleState = 'active' as const;
  return {
    workspaceId: WORKSPACE_ID,
    workspaceType: 'team',
    workspaceMemberId: WORKSPACE_MEMBER_ID,
    role,
    memberStatus: 'active',
    lifecycleState,
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 0, usedSeats: 0 }),
    permissions: buildWorkspacePermissions({ role, lifecycleState }),
    teamId: WORKSPACE_ID,
  };
}

/**
 * Stable identity, like production: ProjectView memoises the project's
 * resolved scope context. A fresh object every render would restart the
 * hook's context effect on every commit.
 */
const PROJECT_SCOPE_CONTEXT = projectScopeContext();

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** Shell reads succeed exactly as production does, so the caches warm. */
function installShellFetch(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input), 'http://d.local').pathname;
    if (pathname.endsWith('/workspace/directory')) {
      return jsonResponse({
        items: [
          {
            workspaceId: WORKSPACE_ID,
            workspaceName: 'OD E2E Team',
            workspaceType: 'team',
            workspaceMemberId: WORKSPACE_MEMBER_ID,
            role: 'owner',
            memberStatus: 'active',
            lifecycleState: 'active',
          },
        ],
        activeWorkspaceId: null,
      });
    }
    if (pathname.endsWith('/workspace/context')) {
      return jsonResponse({ context: shellWorkspaceContext() });
    }
    if (pathname.endsWith('/workspace/projects/team')) {
      return jsonResponse({ projects: [] });
    }
    return jsonResponse({});
  }) as typeof fetch;
}

async function warmShellCaches(): Promise<void> {
  installShellFetch();
  const ctx = renderHook(() => useWorkspaceContext());
  await waitFor(() => expect(ctx.result.current.loading).toBe(false));
  ctx.unmount();
  const team = renderHook(() => useTeamProjects());
  await waitFor(() => expect(team.result.current.loading).toBe(false));
  team.unmount();
}

/**
 * Shell reads keep working; only this ONE project's `/collab/status` refuses.
 * That is the shape of the report: every other personal project in the same
 * workspace stays editable.
 *
 * The body is the daemon's real refusal payload
 * (`{"error":"WORKSPACE_ACCESS_DENIED", ...}` with HTTP 403).
 */
function installStatusDeniedFetch(): ReturnType<typeof vi.fn> {
  const impl = vi.fn(async (input: RequestInfo | URL) => {
    const pathname = new URL(String(input), 'http://d.local').pathname;
    if (pathname.endsWith('/collab/status')) {
      return jsonResponse(
        {
          error: 'WORKSPACE_ACCESS_DENIED',
          message: 'the requested workspace does not own this project',
        },
        403,
      );
    }
    if (pathname.endsWith('/workspace/directory')) {
      return jsonResponse({
        items: [
          {
            workspaceId: WORKSPACE_ID,
            workspaceName: 'OD E2E Team',
            workspaceType: 'team',
            workspaceMemberId: WORKSPACE_MEMBER_ID,
            role: 'owner',
            memberStatus: 'active',
            lifecycleState: 'active',
          },
        ],
        activeWorkspaceId: null,
      });
    }
    if (pathname.endsWith('/workspace/context')) {
      return jsonResponse({ context: shellWorkspaceContext() });
    }
    if (pathname.endsWith('/workspace/projects/team')) {
      return jsonResponse({ projects: [] });
    }
    return jsonResponse({});
  });
  globalThis.fetch = impl as unknown as typeof fetch;
  return impl;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  resetWorkspaceContextCache();
  resetTeamProjectsCache();
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  resetWorkspaceContextCache();
  resetTeamProjectsCache();
  vi.restoreAllMocks();
});

describe('OPEND-2624 personal local-only project stays writable', () => {
  it('does not present a daemon-confirmed personal project as shared read-only when /collab/status refuses', async () => {
    await warmShellCaches();
    const fetchImpl = installStatusDeniedFetch();

    const view = renderHook(() =>
      useProjectCollab(PROJECT_ID, {
        // Exactly what ProjectView passes: the project's own resolved scope.
        workspaceContext: PROJECT_SCOPE_CONTEXT,
        workspaceContextLoading: false,
        // The daemon's authoritative answer for this project: a private draft.
        projectVisibility: 'personal',
      }),
    );

    await waitFor(() =>
      expect(
        fetchImpl.mock.calls.some(([input]) =>
          String(input).endsWith('/collab/status'),
        ),
      ).toBe(true),
    );

    // Give the failed poll a chance to settle into state.
    await waitFor(() => expect(view.result.current.viewerOnly).toBe(false));
    expect(view.result.current.isSharedNonOwner).toBe(false);
    expect(view.result.current.writerAuthority).toBe('allowed');
  });
});
