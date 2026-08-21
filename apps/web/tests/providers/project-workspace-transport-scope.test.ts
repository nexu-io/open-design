import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';
import {
  checkDeploymentLink,
  deleteDesignSystemDraft,
  deleteLiveArtifact,
  deleteProjectFile,
  deployProjectFile,
  designSystemStaticUrl,
  ensureDesignSystemWorkspace,
  fetchDesignSystem,
  fetchDesignSystemFile,
  fetchDesignSystemFiles,
  fetchDesignSystemGenerationJob,
  fetchDesignSystemPreview,
  fetchDesignSystemRevisions,
  fetchDesignSystemShowcase,
  fetchLiveArtifact,
  fetchLiveArtifactCode,
  fetchLiveArtifactRefreshes,
  fetchLiveArtifacts,
  fetchProjectFileText,
  fetchProjectPreviewBaseHref,
  fetchProjectFileVersion,
  fetchProjectFiles,
  fetchProjectDeployments,
  fetchSkill,
  fetchSkillFiles,
  liveArtifactPreviewUrl,
  openProjectInEditor,
  projectRawUrl,
  renewProjectPreviewBaseScope,
  refreshLiveArtifact,
  startDesignSystemGenerationJob,
  startDesignSystemRevisionJob,
  startDesignSystemTokenContractRebuildJob,
  syncDesignSystemAssetsFromWorkspace,
  updateDesignSystemDraft,
  updateDesignSystemRevisionStatus,
} from '../../src/providers/registry';
import {
  createTerminal,
  listConversations,
  loadTabs,
  saveTabs,
  sendTerminalStdin,
  terminalStreamUrl,
} from '../../src/state/projects';
import {
  fetchChatRunStatus,
  listActiveChatRuns,
  reportChatRunFeedback,
} from '../../src/providers/daemon';
import { projectEventsUrl } from '../../src/providers/project-events';

function teamContext(
  workspaceId: string,
  workspaceMemberId: string,
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_plus',
    providerMode: 'platform_credits',
    teamId: `team-${workspaceId}`,
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({
      role: 'member',
      lifecycleState: 'active',
    }),
  };
}

function requestScope(init?: RequestInit): [string | null, string | null] {
  const headers = new Headers(init?.headers);
  return [
    headers.get('x-od-workspace-id'),
    headers.get('x-od-workspace-member-id'),
  ];
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('persisted project Workspace transport scope', () => {
  it('mints a srcDoc preview base without client-supplied Workspace authority', async () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    const expiresAt = Date.now() + 60 * 60 * 1000;
    vi.stubGlobal('location', { href: 'od://app/projects/project-1' });
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({
      url: '/api/projects/project-1/preview/scope-1/pages/brand.html',
      file: 'pages/brand.html',
      csp: "default-src 'none'",
      iframeSandbox: 'allow-scripts allow-forms',
      opaqueOrigin: true,
      expiresAt,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProjectPreviewBaseHref(
      'project-1',
      'pages/brand.html',
      workspaceA,
    )).resolves.toEqual({
      href: 'od://app/api/projects/project-1/preview/scope-1/pages/',
      expiresAt,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/preview-url?file=pages%2Fbrand.html',
      {
        cache: 'no-store',
      },
    );
  });

  it('rejects a preview base response for a different project', async () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({
      url: '/api/projects/project-2/preview/scope-2/brand.html',
      file: 'brand.html',
      csp: "default-src 'none'",
      iframeSandbox: 'allow-scripts allow-forms',
      opaqueOrigin: true,
      expiresAt: Date.now() + 60 * 60 * 1000,
    })));

    await expect(fetchProjectPreviewBaseHref(
      'project-1',
      'brand.html',
      workspaceA,
    )).resolves.toBeNull();
  });

  it('keeps previews working while a new web bundle rolls against an older daemon', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T00:00:00Z'));
    vi.stubGlobal('location', { href: 'od://app/projects/project-1' });
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => Response.json({
      url: '/api/projects/project-1/preview/legacy-scope/pages/brand.html',
      file: 'pages/brand.html',
      csp: "default-src 'none'",
      iframeSandbox: 'allow-scripts allow-forms',
      opaqueOrigin: true,
    })));

    await expect(fetchProjectPreviewBaseHref(
      'project-1',
      'pages/brand.html',
    )).resolves.toEqual({
      href: 'od://app/api/projects/project-1/preview/legacy-scope/pages/',
      expiresAt: Date.now() + 45 * 60 * 1000,
    });
    vi.useRealTimers();
  });

  it('renews only a project-matching preview scope through the host-only route', async () => {
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json({ expiresAt }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(renewProjectPreviewBaseScope(
      'project-1',
      '/api/projects/project-1/preview/scope-0001/pages/',
    )).resolves.toBe(expiresAt);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/preview/scope-0001/renew',
      {
        method: 'POST',
        cache: 'no-store',
        headers: { 'x-od-preview-scope-renewal': '1' },
      },
    );

    await expect(renewProjectPreviewBaseScope(
      'project-2',
      '/api/projects/project-1/preview/scope-0001/pages/',
    )).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps raw project URLs server-authoritative while scoped streams retain captured A', () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    const workspaceB = teamContext('workspace-b', 'member-b');
    const capturedRawUrl = projectRawUrl('project-1', 'index.html', workspaceA);
    const capturedTerminalUrl = terminalStreamUrl('project-1', 'terminal-1', workspaceA);
    const capturedEventsUrl = projectEventsUrl('project-1', workspaceA);

    projectRawUrl('project-1', 'index.html', workspaceB);

    const parsedRaw = new URL(capturedRawUrl, 'https://od.local');
    expect(parsedRaw.searchParams.has('workspaceId')).toBe(false);
    expect(parsedRaw.searchParams.has('workspaceMemberId')).toBe(false);

    for (const url of [capturedTerminalUrl, capturedEventsUrl]) {
      const parsed = new URL(url, 'https://od.local');
      expect(parsed.searchParams.get('workspaceId')).toBe('workspace-a');
      expect(parsed.searchParams.get('workspaceMemberId')).toBe('member-a');
    }
  });

  it('sends exact headers on file, terminal, conversation, tabs, and run reads/writes', async () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes('/raw/')) return new Response('hello');
      if (url.endsWith('/files')) return Response.json({ files: [] });
      if (url.endsWith('/terminals')) {
        return Response.json({ terminal: { id: 'terminal-1' } });
      }
      if (url.endsWith('/stdin')) return new Response(null, { status: 204 });
      if (url.endsWith('/conversations')) {
        return Response.json({ conversations: [] });
      }
      if (url.endsWith('/tabs')) {
        if (init?.method === 'PUT') return new Response(null, { status: 204 });
        return Response.json({ tabs: ['index.html'], active: 'index.html' });
      }
      if (url.startsWith('/api/runs?')) return Response.json({ runs: [] });
      if (url.startsWith('/api/runs/')) {
        return Response.json({
          id: 'run-1',
          status: 'running',
          projectId: 'project-1',
          conversationId: 'conversation-1',
          createdAt: 1,
          updatedAt: 1,
        });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchProjectFileText('project-1', 'index.html', {
      workspaceContext: workspaceA,
    });
    await fetchProjectFiles('project-1', { workspaceContext: workspaceA });
    await createTerminal('project-1', undefined, workspaceA);
    await sendTerminalStdin('project-1', 'terminal-1', 'pwd\n', workspaceA);
    await listConversations('project-scope-test', {
      throwOnError: true,
      workspaceContext: workspaceA,
    });
    await loadTabs('project-tabs-scope-test', workspaceA);
    await saveTabs(
      'project-tabs-scope-test',
      { tabs: ['index.html'], active: 'index.html' },
      workspaceA,
    );
    await fetchChatRunStatus('run-1', workspaceA);
    await listActiveChatRuns('project-1', 'conversation-1', workspaceA);

    expect(fetchMock).toHaveBeenCalledTimes(9);
    for (const [, init] of fetchMock.mock.calls) {
      expect(requestScope(init)).toEqual(['workspace-a', 'member-a']);
    }
  });

  it('sends exact headers when reading a historical project file version', async () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        version: { id: 'version-1' },
        content: '<h1>Historical</h1>',
      }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchProjectFileVersion('project-1', 'index.html', 'version-1', workspaceA);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/files/index.html/versions/version-1',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.objectContaining({
          'x-od-workspace-id': 'workspace-a',
          'x-od-workspace-member-id': 'member-a',
        }),
      }),
    );
  });

  it('keeps write authority in headers without leaking it into the raw URL', async () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(deleteProjectFile('project-1', 'index.html', workspaceA)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/raw/index.html',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          'x-od-workspace-id': 'workspace-a',
          'x-od-workspace-member-id': 'member-a',
        }),
      }),
    );
  });

  it('partitions same project id conversation and tabs reads by full identity', async () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    const workspaceB = teamContext('workspace-b', 'member-b');
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const [workspaceId] = requestScope(init);
      if (String(input).endsWith('/conversations')) {
        return Response.json({
          conversations: [{ id: `conversation-${workspaceId}` }],
        });
      }
      return Response.json({
        tabs: [`${workspaceId}.html`],
        active: `${workspaceId}.html`,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [conversationsA, conversationsB, tabsA, tabsB] = await Promise.all([
      listConversations('same-project', {
        throwOnError: true,
        workspaceContext: workspaceA,
      }),
      listConversations('same-project', {
        throwOnError: true,
        workspaceContext: workspaceB,
      }),
      loadTabs('same-project', workspaceA),
      loadTabs('same-project', workspaceB),
    ]);

    expect(conversationsA[0]?.id).toBe('conversation-workspace-a');
    expect(conversationsB[0]?.id).toBe('conversation-workspace-b');
    expect(tabsA.active).toBe('workspace-a.html');
    expect(tabsB.active).toBe('workspace-b.html');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('scopes run feedback and omits caller-owned project metadata', async () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 202 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await reportChatRunFeedback({
      runId: 'run-1',
      rating: 'positive',
      reasonCodes: ['matched_request'],
      hasCustomReason: false,
      customReason: '',
    }, workspaceA);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(requestScope(init)).toEqual(['workspace-a', 'member-a']);
    expect(JSON.parse(String(init?.body))).toEqual({
      rating: 'positive',
      reasonCodes: ['matched_request'],
      hasCustomReason: false,
      customReason: '',
    });
  });

  it('scopes P1 artifact, deploy, editor, skill, and design-system transports to captured A', async () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    const workspaceB = teamContext('workspace-b', 'member-b');
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes('/refreshes')) return Response.json({ refreshes: [] });
      if (url.includes('/refresh?')) {
        return Response.json({
          artifact: { id: 'artifact-1' },
          refresh: { id: 'refresh-1', status: 'succeeded', refreshedSourceCount: 0 },
        });
      }
      if (url.includes('/preview')) return new Response('<html></html>');
      if (url.includes('/showcase')) return new Response('<html></html>');
      if (url.includes('/live-artifacts?')) return Response.json({ liveArtifacts: [] });
      if (url.includes('/live-artifacts/artifact-1')) {
        return Response.json({ liveArtifact: { id: 'artifact-1' } });
      }
      if (url.endsWith('/deployments')) return Response.json({ deployments: [] });
      if (url.endsWith('/deploy') || url.endsWith('/check-link')) {
        return Response.json({ id: 'deployment-1', providerId: 'vercel-self', status: 'ready' });
      }
      if (url.endsWith('/open-in')) return Response.json({ ok: true });
      if (url.endsWith('/skills/skill-1/files')) return Response.json({ files: [] });
      if (url.endsWith('/skills/skill-1')) return Response.json({ id: 'skill-1' });
      if (url.endsWith('/design-systems/ds-1/files')) return Response.json({ files: [] });
      if (url.includes('/design-systems/ds-1/file?')) return Response.json({ file: null });
      if (url.endsWith('/design-systems/generation-jobs')) {
        return Response.json({ job: { id: 'job-1' } });
      }
      if (url.endsWith('/design-systems/generation-jobs/job-1')) {
        return Response.json({ job: { id: 'job-1' } });
      }
      if (url.endsWith('/design-systems/ds-1/revisions')) {
        return Response.json({ revisions: [] });
      }
      if (url.endsWith('/design-systems/ds-1/revisions/revision-1')) {
        return Response.json({ revision: { id: 'revision-1' } });
      }
      if (url.endsWith('/design-systems/ds-1/revision-jobs')) {
        return Response.json({ job: { id: 'revision-job-1' } });
      }
      if (url.endsWith('/design-systems/ds-1/token-contract/rebuild-jobs')) {
        return Response.json({ decision: { available: false } });
      }
      if (url.endsWith('/design-systems/ds-1/sync-assets')) {
        return Response.json({ synced: [] });
      }
      if (url.endsWith('/design-systems/ds-1/workspace')) {
        return Response.json({ project: { id: 'project-1' }, files: [] });
      }
      if (url.endsWith('/design-systems/ds-1')) {
        return Response.json({ designSystem: { id: 'ds-1', title: 'DS', body: '' } });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const previewUrlA = liveArtifactPreviewUrl(
      'project-1',
      'artifact-1',
      'rendered',
      workspaceA,
    );
    const staticUrlA = designSystemStaticUrl('ds-1', 'system/kit.html', workspaceA);
    liveArtifactPreviewUrl('project-1', 'artifact-1', 'rendered', workspaceB);
    designSystemStaticUrl('ds-1', 'system/kit.html', workspaceB);
    for (const url of [previewUrlA, staticUrlA]) {
      const parsed = new URL(url, 'https://od.local');
      expect(parsed.searchParams.get('workspaceId')).toBe('workspace-a');
      expect(parsed.searchParams.get('workspaceMemberId')).toBe('member-a');
    }

    await fetchLiveArtifacts('p1-live-list', { workspaceContext: workspaceA });
    await fetchLiveArtifact('project-1', 'artifact-1', workspaceA);
    await refreshLiveArtifact('project-1', 'artifact-1', workspaceA);
    await fetchLiveArtifactRefreshes('project-1', 'artifact-1', workspaceA);
    await deleteLiveArtifact('project-1', 'artifact-1', workspaceA);
    await fetchLiveArtifactCode('project-1', 'artifact-1', 'template', workspaceA);
    await fetchProjectDeployments('project-1', workspaceA);
    await deployProjectFile(
      'project-1',
      'index.html',
      'vercel-self',
      undefined,
      undefined,
      workspaceA,
    );
    await checkDeploymentLink('project-1', 'deployment-1', workspaceA);
    await openProjectInEditor('project-1', 'vscode', workspaceA);
    await fetchSkill('skill-1', workspaceA);
    await fetchSkillFiles('skill-1', workspaceA);
    await fetchDesignSystem('ds-1', workspaceA);
    await fetchDesignSystemFiles('ds-1', workspaceA);
    await fetchDesignSystemFile('ds-1', 'DESIGN.md', workspaceA);
    await ensureDesignSystemWorkspace('ds-1', workspaceA);
    await fetchDesignSystemPreview('ds-1', workspaceA);
    await fetchDesignSystemShowcase('ds-1', workspaceA);
    await startDesignSystemGenerationJob({ title: 'DS' }, workspaceA);
    await fetchDesignSystemGenerationJob('job-1', workspaceA);
    await fetchDesignSystemRevisions('ds-1', workspaceA);
    await updateDesignSystemRevisionStatus(
      'ds-1',
      'revision-1',
      'accepted',
      workspaceA,
    );
    await startDesignSystemRevisionJob(
      'ds-1',
      { feedback: 'adjust' },
      workspaceA,
    );
    await startDesignSystemTokenContractRebuildJob(
      'ds-1',
      { force: true },
      workspaceA,
    );
    await updateDesignSystemDraft('ds-1', { title: 'Updated' }, workspaceA);
    await syncDesignSystemAssetsFromWorkspace('ds-1', workspaceA);
    await deleteDesignSystemDraft('ds-1', workspaceA);

    expect(fetchMock).toHaveBeenCalledTimes(27);
    for (const [, init] of fetchMock.mock.calls) {
      expect(requestScope(init)).toEqual(['workspace-a', 'member-a']);
    }
  });
});
