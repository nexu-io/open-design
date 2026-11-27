// Contract test for the `od project handoff` CLI surface. Keeps the
// UI / API / CLI triple wired together (AGENTS.md "Capability exposure"):
// the CLI must drive the same POST /api/projects/:id/handoff endpoint the
// web UI uses, with --json support and the required conversationId.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runProjectHandoff } from '../src/handoff-cli.js';

// Passthrough-by-default fs mock so `--api-key-file -` (stdin, fd 0) can be
// intercepted without breaking real file reads elsewhere.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

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
    delete process.env.ANTHROPIC_API_KEY;
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

  it('sends exact workspace identity for a bound project handoff', async () => {
    const result = await runProjectHandoff([
      'proj-1',
      '--conversation', 'conv-9',
      '--api-key', 'sk-test',
      '--model', 'claude-opus-4-7',
      '--workspace', 'workspace-a',
      '--workspace-member', 'member-a',
      '--daemon-url', DAEMON,
      '--json',
    ]);

    expect(result.exitCode).toBe(0);
    const headers = new Headers(
      (fetchMock.mock.calls[0]![1] as RequestInit).headers,
    );
    expect(headers.get('x-od-workspace-id')).toBe('workspace-a');
    expect(headers.get('x-od-workspace-member-id')).toBe('member-a');
    expect(JSON.parse(stdout.join(''))).toEqual(HANDOFF_RESPONSE);
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

  describe('API key resolution (#2456)', () => {
    const baseArgs = ['proj-1', '--conversation', 'conv-9', '--model', 'claude-opus-4-7', '--daemon-url', DAEMON];

    function keyFile(contents: string): string {
      const dir = mkdtempSync(join(tmpdir(), 'handoff-key-'));
      const path = join(dir, 'key');
      writeFileSync(path, contents);
      return path;
    }

    it('reads the key from --api-key-file <path> without an argv warning', async () => {
      const path = keyFile('sk-from-file\n');
      const result = await runProjectHandoff([...baseArgs, '--api-key-file', path]);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).apiKey).toBe('sk-from-file');
      expect(stderr.join('')).not.toContain('shell history');
    });

    it('reads the key from stdin when --api-key-file is -', async () => {
      // The only readFileSync call on this path is the fd-0 stdin read.
      vi.mocked(readFileSync).mockReturnValueOnce('sk-from-stdin\n' as never);

      const result = await runProjectHandoff([...baseArgs, '--api-key-file', '-']);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).apiKey).toBe('sk-from-stdin');
    });

    it('falls back to ANTHROPIC_API_KEY when no flag is given', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-from-env';
      const result = await runProjectHandoff([...baseArgs]);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).apiKey).toBe('sk-from-env');
      expect(stderr.join('')).not.toContain('shell history');
    });

    it('warns on stderr when --api-key passes the key via argv but still uses it', async () => {
      const result = await runProjectHandoff([...baseArgs, '--api-key', 'sk-argv']);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).apiKey).toBe('sk-argv');
      expect(stderr.join('')).toContain('shell history');
    });

    it('prefers --api-key over --api-key-file and the environment', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-from-env';
      const path = keyFile('sk-from-file');
      const result = await runProjectHandoff([...baseArgs, '--api-key', 'sk-argv', '--api-key-file', path]);

      expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).apiKey).toBe('sk-argv');
      expect(result.exitCode).toBe(0);
    });

    it('prefers --api-key-file over the environment', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-from-env';
      const path = keyFile('sk-from-file');
      const result = await runProjectHandoff([...baseArgs, '--api-key-file', path]);

      expect(JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)).apiKey).toBe('sk-from-file');
    });

    it('fails without calling the daemon when no key is available anywhere', async () => {
      const result = await runProjectHandoff([...baseArgs]);

      expect(result.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(stderr.join('')).toContain('--api-key-file');
      expect(stderr.join('')).toContain('ANTHROPIC_API_KEY');
    });

    it('treats an empty ANTHROPIC_API_KEY as missing', async () => {
      process.env.ANTHROPIC_API_KEY = '   ';
      const result = await runProjectHandoff([...baseArgs]);

      expect(result.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails when the key file cannot be read', async () => {
      const result = await runProjectHandoff([...baseArgs, '--api-key-file', '/nonexistent/key-path']);

      expect(result.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(stderr.join('')).toContain('cannot read API key');
    });

    it('fails when the key file is empty', async () => {
      const path = keyFile('  \n');
      const result = await runProjectHandoff([...baseArgs, '--api-key-file', path]);

      expect(result.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(stderr.join('')).toContain('empty');
    });

    it('fails when --api-key is empty', async () => {
      const result = await runProjectHandoff([...baseArgs, '--api-key', '  ']);

      expect(result.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails at the parser when --api-key-file has no value', async () => {
      const result = await runProjectHandoff([...baseArgs, '--api-key-file']);

      expect(result.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(stderr.join('')).toContain('--api-key-file requires a value');
    });
  });
});
