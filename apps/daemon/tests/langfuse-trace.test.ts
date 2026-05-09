import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildTracePayload,
  readLangfuseConfig,
  reportRunCompleted,
  type LangfuseConfig,
  type ReportContext,
} from '../src/langfuse-trace.js';

function makeCtx(overrides: Partial<ReportContext> = {}): ReportContext {
  const base: ReportContext = {
    installationId: 'install-uuid-1',
    projectId: 'proj-1',
    conversationId: 'conv-uuid-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    agentId: 'claude',
    run: {
      runId: 'run-1',
      status: 'succeeded',
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_004_500,
    },
    message: {
      messageId: 'msg-1',
      prompt: 'Make a landing page for a coffee shop.',
      output: 'Here is a landing page draft …',
      usage: {
        inputTokens: 1234,
        outputTokens: 567,
        totalTokens: 1801,
      },
    },
    artifacts: [],
    tools: [
      {
        id: 'tool-1',
        name: 'Bash',
        startedAt: 1_700_000_001_000,
        endedAt: 1_700_000_001_800,
        input: '{"command":"ls -la"}',
        output: 'total 0',
      },
      {
        id: 'tool-2',
        name: 'Write',
        startedAt: 1_700_000_002_000,
        endedAt: 1_700_000_002_900,
        input: '{"path":"index.html"}',
        output: 'wrote index.html',
      },
    ],
    eventsSummary: { toolCalls: 2, errors: 0, durationMs: 4500 },
    prefs: { metrics: true, content: false, artifactManifest: false },
  };
  return { ...base, ...overrides };
}

const TEST_CONFIG: LangfuseConfig = {
  authHeader: 'Basic dGVzdA==',
  baseUrl: 'https://us.cloud.langfuse.com',
  timeoutMs: 20_000,
  retries: 0,
};

function bodyOf(
  batch: unknown[],
  type: string,
  name?: string,
): Record<string, any> {
  const event = (batch as Array<{ type: string; body: Record<string, any> }>).find(
    (item) => item.type === type && (name === undefined || item.body.name === name),
  );
  expect(event).toBeTruthy();
  return event!.body;
}

describe('readLangfuseConfig', () => {
  it('returns null when keys are missing', () => {
    expect(readLangfuseConfig({})).toBeNull();
    expect(readLangfuseConfig({ LANGFUSE_PUBLIC_KEY: 'pk' })).toBeNull();
    expect(readLangfuseConfig({ LANGFUSE_SECRET_KEY: 'sk' })).toBeNull();
  });

  it('returns null when keys are whitespace-only', () => {
    expect(
      readLangfuseConfig({
        LANGFUSE_PUBLIC_KEY: '   ',
        LANGFUSE_SECRET_KEY: 'sk',
      }),
    ).toBeNull();
  });

  it('builds Basic auth header from public:secret', () => {
    const cfg = readLangfuseConfig({
      LANGFUSE_PUBLIC_KEY: 'pk-lf-abc',
      LANGFUSE_SECRET_KEY: 'sk-lf-xyz',
    });
    expect(cfg).not.toBeNull();
    const expected =
      'Basic ' + Buffer.from('pk-lf-abc:sk-lf-xyz').toString('base64');
    expect(cfg!.authHeader).toBe(expected);
  });

  it('uses default US base URL when LANGFUSE_BASE_URL is absent', () => {
    const cfg = readLangfuseConfig({
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_SECRET_KEY: 'sk',
    });
    expect(cfg!.baseUrl).toBe('https://us.cloud.langfuse.com');
  });

  it('honours LANGFUSE_BASE_URL and strips trailing slashes', () => {
    const cfg = readLangfuseConfig({
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_SECRET_KEY: 'sk',
      LANGFUSE_BASE_URL: 'https://cloud.langfuse.com//',
    });
    expect(cfg!.baseUrl).toBe('https://cloud.langfuse.com');
  });

  it('reads optional timeout and retry tuning from env', () => {
    const cfg = readLangfuseConfig({
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_SECRET_KEY: 'sk',
      LANGFUSE_TIMEOUT_MS: '45000',
      LANGFUSE_RETRIES: '2',
    });
    expect(cfg!.timeoutMs).toBe(45_000);
    expect(cfg!.retries).toBe(2);
  });

  it('falls back when timeout and retry env values are invalid', () => {
    const cfg = readLangfuseConfig({
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_SECRET_KEY: 'sk',
      LANGFUSE_TIMEOUT_MS: '-1',
      LANGFUSE_RETRIES: '-2',
    });
    expect(cfg!.timeoutMs).toBe(20_000);
    expect(cfg!.retries).toBe(1);
  });
});

describe('buildTracePayload', () => {
  it('emits a trace with nested agent + generation observations', () => {
    const batch = buildTracePayload(makeCtx());
    const types = (batch as Array<{ type: string }>).map((e) => e.type);
    expect(types).toEqual([
      'trace-create',
      'span-create',
      'generation-create',
      'span-create',
      'span-create',
    ]);
    const span = bodyOf(batch, 'span-create', 'agent-run');
    const gen = bodyOf(batch, 'generation-create', 'llm');
    const bash = bodyOf(batch, 'span-create', 'tool:Bash');
    const write = bodyOf(batch, 'span-create', 'tool:Write');
    expect(span.id).toBe('run-1-agent');
    expect(span.traceId).toBe('run-1');
    expect(gen.traceId).toBe('run-1');
    expect(gen.parentObservationId).toBe('run-1-agent');
    expect(bash.parentObservationId).toBe('run-1-agent');
    expect(bash.input).toBeUndefined();
    expect(bash.output).toBeUndefined();
    expect(bash.metadata.toolName).toBe('Bash');
    expect(write.parentObservationId).toBe('run-1-agent');
  });

  it('omits prompt + output when content gate is off', () => {
    const batch = buildTracePayload(makeCtx());
    const trace = (batch[0] as any).body;
    const span = bodyOf(batch, 'span-create', 'agent-run');
    const gen = bodyOf(batch, 'generation-create', 'llm');
    const tool = bodyOf(batch, 'span-create', 'tool:Bash');
    expect(trace.input).toBeUndefined();
    expect(trace.output).toBeUndefined();
    expect(span.input).toBeUndefined();
    expect(span.output).toBeUndefined();
    expect(gen.input).toBeUndefined();
    expect(gen.output).toBeUndefined();
    expect(tool.input).toBeUndefined();
    expect(tool.output).toBeUndefined();
  });

  it('includes prompt + output when content gate is on', () => {
    const batch = buildTracePayload(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
    );
    const trace = (batch[0] as any).body;
    const tool = bodyOf(batch, 'span-create', 'tool:Bash');
    expect(trace.input).toMatch(/coffee shop/);
    expect(trace.output).toMatch(/landing page draft/);
    expect(tool.input).toMatch(/ls -la/);
    expect(tool.output).toBe('total 0');
  });

  it('truncates ASCII prompt at 8 KB and output at 16 KB (bytes == chars)', () => {
    const longPrompt = 'a'.repeat(20_000);
    const longOutput = 'b'.repeat(40_000);
    const batch = buildTracePayload(
      makeCtx({
        message: {
          messageId: 'msg-1',
          prompt: longPrompt,
          output: longOutput,
        },
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
    );
    const trace = (batch[0] as any).body;
    expect(Buffer.byteLength(trace.input, 'utf8')).toBe(8 * 1024);
    expect(Buffer.byteLength(trace.output, 'utf8')).toBe(16 * 1024);
  });

  it('truncates by UTF-8 bytes, not by JS string length, for multi-byte text', () => {
    // Each CJK character is 3 bytes in UTF-8 but 1 unit in String.length.
    // 4096 chars × 3 bytes = 12_288 bytes, well over the 8 KB input cap.
    const longCJK = '设'.repeat(4096);
    expect(longCJK.length).toBe(4096);
    expect(Buffer.byteLength(longCJK, 'utf8')).toBe(12_288);
    const batch = buildTracePayload(
      makeCtx({
        message: { messageId: 'msg-1', prompt: longCJK, output: '' },
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
    );
    const trace = (batch[0] as any).body;
    expect(Buffer.byteLength(trace.input, 'utf8')).toBeLessThanOrEqual(8 * 1024);
    // Boundary safety: the trimmed result must still be valid UTF-8 (no
    // half-encoded characters). Round-tripping through Buffer should be
    // lossless if the cut landed correctly.
    expect(Buffer.from(trace.input as string, 'utf8').toString('utf8')).toBe(
      trace.input,
    );
    // And every character is still '设', i.e. we didn't mangle the encoding.
    expect(/^设+$/.test(trace.input as string)).toBe(true);
  });

  it('omits artifacts when manifest gate is off', () => {
    const batch = buildTracePayload(
      makeCtx({
        artifacts: [
          { slug: 'a', type: 'html', sizeBytes: 100 },
          { slug: 'b', type: 'jsx', sizeBytes: 200 },
        ],
      }),
    );
    const trace = (batch[0] as any).body;
    expect(trace.metadata.artifacts).toBeUndefined();
    expect(trace.metadata.artifactsTruncated).toBeUndefined();
  });

  it('caps artifacts at 50 entries with a truncation flag', () => {
    const many = Array.from({ length: 75 }, (_, i) => ({
      slug: `art-${i}`,
      type: 'html',
      sizeBytes: 1,
    }));
    const batch = buildTracePayload(
      makeCtx({
        artifacts: many,
        prefs: { metrics: true, content: false, artifactManifest: true },
      }),
    );
    const trace = (batch[0] as any).body;
    expect(trace.metadata.artifacts).toHaveLength(50);
    expect(trace.metadata.artifactsTruncated).toBe(true);
  });

  it('keeps eventsSummary metadata regardless of content / artifact gates', () => {
    const batch = buildTracePayload(makeCtx());
    const trace = (batch[0] as any).body;
    expect(trace.metadata.eventsSummary).toEqual({
      toolCalls: 2,
      errors: 0,
      durationMs: 4500,
    });
  });

  it('records token counts in metadata.tokens and generation.usage', () => {
    const batch = buildTracePayload(makeCtx());
    const trace = (batch[0] as any).body;
    const gen = bodyOf(batch, 'generation-create', 'llm');
    expect(trace.metadata.tokens).toEqual({
      input: 1234,
      output: 567,
      total: 1801,
    });
    expect(gen.usage).toEqual({
      input: 1234,
      output: 567,
      total: 1801,
      unit: 'TOKENS',
    });
  });

  it('uses conversationId as sessionId when within length limit', () => {
    const batch = buildTracePayload(makeCtx());
    expect((batch[0] as any).body.sessionId).toBe(
      'conv-uuid-aaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    );
  });

  it('drops sessionId when conversationId exceeds 200 chars', () => {
    const batch = buildTracePayload(
      makeCtx({ conversationId: 'x'.repeat(201) }),
    );
    expect((batch[0] as any).body.sessionId).toBeUndefined();
  });

  it('builds tag list with project + agent + extras', () => {
    const batch = buildTracePayload(
      makeCtx({ extraTags: ['legacy:tag'] }),
    );
    expect((batch[0] as any).body.tags).toEqual([
      'open-design',
      'project:proj-1',
      'agent:claude',
      'legacy:tag',
    ]);
  });

  it('adds turn-level tags (model / skill / DS) and runtime tags (os / client)', () => {
    const batch = buildTracePayload(
      makeCtx({
        turn: {
          model: 'gpt-4o',
          reasoning: 'high',
          skillId: 'landing-page',
          designSystemId: 'mission-control',
        },
        runtime: {
          os: 'darwin',
          arch: 'arm64',
          nodeVersion: 'v22.22.0',
          appVersion: '0.5.0',
          clientType: 'desktop',
        },
      }),
    );
    expect((batch[0] as any).body.tags).toEqual([
      'open-design',
      'project:proj-1',
      'agent:claude',
      'model:gpt-4o',
      'skill:landing-page',
      'ds:mission-control',
      'os:darwin',
      'client:desktop',
    ]);
  });

  it('promotes model + reasoning to first-class generation fields', () => {
    const batch = buildTracePayload(
      makeCtx({
        turn: { model: 'claude-sonnet-4-5', reasoning: 'high' },
      }),
    );
    const gen = bodyOf(batch, 'generation-create', 'llm');
    expect(gen.model).toBe('claude-sonnet-4-5');
    expect(gen.modelParameters).toEqual({ reasoning: 'high' });
  });

  it('omits modelParameters entirely when reasoning is unset', () => {
    const batch = buildTracePayload(
      makeCtx({ turn: { model: 'gpt-4o' } }),
    );
    const gen = bodyOf(batch, 'generation-create', 'llm');
    expect(gen.model).toBe('gpt-4o');
    expect(gen.modelParameters).toBeUndefined();
  });

  it('mirrors runtime + turn fields into trace metadata for query / export', () => {
    const batch = buildTracePayload(
      makeCtx({
        turn: { model: 'claude-sonnet-4-5', skillId: 'landing-page' },
        runtime: {
          os: 'linux',
          arch: 'x64',
          nodeVersion: 'v22.22.0',
          appVersion: '0.5.0',
          appChannel: 'beta',
          packaged: true,
          clientType: 'web',
        },
      }),
    );
    const m = (batch[0] as any).body.metadata;
    expect(m.model).toBe('claude-sonnet-4-5');
    expect(m.skillId).toBe('landing-page');
    expect(m.os).toBe('linux');
    expect(m.arch).toBe('x64');
    expect(m.nodeVersion).toBe('v22.22.0');
    expect(m.appVersion).toBe('0.5.0');
    expect(m.appChannel).toBe('beta');
    expect(m.packaged).toBe(true);
    expect(m.clientType).toBe('web');
    expect(m.projectId).toBe('proj-1');
    expect(m.agent).toBe('claude');
  });

  it('marks generation.level=ERROR when run failed', () => {
    const batch = buildTracePayload(
      makeCtx({
        run: {
          runId: 'run-1',
          status: 'failed',
          startedAt: 1,
          endedAt: 2,
          error: 'boom',
        },
      }),
    );
    const span = bodyOf(batch, 'span-create', 'agent-run');
    const gen = bodyOf(batch, 'generation-create', 'llm');
    expect(gen.level).toBe('ERROR');
    expect(gen.statusMessage).toBe('boom');
    expect(span.level).toBe('ERROR');
    expect(span.statusMessage).toBe('boom');
    expect(bodyOf(batch, 'event-create', 'run-error').statusMessage).toBe('boom');
    expect((batch[0] as any).body.metadata.error).toBe('boom');
    expect((batch[0] as any).body.metadata.success).toBe(false);
  });

  it('passes through anonymous installationId as userId', () => {
    const batch = buildTracePayload(makeCtx({ installationId: null }));
    expect((batch[0] as any).body.userId).toBeUndefined();
  });
});

describe('reportRunCompleted', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('does nothing when metrics gate is off', async () => {
    const fetchSpy = vi.fn();
    await reportRunCompleted(
      makeCtx({
        prefs: { metrics: false, content: true, artifactManifest: true },
      }),
      { config: TEST_CONFIG, fetchImpl: fetchSpy as any },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does nothing when no Langfuse config is available', async () => {
    const fetchSpy = vi.fn();
    await reportRunCompleted(makeCtx(), {
      config: null,
      fetchImpl: fetchSpy as any,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs to /api/public/ingestion with Basic auth and a JSON batch body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
    await reportRunCompleted(makeCtx(), {
      config: TEST_CONFIG,
      fetchImpl: fetchSpy as any,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0]!;
    const url = call[0] as string;
    const init = call[1] as RequestInit & { headers: Record<string, string> };
    expect(url).toBe('https://us.cloud.langfuse.com/api/public/ingestion');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Basic dGVzdA==');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(Array.isArray(body.batch)).toBe(true);
    expect(body.batch.map((item: any) => item.type)).toEqual([
      'trace-create',
      'span-create',
      'generation-create',
      'span-create',
      'span-create',
    ]);
  });

  it('warns and drops when serialized batch exceeds the hard cap', async () => {
    // Per-field truncation already caps prompt/output, so we overflow the
    // hard cap by stuffing 50 artifact entries with very long slugs while
    // artifactManifest is on (50 × 30 KB ≈ 1.5 MB > 1 MB cap).
    const fetchSpy = vi.fn();
    const fatArtifacts = Array.from({ length: 50 }, (_, i) => ({
      slug: 'a'.repeat(30_000) + i,
      type: 'html',
      sizeBytes: 1,
    }));
    await reportRunCompleted(
      makeCtx({
        artifacts: fatArtifacts,
        prefs: { metrics: true, content: false, artifactManifest: true },
      }),
      { config: TEST_CONFIG, fetchImpl: fetchSpy as any },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Batch too large'),
    );
  });

  it('only warns (does not throw) when fetch rejects', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(
      reportRunCompleted(makeCtx(), {
        config: TEST_CONFIG,
        fetchImpl: fetchSpy as any,
      }),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Fetch error'),
    );
  });

  it('retries once when fetch rejects before warning', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(new Response('{}', { status: 207 }));
    await reportRunCompleted(makeCtx(), {
      config: { ...TEST_CONFIG, retries: 1 },
      fetchImpl: fetchSpy as any,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('only warns (does not throw) when ingestion responds non-2xx', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );
    await reportRunCompleted(makeCtx(), {
      config: TEST_CONFIG,
      fetchImpl: fetchSpy as any,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Ingestion failed 429'),
    );
  });

  it('warns when 207 Multi-Status body lists per-event errors', async () => {
    // Langfuse legacy ingestion always responds with 207. response.ok is
    // true, but malformed events show up in body.errors instead of as a
    // top-level non-2xx. Without parsing them they'd be silently dropped.
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          successes: [{ id: 'a', status: 201 }],
          errors: [
            {
              id: 'b',
              status: 400,
              message: 'invalid generation usage shape',
            },
          ],
        }),
        { status: 207 },
      ),
    );
    await reportRunCompleted(makeCtx(), {
      config: TEST_CONFIG,
      fetchImpl: fetchSpy as any,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Per-event errors (1)'),
    );
  });

  it('does not warn when 207 body has empty errors array', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          successes: [
            { id: 'a', status: 201 },
            { id: 'b', status: 201 },
          ],
          errors: [],
        }),
        { status: 207 },
      ),
    );
    await reportRunCompleted(makeCtx(), {
      config: TEST_CONFIG,
      fetchImpl: fetchSpy as any,
    });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
