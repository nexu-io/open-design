import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleMcpToolCall } from '../src/mcp.js';

const originalFetch = globalThis.fetch;

function firstText(result: { content: Array<{ text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error('expected MCP text content');
  return item.text;
}

// Coding agents driving Open Design through MCP can inspect existing
// projects but cannot create one (issue #2356). The `create_project`
// tool fixes that gap so the very first turn of an agent-driven session
// no longer requires the user to click "New project" in the desktop UI.
describe('public MCP create_project (#2356)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('posts a minimal project with an auto-generated UUID id', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      // Daemon CreateProjectResponse: { project, conversationId }.
      const requestBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          project: { id: requestBody.id, name: requestBody.name },
          conversationId: 'conv-1',
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'create_project', {
      name: 'Agent-built deck',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(calledUrl).toBe('http://127.0.0.1:17456/api/projects');
    expect(calledInit?.method).toBe('POST');
    expect(calledInit?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    const sent = JSON.parse(String(calledInit?.body));
    expect(sent.name).toBe('Agent-built deck');
    // The MCP layer is responsible for minting a stable id so callers
    // never have to invent one; the daemon route requires it.
    expect(typeof sent.id).toBe('string');
    expect(sent.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const body = JSON.parse(firstText(result));
    expect(body).toMatchObject({
      project: { id: sent.id, name: 'Agent-built deck' },
      conversationId: 'conv-1',
    });
  });

  it('forwards optional skillId, designSystemId, pendingPrompt and customInstructions', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            project: { id: 'ignored', name: 'Workshop' },
            conversationId: 'conv-2',
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await handleMcpToolCall('http://127.0.0.1:17456', 'create_project', {
      name: 'Workshop',
      skillId: 'html-ppt-builder',
      designSystemId: 'xhs-white-editorial',
      pendingPrompt: 'Build a 6-page deck about Q3 OKRs.',
      customInstructions: 'Prefer minimal copy.',
    });

    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(sent).toMatchObject({
      name: 'Workshop',
      skillId: 'html-ppt-builder',
      designSystemId: 'xhs-white-editorial',
      pendingPrompt: 'Build a 6-page deck about Q3 OKRs.',
      customInstructions: 'Prefer minimal copy.',
    });
  });

  it('rejects missing name before posting', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'create_project', {});

    expect(result).toMatchObject({ isError: true });
    expect(firstText(result)).toContain('name is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not forward client-controlled metadata or privileged plugin fields', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            project: { id: 'pid', name: 'Sandboxed' },
            conversationId: 'conv-3',
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await handleMcpToolCall('http://127.0.0.1:17456', 'create_project', {
      name: 'Sandboxed',
      // These shouldn't be exposed through the agent tool surface —
      // baseDir is daemon-rejected, plugin selection is a UI-side
      // concern, and arbitrary metadata invites schema drift.
      metadata: { baseDir: '/etc' },
      pluginId: 'plugin-x',
      pluginInputs: { foo: 'bar' },
      appliedPluginSnapshotId: 'snap-1',
    } as unknown as Record<string, unknown>);

    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(sent).not.toHaveProperty('metadata');
    expect(sent).not.toHaveProperty('pluginId');
    expect(sent).not.toHaveProperty('pluginInputs');
    expect(sent).not.toHaveProperty('appliedPluginSnapshotId');
  });

  it('surfaces a friendly error when the daemon rejects the request', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ error: { code: 'NAME_TAKEN', message: 'duplicate name' } }),
          { status: 409 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'create_project', {
      name: 'Workshop',
    });

    expect(result).toMatchObject({ isError: true });
    // Should expose the daemon's reason rather than a bare HTTP code.
    expect(firstText(result)).toMatch(/duplicate name|NAME_TAKEN|409/);
  });

  it('rejects whitespace-only names locally without contacting the daemon', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'create_project', {
      name: '   ',
    });

    expect(result).toMatchObject({ isError: true });
    expect(firstText(result)).toContain('name is required');
    // Whitespace-only input must short-circuit before the HTTP layer
    // so the agent gets the same fast-fail shape as a missing name.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('primes the project list cache so the new project resolves by name on the same session', async () => {
    // Use a unique base URL so any leftover cache from sibling tests
    // cannot bleed into this assertion.
    const baseUrl = 'http://127.0.0.1:17457';
    let createdId = '';
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      // 1. Prime the project list cache with one existing project so
      //    fetchProjectList() stores a non-empty list keyed to baseUrl.
      if (url === `${baseUrl}/api/projects` && (!init || init.method === undefined || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            projects: [{ id: '11111111-1111-1111-1111-111111111111', name: 'Alpha' }],
          }),
          { status: 200 },
        );
      }
      // 2. create_project for Beta — must NOT trigger a refetch of /api/projects.
      if (url === `${baseUrl}/api/projects` && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { id: string; name: string };
        createdId = body.id;
        return new Response(
          JSON.stringify({ project: { id: body.id, name: body.name }, conversationId: 'c' }),
          { status: 200 },
        );
      }
      // 3. Detail lookup for the newly-created Beta — only reached if
      //    resolveProjectId() found Beta in the cached list.
      if (url === `${baseUrl}/api/projects/${createdId}`) {
        return new Response(
          JSON.stringify({ project: { id: createdId, name: 'Beta' } }),
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    // Warm the cache via a substring resolve that requires fetchProjectList().
    await handleMcpToolCall(baseUrl, 'get_project', { project: 'Alpha' });
    await handleMcpToolCall(baseUrl, 'create_project', { name: 'Beta' });
    const after = await handleMcpToolCall(baseUrl, 'get_project', { project: 'Beta' });

    // Beta must resolve without a second GET /api/projects round-trip:
    // the cached list now contains Beta because createProject pushed it
    // into projectListCache.
    const listFetches = fetchMock.mock.calls.filter(
      ([url, init]) =>
        url === `${baseUrl}/api/projects` && (!init || init.method === undefined || init.method === 'GET'),
    );
    expect(listFetches).toHaveLength(1);
    expect(after).not.toMatchObject({ isError: true });
    const body = JSON.parse(firstText(after as { content: Array<{ text: string }> }));
    expect(body).toMatchObject({ id: createdId, name: 'Beta' });
  });
});
