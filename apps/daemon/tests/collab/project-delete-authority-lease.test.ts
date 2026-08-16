import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { createEnforceWorkspaceProjectMutation } from '../../src/routes/project/index.js';
import type { WorkspaceResourceAccessInput } from '../../src/collab/workspace-resource-mutation.js';

function request() {
  const headers: Record<string, string> = {
    'x-od-workspace-id': 'workspace-personal',
    'x-od-workspace-member-id': 'member-owner',
  };
  return {
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

function personalContext(
  overrides: Partial<WorkspaceCollabContext> = {},
): WorkspaceCollabContext {
  return {
    workspaceId: 'workspace-personal',
    workspaceName: 'Personal',
    workspaceType: 'personal',
    workspaceMemberId: 'member-owner',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 1,
      usedSeats: 1,
      availableSeats: 0,
      isSeatFull: true,
    },
    permissions: {
      canManageMembers: true,
      canManageBilling: true,
      canInviteMembers: false,
      canManageAutoRecharge: true,
      canShareProjects: false,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: true,
    },
    ...overrides,
  };
}

function localOnlyProject(
  overrides: WorkspaceResourceAccessInput = {},
): WorkspaceResourceAccessInput {
  return {
    workspaceId: 'workspace-personal',
    visibility: 'personal',
    resourceState: 'active',
    createdByWorkspaceMemberId: 'member-owner',
    resourceHubResourceId: null,
    syncState: 'local_only',
    ...overrides,
  };
}

function lookups(row: WorkspaceResourceAccessInput) {
  return {
    exact: (_db: unknown, workspaceId: string) =>
      row.workspaceId === workspaceId ? row : null,
    any: () => row,
  };
}

describe('personal local-only project delete authority lease', () => {
  it('deletes from a warm personal lease without starting the fresh authority request', async () => {
    const row = localOnlyProject();
    const { exact, any } = lookups(row);
    const fresh = vi.fn(async () => ({
      ok: false as const,
      status: 503 as const,
      code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
      message: 'fresh authority is unavailable',
      retryable: true as const,
    }));
    const lease = vi.fn(async () => ({
      ok: true as const,
      context: personalContext(),
    }));
    const enforce = createEnforceWorkspaceProjectMutation(fresh, lease);

    await expect(enforce(
      request(),
      {} as any,
      vi.fn(),
      exact,
      any,
      {},
      'project-a',
      'delete',
    )).resolves.toBe(true);
    expect(lease).toHaveBeenCalledTimes(1);
    expect(fresh).not.toHaveBeenCalled();
  });

  it.each([
    ['Team visibility', localOnlyProject({ visibility: 'team' }), personalContext()],
    ['hub-backed project', localOnlyProject({ resourceHubResourceId: 'hub-1' }), personalContext()],
    ['synced project', localOnlyProject({ syncState: 'synced' }), personalContext()],
    ['different creator', localOnlyProject({ createdByWorkspaceMemberId: 'member-other' }), personalContext()],
    ['locked membership', localOnlyProject(), personalContext({ lifecycleState: 'locked' })],
    ['Team workspace', localOnlyProject(), personalContext({ workspaceType: 'team', teamId: 'workspace-personal' })],
  ])('falls through to fresh authority for %s', async (_label, row, context) => {
    const { exact, any } = lookups(row);
    const fresh = vi.fn(async () => ({
      ok: false as const,
      status: 503 as const,
      code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
      message: 'fresh authority is unavailable',
      retryable: true as const,
    }));
    const lease = vi.fn(async () => ({ ok: true as const, context }));
    const sendApiError = vi.fn();
    const enforce = createEnforceWorkspaceProjectMutation(fresh, lease);

    await expect(enforce(
      request(),
      {} as any,
      sendApiError,
      exact,
      any,
      {},
      'project-a',
      'delete',
    )).resolves.toBe(false);
    expect(lease).toHaveBeenCalledTimes(1);
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(sendApiError).toHaveBeenCalledWith(
      expect.anything(),
      503,
      'WORKSPACE_AUTHORITY_UNAVAILABLE',
      expect.any(String),
      { retryable: true },
    );
  });

  it('keeps non-delete mutations on fresh authority even when the lease is eligible', async () => {
    const row = localOnlyProject();
    const { exact, any } = lookups(row);
    const fresh = vi.fn(async () => ({
      ok: true as const,
      context: personalContext(),
    }));
    const lease = vi.fn(async () => ({
      ok: true as const,
      context: personalContext(),
    }));
    const enforce = createEnforceWorkspaceProjectMutation(fresh, lease);

    await expect(enforce(
      request(),
      {} as any,
      vi.fn(),
      exact,
      any,
      {},
      'project-a',
      'writeFiles',
    )).resolves.toBe(true);
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(lease).not.toHaveBeenCalled();
  });
});
