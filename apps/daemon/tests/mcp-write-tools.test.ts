import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleMcpToolCall } from '../src/mcp.js';

const originalFetch = globalThis.fetch;

function firstText(result: { content: Array<{ text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error('expected MCP text content');
  return item.text;
}

// mcp.ts caches the project list per baseUrl for 5 s, so two tests
// that share a baseUrl can see each other's fixtures and lookups fail
// in the second test. Hand each test its own baseUrl to keep the cache
// from leaking across cases.
let portCounter = 18000;
function nextBaseUrl(): string {
  portCounter += 1;
  return `http://127.0.0.1:${portCounter}`;
}

// Round out the MCP write surface. Today agents can `create_artifact`
// (which rejects existing targets) but cannot iterate on a file they
// already created, cannot delete a stale file, and cannot remove a
// throwaway project they spun up via `create_project` (#2356).
// Add three matching write tools so external coding agents can drive
// the full file/project lifecycle through MCP, not just the create
// half of it.

describe('public MCP write_file', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('posts an overwrite-allowed write through the daemon files endpoint', async () => {
    const base = nextBaseUrl();
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/api/projects')) {
        return new Response(
          JSON.stringify({ projects: [{ id: 'project-1', name: 'Demo' }] }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ file: { name: 'deck.html' } }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall(base, 'write_file', {
      project: 'Demo',
      path: 'deck.html',
      content: '<!doctype html><h1>v2</h1>',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [filesUrl, filesInit] = fetchMock.mock.calls[1]!;
    expect(filesUrl).toBe(`${base}/api/projects/project-1/files`);
    expect(filesInit?.method).toBe('POST');
    const body = JSON.parse(String(filesInit?.body));
    // The daemon's POST /api/projects/:id/files defaults to overwrite
    // when neither `artifact: true` nor `overwrite: false` is present,
    // which is what write_file must rely on. Spelling out the absence
    // here would be brittle, so the deep-equal already enforces that
    // both keys are omitted.
    expect(body).toEqual({
      name: 'deck.html',
      content: '<!doctype html><h1>v2</h1>',
      encoding: 'utf8',
    });
    expect(JSON.parse(firstText(result))).toMatchObject({
      file: { name: 'deck.html' },
    });
  });

  it('passes base64 encoding through unchanged', async () => {
    const base = nextBaseUrl();
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/api/projects')) {
        return new Response(
          JSON.stringify({ projects: [{ id: 'p1', name: 'P' }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ file: { name: 'logo.png' } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await handleMcpToolCall(base, 'write_file', {
      project: 'P',
      path: 'logo.png',
      content: 'AAA=',
      encoding: 'base64',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(body.encoding).toBe('base64');
  });

  it('uses the active project when project is omitted', async () => {
    const base = nextBaseUrl();
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/api/active')) {
        return new Response(
          JSON.stringify({ active: true, projectId: 'active-1', projectName: 'Active', fileName: null }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ file: { name: 'index.html' } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall(base, 'write_file', {
      path: 'index.html',
      content: '<!doctype html>',
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${base}/api/projects/active-1/files`);
    expect(JSON.parse(firstText(result))).toMatchObject({
      usedActiveContext: { projectId: 'active-1' },
    });
  });

  it('rejects missing path or content before hitting the network', async () => {
    const base = nextBaseUrl();
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/api/projects')) {
        return new Response(
          JSON.stringify({ projects: [{ id: 'p1', name: 'P' }] }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const missingPath = await handleMcpToolCall(base, 'write_file', {
      project: 'P',
      content: 'x',
    });
    expect(missingPath).toMatchObject({ isError: true });
    expect(firstText(missingPath)).toContain('path is required');

    const missingContent = await handleMcpToolCall(base, 'write_file', {
      project: 'P',
      path: 'a.html',
    });
    expect(missingContent).toMatchObject({ isError: true });
    expect(firstText(missingContent)).toContain('content is required');

    // Neither call should have reached /files; resolveProjectArg may have
    // hit /api/projects, which is harmless.
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/files'))).toBe(false);
  });
});

describe('public MCP delete_file', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('issues DELETE through the nested-path raw endpoint', async () => {
    const base = nextBaseUrl();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/projects')) {
        return new Response(
          JSON.stringify({ projects: [{ id: 'p1', name: 'Demo' }] }),
          { status: 200 },
        );
      }
      expect(init?.method).toBe('DELETE');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall(base, 'delete_file', {
      project: 'Demo',
      path: 'codex-product/index.html',
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `${base}/api/projects/p1/raw/codex-product/index.html`,
    );
    expect(JSON.parse(firstText(result))).toMatchObject({ ok: true });
  });

  it('refuses to delete with no path supplied', async () => {
    const base = nextBaseUrl();
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith('/api/projects')
        ? new Response(JSON.stringify({ projects: [{ id: 'p1', name: 'Demo' }] }), { status: 200 })
        : new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall(base, 'delete_file', {
      project: 'Demo',
    });
    expect(result).toMatchObject({ isError: true });
    expect(firstText(result)).toContain('path is required');
    // Should not have touched /raw/ at all.
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/raw/'))).toBe(false);
  });
});

describe('public MCP delete_project', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('issues DELETE /api/projects/:id when project + confirm are provided', async () => {
    const base = nextBaseUrl();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/projects')) {
        return new Response(
          JSON.stringify({ projects: [{ id: 'p1', name: 'Demo' }] }),
          { status: 200 },
        );
      }
      expect(init?.method).toBe('DELETE');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall(base, 'delete_project', {
      project: 'Demo',
      confirm: true,
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${base}/api/projects/p1`);
    expect(JSON.parse(firstText(result))).toMatchObject({ ok: true });
  });

  it('requires explicit confirm:true so agents cannot silently nuke a project', async () => {
    const base = nextBaseUrl();
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith('/api/projects')
        ? new Response(JSON.stringify({ projects: [{ id: 'p1', name: 'Demo' }] }), { status: 200 })
        : new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const missing = await handleMcpToolCall(base, 'delete_project', {
      project: 'Demo',
    });
    expect(missing).toMatchObject({ isError: true });
    expect(firstText(missing)).toContain('confirm');

    const falseConfirm = await handleMcpToolCall(base, 'delete_project', {
      project: 'Demo',
      confirm: false,
    });
    expect(falseConfirm).toMatchObject({ isError: true });

    // Neither call should have reached the DELETE endpoint.
    expect(
      fetchMock.mock.calls.some(
        (call) =>
          /\/api\/projects\/[^/]+$/.test(String(call[0])) &&
          String(call[1]?.method ?? '').toUpperCase() === 'DELETE',
      ),
    ).toBe(false);
  });

  it('requires an explicit project — never falls back to the active project for delete', async () => {
    const base = nextBaseUrl();
    // No /api/projects call is needed; the tool should reject before
    // resolving anything. We still stub fetch so an accidental call is
    // obvious.
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall(base, 'delete_project', {
      confirm: true,
    });
    expect(result).toMatchObject({ isError: true });
    expect(firstText(result)).toMatch(/project (id|is required)/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('echoes resolvedProject when the caller passed a name substring', async () => {
    const base = nextBaseUrl();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/projects') && (!init || init.method === undefined || init.method === 'GET')) {
        return new Response(
          JSON.stringify({ projects: [{ id: 'p1', name: 'Throwaway demo' }] }),
          { status: 200 },
        );
      }
      expect(init?.method).toBe('DELETE');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    // 'throwaway' is a substring of 'Throwaway demo' — the tool accepts
    // substrings per inputSchema, so the response must carry
    // resolvedProject so the agent can confirm which row got destroyed.
    const result = await handleMcpToolCall(base, 'delete_project', {
      project: 'throwaway',
      confirm: true,
    });
    expect(result).not.toMatchObject({ isError: true });
    const body = JSON.parse(firstText(result as { content: Array<{ text: string }> }));
    expect(body).toMatchObject({
      ok: true,
      resolvedProject: { id: 'p1', name: 'Throwaway demo' },
    });
  });
});

describe('formatDaemonError (shared error mapper)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('reformats a structured daemon error body as "code: message"', async () => {
    const base = nextBaseUrl();
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/api/projects')
        ? new Response(JSON.stringify({ projects: [{ id: 'p1', name: 'Demo' }] }), { status: 200 })
        : new Response(
            JSON.stringify({ error: { code: 'FILE_NOT_FOUND', message: 'no such file' } }),
            { status: 404 },
          ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall(base, 'delete_file', {
      project: 'Demo',
      path: 'gone.html',
    });
    expect(result).toMatchObject({ isError: true });
    const text = firstText(result as { content: Array<{ text: string }> });
    // The mapper should fold the structured error into "code: message"
    // and prefix the daemon status, so agents can branch on either.
    expect(text).toContain('FILE_NOT_FOUND');
    expect(text).toContain('no such file');
    expect(text).toContain('404');
  });

  it('falls back to the raw body when the daemon does not return JSON', async () => {
    const base = nextBaseUrl();
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/api/projects')
        ? new Response(JSON.stringify({ projects: [{ id: 'p1', name: 'Demo' }] }), { status: 200 })
        : new Response('upstream boom', { status: 502 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall(base, 'delete_file', {
      project: 'Demo',
      path: 'gone.html',
    });
    expect(result).toMatchObject({ isError: true });
    const text = firstText(result as { content: Array<{ text: string }> });
    // JSON.parse throws on the non-JSON body and the catch fallthrough
    // must preserve the raw text so the agent still sees the upstream
    // signal.
    expect(text).toContain('upstream boom');
    expect(text).toContain('502');
  });

  it('surfaces a non-2xx that is also non-JSON on delete_project', async () => {
    const base = nextBaseUrl();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/projects') && (!init || init.method === undefined || init.method === 'GET')) {
        return new Response(
          JSON.stringify({ projects: [{ id: 'p1', name: 'Demo' }] }),
          { status: 200 },
        );
      }
      // 409 with structured body — verifies the irreversible tool's
      // error path also flows through formatDaemonError.
      return new Response(
        JSON.stringify({ error: { code: 'PROJECT_LOCKED', message: 'in use' } }),
        { status: 409 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleMcpToolCall(base, 'delete_project', {
      project: 'Demo',
      confirm: true,
    });
    expect(result).toMatchObject({ isError: true });
    const text = firstText(result as { content: Array<{ text: string }> });
    expect(text).toContain('PROJECT_LOCKED');
    expect(text).toContain('in use');
    expect(text).toContain('409');
  });
});
