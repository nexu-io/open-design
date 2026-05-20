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
          JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'name required' } }),
          { status: 400 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'create_project', {
      name: ' ',
    });

    expect(result).toMatchObject({ isError: true });
    // Should expose the daemon's reason rather than a bare HTTP code.
    expect(firstText(result)).toMatch(/name required|BAD_REQUEST|400/);
  });
});
