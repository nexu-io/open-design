import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleMcpToolCall } from '../src/mcp.js';

const originalFetch = globalThis.fetch;

function firstText(result: { content: Array<{ text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error('expected MCP text content');
  return item.text;
}

describe('public MCP create_artifact', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('resolves project names and posts a non-overwrite artifact request', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/projects')) {
        return new Response(JSON.stringify({ projects: [{ id: 'project-1', name: 'Demo' }] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          file: {
            name: 'deck.html',
            artifactManifest: { kind: 'deck', renderer: 'deck-html', entry: 'deck.html' },
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'create_artifact', {
      project: 'Demo',
      name: 'deck.html',
      content: '<!doctype html><h1>Deck</h1>',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:17456/api/projects/project-1/files');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      name: 'deck.html',
      content: '<!doctype html><h1>Deck</h1>',
      encoding: 'utf8',
      artifact: true,
      overwrite: false,
    });
    expect(JSON.parse(firstText(result))).toMatchObject({
      file: {
        name: 'deck.html',
        artifactManifest: { kind: 'deck', renderer: 'deck-html', entry: 'deck.html' },
      },
    });
  });

  it('uses the active project when project is omitted', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/active')) {
        return new Response(JSON.stringify({ active: true, projectId: 'active-1', projectName: 'Active', fileName: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ file: { name: 'index.html' } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'create_artifact', {
      name: 'index.html',
      content: '<!doctype html><h1>Active</h1>',
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:17456/api/projects/active-1/files');
    expect(JSON.parse(firstText(result))).toMatchObject({
      usedActiveContext: { projectId: 'active-1', projectName: 'Active' },
    });
  });

  it('resolves non-UUID project ids and posts a non-overwrite artifact request', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/projects')) {
        return new Response(JSON.stringify({ projects: [{ id: 'custom-project-id', name: 'Demo' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ file: { name: 'index.html' } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17457', 'create_artifact', {
      project: 'custom-project-id',
      name: 'index.html',
      content: '<!doctype html>',
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:17457/api/projects/custom-project-id/files');
    expect(JSON.parse(firstText(result))).toMatchObject({ file: { name: 'index.html' } });
  });

  it('rejects missing required fields before posting the artifact', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/projects')) {
        return new Response(JSON.stringify({ projects: [{ id: 'project-1', name: 'Demo' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ file: { name: 'unused.html' } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'create_artifact', {
      project: 'Demo',
      content: '<!doctype html>',
    });

    expect(result).toMatchObject({ isError: true });
    expect(firstText(result)).toContain('name is required');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/files'))).toBe(false);
  });

  it('rejects non-object artifact manifests before posting the artifact', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/projects')) {
        return new Response(JSON.stringify({ projects: [{ id: 'project-1', name: 'Demo' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ file: { name: 'unused.html' } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'create_artifact', {
      project: 'Demo',
      name: 'index.html',
      content: '<!doctype html>',
      artifactManifest: 'not-a-manifest',
    });

    expect(result).toMatchObject({ isError: true });
    expect(firstText(result)).toContain('artifactManifest must be an object');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/files'))).toBe(false);
  });
});
