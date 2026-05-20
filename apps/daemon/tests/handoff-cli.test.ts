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
    vi.unstubAllEnvs();
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

  // BYOK transport — the next block covers --api-key-file <path|->, the
  // ANTHROPIC_API_KEY env-var fallback, the deprecation warning emitted on
  // raw --api-key use, and the precedence chain between all three. Filed in
  // response to nettee's review on PR #1718 (the daemon-endpoint base of the
  // #462 stack), which flagged the argv-only credential transport as a
  // secret-handling regression.

  it('reads --api-key-file <path> from disk and uses it as the api key', async () => {
    const { writeFile, unlink } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const nodePath = await import('node:path');
    const filePath = nodePath.join(tmpdir(), `od-handoff-test-${Date.now()}-disk.key`);
    await writeFile(filePath, 'sk-ant-from-file', 'utf8');
    try {
      const result = await runProjectHandoff([
        'proj-1',
        '--conversation', 'conv-9',
        '--api-key-file', filePath,
        '--model', 'claude-opus-4-7',
        '--daemon-url', DAEMON,
      ]);

      expect(result.exitCode).toBe(0);
      const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
        apiKey: string;
      };
      expect(body.apiKey).toBe('sk-ant-from-file');
      // No --api-key in argv ⇒ no security warning.
      expect(stderr.join('')).not.toContain('leaks credentials');
    } finally {
      await unlink(filePath).catch(() => {});
    }
  });

  it('reads --api-key-file - from stdin and uses it as the api key', async () => {
    const { Readable } = await import('node:stream');
    const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
    Object.defineProperty(process, 'stdin', {
      value: Readable.from(['sk-ant-from-stdin\n']),
      configurable: true,
      writable: true,
    });
    try {
      const result = await runProjectHandoff([
        'proj-1',
        '--conversation', 'conv-9',
        '--api-key-file', '-',
        '--model', 'claude-opus-4-7',
        '--daemon-url', DAEMON,
      ]);

      expect(result.exitCode).toBe(0);
      const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
        apiKey: string;
      };
      // Trailing newline must be trimmed — the `echo $KEY > -` ergonomic case.
      expect(body.apiKey).toBe('sk-ant-from-stdin');
      expect(stderr.join('')).not.toContain('leaks credentials');
    } finally {
      if (originalStdin) Object.defineProperty(process, 'stdin', originalStdin);
    }
  });

  it('falls back to ANTHROPIC_API_KEY env var when no --api-key or --api-key-file is given', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-from-env');
    const result = await runProjectHandoff([
      'proj-1',
      '--conversation', 'conv-9',
      '--model', 'claude-opus-4-7',
      '--daemon-url', DAEMON,
    ]);

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      apiKey: string;
    };
    expect(body.apiKey).toBe('sk-ant-from-env');
    expect(stderr.join('')).not.toContain('leaks credentials');
  });

  it('emits a security warning to stderr when --api-key is used', async () => {
    const result = await runProjectHandoff([
      'proj-1',
      '--conversation', 'conv-9',
      '--api-key', 'sk-ant-argv',
      '--model', 'claude-opus-4-7',
      '--daemon-url', DAEMON,
    ]);

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
      apiKey: string;
    };
    expect(body.apiKey).toBe('sk-ant-argv');
    // Substring assertion — avoid coupling to the exact wording of the warning.
    expect(stderr.join('')).toContain('leaks credentials');
  });

  it('prefers --api-key over --api-key-file and the env var (warning fires)', async () => {
    const { writeFile, unlink } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const nodePath = await import('node:path');
    const filePath = nodePath.join(tmpdir(), `od-handoff-test-${Date.now()}-prec1.key`);
    await writeFile(filePath, 'sk-from-file', 'utf8');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-from-env');
    try {
      const result = await runProjectHandoff([
        'proj-1',
        '--conversation', 'conv-9',
        '--api-key', 'sk-from-argv',
        '--api-key-file', filePath,
        '--model', 'claude-opus-4-7',
        '--daemon-url', DAEMON,
      ]);

      expect(result.exitCode).toBe(0);
      const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
        apiKey: string;
      };
      expect(body.apiKey).toBe('sk-from-argv');
      // --api-key in argv ⇒ warning fires even when other sources are present.
      expect(stderr.join('')).toContain('leaks credentials');
    } finally {
      await unlink(filePath).catch(() => {});
    }
  });

  it('prefers --api-key-file over the env var when --api-key is not given', async () => {
    const { writeFile, unlink } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const nodePath = await import('node:path');
    const filePath = nodePath.join(tmpdir(), `od-handoff-test-${Date.now()}-prec2.key`);
    await writeFile(filePath, 'sk-from-file', 'utf8');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-from-env');
    try {
      const result = await runProjectHandoff([
        'proj-1',
        '--conversation', 'conv-9',
        '--api-key-file', filePath,
        '--model', 'claude-opus-4-7',
        '--daemon-url', DAEMON,
      ]);

      expect(result.exitCode).toBe(0);
      const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body)) as {
        apiKey: string;
      };
      expect(body.apiKey).toBe('sk-from-file');
      expect(stderr.join('')).not.toContain('leaks credentials');
    } finally {
      await unlink(filePath).catch(() => {});
    }
  });

  it('fails when neither --api-key, --api-key-file, nor ANTHROPIC_API_KEY is set', async () => {
    // Stub to empty so the test passes on machines that export the env var.
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const result = await runProjectHandoff([
      'proj-1',
      '--conversation', 'conv-9',
      '--model', 'claude-opus-4-7',
      '--daemon-url', DAEMON,
    ]);

    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    // Error message must name all three transports so the user can pick one.
    const msg = stderr.join('');
    expect(msg).toContain('handoff requires an API key');
    expect(msg).toContain('--api-key-file');
    expect(msg).toContain('ANTHROPIC_API_KEY');
  });

  it('fails when --api-key-file points at a non-existent file', async () => {
    const result = await runProjectHandoff([
      'proj-1',
      '--conversation', 'conv-9',
      '--api-key-file', `/tmp/od-handoff-nonexistent-${Date.now()}-${Math.random().toString(36).slice(2)}.key`,
      '--model', 'claude-opus-4-7',
      '--daemon-url', DAEMON,
    ]);

    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join('')).toContain('failed to read --api-key-file');
  });

  it('fails when --api-key-file produces an empty key (whitespace-only file)', async () => {
    const { writeFile, unlink } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const nodePath = await import('node:path');
    const filePath = nodePath.join(tmpdir(), `od-handoff-test-${Date.now()}-empty.key`);
    await writeFile(filePath, '   \n', 'utf8');
    try {
      const result = await runProjectHandoff([
        'proj-1',
        '--conversation', 'conv-9',
        '--api-key-file', filePath,
        '--model', 'claude-opus-4-7',
        '--daemon-url', DAEMON,
      ]);

      expect(result.exitCode).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(stderr.join('')).toContain('empty key');
    } finally {
      await unlink(filePath).catch(() => {});
    }
  });

  it('--api-key-file with no value fails fast in the parser', async () => {
    const result = await runProjectHandoff([
      'proj-1',
      '--conversation', 'conv-9',
      '--api-key-file',
    ]);

    expect(result.exitCode).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stderr.join('')).toContain('--api-key-file requires a value');
  });
});
