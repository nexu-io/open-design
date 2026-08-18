import { describe, expect, it, vi } from 'vitest';
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

describe('local project mutation authority', () => {
  it('deletes locally without consulting either settled or fresh remote authority', async () => {
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
      context: {} as never,
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
    expect(lease).not.toHaveBeenCalled();
    expect(fresh).not.toHaveBeenCalled();
  });

  it.each([
    ['Team visibility', localOnlyProject({ visibility: 'team' })],
    ['hub-backed project', localOnlyProject({ resourceHubResourceId: 'hub-1' })],
    ['synced project', localOnlyProject({ syncState: 'synced' })],
  ])('keeps %s locally mutable during an authority outage', async (_label, row) => {
    const { exact, any } = lookups(row);
    const fresh = vi.fn(async () => ({
      ok: false as const,
      status: 503 as const,
      code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
      message: 'fresh authority is unavailable',
      retryable: true as const,
    }));
    const lease = vi.fn();
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
    )).resolves.toBe(true);
    expect(lease).not.toHaveBeenCalled();
    expect(fresh).not.toHaveBeenCalled();
    expect(sendApiError).not.toHaveBeenCalled();
  });

  it('keeps non-delete mutations off remote authority too', async () => {
    const row = localOnlyProject();
    const { exact, any } = lookups(row);
    const fresh = vi.fn(async () => ({
      ok: true as const,
      context: {} as never,
    }));
    const lease = vi.fn(async () => ({
      ok: true as const,
      context: {} as never,
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
    expect(fresh).not.toHaveBeenCalled();
    expect(lease).not.toHaveBeenCalled();
  });

  it('still rejects an explicit member that is not the persisted creator', async () => {
    const row = localOnlyProject({ createdByWorkspaceMemberId: 'member-other' });
    const { exact, any } = lookups(row);
    const fresh = vi.fn();
    const lease = vi.fn();
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
    expect(fresh).not.toHaveBeenCalled();
    expect(lease).not.toHaveBeenCalled();
    expect(sendApiError).toHaveBeenCalledWith(
      expect.anything(),
      403,
      'WORKSPACE_PROJECT_PERMISSION_DENIED',
      expect.any(String),
    );
  });
});
