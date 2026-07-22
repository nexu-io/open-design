import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleMcpToolCall } from '../src/mcp.js';

const originalFetch = globalThis.fetch;

function json(result: { content: Array<{ type: string; text?: string }> }): any {
  const text = result.content.find((item) => item.type === 'text')?.text;
  if (!text) throw new Error('missing text result');
  return JSON.parse(text);
}

describe('ChatGPT-oriented Open Design MCP tools', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('reports Cloud login and wallet without turning wallet failures into zero', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/status')) return new Response(JSON.stringify({ loggedIn: true, user: { email: 'u@example.com' }, account: { balanceUsd: '8.40' } }));
      return new Response('upstream unavailable', { status: 502 });
    }));
    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'get_cloud_account', {});
    expect(json(result)).toMatchObject({
      loggedIn: true,
      account: { balanceUsd: '8.40' },
      wallet: { status: 'unavailable' },
      balanceUsd: '8.40',
      balanceStatus: 'available',
      canUseCloud: true,
      nextAction: 'generate',
    });
    expect(json(result).wallet.balanceUsd).toBeUndefined();
  });

  it('normalizes an empty wallet into recharge-first guidance', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/status')) return new Response(JSON.stringify({ loggedIn: true, user: { id: 'u1' } }));
      return new Response(JSON.stringify({ status: 'available', balanceUsd: '0.00' }));
    }));
    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'get_cloud_account', {});
    expect(json(result)).toMatchObject({
      loggedIn: true,
      balanceUsd: '0.00',
      balanceStatus: 'empty',
      canUseCloud: false,
      nextAction: 'recharge',
      fallback: { modes: ['local_code_agent', 'byok'] },
    });
  });

  it('lists and restores explicit artifact versions', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/projects')) return new Response(JSON.stringify({ projects: [{ id: 'p1', name: 'Demo' }] }));
      if (url.endsWith('/versions') && !init?.method) return new Response(JSON.stringify({ versions: [{ id: 'v1', version: 1 }] }));
      if (url.endsWith('/versions/v1/restore') && init?.method === 'POST') return new Response(JSON.stringify({ version: { id: 'v2', version: 2 } }));
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const listed = await handleMcpToolCall('http://127.0.0.1:17456', 'list_versions', { project: 'Demo', path: 'index.html' });
    expect(json(listed)).toMatchObject({ projectId: 'p1', path: 'index.html', versions: [{ id: 'v1' }] });
    const restored = await handleMcpToolCall('http://127.0.0.1:17456', 'restore_version', { project: 'Demo', path: 'index.html', versionId: 'v1', confirm: true });
    expect(json(restored)).toMatchObject({ projectId: 'p1', version: { id: 'v2' } });
  });

  it('returns a project source ZIP as an embedded MCP resource', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/projects')) return new Response(JSON.stringify({ projects: [{ id: 'p1', name: 'Demo' }] }));
      if (url.endsWith('/archive')) return new Response(new Uint8Array([80, 75, 3, 4]), {
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="demo.zip"',
        },
      });
      return new Response('not found', { status: 404 });
    }));
    const result = await handleMcpToolCall('http://127.0.0.1:17456', 'export_project', { project: 'Demo' });
    expect(result.structuredContent).toMatchObject({ ok: true, projectId: 'p1', fileName: 'demo.zip', bytes: 4 });
    expect(result.content).toContainEqual(expect.objectContaining({
      type: 'resource',
      resource: expect.objectContaining({ mimeType: 'application/zip', blob: 'UEsDBA==' }),
    }));
  });
});
