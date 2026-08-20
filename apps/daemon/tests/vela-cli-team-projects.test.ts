import { describe, expect, it } from 'vitest';
import {
  createScopedVelaTeamProjectCatalogClientCache,
  createVelaCliTeamProjectCatalog,
  createVelaCliTeamProjectCatalogClient,
  shouldUseVelaCliTeamProjectCatalog,
} from '../src/collab/vela-cli-team-projects.js';

describe('Vela CLI team-project catalog adapter', () => {
  it('gets one project through the exact workspace-scoped command', async () => {
    const calls: Array<{
      args: string[];
      workspaceId: string | undefined;
    }> = [];
    const catalog = createVelaCliTeamProjectCatalog({
      run: async (args, workspaceId) => {
        calls.push({ args, workspaceId });
        return JSON.stringify({
          projectId: 'p1',
          ownerMemberId: 'wm-owner',
          displayName: 'Electric Studio 2',
          syncState: 'synced',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-02T00:00:00.000Z',
        });
      },
    });

    await expect(catalog.get('p1', 'team-captured')).resolves.toMatchObject({
      projectId: 'p1',
      ownerMemberId: 'wm-owner',
      name: 'Electric Studio 2',
    });
    expect(calls).toEqual([
      {
        args: ['get', 'p1', '--json'],
        workspaceId: 'team-captured',
      },
    ]);
  });

  it('returns null for an authoritative not-found without listing', async () => {
    const calls: string[][] = [];
    const catalog = createVelaCliTeamProjectCatalog({
      run: async (args) => {
        calls.push(args);
        throw new Error(
          'get team project: API request failed with status 404: team_project_not_found',
        );
      },
    });

    await expect(catalog.get('missing', 'team-1')).resolves.toBeNull();
    expect(calls).toEqual([['get', 'missing', '--json']]);
  });

  it('caches exact-command capability fallback but not authorization failures', async () => {
    const capabilityCalls: string[][] = [];
    const capabilityCatalog = createVelaCliTeamProjectCatalog({
      supportsTeamProjects: () => true,
      run: async (args) => {
        capabilityCalls.push(args);
        if (args[0] === 'get') {
          throw new Error('unknown command "get" for "team-projects"');
        }
        return JSON.stringify({
          projects: [
            {
              projectId: 'p1',
              ownerMemberId: 'wm-owner',
              syncState: 'synced',
              createdAt: '2026-07-01T00:00:00.000Z',
              updatedAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        });
      },
    });

    await expect(capabilityCatalog.get('p1', 'team-1')).resolves.toMatchObject({
      projectId: 'p1',
    });
    await expect(capabilityCatalog.get('p1', 'team-1')).resolves.toMatchObject({
      projectId: 'p1',
    });
    expect(capabilityCalls).toEqual([
      ['get', 'p1', '--json'],
      ['list'],
      ['list'],
    ]);

    for (const message of [
      'get team project: API request failed with status 401: unauthenticated',
      'get team project: API request failed with status 403: workspace_forbidden',
      'get team project: API request failed with status 500',
      'connect ECONNRESET',
    ]) {
      let calls = 0;
      const catalog = createVelaCliTeamProjectCatalog({
        run: async () => {
          calls += 1;
          throw new Error(message);
        },
      });
      await expect(catalog.get('p1', 'team-1')).rejects.toThrow(message);
      await expect(catalog.get('p1', 'team-1')).rejects.toThrow(message);
      expect(calls).toBe(2);
    }
  });

  it('treats only a code-less API 404 as an old endpoint capability miss', async () => {
    const calls: string[][] = [];
    const catalog = createVelaCliTeamProjectCatalog({
      supportsTeamProjects: () => true,
      run: async (args) => {
        calls.push(args);
        if (args[0] === 'get') {
          throw new Error('get team project: API request failed with status 404');
        }
        return JSON.stringify({
          projects: [
            {
              projectId: 'p1',
              ownerMemberId: 'wm-owner',
              syncState: 'synced',
              createdAt: '2026-07-01T00:00:00.000Z',
              updatedAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        });
      },
    });

    await expect(catalog.get('p1', 'team-1')).resolves.toMatchObject({
      projectId: 'p1',
    });
    expect(calls).toEqual([['get', 'p1', '--json'], ['list']]);
  });

  it('uses an explicitly captured workspace for an authoritative list', async () => {
    const catalog = createVelaCliTeamProjectCatalog({
      supportsTeamProjects: () => true,
      run: async (args, workspaceId) => {
        expect(args).toEqual(['list']);
        expect(workspaceId).toBe('team-captured');
        return JSON.stringify({ projects: [] });
      },
    });

    await expect(catalog.list('team-captured')).resolves.toEqual([]);
  });

  it('keeps the rich membership list on its explicit principal when active workspace switches during capability detection', async () => {
    let activeWorkspaceId = 'team-a';
    const calls: Array<{ args: string[]; workspaceId: string | undefined }> = [];
    const client = createVelaCliTeamProjectCatalogClient({
      supportsTeamProjects: async () => {
        activeWorkspaceId = 'team-b';
        return true;
      },
      run: async (args, workspaceId) => {
        calls.push({ args, workspaceId });
        return JSON.stringify({ projects: [] });
      },
    });

    await expect(client.list({
      memberId: 'member-a',
      teamId: 'team-a',
      role: 'member',
      lifecycleState: 'active',
    })).resolves.toEqual([]);

    expect(activeWorkspaceId).toBe('team-b');
    expect(calls).toEqual([{ args: ['list'], workspaceId: 'team-a' }]);
  });

  it('keeps the catalog revision separate from the owner project metadata timestamp', async () => {
    const client = createVelaCliTeamProjectCatalogClient({
      supportsTeamProjects: () => true,
      run: async () => JSON.stringify({
        projects: [{
          id: 'catalog-row-1',
          workspaceId: 'team-a',
          projectId: 'project-a',
          resourceId: 'resource-a',
          ownerMemberId: 'owner-a',
          displayName: 'Renamed by owner',
          syncState: 'synced',
          createdAt: '2026-08-01T00:00:00.000Z',
          // Catalog retries can restamp this row long after the human edit.
          updatedAt: '2026-08-04T09:30:00.000Z',
          metadata: { updatedAt: 1785776400000 },
        }],
      }),
    });

    await expect(client.list({
      memberId: 'reader-a',
      teamId: 'team-a',
      role: 'member',
      lifecycleState: 'active',
    })).resolves.toEqual([
      expect.objectContaining({
        projectId: 'project-a',
        displayName: 'Renamed by owner',
        updatedAt: '2026-08-04T09:30:00.000Z',
        originProjectUpdatedAt: 1785776400000,
      }),
    ]);
  });

  it('partitions cached client reads by the complete captured principal', async () => {
    const calls: string[] = [];
    const cached = createScopedVelaTeamProjectCatalogClientCache({
      list: async (principal) => {
        calls.push(principal.teamId);
        return [];
      },
      upsert: async () => null,
    });
    const principalA = {
      memberId: 'member-a',
      teamId: 'team-a',
      role: 'member' as const,
      lifecycleState: 'active' as const,
    };
    const principalB = {
      memberId: 'member-b',
      teamId: 'team-b',
      role: 'member' as const,
      lifecycleState: 'active' as const,
    };

    await cached.list(principalA);
    await cached.list(principalB);
    await cached.list(principalA);

    expect(calls).toEqual(['team-a', 'team-b']);
  });

  it('drops the exact cached project list after a successful upsert', async () => {
    const principal = {
      memberId: 'member-a',
      teamId: 'team-a',
      role: 'member' as const,
      lifecycleState: 'active' as const,
    };
    let projectIds = ['project-before'];
    let listCalls = 0;
    const cached = createScopedVelaTeamProjectCatalogClientCache({
      list: async () => {
        listCalls += 1;
        return projectIds.map((projectId) => ({
          id: `row-${projectId}`,
          workspaceId: principal.teamId,
          projectId,
          resourceId: `resource-${projectId}`,
          ownerMemberId: principal.memberId,
          displayName: projectId,
          syncState: 'synced' as const,
          lastSyncedVersionId: null,
          createdAt: '2026-07-01T00:00:00.000Z',
          originProjectUpdatedAt: null,
          updatedAt: '2026-07-01T00:00:00.000Z',
          access: {
            canView: true,
            canComment: true,
            canEdit: false,
            frozen: false,
          },
        }));
      },
      upsert: async (input) => {
        projectIds = [input.projectId];
        return null;
      },
    });

    await expect(cached.list(principal)).resolves.toMatchObject([
      { projectId: 'project-before' },
    ]);
    await cached.upsert({
      projectId: 'project-after',
      resourceId: 'resource-project-after',
    }, principal);
    await expect(cached.list(principal)).resolves.toMatchObject([
      { projectId: 'project-after' },
    ]);
    expect(listCalls).toBe(2);
  });

  it('drops every principal after an external catalog mutation', async () => {
    const calls: string[] = [];
    const cached = createScopedVelaTeamProjectCatalogClientCache({
      list: async (principal) => {
        calls.push(principal.teamId);
        return [];
      },
      upsert: async () => null,
    });
    const principalA = {
      memberId: 'member-a',
      teamId: 'team-a',
      role: 'member' as const,
      lifecycleState: 'active' as const,
    };
    const principalB = {
      memberId: 'member-b',
      teamId: 'team-b',
      role: 'member' as const,
      lifecycleState: 'active' as const,
    };

    await cached.list(principalA);
    await cached.list(principalB);
    cached.invalidate();
    await cached.list(principalA);
    await cached.list(principalB);

    expect(calls).toEqual(['team-a', 'team-b', 'team-a', 'team-b']);
  });

  it('drops every member cache in one exact Workspace without evicting another Workspace', async () => {
    const calls: string[] = [];
    const cached = createScopedVelaTeamProjectCatalogClientCache({
      list: async (principal) => {
        calls.push(`${principal.teamId}:${principal.memberId}`);
        return [];
      },
      upsert: async () => null,
    });
    const principalA1 = {
      memberId: 'member-a1', teamId: 'team-a', role: 'member' as const,
      lifecycleState: 'active' as const,
    };
    const principalA2 = {
      memberId: 'member-a2', teamId: 'team-a', role: 'member' as const,
      lifecycleState: 'active' as const,
    };
    const principalB = {
      memberId: 'member-b', teamId: 'team-b', role: 'member' as const,
      lifecycleState: 'active' as const,
    };

    await cached.list(principalA1);
    await cached.list(principalA2);
    await cached.list(principalB);
    cached.invalidateWorkspace('team-a');
    await cached.list(principalA1);
    await cached.list(principalA2);
    await cached.list(principalB);

    expect(calls).toEqual([
      'team-a:member-a1', 'team-a:member-a2', 'team-b:member-b',
      'team-a:member-a1', 'team-a:member-a2',
    ]);
  });

  it('rejects a rich catalog with rows outside the explicit workspace as incomplete', async () => {
    const client = createVelaCliTeamProjectCatalogClient({
      supportsTeamProjects: () => true,
      run: async () => JSON.stringify({
        projects: [
          {
            id: 'row-b',
            workspaceId: 'team-b',
            projectId: 'project-b',
            resourceId: 'resource-b',
            ownerMemberId: 'member-b',
            syncState: 'synced',
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      }),
    });

    await expect(client.list({
      memberId: 'member-a',
      teamId: 'team-a',
      role: 'member',
      lifecycleState: 'active',
    })).rejects.toThrow(/incomplete team project catalog/);
  });

  it('rejects a partially parseable rich catalog instead of treating dropped rows as confirmed absence', async () => {
    const client = createVelaCliTeamProjectCatalogClient({
      supportsTeamProjects: () => true,
      run: async () => JSON.stringify({
        projects: [
          {
            id: 'row-valid',
            workspaceId: 'team-a',
            projectId: 'project-valid',
            resourceId: 'resource-valid',
            ownerMemberId: 'member-a',
            syncState: 'synced',
            createdAt: '2026-07-01T00:00:00.000Z',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
          {
            id: 'row-malformed',
            workspaceId: 'team-a',
            projectId: 'project-malformed',
          },
        ],
      }),
    });

    await expect(client.list({
      memberId: 'member-a',
      teamId: 'team-a',
      role: 'member',
      lifecycleState: 'active',
    })).rejects.toThrow(/incomplete team project catalog/);
  });

  it('keeps catalog upsert and remove on their explicit principal across capability awaits', async () => {
    let activeWorkspaceId = 'team-a';
    const calls: Array<{ args: string[]; workspaceId: string | undefined }> = [];
    const catalog = createVelaCliTeamProjectCatalog({
      supportsTeamProjects: async () => {
        activeWorkspaceId = 'team-b';
        return true;
      },
      run: async (args, workspaceId) => {
        calls.push({ args, workspaceId });
        return '';
      },
    });
    const principal = {
      memberId: 'member-a',
      teamId: 'team-a',
      role: 'member' as const,
      lifecycleState: 'active' as const,
    };

    await catalog.upsert({ projectId: 'project-a' }, principal);
    activeWorkspaceId = 'team-a';
    await catalog.remove('project-a', principal);

    expect(calls).toEqual([
      {
        args: ['upsert', 'project-a', '--resource-id', 'project-project-a'],
        workspaceId: 'team-a',
      },
      {
        args: ['remove', 'project-a'],
        workspaceId: 'team-a',
      },
    ]);
  });

  it('maps list output into team-project DTOs', async () => {
    const catalog = createVelaCliTeamProjectCatalog({
      supportsTeamProjects: () => true,
      run: async (args, workspaceId) => {
        expect(args).toEqual(['list']);
        expect(workspaceId).toBe('team-selected');
        return JSON.stringify({
          projects: [
            {
              projectId: 'p1',
              ownerMemberId: 'wm-owner',
              displayName: 'Electric Studio 2',
              syncState: 'synced',
              metadata: {
                skillId: 'deck-builder',
                designSystemId: 'ds-emerald',
                createdAt: 1719820800000,
                updatedAt: 1719907200000,
                metadata: { kind: 'deck', entryFile: 'index.html' },
              },
              createdAt: '2026-07-01T00:00:00.000Z',
              updatedAt: '2026-07-02T00:00:00.000Z',
            },
          ],
        });
      },
    });

    await expect(catalog.list('team-selected')).resolves.toEqual([
      {
        projectId: 'p1',
        ownerMemberId: 'wm-owner',
        sharedAt: '2026-07-01T00:00:00.000Z',
        name: 'Electric Studio 2',
        skillId: 'deck-builder',
        designSystemId: 'ds-emerald',
        createdAt: 1719820800000,
        updatedAt: 1719907200000,
        metadata: { kind: 'deck', entryFile: 'index.html' },
      },
    ]);
  });

  it('hides catalog rows whose project bytes are not synced yet', async () => {
    const catalog = createVelaCliTeamProjectCatalog({
      supportsTeamProjects: () => true,
      run: async () => JSON.stringify({
        projects: [
          {
            projectId: 'pending',
            ownerMemberId: 'wm-owner',
            displayName: 'Pending Upload',
            syncState: 'pending_upload',
            createdAt: '2026-07-01T00:00:00.000Z',
          },
          {
            projectId: 'failed',
            ownerMemberId: 'wm-owner',
            displayName: 'Failed Upload',
            syncState: 'failed',
            createdAt: '2026-07-01T00:00:00.000Z',
          },
          {
            projectId: 'synced',
            ownerMemberId: 'wm-owner',
            displayName: 'Ready Project',
            syncState: 'synced',
            createdAt: '2026-07-01T00:00:00.000Z',
          },
        ],
      }),
    });

    await expect(catalog.list('team-selected')).resolves.toEqual([
      {
        projectId: 'synced',
        ownerMemberId: 'wm-owner',
        sharedAt: '2026-07-01T00:00:00.000Z',
        name: 'Ready Project',
        createdAt: Date.parse('2026-07-01T00:00:00.000Z'),
      },
    ]);
  });

  it('uses Vela team-project commands for upsert and remove', async () => {
    const calls: string[][] = [];
    const catalog = createVelaCliTeamProjectCatalog({
      supportsTeamProjects: () => true,
      run: async (args) => {
        calls.push(args);
        return '{}';
      },
    });
    const principal = {
      memberId: 'member-owner',
      teamId: 'team-1',
      role: 'owner' as const,
      lifecycleState: 'active' as const,
    };

    await catalog.upsert({
      projectId: 'p1',
      displayName: 'Electric Studio 2',
      syncState: 'pending_upload',
      lastSyncedVersionId: 'v2',
      metadata: {
        skillId: 'deck-builder',
        designSystemId: 'ds-emerald',
        metadata: { kind: 'deck' },
      },
    }, principal);
    await catalog.remove('p1', principal);

    expect(calls).toEqual([
      [
        'upsert',
        'p1',
        '--resource-id',
        'project-p1',
        '--display-name',
        'Electric Studio 2',
        '--sync-state',
        'pending_upload',
        '--last-synced-version-id',
        'v2',
        '--metadata-json',
        JSON.stringify({
          skillId: 'deck-builder',
          designSystemId: 'ds-emerald',
          metadata: { kind: 'deck' },
        }),
      ],
      ['remove', 'p1'],
    ]);
  });

  it('falls back to vela resource shared when the CLI lacks team-projects', async () => {
    const scopedId = `project-${Buffer.from(
      JSON.stringify(['team-1', 'member-owner', 'p-fallback']),
      'utf8',
    ).toString('base64url')}`;
    const teamCalls: string[][] = [];
    const resourceCalls: string[][] = [];
    const sharedOutput = JSON.stringify({
      resources: [
        {
          id: scopedId,
          teamId: 'team-1',
          kind: 'project',
          ownerMemberId: 'member-owner',
          metadata: {
            name: 'Fallback Project',
            skillId: 'deck-builder',
            createdAt: 1719820800000,
            updatedAt: 1719907200000,
            metadata: { kind: 'deck' },
          },
          createdAt: '2026-07-01T00:00:00.000Z',
          deletedAt: null,
        },
      ],
    });
    const options = {
      run: async (args: string[]) => {
        teamCalls.push(args);
        throw new Error('unknown command "team-projects" for "vela"');
      },
      runResource: async (args: string[]) => {
        resourceCalls.push(args);
        return sharedOutput;
      },
    };

    const catalog = createVelaCliTeamProjectCatalog(options);
    await expect(catalog.list('team-1')).resolves.toEqual([
      {
        projectId: 'p-fallback',
        ownerMemberId: 'member-owner',
        sharedAt: '2026-07-01T00:00:00.000Z',
        name: 'Fallback Project',
        skillId: 'deck-builder',
        createdAt: 1719820800000,
        updatedAt: 1719907200000,
        metadata: { kind: 'deck' },
      },
    ]);
    const principal = {
      memberId: 'member-owner',
      teamId: 'team-1',
      role: 'member' as const,
      lifecycleState: 'active' as const,
    };
    await catalog.upsert({ projectId: 'p-fallback' }, principal);
    await catalog.remove('p-fallback', principal);
    expect(teamCalls).toEqual([['--help']]);
    expect(resourceCalls).toEqual([['shared', '--json']]);

    const client = createVelaCliTeamProjectCatalogClient(options);
    await expect(client.list(principal)).resolves.toEqual([
      expect.objectContaining({
        workspaceId: 'team-1',
        projectId: 'p-fallback',
        resourceId: scopedId,
        ownerMemberId: 'member-owner',
        displayName: 'Fallback Project',
        syncState: 'synced',
      }),
    ]);
    await expect(client.upsert({
      projectId: 'p-fallback',
      resourceId: scopedId,
    }, principal)).resolves.toBeNull();
    expect(teamCalls).toEqual([['--help'], ['--help']]);
    expect(resourceCalls).toEqual([
      ['shared', '--json'],
      ['shared', '--json'],
    ]);
  });

  it('keeps Vela workspace context authoritative over legacy transport flags', () => {
    expect(shouldUseVelaCliTeamProjectCatalog({
      OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
      OD_TEAM_PROJECTS_TRANSPORT: 'resource-hub',
    })).toBe(true);
  });
});
