import { afterEach, describe, expect, it, vi } from 'vitest';
import { _resetMcpWorkspaceContextCacheForTests } from '../src/mcp-workspace-context.js';
import { handleMcpToolCall } from '../src/mcp.js';

afterEach(() => { vi.unstubAllGlobals(); _resetMcpWorkspaceContextCacheForTests(); });
describe('MCP reasoning parity', () => {
  it('discovers model capabilities through the daemon', async () => {
    const data = { agents: [{ id: 'codex', available: true, models: [{ id: 'future', reasoningOptions: [{ id: 'deep-v2' }] }] }] };
    const fetchMock = vi.fn(async (_url: string) => Response.json(data));
    vi.stubGlobal('fetch', fetchMock);
    const result = await handleMcpToolCall('http://localhost:18456', 'list_agents', {});
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:18456/api/agents');
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ agents: [{ id: 'codex', models: data.agents[0]!.models }] });
  });
  it('forwards a future effort through the same run endpoint as CLI/UI', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => url.endsWith('/api/workspace/directory') ? Response.json({ items: [], activeWorkspaceId: null }) : url.endsWith('/api/active')
      ? Response.json({ active: true, projectId: 'p1' }) : Response.json({ runId: 'r1' }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await handleMcpToolCall('http://localhost:18457', 'start_run', {
      agent: 'codex', model: 'gpt-6-astra', reasoning: 'deep-v2', prompt: 'Iterate on this design',
    });
    expect(JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith('/api/runs') && init?.method === 'POST')?.[1]?.body))).toMatchObject({
      projectId: 'p1', agentId: 'codex', model: 'gpt-6-astra', reasoning: 'deep-v2', message: 'Iterate on this design',
    });
    expect(JSON.parse(result.content[0]!.text)).toMatchObject({ runId: 'r1' });
  });
});
