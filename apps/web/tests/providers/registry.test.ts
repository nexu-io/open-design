import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockOpenDesignHost } from '@open-design/host/testing';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

import {
  cancelConnectorAuthorization,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  connectConnector,
  DEFAULT_DEPLOY_PROVIDER_ID,
  deleteDesignSystemDraft,
  DesignSystemDeleteError,
  deletePreviewComment,
  deployProjectFile,
  createDesignSystemDraft,
  fetchAgentsStream,
  fetchCloudflarePagesZones,
  fetchDeployConfig,
  fetchDesignSystemsResult,
  fetchAppVersionInfo,
  fetchConnectorDetail,
  fetchConnectorDiscovery,
  fetchPluginExampleHtml,
  fetchPluginAssetText,
  fetchPluginPreviewHtml,
  fetchProjectDesignSystemPackageAudit,
  fetchProjectFiles,
  fetchProjectFileText,
  fetchLiveArtifacts,
  fetchSkillExample,
  invalidateProjectFilesCache,
  importSkill,
  installSkill,
  isDeployProviderId,
  openFolderDialog,
  patchPreviewCommentSortKey,
  patchPreviewCommentStatus,
  updateDeployConfig,
  uploadProjectFiles,
  upsertPreviewComment,
  writeProjectTextFileDetailed,
} from '../../src/providers/registry';

describe('skill operation diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('preserves the top-level remote-install error code and status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'Skill download failed',
      code: 'FETCH_FAILED',
    }), { status: 502 })));

    await expect(installSkill({ source: 'github:owner/repo' })).resolves.toEqual({
      error: {
        code: 'FETCH_FAILED',
        message: 'Skill download failed',
        status: 502,
      },
    });
  });

  it('preserves a nested import error envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'VALIDATION_FAILED', message: 'Invalid SKILL.md' },
    }), { status: 400 })));

    await expect(importSkill({ name: 'broken', body: 'broken' })).resolves.toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid SKILL.md',
        status: 400,
      },
    });
  });

  it('drops a syntactically valid but unknown import error code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: { code: 'UPSTREAM_abc123', message: 'Unknown upstream failure' },
    }), { status: 503 })));

    await expect(importSkill({ name: 'broken', body: 'broken' })).resolves.toEqual({
      error: {
        message: 'Unknown upstream failure',
        status: 503,
      },
    });
  });
});

function personalWorkspaceContext(): WorkspaceCollabContext {
  return {
    workspaceId: 'ws-personal',
    workspaceType: 'personal',
    workspaceMemberId: 'wm-1',
    role: 'owner',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
    permissions: buildWorkspacePermissions({ role: 'owner', lifecycleState: 'active' }),
  };
}

function teamWorkspaceContext(): WorkspaceCollabContext {
  return {
    ...personalWorkspaceContext(),
    workspaceId: 'ws-team-a',
    workspaceType: 'team',
    workspaceMemberId: 'wm-team-a',
  };
}

function agentStreamResponse(text: string): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('design-system Workspace scope', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('attaches the captured Workspace/member identity to catalog reads', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ designSystems: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const context = personalWorkspaceContext();

    await expect(fetchDesignSystemsResult(context)).resolves.toEqual({
      ok: true,
      designSystems: [],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(fetchMock).toHaveBeenCalledWith('/api/design-systems', {
      headers: expect.objectContaining({
        'x-od-workspace-id': context.workspaceId,
        'x-od-workspace-member-id': context.workspaceMemberId,
      }),
    });
  });

  it('preserves the permission code from a denied design-system delete', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: 'WORKSPACE_RESOURCE_MANAGE_DENIED',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const context = teamWorkspaceContext();

    await expect(deleteDesignSystemDraft('user:team-brand', context)).rejects.toEqual(
      expect.objectContaining<Partial<DesignSystemDeleteError>>({
        name: 'DesignSystemDeleteError',
        status: 403,
        code: 'WORKSPACE_RESOURCE_MANAGE_DENIED',
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/design-systems/user%3Ateam-brand', {
      method: 'DELETE',
      headers: expect.objectContaining({
        'x-od-workspace-id': context.workspaceId,
        'x-od-workspace-member-id': context.workspaceMemberId,
      }),
    });
  });

  it('materializes the exact team Workspace catalog before listing design systems', async () => {
    const context = teamWorkspaceContext();
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url === '/api/workspace/design-systems/team') {
        return new Response(JSON.stringify({ ids: ['user:team-brand'] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        designSystems: [{
          id: 'user:team-brand',
          title: 'Team Brand',
          category: 'Custom',
          summary: 'Shared by the team.',
          swatches: [],
          surface: 'web',
          source: 'user',
          status: 'published',
          isEditable: true,
        }],
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDesignSystemsResult(context)).resolves.toMatchObject({
      ok: true,
      designSystems: [expect.objectContaining({ id: 'user:team-brand', teamShared: true })],
    });

    expect(calls).toEqual([
      '/api/workspace/design-systems/team',
      '/api/design-systems',
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/workspace/design-systems/team', {
      cache: 'no-store',
      headers: expect.objectContaining({
        'x-od-workspace-id': context.workspaceId,
        'x-od-workspace-member-id': context.workspaceMemberId,
      }),
    });
  });

  it('reuses an exact Team-index witness instead of materializing the same scope twice', async () => {
    const context = {
      ...teamWorkspaceContext(),
      workspaceId: 'ws-team-index-already-materialized',
      teamId: 'ws-team-index-already-materialized',
    };
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return new Response(JSON.stringify({
        designSystems: [{
          id: 'user:already-materialized',
          title: 'Already Materialized',
          category: 'Custom',
          summary: 'The Team index was read by the caller.',
          source: 'user',
          status: 'published',
        }],
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDesignSystemsResult(context, {
      materializedTeamIds: ['user:already-materialized'],
    })).resolves.toMatchObject({
      ok: true,
      designSystems: [expect.objectContaining({
        id: 'user:already-materialized',
        teamShared: true,
      })],
    });

    expect(calls).toEqual(['/api/design-systems']);
  });

  it('forces a fresh Team materialization after a remote resource invalidation', async () => {
    const context = {
      ...teamWorkspaceContext(),
      workspaceId: 'ws-team-force-refresh',
    };
    let teamReadCount = 0;
    let sharedIds = ['user:old-team-brand'];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/workspace/design-systems/team') {
        teamReadCount += 1;
        return new Response(JSON.stringify({ ids: sharedIds }), { status: 200 });
      }
      return new Response(JSON.stringify({
        designSystems: [
          {
            id: 'user:old-team-brand',
            title: 'Old Team Brand',
            category: 'Custom',
            summary: 'Removed remotely.',
            source: 'user',
            status: 'published',
          },
          {
            id: 'user:new-team-brand',
            title: 'New Team Brand',
            category: 'Custom',
            summary: 'Shared remotely.',
            source: 'user',
            status: 'published',
          },
        ],
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDesignSystemsResult(context)).resolves.toMatchObject({
      ok: true,
      designSystems: [
        expect.objectContaining({ id: 'user:old-team-brand', teamShared: true }),
        expect.objectContaining({ id: 'user:new-team-brand' }),
      ],
    });

    sharedIds = ['user:new-team-brand'];
    await expect(fetchDesignSystemsResult(context, {
      forceTeamMaterialization: true,
    })).resolves.toMatchObject({
      ok: true,
      designSystems: [
        expect.not.objectContaining({ teamShared: true }),
        expect.objectContaining({ id: 'user:new-team-brand', teamShared: true }),
      ],
    });
    expect(teamReadCount).toBe(2);
  });

  it('does not merge two forced Team materializations inside the burst window', async () => {
    const context = {
      ...teamWorkspaceContext(),
      workspaceId: 'ws-team-two-rapid-mutations',
    };
    const teamA = deferred<Response>();
    const teamB = deferred<Response>();
    let teamReadCount = 0;
    const catalog = {
      designSystems: [
        { id: 'user:brand-a', title: 'A', source: 'user', status: 'published' },
        { id: 'user:brand-b', title: 'B', source: 'user', status: 'published' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/workspace/design-systems/team') {
        teamReadCount += 1;
        return teamReadCount === 1 ? teamA.promise : teamB.promise;
      }
      return Promise.resolve(new Response(JSON.stringify(catalog), { status: 200 }));
    }));

    const resultA = fetchDesignSystemsResult(context, { forceTeamMaterialization: true });
    expect(teamReadCount).toBe(1);
    const resultB = fetchDesignSystemsResult(context, { forceTeamMaterialization: true });
    expect(teamReadCount).toBe(2);

    teamB.resolve(new Response(JSON.stringify({ ids: ['user:brand-b'] }), { status: 200 }));
    await expect(resultB).resolves.toMatchObject({
      ok: true,
      designSystems: [
        expect.not.objectContaining({ teamShared: true }),
        expect.objectContaining({ id: 'user:brand-b', teamShared: true }),
      ],
    });

    teamA.resolve(new Response(JSON.stringify({ ids: ['user:brand-a'] }), { status: 200 }));
    await expect(resultA).resolves.toMatchObject({
      ok: true,
      designSystems: [
        expect.objectContaining({ id: 'user:brand-a', teamShared: true }),
        expect.not.objectContaining({ teamShared: true }),
      ],
    });
  });

  it('keeps personal and official systems available when team materialization fails', async () => {
    const context = {
      ...teamWorkspaceContext(),
      workspaceId: 'ws-team-offline',
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/workspace/design-systems/team') {
        return new Response('unavailable', { status: 503 });
      }
      return new Response(JSON.stringify({
        designSystems: [{
          id: 'user:local-brand',
          title: 'Local Brand',
          category: 'Custom',
          summary: 'Still available.',
          swatches: [],
          surface: 'web',
          source: 'user',
          status: 'published',
          isEditable: true,
        }],
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDesignSystemsResult(context)).resolves.toMatchObject({
      ok: true,
      designSystems: [expect.objectContaining({
        id: 'user:local-brand',
      })],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('partitions team materialization when the Workspace changes', async () => {
    const contexts = [
      teamWorkspaceContext(),
      {
        ...teamWorkspaceContext(),
        workspaceId: 'ws-team-b',
        workspaceMemberId: 'wm-team-b',
      },
    ];
    const teamRequestHeaders: Array<{ workspaceId: string | null; memberId: string | null }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/workspace/design-systems/team') {
        const headers = new Headers(init?.headers);
        teamRequestHeaders.push({
          workspaceId: headers.get('x-od-workspace-id'),
          memberId: headers.get('x-od-workspace-member-id'),
        });
        return new Response(JSON.stringify({ ids: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ designSystems: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all(contexts.map((context) => fetchDesignSystemsResult(context)));

    expect(teamRequestHeaders).toEqual([
      { workspaceId: 'ws-team-a', memberId: 'wm-team-a' },
      { workspaceId: 'ws-team-b', memberId: 'wm-team-b' },
    ]);
  });

  it('attaches the same identity to design-system creation', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({
        designSystem: {
          id: 'user:brand-a',
          title: 'Brand A',
          category: 'Custom',
          summary: '',
          swatches: [],
          surface: 'web',
          body: '# Brand A',
          source: 'user',
          status: 'draft',
          isEditable: true,
        },
      }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const context = personalWorkspaceContext();

    await createDesignSystemDraft({ title: 'Brand A' }, context);

    expect(fetchMock).toHaveBeenCalledWith('/api/design-systems', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'x-od-workspace-id': context.workspaceId,
        'x-od-workspace-member-id': context.workspaceMemberId,
      }),
    }));
  });
});

describe('fetchAgentsStream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('collects streamed agents only after the terminal done event', async () => {
    const agent = {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => agentStreamResponse(
        `event: agent\ndata: ${JSON.stringify(agent)}\n\n` +
          'event: done\ndata: {}\n\n',
      )),
    );
    const onAgent = vi.fn();

    await expect(fetchAgentsStream({ onAgent })).resolves.toEqual([agent]);
    expect(onAgent).toHaveBeenCalledWith(agent);
  });

  it('throws when the stream emits an error event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => agentStreamResponse(
        'event: error\ndata: {"error":"agent probe failed"}\n\n',
      )),
    );

    await expect(fetchAgentsStream({ onAgent: vi.fn() }))
      .rejects.toThrow('agent probe failed');
  });

  it('throws when the stream closes before the terminal done event', async () => {
    const agent = {
      id: 'codex',
      name: 'Codex CLI',
      bin: 'codex',
      available: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => agentStreamResponse(
        `event: agent\ndata: ${JSON.stringify(agent)}\n\n`,
      )),
    );

    await expect(fetchAgentsStream({ onAgent: vi.fn() }))
      .rejects.toThrow('agents stream ended before done');
  });
});

describe('fetchAppVersionInfo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns version info from the daemon response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        version: { version: '1.2.3', channel: 'beta', packaged: true, platform: 'darwin', arch: 'arm64' },
      }), { status: 200 })),
    );

    await expect(fetchAppVersionInfo()).resolves.toEqual({
      version: '1.2.3',
      channel: 'beta',
      packaged: true,
      platform: 'darwin',
      arch: 'arm64',
    });
  });

  it('returns null when version info is unavailable or malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ version: { version: '1.2.3' } }), { status: 200 })),
    );

    await expect(fetchAppVersionInfo()).resolves.toBeNull();
  });
});

describe('fetchProjectFiles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('bypasses the HTTP cache for dynamic project file lists', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ files: [] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProjectFiles('project-dynamic-list', { fresh: true }))
      .resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-dynamic-list/files',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('does not make a foreground reopen join a cancellable background read', async () => {
    const files = [{
      name: 'index.html',
      path: 'index.html',
      kind: 'html',
      mtime: 1,
      size: 1,
      mime: 'text/html',
    }];
    const fetchMock = vi.fn<typeof fetch>()
      .mockImplementationOnce((_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ files }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const background = fetchProjectFiles('project-reopen', {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();
    const foreground = fetchProjectFiles('project-reopen');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await expect(background).resolves.toEqual([]);
    await expect(foreground).resolves.toEqual(files);
  });

  it('rejects an HTTP failure instead of publishing a non-authoritative empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'temporarily unavailable' } }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    )));

    await expect(fetchProjectFiles('project-http-failure', {
      fresh: true,
      requireAuthoritative: true,
    }))
      .rejects.toThrow('Project files request failed (503)');
  });

  it('rejects a network failure instead of publishing a non-authoritative empty list', async () => {
    const networkError = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw networkError;
    }));

    await expect(fetchProjectFiles('project-network-failure', {
      fresh: true,
      requireAuthoritative: true,
    }))
      .rejects.toBe(networkError);
  });

  it('preserves the historical empty fallback when strict authority is not requested', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProjectFiles('project-default-http-failure', { fresh: true }))
      .resolves.toEqual([]);
    await expect(fetchProjectFiles('project-default-network-failure', { fresh: true }))
      .resolves.toEqual([]);
  });

  it('still accepts an authoritative successful empty file list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ files: [] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    await expect(fetchProjectFiles('project-authoritative-empty', { fresh: true }))
      .resolves.toEqual([]);
  });

  it('re-reads after a successful mutation overtakes an in-flight file list', async () => {
    const workspaceContext = personalWorkspaceContext();
    const staleFiles = [{
      name: 'stale.html',
      path: 'stale.html',
      kind: 'html',
      mtime: 1,
      size: 1,
      mime: 'text/html',
    }];
    const freshFiles = [{
      name: 'fresh.html',
      path: 'fresh.html',
      kind: 'html',
      mtime: 2,
      size: 2,
      mime: 'text/html',
    }];
    let resolveStaleRead!: (response: Response) => void;
    const staleRead = new Promise<Response>((resolve) => {
      resolveStaleRead = resolve;
    });
    let fileListReads = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects/project-mutation-race/files') {
        fileListReads += 1;
        if (fileListReads === 1) return staleRead;
        return new Response(JSON.stringify({ files: freshFiles }), { status: 200 });
      }
      if (url === '/api/projects/project-mutation-race/upload' && init?.method === 'POST') {
        return new Response(JSON.stringify({
          files: [{ name: 'fresh.html', path: 'fresh.html', size: 2 }],
        }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const initialRead = fetchProjectFiles('project-mutation-race', { workspaceContext });
    await vi.waitFor(() => expect(fileListReads).toBe(1));

    const upload = new File(['ok'], 'fresh.html', { type: 'text/html' });
    await expect(
      uploadProjectFiles('project-mutation-race', [upload], undefined, workspaceContext),
    ).resolves.toMatchObject({ uploaded: [{ path: 'fresh.html' }], failed: [] });

    resolveStaleRead(new Response(JSON.stringify({ files: staleFiles }), { status: 200 }));

    await expect(initialRead).resolves.toEqual(freshFiles);
    expect(fileListReads).toBe(2);
  });

  it('re-reads after an external file event invalidates settled and in-flight scoped lists', async () => {
    const workspaceContext = personalWorkspaceContext();
    const firstFiles = [{
      name: 'first.html',
      path: 'first.html',
      kind: 'html',
      mtime: 1,
      size: 1,
      mime: 'text/html',
    }];
    const staleFiles = [{
      name: 'stale.html',
      path: 'stale.html',
      kind: 'html',
      mtime: 2,
      size: 2,
      mime: 'text/html',
    }];
    const freshFiles = [{
      name: 'fresh.html',
      path: 'fresh.html',
      kind: 'html',
      mtime: 3,
      size: 3,
      mime: 'text/html',
    }];
    let resolveStaleRead!: (response: Response) => void;
    const staleRead = new Promise<Response>((resolve) => {
      resolveStaleRead = resolve;
    });
    let fileListReads = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toBe('/api/projects/project-event-race/files');
      fileListReads += 1;
      if (fileListReads === 1) {
        return new Response(JSON.stringify({ files: firstFiles }), { status: 200 });
      }
      if (fileListReads === 2) return staleRead;
      return new Response(JSON.stringify({ files: freshFiles }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProjectFiles('project-event-race', { workspaceContext }))
      .resolves.toEqual(firstFiles);
    await expect(fetchProjectFiles('project-event-race', { workspaceContext }))
      .resolves.toEqual(firstFiles);
    expect(fileListReads).toBe(1);

    invalidateProjectFilesCache('project-event-race', workspaceContext);
    const invalidatedRead = fetchProjectFiles('project-event-race', { workspaceContext });
    await vi.waitFor(() => expect(fileListReads).toBe(2));

    invalidateProjectFilesCache('project-event-race', workspaceContext);
    resolveStaleRead(new Response(JSON.stringify({ files: staleFiles }), { status: 200 }));

    await expect(invalidatedRead).resolves.toEqual(freshFiles);
    expect(fileListReads).toBe(3);
  });

  it('keeps ordinary live-artifact reads independent from cancellable card scans', async () => {
    const artifacts = [{
      id: 'artifact-1',
      projectId: 'project-reopen',
      name: 'Dashboard',
      createdAt: 1,
      updatedAt: 2,
    }];
    const fetchMock = vi.fn<typeof fetch>()
      .mockImplementationOnce((_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ liveArtifacts: artifacts }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const background = fetchLiveArtifacts('project-reopen', {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort();
    const foreground = fetchLiveArtifacts('project-reopen');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await expect(background).resolves.toEqual([]);
    await expect(foreground).resolves.toEqual(artifacts);
  });
});

describe('writeProjectTextFileDetailed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('surfaces daemon save errors instead of collapsing them to null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        error: { code: 'ARTIFACT_REGRESSION', message: 'new artifact is smaller than the prior version' },
      }), { status: 422, headers: { 'Content-Type': 'application/json' } })),
    );

    await expect(writeProjectTextFileDetailed('project-1', 'preview.html', '<html></html>')).resolves.toEqual({
      ok: false,
      status: 422,
      code: 'ARTIFACT_REGRESSION',
      message: 'new artifact is smaller than the prior version',
    });
  });

  it('attaches workspace identity headers when a workspace context is passed', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ file: { name: 'preview.html', path: 'preview.html', size: 0, mtime: 0 } }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await writeProjectTextFileDetailed(
      'project-1',
      'preview.html',
      '<html></html>',
      undefined,
      personalWorkspaceContext(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/files',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-od-workspace-id': 'ws-personal',
          'x-od-workspace-member-id': 'wm-1',
        }),
      }),
    );
  });

  it('omits workspace headers when there is no workspace context (legacy local mode)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ file: { name: 'preview.html', path: 'preview.html', size: 0, mtime: 0 } }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await writeProjectTextFileDetailed('project-1', 'preview.html', '<html></html>');

    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

// A minimal PreviewCommentTarget — only the fields the contract requires,
// the values themselves are irrelevant to the header-attachment behavior
// under test here.
const PREVIEW_COMMENT_TARGET = {
  filePath: 'index.html',
  elementId: 'el-1',
  selector: '#el-1',
  label: 'Hero',
  text: '',
  position: { x: 0, y: 0, width: 10, height: 10 },
  htmlHint: '<div>hero</div>',
};

function previewCommentResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      comment: {
        id: 'cmt_1',
        projectId: 'project-1',
        conversationId: 'conv-1',
        ...PREVIEW_COMMENT_TARGET,
        note: 'hi',
        status: 'open',
        createdAt: 0,
        updatedAt: 0,
        ...overrides,
      },
    }),
    { status: 200 },
  );
}

describe('upsertPreviewComment', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // recvq5BVsolIxi follow-up: this call used to omit `x-od-workspace-*`
  // entirely, so a team-bound project's daemon-side
  // `enforceCommentWorkspaceMutation` gate 401'd with
  // `WORKSPACE_CONTEXT_REQUIRED` on every real click — silently, since the
  // caller collapsed any non-ok response to `null`. Reproduced against the
  // real dogfood daemon via curl before this fix landed.
  it('attaches workspace identity headers when a workspace context is passed', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => previewCommentResponse());
    vi.stubGlobal('fetch', fetchMock);

    await upsertPreviewComment(
      'project-1',
      'conv-1',
      { target: PREVIEW_COMMENT_TARGET, note: 'hi' },
      personalWorkspaceContext(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/conversations/conv-1/comments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-od-workspace-id': 'ws-personal',
          'x-od-workspace-member-id': 'wm-1',
        }),
      }),
    );
  });

  it('omits workspace headers when there is no workspace context (legacy local mode)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => previewCommentResponse());
    vi.stubGlobal('fetch', fetchMock);

    await upsertPreviewComment('project-1', 'conv-1', { target: PREVIEW_COMMENT_TARGET, note: 'hi' });

    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

describe('preview comment scoped mutations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('attaches workspace identity headers to status updates', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => previewCommentResponse());
    vi.stubGlobal('fetch', fetchMock);

    await patchPreviewCommentStatus(
      'project-1',
      'conv-1',
      'cmt_1',
      'applying',
      personalWorkspaceContext(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/conversations/conv-1/comments/cmt_1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-od-workspace-id': 'ws-personal',
          'x-od-workspace-member-id': 'wm-1',
        }),
      }),
    );
  });

  it('attaches workspace identity headers to deletes', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await deletePreviewComment(
      'project-1',
      'conv-1',
      'cmt_1',
      personalWorkspaceContext(),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/conversations/conv-1/comments/cmt_1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          'x-od-workspace-id': 'ws-personal',
          'x-od-workspace-member-id': 'wm-1',
        }),
      }),
    );
  });
});

describe('patchPreviewCommentSortKey', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('attaches workspace identity headers when a workspace context is passed', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => previewCommentResponse({ sortKey: 42 }));
    vi.stubGlobal('fetch', fetchMock);

    await patchPreviewCommentSortKey('project-1', 'conv-1', 'cmt_1', 42, personalWorkspaceContext());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/conversations/conv-1/comments/cmt_1/reorder',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-od-workspace-id': 'ws-personal',
          'x-od-workspace-member-id': 'wm-1',
        }),
      }),
    );
  });

  it('omits workspace headers when there is no workspace context (legacy local mode)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => previewCommentResponse({ sortKey: 42 }));
    vi.stubGlobal('fetch', fetchMock);

    await patchPreviewCommentSortKey('project-1', 'conv-1', 'cmt_1', 42);

    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

describe('openFolderDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the legacy fail-soft behavior unless throwOnError is requested', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({ error: 'Could not open folder picker: zenity is not installed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )),
    );

    await expect(openFolderDialog()).resolves.toBeNull();
  });

  it('throws daemon picker messages when throwOnError is requested', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(
        JSON.stringify({ error: 'Could not open folder picker: zenity is not installed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      )),
    );

    await expect(openFolderDialog({ throwOnError: true }))
      .rejects.toThrow('Could not open folder picker: zenity is not installed');
  });
});

describe('fetchSkillExample', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Regression coverage for nexu-io/open-design#897. Skills declared with
  // a non-html `od.preview.type` ship no fetchable HTML — the daemon's
  // /example endpoint only resolves HTML files and 404s for everything
  // else, which left the gallery stuck on a misleading "Couldn't load
  // this example. The example HTML failed to fetch." state. The dispatch
  // now short-circuits at the data layer so the modal can render a calm
  // "no shipped preview" placeholder without firing a doomed network
  // call.
  it('short-circuits without a fetch when previewType is not html', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('hatch-pet', 'image')).resolves.toEqual({
      unavailable: true,
      kind: 'image',
    });
    await expect(
      fetchSkillExample('dcf-valuation', 'markdown'),
    ).resolves.toEqual({ unavailable: true, kind: 'markdown' });

    // The doomed-call is the bug we're fixing — assert no network call
    // was made for either non-html dispatch.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to html fetch when previewType is omitted (legacy callers)', async () => {
    const fetchMock = vi.fn(
      async () => new Response('<html><body>ok</body></html>', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('blog-post')).resolves.toEqual({
      html: '<html><body>ok</body></html>',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/blog-post/example');
  });

  it('treats missing html previews as unavailable instead of an error', async () => {
    const fetchMock = vi.fn(
      async () => new Response('not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('design-brief', 'html')).resolves.toEqual({
      unavailable: true,
      kind: 'html',
    });
    // Confirm the dispatch did call through to the daemon for the html
    // path (i.e. the short-circuit above only catches non-html types).
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/design-brief/example');
  });

  it('forwards real html preview fetch failures as discriminated errors', async () => {
    const fetchMock = vi.fn(
      async () => new Response('server error', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSkillExample('design-brief', 'html')).resolves.toEqual({
      error: 'HTTP 500',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/skills/design-brief/example');
  });
});

// Plugin previews use the same daemon contract as skill examples (the
// daemon returns 404 when the manifest declares a preview entry but no
// file ships at that path). Skills already map that 404 to
// { unavailable: true, kind: 'html' } per #897 so the modal renders a
// calm "no shipped preview" placeholder instead of "Couldn't load this
// example. The example HTML failed to fetch." Plugins lacked the
// symmetric treatment, so bundled plugins like `example-live-artifact`
// surfaced the misleading error from the Home Community grid even
// though the catalog simply ships no example HTML for that plugin.
describe('fetchPluginPreviewHtml', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats missing previews as unavailable instead of an error', async () => {
    const fetchMock = vi.fn(
      async () => new Response('preview not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginPreviewHtml('example-live-artifact'),
    ).resolves.toEqual({ unavailable: true, kind: 'html' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-live-artifact/preview',
    );
  });

  it('forwards real preview fetch failures as discriminated errors', async () => {
    const fetchMock = vi.fn(
      async () => new Response('server error', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginPreviewHtml('example-live-artifact'),
    ).resolves.toEqual({ error: 'HTTP 500' });
  });

  it('returns html on success', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('<html><body>preview</body></html>', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginPreviewHtml('example-live-artifact'),
    ).resolves.toEqual({ html: '<html><body>preview</body></html>' });
  });
});

describe('fetchPluginExampleHtml', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats missing example stems as unavailable instead of an error', async () => {
    const fetchMock = vi.fn(
      async () => new Response('example not found', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginExampleHtml('example-live-artifact', 'index'),
    ).resolves.toEqual({ unavailable: true, kind: 'html' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/example-live-artifact/example/index',
    );
  });

  it('forwards real example fetch failures as discriminated errors', async () => {
    const fetchMock = vi.fn(
      async () => new Response('server error', { status: 500 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchPluginExampleHtml('example-live-artifact', 'index'),
    ).resolves.toEqual({ error: 'HTTP 500' });
  });
});

describe('Workspace-scoped resource reads', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sends the exact Workspace/member headers on skill, plugin and asset fetches', async () => {
    const context = personalWorkspaceContext();
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('<html>ok</html>', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchSkillExample('skill-a', 'html', context);
    await fetchPluginPreviewHtml('plugin-a', context);
    await fetchPluginExampleHtml('plugin-a', 'example-a', context);
    await fetchPluginAssetText('plugin-a', './DESIGN.md', context);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.get('x-od-workspace-id')).toBe(context.workspaceId);
      expect(headers.get('x-od-workspace-member-id')).toBe(context.workspaceMemberId);
    }
  });
});

describe('fetchProjectFileText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('can bypass caches when fetching source text', async () => {
    const fetchMock = vi.fn(async () => new Response('<svg />', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchProjectFileText('project-1', 'diagram.svg', {
        cache: 'no-store',
        cacheBustKey: '1710000000-2',
      }),
    ).resolves.toBe('<svg />');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/raw/diagram.svg?cacheBust=1710000000-2',
      { cache: 'no-store' },
    );
  });

  it('logs HTTP failure context before returning null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404, statusText: 'Not Found' })));

    await expect(fetchProjectFileText('project-1', 'missing.svg')).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      '[fetchProjectFileText] failed:',
      expect.objectContaining({
        name: 'missing.svg',
        projectId: 'project-1',
        status: 404,
        statusText: 'Not Found',
        url: '/api/projects/project-1/raw/missing.svg',
      }),
    );
  });

  it('logs thrown fetch errors before returning null', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = new Error('network down');
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw error;
    }));

    await expect(fetchProjectFileText('project-1', 'diagram.svg')).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      '[fetchProjectFileText] failed:',
      expect.objectContaining({
        error,
        name: 'diagram.svg',
        projectId: 'project-1',
        url: '/api/projects/project-1/raw/diagram.svg',
      }),
    );
  });

  it('silently returns null when a background source read is aborted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const controller = new AbortController();
    vi.stubGlobal('fetch', vi.fn((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      );
    })));

    const pending = fetchProjectFileText('project-1', 'brand.json', {
      cache: 'no-store',
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).resolves.toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('fetchProjectDesignSystemPackageAudit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns the daemon package audit for a project', async () => {
    const audit = {
      ok: false,
      projectPath: '/tmp/project',
      filesInspected: 4,
      errors: [{
        severity: 'error',
        code: 'ui_kit_index_missing_runtime_bootstrap',
        message: 'UI kit must mount.',
        path: 'ui_kits/app/index.html',
      }],
      warnings: [],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ audit }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProjectDesignSystemPackageAudit('ds acme')).resolves.toEqual(audit);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/ds%20acme/design-system-package-audit',
      { cache: 'no-store' },
    );
  });

  it('returns null when the audit endpoint is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));

    await expect(fetchProjectDesignSystemPackageAudit('missing')).resolves.toBeNull();
  });
});

describe('fetchConnectorDiscovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('caches connector discovery after a successful fetch', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      connectors: [{ id: 'github', name: 'GitHub', tools: [{ name: 'issues' }] }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchConnectorDiscovery({ refresh: true })).resolves.toEqual([
      { id: 'github', name: 'GitHub', tools: [{ name: 'issues' }] },
    ]);
    await expect(fetchConnectorDiscovery()).resolves.toEqual([
      { id: 'github', name: 'GitHub', tools: [{ name: 'issues' }] },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/connectors/discovery?refresh=true');
  });
});

describe('fetchConnectorDetail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('requests paginated hydrated tool previews for one connector', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      connector: {
        id: 'canvas',
        name: 'Canvas',
        tools: [{ name: 'canvas.list_courses' }],
        toolCount: 574,
        toolsNextCursor: 'cursor_2',
        toolsHasMore: true,
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchConnectorDetail('canvas', {
      hydrateTools: true,
      toolsLimit: 50,
      toolsCursor: 'cursor_1',
    })).resolves.toMatchObject({
      id: 'canvas',
      toolCount: 574,
      toolsNextCursor: 'cursor_2',
      tools: [{ name: 'canvas.list_courses' }],
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/connectors/canvas?hydrateTools=true&toolsLimit=50&toolsCursor=cursor_1');
  });
});

describe('connectConnector', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a fallback link before navigating the auth popup', async () => {
    const replace = vi.fn();
    const authWindow = {
      document: {
        title: '',
        body: { innerHTML: '' },
      },
      location: { replace },
      close: vi.fn(),
    };
    const open = vi.fn(() => authWindow);
    vi.stubGlobal('window', {
      open,
      location: { assign: vi.fn() },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: {
            airtable: { status: 'ready', authConfigId: 'ac_airtable' },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'airtable', name: 'Airtable' },
        auth: {
          kind: 'redirect_required',
          redirectUrl: 'https://connect.composio.dev/link/lk_test?a=1&b=2',
        },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(connectConnector('airtable')).resolves.toMatchObject({
      connector: { id: 'airtable' },
      auth: {
        kind: 'redirect_required',
        redirectUrl: 'https://connect.composio.dev/link/lk_test?a=1&b=2',
      },
    });

    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(authWindow.document.body.innerHTML).toContain('Open Composio');
    expect(authWindow.document.body.innerHTML).toContain('https://connect.composio.dev/link/lk_test?a=1&amp;b=2');
    expect(replace).toHaveBeenCalledWith('https://connect.composio.dev/link/lk_test?a=1&b=2');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/connectors/auth-configs/prepare',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/connectors/airtable/connect', { method: 'POST' });
  });

  it('keeps the popup open with custom auth guidance when initialization fails', async () => {
    const authWindow = {
      document: {
        title: '',
        body: { innerHTML: '' },
      },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    vi.stubGlobal('window', {
      open: vi.fn(() => authWindow),
      location: { assign: vi.fn() },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        results: {
          canvas: {
            status: 'custom_required',
            message: 'Canvas requires a custom Composio auth config. Create or enable a Canvas auth config in Composio with your own OAuth credentials, then retry this connection.',
          },
        },
      }), { status: 200 })),
    );

    await expect(connectConnector('canvas')).resolves.toEqual({
      connector: null,
      error: 'Canvas requires a custom Composio auth config. Create or enable a Canvas auth config in Composio with your own OAuth credentials, then retry this connection.',
    });

    expect(authWindow.close).not.toHaveBeenCalled();
    expect(authWindow.document.title).toBe('Connection failed');
    expect(authWindow.document.body.innerHTML).toContain('Canvas requires a custom Composio auth config.');
    expect(authWindow.document.body.innerHTML).not.toContain('Default auth config not found');
  });

  it('opens the system browser through the daemon when the OAuth popup is blocked', async () => {
    const open = vi.fn(() => null);
    const assign = vi.fn();
    vi.stubGlobal('window', {
      open,
      location: { assign },
    } as unknown as Window & typeof globalThis);
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: {
            github: { status: 'ready', authConfigId: 'ac_github' },
          },
        }), { status: 200 });
      }
      if (url === '/api/system/open-external') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
        auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(connectConnector('github')).resolves.toEqual({
      connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
      auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(assign).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/system/open-external', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/oauth' }),
    });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/connectors/github/authorization/cancel', {
      method: 'POST',
    });
  });

  it('renders an info notice in the popup when the connect response carries no redirect URL', async () => {
    const authWindow = {
      document: {
        title: '',
        body: { innerHTML: '' },
      },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    vi.stubGlobal('window', {
      open: vi.fn(() => authWindow),
      location: { assign: vi.fn() },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: { twitter: { status: 'ready', authConfigId: 'ac_twitter' } },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'twitter', name: 'Twitter', status: 'available', tools: [] },
        auth: { kind: 'pending', expiresAt: '2026-05-08T10:00:00.000Z' },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(connectConnector('twitter')).resolves.toMatchObject({
      connector: { id: 'twitter' },
      auth: { kind: 'pending' },
    });

    expect(authWindow.close).not.toHaveBeenCalled();
    expect(authWindow.document.title).toBe('Authorization pending');
    expect(authWindow.document.body.innerHTML).toContain('Authorization pending');
  });

  it('opens connector auth in the system browser when the host bridge succeeds', async () => {
    const open = vi.fn();
    const openExternal = vi.fn(async () => ({ ok: true as const }));
    vi.stubGlobal('window', {
      open,
    } as unknown as Window & typeof globalThis);
    const restoreHost = installMockOpenDesignHost({
      host: { shell: { openExternal } },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: {
            github: { status: 'ready', authConfigId: 'ac_github' },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
        auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(connectConnector('github')).resolves.toEqual({
        connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
        auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
      });
    } finally {
      restoreHost();
    }
    expect(open).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/oauth');
  });

  it('surfaces an error when the host bridge cannot confirm that the system browser opened', async () => {
    const open = vi.fn();
    const openExternal = vi.fn(async () => ({ ok: false as const, reason: 'blocked' }));
    vi.stubGlobal('window', {
      open,
    } as unknown as Window & typeof globalThis);
    const restoreHost = installMockOpenDesignHost({
      host: { shell: { openExternal } },
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/connectors/auth-configs/prepare') {
        return new Response(JSON.stringify({
          results: {
            github: { status: 'ready', authConfigId: 'ac_github' },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
        auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(connectConnector('github')).resolves.toEqual({
        connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
        auth: { kind: 'redirect_required', redirectUrl: 'https://example.com/oauth' },
        error: 'Popup blocked. Allow popups for Open Design and try again.',
      });
    } finally {
      restoreHost();
    }
    expect(open).not.toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/oauth');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/connectors/github/authorization/cancel', {
      method: 'POST',
    });
  });
});

describe('cancelConnectorAuthorization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('invalidates pending connector authorization on the daemon', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      connector: { id: 'github', name: 'GitHub', status: 'available', tools: [] },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(cancelConnectorAuthorization('github')).resolves.toEqual({
      id: 'github',
      name: 'GitHub',
      status: 'available',
      tools: [],
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/connectors/github/authorization/cancel', {
      method: 'POST',
    });
  });
});

describe('uploadProjectFiles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats every response entry as a success regardless of originalName drift', async () => {
    // Simulates an encoding edge case: the browser File.name carries a
    // composed CJK name (NFC) but multer round-trips it through latin1 and
    // returns a slightly different decoded form. The old name-equality
    // matching marked these as failed even though the server stored them.
    const composed = '测试.pdf';
    const decomposed = '测试.pdf'; // pretend the server returned a normalized variant
    const file = new File(['hello'], composed, { type: 'application/pdf' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        files: [
          {
            name: 'mxk7-test.pdf',
            path: 'mxk7-test.pdf',
            size: 5,
            originalName: decomposed,
          },
        ],
      }), { status: 200 })),
    );

    const result = await uploadProjectFiles('project-1', [file]);

    expect(result.failed).toEqual([]);
    expect(result.uploaded).toHaveLength(1);
    expect(result.uploaded[0]).toMatchObject({
      path: 'mxk7-test.pdf',
      name: decomposed,
      size: 5,
    });
  });

  it('marks the unmatched tail as failed when the server drops files mid-flight', async () => {
    const a = new File(['a'], 'a.txt', { type: 'text/plain' });
    const b = new File(['b'], 'b.txt', { type: 'text/plain' });
    const c = new File(['c'], 'c.txt', { type: 'text/plain' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({
        files: [
          { name: 't1-a.txt', path: 't1-a.txt', size: 1, originalName: 'a.txt' },
          { name: 't2-b.txt', path: 't2-b.txt', size: 1, originalName: 'b.txt' },
        ],
      }), { status: 200 })),
    );

    const result = await uploadProjectFiles('project-1', [a, b, c]);

    expect(result.uploaded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ name: 'c.txt' });
  });

  it('attaches workspace identity headers when a workspace context is passed', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      files: [{ name: 'hello.txt', path: 'hello.txt', size: 5, originalName: 'hello.txt' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await uploadProjectFiles('project-1', [file], undefined, personalWorkspaceContext());

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/upload',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-od-workspace-id': 'ws-personal',
          'x-od-workspace-member-id': 'wm-1',
        }),
      }),
    );
  });

  it('omits workspace headers when there is no workspace context (legacy local mode)', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      files: [{ name: 'hello.txt', path: 'hello.txt', size: 5, originalName: 'hello.txt' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await uploadProjectFiles('project-1', [file]);

    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(init.headers).toBeUndefined();
  });

  it('invalidates the shared file list after an upload succeeds', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    let uploaded = false;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects/project-1/upload' && init?.method === 'POST') {
        uploaded = true;
        return new Response(JSON.stringify({
          files: [{ name: 'hello.txt', path: 'hello.txt', size: 5, originalName: 'hello.txt' }],
        }), { status: 200 });
      }
      if (url === '/api/projects/project-1/files') {
        return new Response(JSON.stringify({
          files: uploaded
            ? [{ name: 'hello.txt', path: 'hello.txt', type: 'file', size: 5, mtime: 1 }]
            : [],
        }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProjectFiles('project-1')).resolves.toEqual([]);
    await expect(uploadProjectFiles('project-1', [file])).resolves.toMatchObject({
      uploaded: [{ path: 'hello.txt' }],
      failed: [],
    });
    await expect(fetchProjectFiles('project-1')).resolves.toEqual([
      expect.objectContaining({ name: 'hello.txt', path: 'hello.txt' }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('deploy provider registry helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('recognizes Vercel and Cloudflare Pages provider ids only', () => {
    expect(isDeployProviderId(DEFAULT_DEPLOY_PROVIDER_ID)).toBe(true);
    expect(isDeployProviderId(CLOUDFLARE_PAGES_PROVIDER_ID)).toBe(true);
    expect(isDeployProviderId('netlify')).toBe(false);
    expect(isDeployProviderId(null)).toBe(false);
  });

  it('fetches provider-specific deploy config via query string', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      configured: true,
      tokenMask: 'saved-cloudflare-token',
      teamId: '',
      teamSlug: '',
      accountId: 'account-123',
      projectName: '',
      target: 'preview',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDeployConfig(CLOUDFLARE_PAGES_PROVIDER_ID)).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      configured: true,
      accountId: 'account-123',
      projectName: '',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/deploy/config?providerId=cloudflare-pages');
  });

  it('fetches Cloudflare Pages zones from the deploy helper route', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      zones: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
      cloudflarePages: { lastZoneId: 'zone-1', lastDomainPrefix: 'demo' },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCloudflarePagesZones()).resolves.toEqual({
      zones: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
      cloudflarePages: { lastZoneId: 'zone-1', lastDomainPrefix: 'demo' },
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/deploy/cloudflare-pages/zones');
  });

  it('sends Cloudflare Pages config fields without dropping provider-specific metadata', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      configured: true,
      tokenMask: 'saved-cloudflare-token',
      teamId: '',
      teamSlug: '',
      accountId: 'account-123',
      projectName: '',
      target: 'preview',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(updateDeployConfig({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      token: 'cf-token',
      accountId: 'account-123',
    })).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      accountId: 'account-123',
      projectName: '',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/deploy/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        token: 'cf-token',
        accountId: 'account-123',
      }),
    });
  });

  it('passes the selected Cloudflare Pages provider id and custom domain through deploy requests', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'deployment-row-1',
      projectId: 'project-1',
      fileName: 'index.html',
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      url: 'https://open-design-preview.pages.dev',
      deploymentId: 'cf-deployment-1',
      deploymentCount: 1,
      target: 'preview',
      status: 'ready',
      createdAt: 1,
      updatedAt: 2,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      deployProjectFile('project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID, {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      }),
    ).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      deploymentId: 'cf-deployment-1',
      url: 'https://open-design-preview.pages.dev',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'index.html',
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        cloudflarePages: {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          domainPrefix: 'demo',
        },
      }),
    });
  });

  it('forwards the selected deploy target through deploy requests', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'deployment-row-2',
      projectId: 'project-1',
      fileName: 'index.html',
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      url: 'https://open-design-preview.pages.dev',
      deploymentId: 'cf-deployment-2',
      deploymentCount: 1,
      target: 'production',
      status: 'ready',
      createdAt: 1,
      updatedAt: 2,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      deployProjectFile(
        'project-1',
        'index.html',
        CLOUDFLARE_PAGES_PROVIDER_ID,
        {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          domainPrefix: 'demo',
        },
        'production',
      ),
    ).resolves.toMatchObject({
      providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
      deploymentId: 'cf-deployment-2',
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'index.html',
        providerId: CLOUDFLARE_PAGES_PROVIDER_ID,
        cloudflarePages: {
          zoneId: 'zone-1',
          zoneName: 'example.com',
          domainPrefix: 'demo',
        },
        target: 'production',
      }),
    });
  });

  it('carries the HTTP status as an error .code when a failed deploy has only a human message', async () => {
    // The provider/daemon returns a message but no structured code; the wrapper
    // must still surface the status so analytics (deployErrorCode reads `.code`
    // first) can bucket it instead of collapsing to the generic "Error".
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'Cloudflare rejected the request' } }),
      { status: 403 },
    )));
    await deployProjectFile('project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID).then(
      () => { throw new Error('expected deploy to reject'); },
      (err: unknown) => {
        expect((err as { code?: string }).code).toBe('HTTP_403');
        expect((err as Error).message).toBe('Cloudflare rejected the request');
      },
    );
  });

  it('prefers a structured provider error code over the HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'quota exceeded', code: 'RATE_LIMITED' } }),
      { status: 429 },
    )));
    await deployProjectFile('project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID).then(
      () => { throw new Error('expected deploy to reject'); },
      (err: unknown) => expect((err as { code?: string }).code).toBe('RATE_LIMITED'),
    );
  });

  it('ignores the daemon\'s generic BAD_REQUEST envelope and buckets by the real HTTP status', async () => {
    // The daemon deploy route wraps every non-404 provider failure as
    // `error.code = 'BAD_REQUEST'` but keeps the real HTTP status (403/429/5xx).
    // The wrapper must NOT let BAD_REQUEST win, or every failure collapses to one
    // code — it falls back to the real status instead.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Cloudflare returned 403' } }),
      { status: 403 },
    )));
    await deployProjectFile('project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID).then(
      () => { throw new Error('expected deploy to reject'); },
      (err: unknown) => expect((err as { code?: string }).code).toBe('HTTP_403'),
    );
  });

  it('ignores the daemon\'s FILE_NOT_FOUND envelope and buckets a 404 as HTTP_404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 'FILE_NOT_FOUND', message: 'file not found' } }),
      { status: 404 },
    )));
    await deployProjectFile('project-1', 'index.html', CLOUDFLARE_PAGES_PROVIDER_ID).then(
      () => { throw new Error('expected deploy to reject'); },
      (err: unknown) => expect((err as { code?: string }).code).toBe('HTTP_404'),
    );
  });
});
