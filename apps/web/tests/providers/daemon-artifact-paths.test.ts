import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamViaDaemon } from '../../src/providers/daemon';

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

function endResponse(body: unknown): Response {
  return new Response(`event: end\ndata: ${JSON.stringify(body)}\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('physical run artifact authority delivered to ProjectView', () => {
  it('reports each physical run separately before one logical task completion', async () => {
    const calls: unknown[] = [];
    const request = {
      taskExecutionId: 'task-dark',
      strategy: { id: 'od-next-strategy', version: '2.0.0', packageHash: 'a'.repeat(64), snapshotId: 'snapshot-dark' },
      inputStage: 'request', outcome: 'running', route: 'full_plan', executionMode: null,
      activeRunId: 'run-dark', terminal: false,
    };
    const successor = { ...request, inputStage: 'production', activeRunId: 'run-backup', nextRunId: 'run-backup' };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/runs') return jsonResponse({ runId: 'run-dark', strategyTask: request });
      if (url === '/api/runs/run-dark/events') return endResponse({ code: 0, status: 'succeeded', artifactPaths: ['index.html'], strategyTask: successor });
      if (url === '/api/runs/run-backup/events') return endResponse({ code: 0, status: 'succeeded', artifactPaths: ['reference/light-paper.html'], strategyTask: { ...successor, nextRunId: undefined, terminal: true, outcome: 'completed' } });
      throw new Error(`Unexpected request ${url}`);
    }));
    const onError = vi.fn();
    await streamViaDaemon({
      agentId: 'mock', history: [{ id: 'user', role: 'user', content: 'Produce a dark revision' }],
      signal: new AbortController().signal,
      handlers: { onDelta: vi.fn(), onAgentEvent: vi.fn(), onError, onDone: () => { calls.push(['done']); } },
      onRunCreated: (runId, task) => { calls.push(['run', runId, task?.taskExecutionId]); },
      onArtifactPaths: (paths) => { calls.push(['paths', paths]); },
    });
    expect(onError).not.toHaveBeenCalled();
    expect(calls).toEqual([
      ['run', 'run-dark', 'task-dark'], ['paths', ['index.html']],
      ['run', 'run-backup', 'task-dark'], ['paths', ['reference/light-paper.html']], ['done'],
    ]);
  });

  it.each([
    { label: 'absent', artifactPaths: undefined },
    { label: 'explicit empty', artifactPaths: [] },
    { label: 'explicit nonempty', artifactPaths: ['index.html'] },
  ])('preserves $label authority', async ({ artifactPaths }) => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/api/runs') return jsonResponse({ runId: 'run-dark' });
      return endResponse({ code: 0, status: 'succeeded', artifactPaths });
    }));
    const onArtifactPaths = vi.fn();
    const onError = vi.fn();
    const onDone = vi.fn();
    await streamViaDaemon({
      agentId: 'mock', history: [{ id: 'user', role: 'user', content: 'Update the HTML' }],
      signal: new AbortController().signal,
      handlers: { onDelta: vi.fn(), onAgentEvent: vi.fn(), onError, onDone }, onArtifactPaths,
    });
    expect(onError).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledOnce();
    expect(onArtifactPaths.mock.calls).toEqual(artifactPaths === undefined ? [] : [[artifactPaths]]);
  });
});
