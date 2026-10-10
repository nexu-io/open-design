import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WorkspaceCollabContext } from '@open-design/contracts';

let connection: typeof import('../../src/providers/connection-test');
let registry: typeof import('../../src/providers/registry');
let workspaceIdentity: typeof import('../../src/collab/workspace-identity');

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_OD_WEB_BASE_PATH', '/open-design');
  vi.resetModules();
  connection = await import('../../src/providers/connection-test');
  registry = await import('../../src/providers/registry');
  workspaceIdentity = await import('../../src/collab/workspace-identity');
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => vi.unstubAllEnvs());

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}

describe('browser requests under a configured web base path', () => {
  it('preserves absolute attachment paths from recorded agent output', () => {
    expect(registry.projectFileUrl('p', '/tmp/odmedia.sh')).toBe(
      '/open-design/api/projects/p/raw//tmp/odmedia.sh',
    );
    expect(registry.projectRawUrl('p', 'docs/A B.png')).toBe(
      '/open-design/api/projects/p/raw/docs/A%20B.png',
    );
  });

  it('tests the current provider through the prefixed daemon route', async () => {
    const reply = { ok: true, kind: 'success', latencyMs: 12, model: 'test-model' };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(reply));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    const result = await connection.testApiProvider({
      protocol: 'openai', baseUrl: 'https://provider.example/v1',
      model: 'test-model', apiKey: 'test-key',
    }, signal);
    expect(result).toEqual(reply);
    expect(fetchMock).toHaveBeenCalledWith('/open-design/api/test/connection',
      expect.objectContaining({ method: 'POST', signal }));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toMatchObject({
      mode: 'provider', baseUrl: 'https://provider.example/v1', apiKey: 'test-key',
    });
  });

  it('preserves workspace authority in prefixed browser file URLs', () => {
    const workspace = {
      workspaceId: 'team/workspace', workspaceMemberId: 'member/1',
    } as WorkspaceCollabContext;
    expect(workspaceIdentity.workspaceResourceUrl('/api/projects/project-1/raw/docs/page.html', workspace)).toBe(
      '/open-design/api/projects/project-1/raw/docs/page.html?workspaceId=team%2Fworkspace&workspaceMemberId=member%2F1',
    );
  });

  it('accepts a prefixed preview capability and renews it without doubling the path', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        url: '/open-design/api/projects/project-1/preview/abcdefgh/docs/page.html',
        expiresAt: 123,
      }))
      .mockResolvedValueOnce(jsonResponse({ expiresAt: 456 }));
    vi.stubGlobal('fetch', fetchMock);
    const preview = await registry.fetchProjectPreviewBaseHref('project-1', 'docs/page.html');
    expect(preview).toEqual({
      href: 'http://open-design.local/open-design/api/projects/project-1/preview/abcdefgh/docs/',
      expiresAt: 123,
    });
    expect(await registry.renewProjectPreviewBaseScope('project-1', preview!.href)).toBe(456);
    expect(fetchMock.mock.calls[0]![0]).toBe('/open-design/api/projects/project-1/preview-url?file=docs%2Fpage.html');
    expect(fetchMock.mock.calls[1]![0]).toBe('/open-design/api/projects/project-1/preview/abcdefgh/renew');
  });
});
