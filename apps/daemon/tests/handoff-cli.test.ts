// Contract test for the `od project handoff` CLI surface. Keeps the
// UI / API / CLI triple wired together (AGENTS.md "Capability exposure"):
// the CLI must drive the same POST /api/projects/:id/handoff endpoint the
// web UI uses, with --json support and the required conversationId.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runProjectHandoff } from '../src/handoff-cli.js';

// Isolate the test from real daemon discovery — the flagUrl is echoed back.
vi.mock('../src/daemon-url.js', () => ({
  resolveDaemonUrl: vi.fn(async (opts?: { flagUrl?: string }) => opts?.flagUrl ?? 'http://127.0.0.1:7456'),
}));

const DAEMON = 'http://127.0.0.1:9999';

const HANDOFF_RESPONSE = {
  prompt: '## Context\nResume the work here.',
  model: 'claude-opus-4-7',
  inputTokens: 100,
  outputTokens: 50,
  transcriptMessageCount: 6,
};

describe('od project handoff CLI', () => {
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
      new Response(JSON.stringify(HANDOFF_RESPONSE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('POSTs a conversation-scoped handoff request and prints the synthesized prompt', async () => {
    const result = await runProjectHandoff([
      'proj-1',
      '--conversation', 'conv-9',
      '--api-key', 'sk-test',
      '--model', 'claude-opus-4-7',
      '--daemon-url', DAEMON,
    ]);

    expect(result.exitCode).toBe(0);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${DAEMON}/api/projects/proj-1/handoff`);
    expect((init as RequestInit).method).toBe('POST');
    // conversationId must be carried — the endpoint is conversation-scoped.
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      conversationId: 'conv-9',
      apiKey: 'sk-test',
      model: 'claude-opus-4-7',
    });
    // Default output is the prompt itself, so it pipes into a file.
    expect(stdout.join('')).toContain('## Context');
  });

  it('emits the full response as JSON under --json', async () => {
    const result = await runProjectHandoff([
      'proj-1',
      '--conversation', 'conv-9',
      '--api-key', 'sk-test',
      '--model', 'claude-opus-4-7',
      '--base-url', 'https://proxy.example',
      '--max-tokens', '8192',
      '--daemon-url', DAEMON,
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdout.join(''))).toEqual(HANDOFF_RESPONSE);
    // Optional flags flow into the request body.
    expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body))).toEqual({
      conversationId: 'conv-9',
      apiKey: 'sk-test',
      model: 'claude-opus-4-7',
      baseUrl: 'https://proxy.example',
      maxTokens: 8192,
    });
  });

  it('fails without calling the daemon when --conversation is missing', async () => {
    const result = await runProjectHandoff([
      'proj-1',
      '--api-key', 'sk-test',
      '--model', 'claude-opus-4-7',
      '--daemon-url', DAEMON,
    ]);

    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join('')).toContain('--conversation');
  });

  it('fails when no projectId is given', async () => {
    const result = await runProjectHandoff([
      '--conversation', 'conv-9',
      '--api-key', 'sk-test',
      '--model', 'claude-opus-4-7',
      '--daemon-url', DAEMON,
    ]);

    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join('')).toContain('projectId');
  });

  it('surfaces a daemon error response with its code and a non-zero exit', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: 'CONVERSATION_NOT_FOUND', message: 'conversation not found in this project' } }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await runProjectHandoff([
      'proj-1',
      '--conversation', 'ghost',
      '--api-key', 'sk-test',
      '--model', 'claude-opus-4-7',
      '--daemon-url', DAEMON,
    ]);

    expect(result.exitCode).toBe(1);
    const errOut = stderr.join('');
    expect(errOut).toContain('CONVERSATION_NOT_FOUND');
    expect(errOut).toContain('conversation not found');
  });

  it('fails a 200 response whose body is not a well-formed HandoffResponse', async () => {
    // A broken daemon/proxy 200 with a shape-invalid body must not print
    // `undefined` and exit 0 — scripts rely on the exit code.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ unexpected: 'shape' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await runProjectHandoff([
      'proj-1',
      '--conversation', 'conv-9',
      '--api-key', 'sk-test',
      '--model', 'claude-opus-4-7',
      '--daemon-url', DAEMON,
    ]);

    expect(result.exitCode).toBe(1);
    expect(stdout.join('')).not.toContain('undefined');
    expect(stderr.join('')).toContain('malformed handoff response');
  });

  it('fails a 200 response with an unparseable body instead of exiting 0', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html>not json</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

    const result = await runProjectHandoff([
      'proj-1',
      '--conversation', 'conv-9',
      '--api-key', 'sk-test',
      '--model', 'claude-opus-4-7',
      '--daemon-url', DAEMON,
    ]);

    expect(result.exitCode).toBe(1);
    expect(stderr.join('')).toContain('malformed handoff response');
  });

  // Malformed flags must reach this structured fail() path. `od project
  // handoff` short-circuits to runProjectHandoff before runProject's
  // generic parseFlags, so these are the real entrypoint's behavior.
  it('fails fast on an unknown flag without calling the daemon', async () => {
    const result = await runProjectHandoff([
      'proj-1',
      '--conversation', 'conv-9',
      '--api-key', 'sk-test',
      '--model', 'claude-opus-4-7',
      '--bogus',
      '--daemon-url', DAEMON,
    ]);

    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join('')).toContain('unknown option');
  });

  it('fails fast when --max-tokens is given without a value', async () => {
    const result = await runProjectHandoff([
      'proj-1',
      '--conversation', 'conv-9',
      '--api-key', 'sk-test',
      '--model', 'claude-opus-4-7',
      '--max-tokens',
    ]);

    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join('')).toContain('max-tokens');
  });
});
