import { describe, expect, it } from 'vitest';
import {
  TeamResourceShareForbiddenError,
  createTeamResourceShareService,
  parseSharedResourceIds,
  parseSharedResourceRecords,
  teamResourceRequestScopeFromContext,
  teamResourceRequestScopeForWorkspaceId,
  type TeamResourceRequestScope,
} from '../src/collab/team-resource-share.js';
import type {
  WorkspaceCollabContext,
  WorkspaceDirectoryItem,
} from '@open-design/contracts';
import type { ResourceHubPrincipal } from '../src/collab/resource-principal.js';

const unreachableRun = async (): Promise<string> => {
  throw new Error('Vela should not run when the permission gate stops sharing');
};
const principal: ResourceHubPrincipal = {
  memberId: 'wm-1',
  teamId: 't-1',
  role: 'member',
  lifecycleState: 'active',
};
const scope: TeamResourceRequestScope = { principal, canShare: true };
const readOnlyScope: TeamResourceRequestScope = { principal, canShare: false };

describe('team resource share permission gate', () => {
  it('does not manufacture a Team resource scope for an authoritative Personal workspace', () => {
    const personalContext = {
      workspaceId: 'personal-1',
      workspaceType: 'personal',
      workspaceMemberId: 'wm-personal',
      memberStatus: 'active',
      permissions: {
        canManageSharedResources: false,
        canShareProjects: false,
      },
    } as WorkspaceCollabContext;

    expect(teamResourceRequestScopeFromContext(personalContext)).toBeNull();
  });

  it('resolves a background operation from the exact event Workspace membership', () => {
    const directory: WorkspaceDirectoryItem[] = [
      {
        workspaceId: 'team-a',
        workspaceName: 'A',
        workspaceType: 'team',
        workspaceMemberId: 'wm-a',
        role: 'owner',
        memberStatus: 'active',
        lifecycleState: 'active',
      },
      {
        workspaceId: 'team-b',
        workspaceName: 'B',
        workspaceType: 'team',
        workspaceMemberId: 'wm-b',
        role: 'member',
        memberStatus: 'removed',
        lifecycleState: 'active',
      },
    ];

    expect(teamResourceRequestScopeForWorkspaceId(directory, 'team-a')).toMatchObject({
      principal: { teamId: 'team-a', memberId: 'wm-a' },
    });
    expect(teamResourceRequestScopeForWorkspaceId(directory, 'team-b')).toBeNull();
  });

  it('uses the request-scoped principal even when the daemon ambient workspace has changed', async () => {
    const requestPrincipal: ResourceHubPrincipal = {
      memberId: 'wm-a',
      teamId: 'team-a',
      role: 'owner',
      lifecycleState: 'active',
      workspaceType: 'team',
    };
    const calls: Array<{ args: string[]; workspaceId: string | undefined }> = [];
    const service = createTeamResourceShareService({
      kind: 'skill',
      idPrefix: 'skill',
      resolveDir: () => '/tmp/skill',
      run: async (args, workspaceId) => {
        calls.push({ args, workspaceId });
        return JSON.stringify({ version: 1 });
      },
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
    });

    await service.share('skill-a', { principal: requestPrincipal, canShare: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.workspaceId).toBe('team-a');
    expect(calls[0]?.args[2]).toBe('skill-team-a-skill-a');
  });

  it('refuses a team member who cannot manage shared resources (403 marker)', async () => {
    const service = createTeamResourceShareService({
      kind: 'design_system',
      idPrefix: 'ds',
      resolveDir: () => '/tmp/ds',
      run: unreachableRun,
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
    });
    await expect(service.share('ds-1', readOnlyScope)).rejects.toBeInstanceOf(
      TeamResourceShareForbiddenError,
    );
    expect(service.isShared('ds-1', readOnlyScope)).toBe(false);
  });

  it('keeps a non-Vela dev workspace on the unconfigured no-op path', async () => {
    const service = createTeamResourceShareService({
      kind: 'design_system',
      idPrefix: 'ds',
      resolveDir: () => '/tmp/ds',
      run: unreachableRun,
      env: {},
    });

    expect(service.configured).toBe(false);
    expect(await service.share('ds-1', scope)).toBeNull();
    expect(await service.unshare('ds-1', scope)).toBe(false);
    expect(await service.sharedIds(scope)).toEqual([]);
  });

  it('removes a team resource through the Vela CLI', async () => {
    const calls: string[][] = [];
    const run = async (args: string[]): Promise<string> => {
      calls.push(args);
      if (args[0] === 'push') return JSON.stringify({ version: 1 });
      if (args[0] === 'remove') return JSON.stringify({ ok: true });
      throw new Error(`unexpected args: ${args.join(' ')}`);
    };
    const service = createTeamResourceShareService({
      kind: 'skill',
      idPrefix: 'skill',
      resolveDir: () => '/tmp/skill',
      run,
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
    });

    expect(await service.share('mock-team-expert-kit', scope)).toEqual({ version: 1 });
    expect(service.isShared('mock-team-expert-kit', scope)).toBe(true);
    await expect(service.unshare('mock-team-expert-kit', scope)).resolves.toBe(true);
    expect(service.isShared('mock-team-expert-kit', scope)).toBe(false);
    expect(calls.at(-1)).toEqual([
      'remove',
      'skill-t-1-mock-team-expert-kit',
      '--json',
    ]);
  });

  it('keeps fallback shared state isolated when two Workspace requests interleave', async () => {
    const workspaceA: TeamResourceRequestScope = {
      principal: { ...principal, memberId: 'wm-a', teamId: 'team-a' },
      canShare: true,
    };
    const workspaceB: TeamResourceRequestScope = {
      principal: { ...principal, memberId: 'wm-b', teamId: 'team-b' },
      canShare: true,
    };
    const service = createTeamResourceShareService({
      kind: 'skill',
      idPrefix: 'skill',
      resolveDir: () => '/tmp/skill',
      run: async (args) => {
        if (args[0] === 'push') return JSON.stringify({ version: 1 });
        throw new Error('hub listing temporarily unavailable');
      },
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
    });

    await service.share('skill-a', workspaceA);
    await service.share('skill-b', workspaceB);

    expect(service.isShared('skill-a', workspaceA)).toBe(true);
    expect(service.isShared('skill-b', workspaceB)).toBe(true);
    await expect(service.sharedIds(workspaceA)).resolves.toEqual(['skill-a']);
    await expect(service.sharedIds(workspaceB)).resolves.toEqual(['skill-b']);
  });

  it('distinguishes a fallback catalog from an authoritative hub listing', async () => {
    let listing: 'failure' | 'empty' | 'shared' = 'failure';
    const service = createTeamResourceShareService({
      kind: 'skill',
      idPrefix: 'skill',
      resolveDir: () => '/tmp/skill',
      run: async (args) => {
        if (args[0] === 'push') return JSON.stringify({ version: 1 });
        if (listing === 'failure') throw new Error('hub unavailable');
        return JSON.stringify({
          resources: listing === 'shared'
            ? [{ id: 'skill-skill-a', kind: 'skill', deletedAt: null }]
            : [],
        });
      },
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
    });

    await service.share('skill-a', scope);
    await expect(service.sharedResources(scope)).resolves.toEqual([
      { id: 'skill-a', canUnshare: true },
    ]);
    await expect(
      service.sharedResources(scope, { authoritative: true }),
    ).rejects.toThrow('hub unavailable');

    listing = 'empty';
    await expect(
      service.sharedResources(scope, { authoritative: true }),
    ).resolves.toEqual([]);

    listing = 'shared';
    await expect(
      service.sharedResources(scope, { authoritative: true }),
    ).resolves.toEqual([
      { id: 'skill-a', canUnshare: false },
    ]);
  });

  it('lists resources already shared through another daemon via Vela CLI', async () => {
    const run = async (args: string[]): Promise<string> => {
      expect(args).toEqual(['shared', '--json']);
      return JSON.stringify({
        resources: [
          {
            id: 'skill-mock-team-expert-kit',
            kind: 'skill',
            deletedAt: null,
            ownerMemberId: 'wm-1',
            metadata: { title: 'Mock kit', description: 'Shared kit' },
          },
          { id: 'skill-deleted-kit', kind: 'skill', deletedAt: '2026-07-13T00:00:00Z' },
          { id: 'project-p1', kind: 'project', deletedAt: null },
        ],
      });
    };
    const service = createTeamResourceShareService({
      kind: 'skill',
      idPrefix: 'skill',
      resolveDir: () => '/tmp/skill',
      run,
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
    });

    expect(await service.sharedIds(readOnlyScope)).toEqual(['mock-team-expert-kit']);
    await expect(service.sharedResources(readOnlyScope)).resolves.toEqual([
      {
        id: 'mock-team-expert-kit',
        title: 'Mock kit',
        description: 'Shared kit',
        ownerMemberId: 'wm-1',
        canUnshare: true,
      },
    ]);
    expect(service.isShared('mock-team-expert-kit', readOnlyScope)).toBe(true);
  });

  it('preserves the workspace-scoped hub id for teammate materialization', async () => {
    const service = createTeamResourceShareService({
      kind: 'skill',
      idPrefix: 'skill',
      resolveDir: () => '/tmp/skill',
      run: async () => JSON.stringify({
        resources: [
          {
            id: 'skill-t-1-shared-kit',
            kind: 'skill',
            deletedAt: null,
            ownerMemberId: 'wm-owner',
            metadata: { localId: 'shared-kit' },
          },
        ],
      }),
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
    });

    const [resource] = await service.sharedResources(readOnlyScope);
    expect(resource).toEqual({
      id: 'shared-kit',
      ownerMemberId: 'wm-owner',
      canUnshare: false,
    });
    expect(resource?.hubResourceId).toBe('skill-t-1-shared-kit');
    expect(Object.keys(resource ?? {})).not.toContain('hubResourceId');
  });

  it('reconciles stale local shared ids when Vela reports the resource removed', async () => {
    let remoteHasSkill = true;
    const run = async (args: string[]): Promise<string> => {
      if (args[0] === 'push') return JSON.stringify({ version: 1 });
      expect(args).toEqual(['shared', '--json']);
      return JSON.stringify({
        resources: remoteHasSkill
          ? [
            {
              id: 'skill-mock-team-expert-kit',
              kind: 'skill',
              deletedAt: null,
              ownerMemberId: 'wm-1',
            },
          ]
          : [],
      });
    };
    const service = createTeamResourceShareService({
      kind: 'skill',
      idPrefix: 'skill',
      resolveDir: () => '/tmp/skill',
      run,
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
    });

    expect(await service.share('mock-team-expert-kit', scope)).toEqual({ version: 1 });
    expect(await service.sharedIds(scope)).toEqual(['mock-team-expert-kit']);
    expect(service.isShared('mock-team-expert-kit', scope)).toBe(true);

    remoteHasSkill = false;

    expect(await service.sharedIds(scope)).toEqual([]);
    expect(service.isShared('mock-team-expert-kit', scope)).toBe(false);
  });

  it('marks resources unshareable for non-owner non-uploader members', async () => {
    const run = async (): Promise<string> => JSON.stringify({
      resources: [
        {
          id: 'plugin-shared-kit',
          kind: 'plugin',
          deletedAt: null,
          ownerMemberId: 'wm-owner',
        },
      ],
    });
    const service = createTeamResourceShareService({
      kind: 'plugin',
      idPrefix: 'plugin',
      resolveDir: () => '/tmp/plugin',
      run,
      env: { OD_WORKSPACE_CONTEXT_SOURCE: 'vela' },
    });

    await expect(service.sharedResources(scope)).resolves.toEqual([
      { id: 'shared-kit', ownerMemberId: 'wm-owner', canUnshare: false },
    ]);
    await expect(service.unshare('shared-kit', scope)).rejects.toBeInstanceOf(
      TeamResourceShareForbiddenError,
    );
  });

  it('parses shared resource ids by kind and prefix', () => {
    expect(
      parseSharedResourceIds(
        JSON.stringify({
          resources: [
            { id: 'plugin-alpha', kind: 'plugin' },
            { id: 'skill-alpha', kind: 'skill' },
            { id: 'skill-beta', kind: 'skill', deletedAt: null },
            { id: 'skill-gamma', kind: 'skill', deletedAt: '2026-07-13T00:00:00Z' },
          ],
        }),
        'skill',
        'skill',
      ),
    ).toEqual(['alpha', 'beta']);
  });

  it('parses shared resource metadata for team cards', () => {
    expect(
      parseSharedResourceRecords(
        JSON.stringify({
          resources: [
            {
              id: 'skill-alpha',
              kind: 'skill',
              ownerMemberId: 'wm-1',
              metadata: { title: 'Alpha skill', description: 'Useful in teams' },
            },
          ],
        }),
        'skill',
        'skill',
      ),
    ).toEqual([{
      id: 'alpha',
      title: 'Alpha skill',
      description: 'Useful in teams',
      ownerMemberId: 'wm-1',
    }]);
  });

  it('decodes legacy design-system resource ids back to user ids', () => {
    expect(
      parseSharedResourceRecords(
        JSON.stringify({
          resources: [
            {
              id: 'ds-user-design-system-inspired-by-agentic',
              kind: 'design_system',
              ownerMemberId: 'wm-1',
              metadata: { title: 'Agentic' },
            },
          ],
        }),
        'design_system',
        'ds',
      ),
    ).toEqual([{
      id: 'user:design-system-inspired-by-agentic',
      title: 'Agentic',
      ownerMemberId: 'wm-1',
    }]);
  });
});
