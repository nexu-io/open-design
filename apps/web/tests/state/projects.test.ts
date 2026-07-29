import { afterEach, describe, expect, it, vi, type MockedFunction } from 'vitest';
import type { StoreScreenshotDocumentResponse } from '@open-design/contracts';
import {
  applyPlugin,
  contributeGeneratedPluginToOpenDesign,
  createProject,
  createPluginShareProject,
  deleteProject,
  importClaudeDesignZip,
  importFolderProject,
  installGeneratedPluginFolder,
  listProjects,
  listPlugins,
  pickLocalFolderPath,
  publishGeneratedPluginToGitHub,
} from '../../src/state/projects';

describe('applyPlugin', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes the current locale to the daemon apply endpoint', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        query: '生成一份简报。',
        contextItems: [],
        inputs: [],
        assets: [],
        mcpServers: [],
        projectMetadata: {},
        trust: 'trusted',
        capabilitiesGranted: [],
        capabilitiesRequired: [],
        appliedPlugin: {
          snapshotId: 'snap-1',
          pluginId: 'sample-plugin',
          pluginVersion: '1.0.0',
          manifestSourceDigest: 'a'.repeat(64),
          inputs: {},
          resolvedContext: { items: [] },
          capabilitiesGranted: [],
          capabilitiesRequired: [],
          assetsStaged: [],
          taskKind: 'new-generation',
          appliedAt: 0,
          connectorsRequired: [],
          connectorsResolved: [],
          mcpServers: [],
          status: 'fresh',
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await applyPlugin('sample-plugin', { locale: 'zh-CN' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toMatchObject({
      inputs: {},
      grantCaps: [],
      locale: 'zh-CN',
    });
  });
});

describe('listProjects', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the default fail-soft behavior for background app startup', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(null, { status: 503 })));

    await expect(listProjects()).resolves.toEqual([]);
  });

  it('can reject transport failures for refresh paths that must preserve current state', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(null, { status: 503 })));

    await expect(listProjects({ throwOnError: true })).rejects.toThrow('projects 503');
  });
});

describe('createProject', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('preserves daemon validation messages from non-2xx create responses', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        error: {
          message: 'draft design systems cannot be used by projects',
        },
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createProject({
      name: 'Draft DS project',
      skillId: null,
      designSystemId: 'user:draft-system',
    })).rejects.toThrow('draft design systems cannot be used by projects');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('initializes a four-page minimal store screenshot document after project creation', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === '/api/projects') {
        return new Response(JSON.stringify({
          project: {
            id: 'project-store-1',
            name: 'Focus store listing',
            skillId: null,
            designSystemId: 'clay',
            metadata: {
              kind: 'image',
              intent: 'store-screenshot',
              platformTargets: ['mobile-ios', 'mobile-android'],
            },
          },
          conversationId: 'conversation-1',
        }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(storeScreenshotDocumentResponse('project-store-1')), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await createProject({
      name: 'Focus store listing',
      skillId: null,
      designSystemId: 'clay',
      metadata: {
        kind: 'image',
        intent: 'store-screenshot',
        platform: 'mobile-ios',
        platformTargets: ['mobile-ios', 'mobile-android'],
      },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/projects/project-store-1/store-screenshots',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const [, init] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      product: {
        name: 'Focus store listing',
        summary: '',
        audience: '',
        features: [],
      },
      designSystemId: 'clay',
      templateId: 'minimal-center',
      pageCount: 4,
      platforms: ['appStore', 'googlePlay'],
    });
  });

  it('retries document initialization on the same project after an initialization failure', async () => {
    let documentAttempts = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === '/api/projects') {
        return new Response(JSON.stringify({
          project: {
            id: 'project-store-retry',
            name: 'Recoverable store listing',
            skillId: null,
            designSystemId: 'clay',
            metadata: {
              kind: 'image',
              intent: 'store-screenshot',
              platformTargets: ['mobile-ios', 'mobile-android'],
            },
          },
          conversationId: 'conversation-retry',
        }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (init?.method !== 'POST') {
        return new Response(JSON.stringify({
          error: {
            code: 'DOCUMENT_NOT_FOUND',
            message: 'document not found',
          },
        }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      documentAttempts += 1;
      if (documentAttempts === 1) {
        return new Response(JSON.stringify({
          error: { message: 'temporary document failure' },
        }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify(storeScreenshotDocumentResponse('project-store-retry')),
        {
          status: 201,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const input: Parameters<typeof createProject>[0] = {
      name: 'Recoverable store listing',
      skillId: null,
      designSystemId: 'clay',
      metadata: {
        kind: 'image',
        intent: 'store-screenshot',
        platform: 'mobile-ios',
        platformTargets: ['mobile-ios', 'mobile-android'],
      },
    };

    await expect(createProject(input)).rejects.toThrow('temporary document failure');
    await expect(createProject(input)).resolves.toMatchObject({
      project: { id: 'project-store-retry' },
    });

    expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/api/projects')).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url, init]) => (
      String(url) === '/api/projects/project-store-retry/store-screenshots'
      && init?.method === 'POST'
    ))).toHaveLength(2);
  });

  it('does not retry document creation when recovery lookup returns a server error', async () => {
    let documentPosts = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects') {
        return projectCreateResponse('project-store-get-500', 'Recovery GET 500');
      }
      if (init?.method === 'POST') {
        documentPosts += 1;
        return apiErrorResponse(
          documentPosts === 1 ? 503 : 201,
          documentPosts === 1 ? 'INTERNAL_ERROR' : 'CONFLICT',
          documentPosts === 1 ? 'initialization unavailable' : 'unexpected retry',
        );
      }
      return apiErrorResponse(500, 'INTERNAL_ERROR', 'lookup unavailable');
    });
    vi.stubGlobal('fetch', fetchMock);
    const input = storeScreenshotProjectInput('Recovery GET 500');

    await expect(createProject(input)).rejects.toThrow('initialization unavailable');
    await expect(createProject(input)).rejects.toThrow('lookup unavailable');

    expect(documentPosts).toBe(1);
    expect(projectPostCalls(fetchMock)).toHaveLength(1);
  });

  it('does not retry document creation when recovery lookup returns malformed success data', async () => {
    let documentPosts = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects') {
        return projectCreateResponse('project-store-get-malformed', 'Recovery malformed');
      }
      if (init?.method === 'POST') {
        documentPosts += 1;
        if (documentPosts === 1) {
          return apiErrorResponse(503, 'INTERNAL_ERROR', 'initialization unavailable');
        }
        return jsonResponse(storeScreenshotDocumentResponse('project-store-get-malformed'), 201);
      }
      return jsonResponse({ unexpected: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    const input = storeScreenshotProjectInput('Recovery malformed');

    await expect(createProject(input)).rejects.toThrow('initialization unavailable');
    await expect(createProject(input)).rejects.toThrow(
      'Invalid store screenshot API response',
    );

    expect(documentPosts).toBe(1);
    expect(projectPostCalls(fetchMock)).toHaveLength(1);
  });

  it('does not retry document creation when recovery lookup has a network failure', async () => {
    let documentPosts = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects') {
        return projectCreateResponse('project-store-get-network', 'Recovery network');
      }
      if (init?.method === 'POST') {
        documentPosts += 1;
        return apiErrorResponse(503, 'INTERNAL_ERROR', 'initialization unavailable');
      }
      throw new TypeError('network unavailable');
    });
    vi.stubGlobal('fetch', fetchMock);
    const input = storeScreenshotProjectInput('Recovery network');

    await expect(createProject(input)).rejects.toThrow('initialization unavailable');
    await expect(createProject(input)).rejects.toThrow('network unavailable');

    expect(documentPosts).toBe(1);
    expect(projectPostCalls(fetchMock)).toHaveLength(1);
  });

  it('does not retry document creation for a 404 with the wrong business code', async () => {
    let documentPosts = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects') {
        return projectCreateResponse('project-store-wrong-404', 'Recovery wrong 404');
      }
      if (init?.method === 'POST') {
        documentPosts += 1;
        return apiErrorResponse(503, 'INTERNAL_ERROR', 'initialization unavailable');
      }
      return apiErrorResponse(404, 'PROJECT_NOT_FOUND', 'project disappeared');
    });
    vi.stubGlobal('fetch', fetchMock);
    const input = storeScreenshotProjectInput('Recovery wrong 404');

    await expect(createProject(input)).rejects.toThrow('initialization unavailable');
    await expect(createProject(input)).rejects.toThrow('project disappeared');

    expect(documentPosts).toBe(1);
  });

  it.each([
    ['name', (input: Parameters<typeof createProject>[0]) => ({ ...input, name: `${input.name} changed` })],
    ['project location', (input: Parameters<typeof createProject>[0]) => ({ ...input, projectLocationId: 'alternate-location' })],
    ['skill', (input: Parameters<typeof createProject>[0]) => ({ ...input, skillId: 'alternate-skill' })],
    ['design system', (input: Parameters<typeof createProject>[0]) => ({ ...input, designSystemId: 'alternate-system' })],
    ['pending prompt', (input: Parameters<typeof createProject>[0]) => ({ ...input, pendingPrompt: 'alternate prompt' })],
    ['conversation mode', (input: Parameters<typeof createProject>[0]) => ({ ...input, conversationMode: 'chat' as const })],
    ['plugin id', (input: Parameters<typeof createProject>[0]) => ({ ...input, pluginId: 'alternate-plugin' })],
    ['plugin snapshot', (input: Parameters<typeof createProject>[0]) => ({ ...input, appliedPluginSnapshotId: 'alternate-snapshot' })],
    ['plugin inputs', (input: Parameters<typeof createProject>[0]) => ({ ...input, pluginInputs: { theme: 'light', nested: { density: 2 } } })],
    ['custom instructions', (input: Parameters<typeof createProject>[0]) => ({ ...input, customInstructions: 'Use a compact layout' })],
    ['skip discovery brief', (input: Parameters<typeof createProject>[0]) => ({ ...input, skipDiscoveryBrief: true })],
    ['metadata baseDir', (input: Parameters<typeof createProject>[0]) => ({
      ...input,
      metadata: { ...input.metadata!, baseDir: '/alternate/workspace' },
    })],
    ['metadata', (input: Parameters<typeof createProject>[0]) => ({
      ...input,
      metadata: { ...input.metadata!, platform: 'mobile-android' as const },
    })],
  ])('does not reuse a recovery project when %s changes', async (label, mutate) => {
    let projectPosts = 0;
    const slug = label.replaceAll(' ', '-');
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects') {
        projectPosts += 1;
        return projectCreateResponse(
          `project-fingerprint-${slug}-${projectPosts}`,
          `Fingerprint ${label}`,
        );
      }
      if (init?.method === 'POST') {
        if (url.includes(`-${slug}-1/`)) {
          return apiErrorResponse(503, 'INTERNAL_ERROR', 'initialization unavailable');
        }
        const projectId = url.split('/')[3]!;
        return jsonResponse(storeScreenshotDocumentResponse(projectId), 201);
      }
      return apiErrorResponse(404, 'DOCUMENT_NOT_FOUND', 'document not found');
    });
    vi.stubGlobal('fetch', fetchMock);
    const original = storeScreenshotProjectInput(`Fingerprint ${label}`);

    await expect(createProject(original)).rejects.toThrow('initialization unavailable');
    await expect(createProject(mutate(original))).resolves.toBeTruthy();

    expect(projectPosts).toBe(2);
  });

  it('uses stable object serialization for semantically identical recovery inputs', async () => {
    let documentPosts = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects') {
        return projectCreateResponse('project-stable-fingerprint', 'Stable fingerprint');
      }
      if (init?.method !== 'POST') {
        return apiErrorResponse(404, 'DOCUMENT_NOT_FOUND', 'document not found');
      }
      documentPosts += 1;
      if (documentPosts === 1) {
        return apiErrorResponse(503, 'INTERNAL_ERROR', 'initialization unavailable');
      }
      return jsonResponse(storeScreenshotDocumentResponse('project-stable-fingerprint'), 201);
    });
    vi.stubGlobal('fetch', fetchMock);
    const first = storeScreenshotProjectInput('Stable fingerprint');
    first.pluginInputs = {
      theme: 'dark',
      screens: [{ density: 1, contrast: 'high' }],
      tags: ['productivity', 'mobile'],
    };
    const reordered: Parameters<typeof createProject>[0] = {
      ...first,
      metadata: {
        platformTargets: ['mobile-ios', 'mobile-android'],
        platform: 'mobile-ios',
        intent: 'store-screenshot',
        kind: 'image',
      },
      pluginInputs: {
        tags: ['productivity', 'mobile'],
        screens: [{ contrast: 'high', density: 1 }],
        theme: 'dark',
      },
    };

    await expect(createProject(first)).rejects.toThrow('initialization unavailable');
    await expect(createProject(reordered)).resolves.toMatchObject({
      project: { id: 'project-stable-fingerprint' },
    });

    expect(projectPostCalls(fetchMock)).toHaveLength(1);
    expect(documentPosts).toBe(2);
  });

  it('fingerprints the JSON request value produced by toJSON inputs', async () => {
    let projectPosts = 0;
    let documentPosts = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects') {
        projectPosts += 1;
        return projectCreateResponse(
          `project-request-equivalent-${projectPosts}`,
          'Request equivalent',
        );
      }
      if (init?.method !== 'POST') {
        return apiErrorResponse(404, 'DOCUMENT_NOT_FOUND', 'document not found');
      }
      documentPosts += 1;
      if (documentPosts === 1) {
        return apiErrorResponse(503, 'INTERNAL_ERROR', 'initialization unavailable');
      }
      const projectId = url.split('/')[3]!;
      return jsonResponse(storeScreenshotDocumentResponse(projectId), 201);
    });
    vi.stubGlobal('fetch', fetchMock);
    const first = storeScreenshotProjectInput('Request equivalent');
    first.pluginInputs = {
      capturedAt: new Date('2026-07-29T12:00:00.000Z'),
    };
    const requestEquivalent = storeScreenshotProjectInput('Request equivalent');
    requestEquivalent.pluginInputs = {
      capturedAt: '2026-07-29T12:00:00.000Z',
    };

    await expect(createProject(first)).rejects.toThrow('initialization unavailable');
    await expect(createProject(requestEquivalent)).resolves.toMatchObject({
      project: { id: 'project-request-equivalent-1' },
    });

    expect(projectPosts).toBe(1);
    expect(documentPosts).toBe(2);
  });

  it('does not reuse a recovery project when name whitespace changes the request payload', async () => {
    let projectPosts = 0;
    let firstProjectDocumentPosts = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects') {
        projectPosts += 1;
        const request = JSON.parse(String(init?.body)) as { name: string };
        return projectCreateResponse(`project-name-space-${projectPosts}`, request.name);
      }
      if (url.includes('/project-name-space-1/') && init?.method === 'POST') {
        firstProjectDocumentPosts += 1;
        if (firstProjectDocumentPosts === 1) {
          return apiErrorResponse(503, 'INTERNAL_ERROR', 'initialization unavailable');
        }
      }
      if (init?.method !== 'POST') {
        return apiErrorResponse(404, 'DOCUMENT_NOT_FOUND', 'document not found');
      }
      const projectId = url.split('/')[3]!;
      return jsonResponse(storeScreenshotDocumentResponse(projectId), 201);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createProject(storeScreenshotProjectInput(' Focus ')),
    ).rejects.toThrow('initialization unavailable');
    await expect(
      createProject(storeScreenshotProjectInput('Focus')),
    ).resolves.toMatchObject({
      project: { id: 'project-name-space-2' },
    });

    expect(projectPostCalls(fetchMock)).toHaveLength(2);
    expect(projectPostCalls(fetchMock).map(([, init]) => (
      (JSON.parse(String(init?.body)) as { name: string }).name
    ))).toEqual([' Focus ', 'Focus']);
    expect(fetchMock.mock.calls
      .filter(([url, init]) => (
        String(url).includes('/store-screenshots')
        && init?.method === 'POST'
      ))
      .map(([, init]) => (
        (JSON.parse(String(init?.body)) as { product: { name: string } }).product.name
      ))).toEqual([' Focus ', 'Focus']);
  });

  it('expires a failed recovery project after five minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.now());
    let projectPosts = 0;
    const documentPosts = new Map<string, number>();
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects') {
        projectPosts += 1;
        return projectCreateResponse(`project-registry-ttl-${projectPosts}`, 'Registry TTL');
      }
      if (init?.method !== 'POST') {
        return apiErrorResponse(404, 'DOCUMENT_NOT_FOUND', 'document not found');
      }
      const projectId = url.split('/')[3]!;
      const attempts = (documentPosts.get(projectId) ?? 0) + 1;
      documentPosts.set(projectId, attempts);
      if (projectId === 'project-registry-ttl-1' && attempts === 1) {
        return apiErrorResponse(503, 'INTERNAL_ERROR', 'initialization unavailable');
      }
      return jsonResponse(storeScreenshotDocumentResponse(projectId), 201);
    });
    vi.stubGlobal('fetch', fetchMock);
    const input = storeScreenshotProjectInput('Registry TTL');

    await expect(createProject(input)).rejects.toThrow('initialization unavailable');
    vi.advanceTimersByTime(5 * 60 * 1_000 + 1);
    await expect(createProject(input)).resolves.toMatchObject({
      project: { id: 'project-registry-ttl-2' },
    });

    expect(projectPosts).toBe(2);
  });

  it('evicts the least recently used failed recovery when capacity is exceeded', async () => {
    const projectPostsByName = new Map<string, number>();
    const documentPostsByProject = new Map<string, number>();
    let lruGets = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects') {
        const request = JSON.parse(String(init?.body)) as { name: string };
        const attempt = (projectPostsByName.get(request.name) ?? 0) + 1;
        projectPostsByName.set(request.name, attempt);
        return projectCreateResponse(
          `${request.name}-project-${attempt}`,
          request.name,
        );
      }
      const projectId = url.split('/')[3]!;
      if (init?.method !== 'POST') {
        if (projectId === 'registry-lru-project-1') {
          lruGets += 1;
          if (lruGets === 1) {
            return apiErrorResponse(500, 'INTERNAL_ERROR', 'touch failed recovery');
          }
        }
        return apiErrorResponse(404, 'DOCUMENT_NOT_FOUND', 'document not found');
      }
      const attempts = (documentPostsByProject.get(projectId) ?? 0) + 1;
      documentPostsByProject.set(projectId, attempts);
      if (projectId.endsWith('-project-2') || attempts > 1) {
        return jsonResponse(storeScreenshotDocumentResponse(projectId), 201);
      }
      return apiErrorResponse(503, 'INTERNAL_ERROR', 'initialization unavailable');
    });
    vi.stubGlobal('fetch', fetchMock);
    const lruInput = storeScreenshotProjectInput('registry-lru');
    const oldestInput = storeScreenshotProjectInput('registry-oldest');

    await expect(createProject(lruInput)).rejects.toThrow('initialization unavailable');
    await expect(createProject(oldestInput)).rejects.toThrow('initialization unavailable');
    for (let index = 0; index < 30; index += 1) {
      await expect(
        createProject(storeScreenshotProjectInput(`registry-filler-${index}`)),
      ).rejects.toThrow('initialization unavailable');
    }

    await expect(createProject(lruInput)).rejects.toThrow('touch failed recovery');
    await expect(
      createProject(storeScreenshotProjectInput('registry-overflow')),
    ).rejects.toThrow('initialization unavailable');

    await expect(createProject(oldestInput)).resolves.toMatchObject({
      project: { id: 'registry-oldest-project-2' },
    });
    await expect(createProject(lruInput)).resolves.toMatchObject({
      project: { id: 'registry-lru-project-1' },
    });

    expect(projectPostsByName.get('registry-oldest')).toBe(2);
    expect(projectPostsByName.get('registry-lru')).toBe(1);
  });

  it('keeps an in-flight creation single-flighted while failed recoveries exceed capacity', async () => {
    let resolveTargetProject!: (response: Response) => void;
    const targetProjectResponse = new Promise<Response>((resolve) => {
      resolveTargetProject = resolve;
    });
    let targetProjectPosts = 0;
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === '/api/projects') {
        const request = JSON.parse(String(init?.body)) as { name: string };
        if (request.name === 'registry-in-flight') {
          targetProjectPosts += 1;
          return targetProjectResponse;
        }
        return projectCreateResponse(`${request.name}-project-1`, request.name);
      }
      if (url.includes('/registry-in-flight-project-1/')) {
        return jsonResponse(
          storeScreenshotDocumentResponse('registry-in-flight-project-1'),
          201,
        );
      }
      return apiErrorResponse(503, 'INTERNAL_ERROR', 'initialization unavailable');
    });
    vi.stubGlobal('fetch', fetchMock);
    const targetInput = storeScreenshotProjectInput('registry-in-flight');

    const first = createProject(targetInput);
    await Promise.resolve();
    for (let index = 0; index < 33; index += 1) {
      await expect(
        createProject(storeScreenshotProjectInput(`registry-pressure-${index}`)),
      ).rejects.toThrow('initialization unavailable');
    }
    const second = createProject(targetInput);

    resolveTargetProject(
      projectCreateResponse('registry-in-flight-project-1', 'registry-in-flight'),
    );
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.project.id).toBe('registry-in-flight-project-1');
    expect(secondResult.project.id).toBe('registry-in-flight-project-1');
    expect(targetProjectPosts).toBe(1);
  });

  it('single-flights concurrent identical project creation and initialization', async () => {
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === '/api/projects') {
        return projectCreateResponse('project-single-flight', 'Single flight');
      }
      return jsonResponse(storeScreenshotDocumentResponse('project-single-flight'), 201);
    });
    vi.stubGlobal('fetch', fetchMock);
    const input = storeScreenshotProjectInput('Single flight');

    const [first, second] = await Promise.all([
      createProject(input),
      createProject(input),
    ]);

    expect(first.project.id).toBe('project-single-flight');
    expect(second.project.id).toBe('project-single-flight');
    expect(projectPostCalls(fetchMock)).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => (
      String(url) === '/api/projects/project-single-flight/store-screenshots'
    ))).toHaveLength(1);
  });
});

function storeScreenshotProjectInput(
  name: string,
): Parameters<typeof createProject>[0] {
  return {
    name,
    projectLocationId: 'default',
    skillId: 'store-screenshot-skill',
    designSystemId: 'clay',
    pendingPrompt: 'Create a store listing',
    conversationMode: 'design',
    pluginId: 'store-screenshot-plugin',
    appliedPluginSnapshotId: 'snapshot-1',
    pluginInputs: {
      theme: 'dark',
      nested: { density: 1 },
    },
    metadata: {
      kind: 'image',
      intent: 'store-screenshot',
      platform: 'mobile-ios',
      platformTargets: ['mobile-ios', 'mobile-android'],
    },
  };
}

function projectCreateResponse(projectId: string, name: string): Response {
  return jsonResponse({
    project: {
      id: projectId,
      name,
      skillId: 'store-screenshot-skill',
      designSystemId: 'clay',
      metadata: {
        kind: 'image',
        intent: 'store-screenshot',
        platformTargets: ['mobile-ios', 'mobile-android'],
      },
    },
    conversationId: `conversation-${projectId}`,
  }, 201);
}

function apiErrorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function projectPostCalls(fetchMock: MockedFunction<typeof fetch>) {
  return fetchMock.mock.calls.filter(([url]) => String(url) === '/api/projects');
}

function storeScreenshotDocumentResponse(
  projectId: string,
): StoreScreenshotDocumentResponse {
  return {
    document: {
      schemaVersion: 1,
      id: `document-${projectId}`,
      projectId,
      version: 1,
      product: {
        name: 'Focus store listing',
        summary: '',
        audience: '',
        features: [],
      },
      designSystemId: 'clay',
      assets: [],
      pages: Array.from({ length: 4 }, (_, index) => ({
        id: `page-${index + 1}`,
        order: index,
        templateId: 'minimal-center',
        headline: 'Focus store listing',
        overrides: {},
        lockedFields: [],
      })),
    },
  };
}

describe('listPlugins', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hides plugins marked od.hidden from UI-facing lists', async () => {
    const visible = {
      id: 'od-new-generation',
      title: 'New generation',
      manifest: { od: { kind: 'scenario' } },
    };
    const hidden = {
      id: 'od-default',
      title: 'Default design router',
      manifest: { od: { kind: 'scenario', hidden: true } },
    };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ plugins: [hidden, visible] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    const rows = await listPlugins();

    expect(rows.map((row) => row.id)).toEqual(['od-new-generation']);
  });

  it('can include hidden plugins for installed-entry matching', async () => {
    const visible = {
      id: 'od-new-generation',
      title: 'New generation',
      manifest: { od: { kind: 'scenario' } },
    };
    const hidden = {
      id: 'od-default',
      title: 'Default design router',
      manifest: { od: { kind: 'scenario', hidden: true } },
    };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ plugins: [hidden, visible] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    const rows = await listPlugins({ includeHidden: true });

    expect(rows.map((row) => row.id)).toEqual(['od-default', 'od-new-generation']);
  });
});

describe('installGeneratedPluginFolder', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('installs a project-relative generated plugin folder', async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        ok: true,
        plugin: { id: 'generated-plugin', title: 'Generated Plugin' },
        warnings: [],
        message: 'Installed Generated Plugin.',
        log: [],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await installGeneratedPluginFolder('project-1', 'generated-plugin');

    expect(outcome.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/projects/project-1/plugins/install-folder',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: 'generated-plugin' }),
      }),
    );
    expect(dispatchEvent).toHaveBeenCalled();
  });

  it('preserves install diagnostics from non-2xx project folder responses', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        ok: false,
        warnings: ['Missing open-design.json'],
        message: 'Plugin validation failed.',
        log: ['Validating generated-plugin'],
      }),
      { status: 400, headers: { 'content-type': 'application/json' }, statusText: 'Bad Request' },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await installGeneratedPluginFolder('project-1', 'generated-plugin');

    expect(outcome).toMatchObject({
      ok: false,
      warnings: ['Missing open-design.json'],
      message: 'Plugin validation failed.',
      log: ['Validating generated-plugin'],
    });
  });
});

describe('importClaudeDesignZip', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves daemon import errors from non-2xx responses', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: 'Unable to unpack Claude export.' }),
      { status: 422, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['zip-bytes'], 'claude-design.zip', {
      type: 'application/zip',
    });

    await expect(importClaudeDesignZip(file)).rejects.toThrow(
      'Unable to unpack Claude export.',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/import/claude-design',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }),
    );
  });
});

describe('generated plugin share actions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts publish and contribute actions for project-relative plugin folders', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        ok: true,
        message: 'Ready',
        url: 'https://github.com/example/generated-plugin',
        log: ['ok'],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const publish = await publishGeneratedPluginToGitHub('project-1', 'generated-plugin');
    const contribute = await contributeGeneratedPluginToOpenDesign('project-1', 'generated-plugin');

    expect(publish).toMatchObject({ ok: true, message: 'Ready' });
    expect(contribute).toMatchObject({ ok: true, message: 'Ready' });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/projects/project-1/plugins/publish-github',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: 'generated-plugin' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/projects/project-1/plugins/contribute-open-design',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ path: 'generated-plugin' }),
      }),
    );
  });
});

describe('createPluginShareProject', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates an agent-backed share project for an installed plugin', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        ok: true,
        project: {
          id: 'project-1',
          name: 'Publish to GitHub: Sample Plugin',
          skillId: null,
          designSystemId: null,
          createdAt: 1,
          updatedAt: 1,
          pendingPrompt: 'Publish it',
          metadata: { kind: 'prototype' },
        },
        conversationId: 'conversation-1',
        appliedPluginSnapshotId: 'snapshot-1',
        actionPluginId: 'od-plugin-publish-github',
        sourcePluginId: 'sample-plugin',
        stagedPath: 'plugin-source/sample-plugin',
        prompt: 'Publish it',
        message: 'Created a Publish to GitHub task.',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await createPluginShareProject(
      'sample-plugin',
      'publish-github',
      'zh-CN',
    );

    expect(outcome).toMatchObject({
      ok: true,
      project: { id: 'project-1' },
      appliedPluginSnapshotId: 'snapshot-1',
      stagedPath: 'plugin-source/sample-plugin',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/sample-plugin/share-project',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'publish-github', locale: 'zh-CN' }),
      }),
    );
  });

  it('surfaces share project errors from the daemon', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({
        ok: false,
        code: 'share-action-plugin-missing',
        message: 'Restart the daemon.',
      }),
      { status: 409, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await createPluginShareProject(
      'sample-plugin',
      'contribute-open-design',
    );

    expect(outcome).toEqual({
      ok: false,
      code: 'share-action-plugin-missing',
      message: 'Restart the daemon.',
    });
  });
});

describe('importFolderProject', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the project on success', async () => {
    const response = {
      project: { id: 'p-1', name: 'My Folder' },
      conversationId: 'conv-1',
      entryFile: 'index.html',
    };
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    const result = await importFolderProject({ baseDir: '/home/user/project' });
    expect(result).toMatchObject({ project: { id: 'p-1' }, entryFile: 'index.html' });
  });

  it('throws with daemon error message for filesystem root', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'cannot import the filesystem root' } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )));

    await expect(importFolderProject({ baseDir: '/' }))
      .rejects.toThrow('cannot import the filesystem root');
  });

  it('throws with daemon error message for non-existent folder', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'folder not found' } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )));

    await expect(importFolderProject({ baseDir: '/abc/xyz/notexist' }))
      .rejects.toThrow('folder not found');
  });

  it('throws with daemon error message for file path', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'path must be a directory' } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )));

    await expect(importFolderProject({ baseDir: '/etc/hosts' }))
      .rejects.toThrow('path must be a directory');
  });

  it('throws a fallback message when response body has no error detail', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      'Internal Server Error',
      { status: 500 },
    )));

    await expect(importFolderProject({ baseDir: '/some/path' }))
      .rejects.toThrow('Failed to import folder');
  });
});

describe('pickLocalFolderPath', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the selected native folder path', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ path: '/Users/me/Site' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(pickLocalFolderPath()).resolves.toBe('/Users/me/Site');
    expect(fetchMock).toHaveBeenCalledWith('/api/dialog/open-folder', {
      method: 'POST',
    });
  });

  it('returns null when the native picker is cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ path: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));

    await expect(pickLocalFolderPath()).resolves.toBeNull();
  });

  it('throws with the daemon picker error message', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ error: 'cross-origin request rejected' }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    )));

    await expect(pickLocalFolderPath()).rejects.toThrow('cross-origin request rejected');
  });
});

describe('deleteProject tabs cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const tabsKey = 'open-design:project-tabs:v1:p1';

  function stubWindowStore(): Map<string, string> {
    const store = new Map<string, string>([[tabsKey, JSON.stringify({ tabs: [], active: null })]]);
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    });
    return store;
  }

  it('prunes the project tabs cache on a successful delete', async () => {
    const store = stubWindowStore();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(null, { status: 200 })));
    await expect(deleteProject('p1')).resolves.toBe(true);
    expect(store.has(tabsKey)).toBe(false);
  });

  it('keeps the tabs cache when the delete fails', async () => {
    const store = stubWindowStore();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(async () => new Response(null, { status: 500 })));
    await expect(deleteProject('p1')).resolves.toBe(false);
    expect(store.has(tabsKey)).toBe(true);
  });
});
