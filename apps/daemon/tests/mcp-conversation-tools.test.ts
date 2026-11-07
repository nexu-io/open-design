import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleMcpToolCall, localMcpToolDefinitions } from '../src/mcp.js';
import { _resetMcpWorkspaceContextCacheForTests } from '../src/mcp-workspace-context.js';

const originalFetch = globalThis.fetch;
const BASE = 'http://127.0.0.1:17456';
const PROJECT = '11111111-1111-4111-8111-111111111111';

// Non-vela directory: headerless behavior, which is the path a headless user
// without workspace sign-in takes.
function withDirectory(
  fn: (url: string, init?: RequestInit) => Promise<Response>,
): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/api/workspace/directory')) {
      return new Response(
        JSON.stringify({ items: [], activeWorkspaceId: null }),
        { status: 200 },
      );
    }
    return fn(url, init);
  };
}

function firstText(result: { content: Array<{ text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error('expected MCP text content');
  return item.text;
}

function json(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(firstText(result)) as Record<string, unknown>;
}

function sse(records: Array<{ id: number; event: string; data: unknown }>): string {
  return records
    .map((record) => `id: ${record.id}\nevent: ${record.event}\ndata: ${JSON.stringify(record.data)}\n\n`)
    .join('');
}

afterEach(() => {
  _resetMcpWorkspaceContextCacheForTests();
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
});

describe('conversation tools', () => {
  it('lists a project\'s conversations', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`${BASE}/api/projects/${PROJECT}/conversations`);
      return new Response(JSON.stringify({
        conversations: [
          { id: 'c1', title: 'Landing page', createdAt: 1, updatedAt: 2, messageCount: 4 },
        ],
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', withDirectory(fetchMock));

    const result = await handleMcpToolCall(BASE, 'list_conversations', { project: PROJECT });
    expect(json(result)).toEqual({
      projectId: PROJECT,
      conversations: [
        expect.objectContaining({ id: 'c1', title: 'Landing page', messageCount: 4 }),
      ],
    });
  });

  it('reads the last messages of the default conversation and truncates long content', async () => {
    const long = 'x'.repeat(500);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/conversations')) {
        return new Response(JSON.stringify({ conversations: [{ id: 'c1' }] }), { status: 200 });
      }
      if (url.endsWith('/conversations/c1/messages')) {
        return new Response(JSON.stringify({
          messages: [
            { id: 'm1', role: 'user', content: 'first', createdAt: 1 },
            { id: 'm2', role: 'assistant', content: long, createdAt: 2, runId: 'r1', runStatus: 'succeeded' },
            { id: 'm3', role: 'user', content: 'last', createdAt: 3 },
          ],
        }), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', withDirectory(fetchMock));

    const result = await handleMcpToolCall(BASE, 'read_conversation', {
      project: PROJECT,
      limit: 2,
      maxChars: 200,
    });
    const payload = json(result) as {
      conversationId: string;
      totalMessages: number;
      messages: Array<{ id: string; content: string; runStatus?: string }>;
    };
    expect(payload.conversationId).toBe('c1');
    expect(payload.totalMessages).toBe(3);
    expect(payload.messages.map((message) => message.id)).toEqual(['m2', 'm3']);
    expect(payload.messages[0]?.content).toContain('truncated 300 chars');
    expect(payload.messages[0]?.runStatus).toBe('succeeded');
  });
});

describe('run observability tools', () => {
  it('pages run events from a cursor and drops the repeated running status frame', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const target = String(url);
      if (target.endsWith('/api/runs/run-42')) {
        return new Response(JSON.stringify({ id: 'run-42', status: 'running' }), { status: 200 });
      }
      if (target.includes('/api/runs/run-42/events')) {
        expect(target).toContain('after=3');
        return new Response(sse([
          { id: 4, event: 'agent', data: { type: 'status', label: 'running' } },
          { id: 5, event: 'agent', data: { type: 'thinking_delta', delta: 'Considering the hero.' } },
          { id: 6, event: 'agent', data: { type: 'tool_use', name: 'Read', input: { path: 'index.html' } } },
          { id: 7, event: 'agent', data: { type: 'text_delta', delta: 'Shrunk the header.' } },
        ]), { status: 200 });
      }
      throw new Error(`unexpected url ${target}`);
    });
    vi.stubGlobal('fetch', withDirectory(fetchMock));

    const result = await handleMcpToolCall(BASE, 'watch_run', {
      runId: 'run-42',
      after: 3,
      waitMs: 250,
    });
    const payload = json(result) as {
      status: string;
      done: boolean;
      nextAfter: number;
      events: Array<{ seq: number; kind: string; text?: string; name?: string }>;
    };
    expect(payload.status).toBe('running');
    expect(payload.done).toBe(false);
    expect(payload.nextAfter).toBe(7);
    expect(payload.events.map((event) => event.kind)).toEqual([
      'thinking_delta',
      'tool_use',
      'text_delta',
    ]);
    expect(payload.events[0]?.text).toBe('Considering the hero.');
    expect(payload.events[1]?.name).toBe('Read');
    expect(payload.events[2]?.text).toBe('Shrunk the header.');
  });

  it('returns the enriched get_run payload once the run is terminal', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/runs/run-42')) {
        return new Response(JSON.stringify({
          id: 'run-42',
          status: 'succeeded',
          projectId: PROJECT,
          conversationId: 'c1',
          deliverableValid: true,
          deliverableValidation: 'valid',
          deliverableEntryFile: 'index.html',
        }), { status: 200 });
      }
      if (url.endsWith('/api/runs/run-42/events')) {
        return new Response(sse([
          { id: 1, event: 'agent', data: { type: 'text_delta', delta: 'Done: index.html' } },
        ]), { status: 200 });
      }
      if (url.endsWith('/api/mcp/install-info')) {
        return new Response(JSON.stringify({ webBaseUrl: null }), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', withDirectory(fetchMock));

    const result = await handleMcpToolCall(BASE, 'wait_for_run', {
      runId: 'run-42',
      timeoutMs: 1_000,
      pollMs: 500,
    });
    const payload = json(result) as {
      done: boolean;
      status: string;
      agentMessage?: string;
      previewUrl?: string;
    };
    expect(payload.done).toBe(true);
    expect(payload.status).toBe('succeeded');
    expect(payload.agentMessage).toBe('Done: index.html');
    expect(payload.previewUrl).toBe(
      `${BASE}/api/projects/${PROJECT}/raw/index.html`,
    );
  });

  it('forwards a conversation id and design system into start_run', async () => {
    let posted: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/runs')) {
        posted = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return new Response(JSON.stringify({ runId: 'run-9', conversationId: 'c9' }), { status: 200 });
      }
      if (url.endsWith('/api/mcp/install-info')) {
        return new Response(JSON.stringify({ webBaseUrl: null }), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', withDirectory(fetchMock));

    await handleMcpToolCall(BASE, 'start_run', {
      project: PROJECT,
      conversationId: 'c9',
      designSystemId: 'ds-1',
      prompt: 'Make the hero quieter.',
    });
    expect(posted).toMatchObject({
      projectId: PROJECT,
      conversationId: 'c9',
      designSystemId: 'ds-1',
      message: 'Make the hero quieter.',
    });
  });
});

describe('od_command', () => {
  it('exposes the escape hatch without replacing the typed tools', () => {
    const definitions = localMcpToolDefinitions();
    const names = definitions.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining([
      'list_conversations',
      'read_conversation',
      'watch_run',
      'wait_for_run',
      'od_command',
    ]));
    const escapeHatch = definitions.find((tool) => tool.name === 'od_command');
    expect(escapeHatch?.inputSchema.required).toEqual(['argv']);
    expect(escapeHatch?.inputSchema.properties).toHaveProperty('argv');
  });

  it('refuses commands that would recurse or fight the attached runtime', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', withDirectory(fetchMock));

    for (const argv of [['mcp'], ['daemon', 'start'], ['rm', '-rf', '/']]) {
      const result = await handleMcpToolCall(BASE, 'od_command', { argv });
      expect(result).toMatchObject({ isError: true });
      expect(firstText(result)).toContain('od_command does not allow');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed argv', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', withDirectory(fetchMock));
    const result = await handleMcpToolCall(BASE, 'od_command', { argv: 'automation list' });
    expect(result).toMatchObject({ isError: true });
    expect(firstText(result)).toContain('argv must be a non-empty array');
  });
});

describe('folder-bound projects', () => {
  it('imports the caller\'s folder so designs and plan.md land there', async () => {
    const { mkdtempSync, realpathSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join, basename } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'od-mcp-folder-'));
    const canonical = realpathSync(dir);
    let posted: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/projects')) {
        return new Response(JSON.stringify({ projects: [] }), { status: 200 });
      }
      if (url.endsWith('/api/import/folder')) {
        posted = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
        return new Response(JSON.stringify({
          project: { id: 'p-new', name: 'repo', metadata: { baseDir: canonical } },
          conversationId: 'c1',
        }), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', withDirectory(fetchMock));
    try {
      const result = await handleMcpToolCall('http://127.0.0.1:17458', 'create_project', {
        directory: dir,
      });
      const payload = json(result) as {
        projectId: string;
        baseDir: string;
        reused: boolean;
      };
      expect(payload.projectId).toBe('p-new');
      expect(payload.baseDir).toBe(canonical);
      expect(payload.reused).toBe(false);
      expect(posted).toMatchObject({ baseDir: canonical, name: basename(canonical) });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reuses the project already bound to the same folder', async () => {
    const { mkdtempSync, realpathSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'od-mcp-folder-'));
    const canonical = realpathSync(dir);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/projects')) {
        return new Response(JSON.stringify({
          projects: [
            { id: 'p-existing', name: 'repo', metadata: { baseDir: canonical, kind: 'prototype' } },
          ],
        }), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal('fetch', withDirectory(fetchMock));
    try {
      const result = await handleMcpToolCall('http://127.0.0.1:17459', 'create_project', {
        directory: dir,
        name: 'Ignored',
      });
      const payload = json(result) as { projectId: string; reused: boolean };
      expect(payload.projectId).toBe('p-existing');
      expect(payload.reused).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still requires a name when no directory is given', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', withDirectory(fetchMock));
    const result = await handleMcpToolCall(BASE, 'create_project', {});
    expect(result).toMatchObject({ isError: true });
    expect(firstText(result)).toContain('name is required');
  });
});
