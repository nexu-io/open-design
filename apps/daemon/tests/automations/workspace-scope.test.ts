import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDirectoryItem } from '@open-design/contracts';
import {
  authorizePersistedAutomationWorkspaceScope,
  authorizePersistedProjectWorkspace,
  bindProjectToPersistedAutomationWorkspace,
  normalizePersistedAutomationWorkspaceScope,
} from '../../src/automations/workspace-scope.js';

function directoryItem(
  workspaceId: string,
  workspaceMemberId: string,
  overrides: Partial<WorkspaceDirectoryItem> = {},
): WorkspaceDirectoryItem {
  return {
    workspaceId,
    workspaceName: workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    ...overrides,
  };
}

describe('persisted automation Workspace scope', () => {
  it('binds the exact persisted billing address without consulting membership authority', () => {
    const ensureWorkspaceProject = vi.fn();

    bindProjectToPersistedAutomationWorkspace(
      ensureWorkspaceProject,
      {
        workspaceId: 'workspace-a',
        workspaceMemberId: 'member-a',
      },
      'project-a',
      123,
    );

    expect(ensureWorkspaceProject).toHaveBeenCalledWith({
      projectId: 'project-a',
      workspaceId: 'workspace-a',
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: 'member-a',
      updatedByWorkspaceMemberId: 'member-a',
      syncState: 'local_only',
      resourceHubResourceId: null,
      cloudTombstonedAt: null,
      createdAt: 123,
      updatedAt: 123,
    });
  });

  it('keeps the configured A identity after the directory also exposes B', async () => {
    const fetchDirectory = vi.fn(async () => ({
      ok: true,
      items: [
        directoryItem('workspace-b', 'member-b'),
        directoryItem('workspace-a', 'member-a'),
      ],
    }));

    await expect(
      authorizePersistedAutomationWorkspaceScope(
        { workspaceId: 'workspace-a', workspaceMemberId: 'member-a' },
        fetchDirectory,
      ),
    ).resolves.toMatchObject({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
    });
  });

  it('fails closed on removal and authority outage', async () => {
    await expect(
      authorizePersistedAutomationWorkspaceScope(
        { workspaceId: 'workspace-a', workspaceMemberId: 'member-a' },
        async () => ({
          ok: true,
          items: [
            directoryItem('workspace-a', 'member-a', { memberStatus: 'removed' }),
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED', retryable: false });

    await expect(
      authorizePersistedAutomationWorkspaceScope(
        { workspaceId: 'workspace-a', workspaceMemberId: 'member-a' },
        async () => ({ ok: false, items: [] }),
      ),
    ).rejects.toMatchObject({
      code: 'WORKSPACE_AUTHORITY_UNAVAILABLE',
      retryable: true,
    });
  });

  it('re-reads authority for every trigger and rejects a member removed after configuration', async () => {
    let removed = false;
    const fetchDirectory = vi.fn(async () => ({
      ok: true,
      items: [
        directoryItem('workspace-a', 'member-a', {
          memberStatus: removed ? 'removed' : 'active',
        }),
      ],
    }));

    await expect(
      authorizePersistedAutomationWorkspaceScope(
        { workspaceId: 'workspace-a', workspaceMemberId: 'member-a' },
        fetchDirectory,
      ),
    ).resolves.toMatchObject({ workspaceId: 'workspace-a' });

    removed = true;
    await expect(
      authorizePersistedAutomationWorkspaceScope(
        { workspaceId: 'workspace-a', workspaceMemberId: 'member-a' },
        fetchDirectory,
      ),
    ).rejects.toMatchObject({ code: 'WORKSPACE_ACCESS_DENIED' });
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
  });

  it('keeps historical no-scope automation records truly unbound', () => {
    expect(normalizePersistedAutomationWorkspaceScope(undefined)).toBeNull();
    expect(normalizePersistedAutomationWorkspaceScope(null)).toBeNull();
    expect(normalizePersistedAutomationWorkspaceScope({})).toBeNull();
  });

  it('uses a reused project binding instead of another selected Workspace', async () => {
    await expect(
      authorizePersistedProjectWorkspace(
        'workspace-a',
        async () => ({
          ok: true,
          items: [
            directoryItem('workspace-b', 'member-b'),
            directoryItem('workspace-a', 'member-a'),
          ],
        }),
      ),
    ).resolves.toMatchObject({
      workspaceId: 'workspace-a',
      workspaceMemberId: 'member-a',
    });
  });
});
