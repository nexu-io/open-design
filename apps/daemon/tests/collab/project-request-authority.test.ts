import { describe, expect, it, vi } from 'vitest';
import { createAuthorizeProjectRequest } from '../../src/collab/project-request-authority.js';
import { verifyWorkspaceRequestContext } from '../../src/collab/request-workspace-context.js';
import { createCachedWorkspaceDirectoryFetcher } from '../../src/collab/vela-workspace-context.js';

function response() {
  return {} as any;
}

function request(input: {
  workspaceId?: string;
  memberId?: string;
  query?: Record<string, string>;
}) {
  const headers: Record<string, string | undefined> = {
    'x-od-workspace-id': input.workspaceId,
    'x-od-workspace-member-id': input.memberId,
  };
  return {
    query: input.query ?? {},
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: 'workspace-a',
    workspaceName: 'A',
    workspaceType: 'team' as const,
    workspaceMemberId: 'member-a',
    role: 'member' as const,
    memberStatus: 'active' as const,
    lifecycleState: 'active' as const,
    billingState: 'active' as const,
    planId: 'team_plus',
    providerMode: 'platform_credits' as const,
    seatSummary: {
      seatLimit: 5,
      usedSeats: 2,
      availableSeats: 3,
      isSeatFull: false,
    },
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
    ...overrides,
  };
}

describe('createAuthorizeProjectRequest', () => {
  it('uses the bounded read verifier without weakening fresh mutation authority', async () => {
    const row = {
      workspaceId: 'workspace-a',
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
    };
    const directoryResult = {
      ok: true as const,
      items: [{
        workspaceId: 'workspace-a',
        workspaceName: 'A',
        workspaceType: 'team' as const,
        workspaceMemberId: 'member-a',
        role: 'member' as const,
        memberStatus: 'active' as const,
        lifecycleState: 'active' as const,
      }],
    };
    const fetchReadDirectory = vi.fn(async () => directoryResult);
    const cachedReadDirectory = createCachedWorkspaceDirectoryFetcher({
      fetchDirectory: fetchReadDirectory,
      identityKey: () => 'account-a:config-a',
      ttlMs: 5_000,
    });
    const fetchFreshMutationDirectory = vi.fn(async () => directoryResult);
    const readVerifier = vi.fn((req: unknown) =>
      verifyWorkspaceRequestContext({
        req,
        fetchWorkspaceDirectory: cachedReadDirectory,
      }));
    const mutationVerifier = vi.fn((req: unknown) =>
      verifyWorkspaceRequestContext({
        req,
        fetchWorkspaceDirectory: fetchFreshMutationDirectory,
      }));
    const authorize = createAuthorizeProjectRequest({
      db: {},
      getWorkspaceProject: () => row,
      getWorkspaceProjectByProjectId: () => row,
      verifyWorkspaceReadAuthority: readVerifier,
      verifyWorkspaceRequestAuthority: mutationVerifier,
      sendApiError: vi.fn(),
    });
    const req = request({
      workspaceId: 'workspace-a',
      memberId: 'member-a',
    });

    for (let index = 0; index < 6; index += 1) {
      await expect(authorize(req, response(), 'project-a', { mode: 'read' }))
        .resolves.toBe(true);
    }
    expect(readVerifier).toHaveBeenCalledTimes(6);
    expect(fetchReadDirectory).toHaveBeenCalledTimes(1);
    expect(mutationVerifier).not.toHaveBeenCalled();

    for (let index = 0; index < 2; index += 1) {
      await expect(authorize(
        request({ workspaceId: 'workspace-a', memberId: 'member-a' }),
        response(),
        'project-a',
        { mode: 'write', capability: 'writeFiles' },
      )).resolves.toBe(true);
    }
    expect(readVerifier).toHaveBeenCalledTimes(6);
    expect(fetchReadDirectory).toHaveBeenCalledTimes(1);
    expect(mutationVerifier).toHaveBeenCalledTimes(2);
    expect(fetchFreshMutationDirectory).toHaveBeenCalledTimes(2);
  });

  it('preserves unbound legacy reads and writes without consulting authority', async () => {
    const verify = vi.fn();
    const sendApiError = vi.fn();
    const authorize = createAuthorizeProjectRequest({
      db: {},
      getWorkspaceProject: () => null,
      getWorkspaceProjectByProjectId: () => null,
      verifyWorkspaceRequestAuthority: verify,
      sendApiError,
    });

    await expect(authorize(request({}), response(), 'legacy', { mode: 'read' }))
      .resolves.toBe(true);
    await expect(authorize(
      request({}),
      response(),
      'legacy',
      { mode: 'write', capability: 'writeFiles' },
    )).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
    expect(sendApiError).not.toHaveBeenCalled();
  });

  it('does not disclose a bound project to a headerless bootstrap request', async () => {
    const row = {
      workspaceId: 'workspace-a',
      visibility: 'personal',
      resourceState: 'active',
    };
    const verify = vi.fn(async () => ({
      ok: false as const,
      status: 400 as const,
      code: 'WORKSPACE_CONTEXT_REQUIRED',
      message: 'an explicit workspace context is required',
    }));
    const sendApiError = vi.fn();
    const authorize = createAuthorizeProjectRequest({
      db: {},
      getWorkspaceProject: () => row,
      getWorkspaceProjectByProjectId: () => row,
      verifyWorkspaceRequestAuthority: verify,
      sendApiError,
    });

    await expect(authorize(
      request({}),
      response(),
      'project-a',
      { mode: 'read' },
    )).resolves.toBe(false);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(sendApiError).toHaveBeenCalledWith(
      expect.anything(),
      400,
      'WORKSPACE_CONTEXT_REQUIRED',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('keeps locked/frozen Team projects readable but rejects writes', async () => {
    const row = {
      visibility: 'team',
      resourceState: 'frozen',
      createdByWorkspaceMemberId: 'member-a',
    };
    const sendApiError = vi.fn();
    const authorize = createAuthorizeProjectRequest({
      db: {},
      getWorkspaceProject: (_db, workspaceId) =>
        workspaceId === 'workspace-a' ? row : null,
      getWorkspaceProjectByProjectId: () => row,
      verifyWorkspaceRequestAuthority: async () => ({
        ok: true,
        context: context({ lifecycleState: 'locked' }),
      }),
      sendApiError,
    });
    const req = request({ workspaceId: 'workspace-a', memberId: 'member-a' });

    await expect(authorize(req, response(), 'project-a', { mode: 'read' }))
      .resolves.toBe(true);
    await expect(authorize(
      req,
      response(),
      'project-a',
      { mode: 'write', capability: 'writeFiles' },
    )).resolves.toBe(false);
    expect(sendApiError).toHaveBeenLastCalledWith(
      expect.anything(),
      403,
      'WORKSPACE_LOCKED',
      expect.any(String),
    );
  });

  it.each(['rename', 'delete', 'duplicate', 'writeFiles'] as const)(
    'keeps shared-project %s single-writer even for a Team workspace owner',
    async (capability) => {
      const row = {
        workspaceId: 'workspace-a',
        visibility: 'team',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'project-owner',
      };
      const sendApiError = vi.fn();
      const authorize = createAuthorizeProjectRequest({
        db: {},
        getWorkspaceProject: () => row,
        getWorkspaceProjectByProjectId: () => row,
        verifyWorkspaceRequestAuthority: async () => ({
          ok: true,
          context: context({
            workspaceMemberId: 'workspace-owner',
            role: 'owner',
          }),
        }),
        sendApiError,
      });

      await expect(authorize(
        request({ workspaceId: 'workspace-a', memberId: 'workspace-owner' }),
        response(),
        'project-a',
        { mode: 'write', capability },
      )).resolves.toBe(false);
      expect(sendApiError).toHaveBeenLastCalledWith(
        expect.anything(),
        403,
        'WORKSPACE_PROJECT_PERMISSION_DENIED',
        expect.any(String),
      );
    },
  );

  it('preserves shared-project comments for active Team viewers', async () => {
    const row = {
      workspaceId: 'workspace-a',
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'project-owner',
    };
    const authorize = createAuthorizeProjectRequest({
      db: {},
      getWorkspaceProject: () => row,
      getWorkspaceProjectByProjectId: () => row,
      verifyWorkspaceRequestAuthority: async () => ({
        ok: true,
        context: context({
          workspaceMemberId: 'workspace-owner',
          role: 'owner',
        }),
      }),
      sendApiError: vi.fn(),
    });

    await expect(authorize(
      request({ workspaceId: 'workspace-a', memberId: 'workspace-owner' }),
      response(),
      'project-a',
      { mode: 'write', capability: 'comment' },
    )).resolves.toBe(true);
  });

  it('preserves write access for the shared-project owner', async () => {
    const row = {
      visibility: 'team',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
    };
    const authorize = createAuthorizeProjectRequest({
      db: {},
      getWorkspaceProject: () => row,
      getWorkspaceProjectByProjectId: () => row,
      verifyWorkspaceRequestAuthority: async () => ({
        ok: true,
        context: context({ role: 'member' }),
      }),
      sendApiError: vi.fn(),
    });

    await expect(authorize(
      request({ workspaceId: 'workspace-a', memberId: 'member-a' }),
      response(),
      'project-a',
      { mode: 'write', capability: 'writeFiles' },
    )).resolves.toBe(true);
  });

  it.each(['owner', 'admin'] as const)(
    'does not let a Workspace %s mutate another member\'s Personal project',
    async (role) => {
      const row = {
        visibility: 'personal',
        resourceState: 'active',
        createdByWorkspaceMemberId: 'project-owner',
      };
      const callerMemberId = `workspace-${role}`;
      const sendApiError = vi.fn();
      const authorize = createAuthorizeProjectRequest({
        db: {},
        getWorkspaceProject: () => row,
        getWorkspaceProjectByProjectId: () => row,
        verifyWorkspaceRequestAuthority: async () => ({
          ok: true,
          context: context({
            workspaceMemberId: callerMemberId,
            role,
          }),
        }),
        sendApiError,
      });

      await expect(authorize(
        request({ workspaceId: 'workspace-a', memberId: callerMemberId }),
        response(),
        'project-a',
        { mode: 'write', capability: 'writeFiles' },
      )).resolves.toBe(false);
      expect(sendApiError).toHaveBeenCalledWith(
        expect.anything(),
        403,
        'WORKSPACE_PROJECT_PERMISSION_DENIED',
        'workspace project mutation is not allowed',
      );
    },
  );

  it.each([
    [
      'removed member',
      { ok: false as const, status: 403 as const, code: 'WORKSPACE_MEMBER_REMOVED', message: 'removed' },
    ],
    [
      'authority outage',
      {
        ok: false as const,
        status: 503 as const,
        code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
        message: 'unavailable',
        retryable: true as const,
      },
    ],
  ])('fails a bound read closed for %s', async (_label, result) => {
    const row = { visibility: 'team', resourceState: 'active' };
    const sendApiError = vi.fn();
    const authorize = createAuthorizeProjectRequest({
      db: {},
      getWorkspaceProject: () => row,
      getWorkspaceProjectByProjectId: () => row,
      verifyWorkspaceRequestAuthority: async () => result,
      sendApiError,
    });

    await expect(authorize(
      request({ workspaceId: 'workspace-a', memberId: 'member-a' }),
      response(),
      'project-a',
      { mode: 'read' },
    )).resolves.toBe(false);
    expect(sendApiError).toHaveBeenCalledWith(
      expect.anything(),
      result.status,
      result.code,
      result.message,
      expect.any(Object),
    );
  });

  it('denies a freshly verified cross-Workspace identity', async () => {
    const row = { visibility: 'team', resourceState: 'active' };
    const sendApiError = vi.fn();
    const authorize = createAuthorizeProjectRequest({
      db: {},
      getWorkspaceProject: (_db, workspaceId) =>
        workspaceId === 'workspace-a' ? row : null,
      getWorkspaceProjectByProjectId: () => row,
      verifyWorkspaceRequestAuthority: async () => ({
        ok: true,
        context: context({
          workspaceId: 'workspace-b',
          workspaceMemberId: 'member-b',
        }),
      }),
      sendApiError,
    });

    await expect(authorize(
      request({ workspaceId: 'workspace-b', memberId: 'member-b' }),
      response(),
      'project-a',
      { mode: 'read' },
    )).resolves.toBe(false);
    expect(sendApiError).toHaveBeenCalledWith(
      expect.anything(),
      403,
      'WORKSPACE_PROJECT_PERMISSION_DENIED',
      expect.any(String),
    );
  });

  it('accepts an exact navigation query pair and rejects header/query conflict', async () => {
    const row = { visibility: 'team', resourceState: 'active' };
    const verify = vi.fn(async (req: any) => ({
      ok: true as const,
      context: context({
        workspaceId: req.get('x-od-workspace-id'),
        workspaceMemberId: req.get('x-od-workspace-member-id'),
      }),
    }));
    const sendApiError = vi.fn();
    const authorize = createAuthorizeProjectRequest({
      db: {},
      getWorkspaceProject: (_db, workspaceId) =>
        workspaceId === 'workspace-a' ? row : null,
      getWorkspaceProjectByProjectId: () => row,
      verifyWorkspaceRequestAuthority: verify,
      sendApiError,
    });

    await expect(authorize(
      request({
        query: {
          workspaceId: 'workspace-a',
          workspaceMemberId: 'member-a',
        },
      }),
      response(),
      'project-a',
      { mode: 'read', allowNavigationQuery: true },
    )).resolves.toBe(true);

    await expect(authorize(
      request({
        workspaceId: 'workspace-b',
        memberId: 'member-b',
        query: {
          workspaceId: 'workspace-a',
          workspaceMemberId: 'member-a',
        },
      }),
      response(),
      'project-a',
      { mode: 'read', allowNavigationQuery: true },
    )).resolves.toBe(false);
    expect(sendApiError).toHaveBeenLastCalledWith(
      expect.anything(),
      400,
      'WORKSPACE_CONTEXT_CONFLICT',
      expect.any(String),
    );
  });
});
