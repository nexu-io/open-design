// Contract test for the `od compact` CLI surface. Keeps the
// UI / API / CLI triple wired together (AGENTS.md "Capability exposure"):
// the CLI must drive the same POST /api/projects/:id/conversations/:cid/compact
// SSE endpoint the web UI uses, with --json support, streaming progress on
// stderr, and fail-fast JSON envelopes for pre-stream validation errors.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runCompactCli } from '../src/compact-cli.js';

// Isolate the test from real daemon discovery — the flagUrl is echoed back.
vi.mock('../src/daemon-url.js', () => ({
  resolveDaemonUrl: vi.fn(async (opts?: { flagUrl?: string }) => opts?.flagUrl ?? 'http://127.0.0.1:7456'),
}));

const DAEMON = 'http://127.0.0.1:9999';

const COMPACTION = {
  conversationId: 'c1',
  cutAtMessageId: 'm2',
  summaryText: '## Compacted summary\n\nPage built in dark mode.',
  ledger: [{ identifier: 'page.html', description: 'file', fileName: 'page.html' }],
};

function sseResponse(frames: Array<{ event: string; data: unknown }>) {
  const body = frames
    .map((f) => `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`)
    .join('');
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('od compact CLI', () => {
  let stdout: string[];
  let stderr: string[];
  let stdoutSpy: { mockRestore: () => void };
  let stderrSpy: { mockRestore: () => void };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    stdout = [];
    stderr = [];
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout.push(String(chunk));
      return true;
    });
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    fetchMock = vi.fn(async () =>
      sseResponse([
        { event: 'progress', data: { stage: 'summarizing', message: 'thinking…' } },
        { event: 'compaction', data: { compaction: COMPACTION } },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('POSTs a conversation-scoped compact request and prints the summary', async () => {
    const result = await runCompactCli(['p1', 'c1', '--cut-at', 'm2', '--daemon-url', DAEMON]);

    expect(result.exitCode).toBe(0);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${DAEMON}/api/projects/p1/conversations/c1/compact`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ cutAtMessageId: 'm2' });
    // Progress goes to stderr; the summary text is the stdout payload.
    expect(stderr.join('')).toContain('[summarizing] thinking…');
    expect(stdout.join('')).toContain('Compacted c1 at message m2');
    expect(stdout.join('')).toContain('Page built in dark mode.');
  });

  it('sends an empty body when --cut-at is omitted', async () => {
    const result = await runCompactCli(['p1', 'c1', '--daemon-url', DAEMON]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({});
  });

  it('emits the full compaction record as JSON under --json', async () => {
    const result = await runCompactCli(['p1', 'c1', '--json', '--daemon-url', DAEMON]);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdout.join(''))).toEqual(COMPACTION);
  });

  it('surfaces pre-stream JSON error envelopes and exits non-zero', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'cutAtMessageId does not exist in this conversation' } }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await runCompactCli(['p1', 'c1', '--daemon-url', DAEMON]);
    expect(result.exitCode).toBe(1);
    const failed = JSON.parse(stderr.join(''));
    expect(failed).toEqual({
      ok: false,
      status: 400,
      error: { message: 'cutAtMessageId does not exist in this conversation', code: 'BAD_REQUEST' },
    });
    expect(stdout.join('')).toBe('');
  });

  it('surfaces mid-stream error frames and exits non-zero', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        { event: 'progress', data: { stage: 'summarizing' } },
        { event: 'error', data: { message: 'provider exploded' } },
      ]),
    );
    const result = await runCompactCli(['p1', 'c1', '--daemon-url', DAEMON]);
    expect(result.exitCode).toBe(1);
    expect(stderr.join('')).toContain('provider exploded');
    expect(stdout.join('')).toBe('');
  });

  it('fails fast when the stream ends without a compaction frame', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([{ event: 'progress', data: { stage: 'summarizing' } }]),
    );
    const result = await runCompactCli(['p1', 'c1', '--daemon-url', DAEMON]);
    expect(result.exitCode).toBe(1);
    expect(stderr.join('')).toContain('stream ended without a compaction result');
  });

  it('rejects missing positional arguments without calling the daemon', async () => {
    const result = await runCompactCli(['--daemon-url', DAEMON]);
    expect(result.exitCode).toBe(2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join('')).toContain('missing <projectId> or <conversationId>');
  });
});
