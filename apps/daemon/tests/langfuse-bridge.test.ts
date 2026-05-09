import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportRunCompletedFromDaemon } from '../src/langfuse-bridge.js';

interface FakeMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  producedFiles?: Array<Record<string, unknown>>;
}

function makeDb(messagesByConvo: Record<string, FakeMessage[]> = {}) {
  return {
    __messages: messagesByConvo,
    prepare() {
      throw new Error('listMessages should be the only DB call in tests');
    },
  };
}

function makeRun(over: Partial<Parameters<typeof reportRunCompletedFromDaemon>[0]['run']> = {}) {
  const now = Date.now();
  return {
    id: 'run-id-1',
    projectId: 'proj-1',
    conversationId: 'conv-1',
    assistantMessageId: 'msg-1',
    agentId: 'claude',
    status: 'succeeded',
    createdAt: now - 4500,
    updatedAt: now,
    events: [
      {
        id: 1,
        event: 'agent',
        timestamp: now - 4000,
        data: {
          type: 'tool_use',
          id: 'tool-1',
          name: 'Bash',
          input: { command: 'ls -la' },
        },
      },
      {
        id: 2,
        event: 'agent',
        timestamp: now - 3500,
        data: {
          type: 'tool_result',
          toolUseId: 'tool-1',
          content: 'total 0',
          isError: false,
        },
      },
      {
        id: 3,
        event: 'agent',
        timestamp: now - 3000,
        data: {
          type: 'tool_use',
          id: 'tool-2',
          name: 'Write',
          input: { path: 'index.html' },
        },
      },
      {
        id: 4,
        event: 'agent',
        timestamp: now - 2500,
        data: {
          type: 'tool_result',
          toolUseId: 'tool-2',
          content: 'wrote index.html',
          isError: false,
        },
      },
      {
        id: 5,
        event: 'agent',
        timestamp: now - 2000,
        data: {
          type: 'usage',
          usage: { input_tokens: 100, output_tokens: 200 },
        },
      },
    ] as Array<{ id: number; event: string; data: unknown; timestamp?: number }>,
    userPrompt: 'design a coffee landing page',
    ...over,
  };
}

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

describe('langfuse-bridge.reportRunCompletedFromDaemon', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-bridge-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function writeAppCfg(cfg: Record<string, unknown>) {
    await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify(cfg));
  }

  it('does nothing when telemetry.metrics is off', async () => {
    await writeAppCfg({
      installationId: 'install-1',
      telemetry: { metrics: false },
    });
    const fetchSpy = vi.fn();
    await reportRunCompletedFromDaemon({
      db: makeDb(),
      dataDir,
      run: makeRun() as any,
      fetchImpl: fetchSpy as any,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does nothing when no app-config.json exists (fresh install)', async () => {
    const fetchSpy = vi.fn();
    await reportRunCompletedFromDaemon({
      db: makeDb(),
      dataDir,
      run: makeRun() as any,
      fetchImpl: fetchSpy as any,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('builds a ReportContext from db + app-config and POSTs the trace', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
    });
    const messages: FakeMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Here is a draft …',
        producedFiles: [
          { name: 'index.html', kind: 'html', size: 4096 },
          { name: 'style.css', kind: 'code', size: 800 },
        ],
      },
    ];
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({ 'conv-1': messages }),
        dataDir,
        run: makeRun() as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const batch = JSON.parse(init.body as string).batch as any[];
    expect(batch.map((item) => item.type)).toEqual([
      'trace-create',
      'span-create',
      'generation-create',
      'span-create',
      'span-create',
      'event-create',
    ]);
    const trace = batch[0].body;
    const span = bodyOf(batch, 'span-create', 'agent-run');
    const generation = bodyOf(batch, 'generation-create', 'llm');
    const bash = bodyOf(batch, 'span-create', 'tool:Bash');
    const write = bodyOf(batch, 'span-create', 'tool:Write');
    const artifacts = bodyOf(batch, 'event-create', 'artifact-summary');
    expect(trace.userId).toBe('install-uuid-1');
    expect(trace.sessionId).toBe('conv-1');
    expect(trace.input).toBe('design a coffee landing page');
    expect(trace.output).toBe('Here is a draft …');
    expect(span.id).toBe('run-id-1-agent');
    expect(span.traceId).toBe('run-id-1');
    expect(span.input).toBe('design a coffee landing page');
    expect(span.output).toBe('Here is a draft …');
    expect(generation.parentObservationId).toBe('run-id-1-agent');
    expect(bash.parentObservationId).toBe('run-id-1-agent');
    expect(bash.input).toMatch(/ls -la/);
    expect(bash.output).toBe('total 0');
    expect(write.parentObservationId).toBe('run-id-1-agent');
    expect(write.metadata.toolName).toBe('Write');
    expect(artifacts.parentObservationId).toBe('run-id-1-agent');
    expect(artifacts.metadata.artifacts).toEqual([
      { slug: 'index.html', type: 'html', sizeBytes: 4096 },
      { slug: 'style.css', type: 'code', sizeBytes: 800 },
    ]);
    // Core tags must be present. The bridge also tacks on an `os:<...>`
    // tag derived from the host (`darwin` / `linux` / `win32`), which is
    // useful telemetry but varies between dev / CI environments — assert
    // its presence by prefix rather than pinning a value.
    expect(trace.tags).toEqual(
      expect.arrayContaining(['open-design', 'project:proj-1', 'agent:claude']),
    );
    expect((trace.tags as string[]).some((t) => t.startsWith('os:'))).toBe(true);
    expect(trace.metadata.eventsSummary.toolCalls).toBe(2);
    expect(trace.metadata.eventsSummary.errors).toBe(0);
    expect(trace.metadata.tokens).toEqual({
      input: 100,
      output: 200,
      total: 300,
    });
    expect(trace.metadata.artifacts).toEqual([
      { slug: 'index.html', type: 'html', sizeBytes: 4096 },
      { slug: 'style.css', type: 'code', sizeBytes: 800 },
    ]);
    expect(trace.metadata.success).toBe(true);
  });

  it('attaches turn-level config (model / reasoning / skill / DS) to trace + generation', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: false, artifactManifest: false },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({ 'conv-1': [] }),
        dataDir,
        run: makeRun({
          model: 'claude-sonnet-4-5',
          reasoning: 'high',
          skillId: 'landing-page',
          designSystemId: 'mission-control',
          clientType: 'desktop',
        }) as any,
        appVersion: {
          version: '0.5.0',
          channel: 'beta',
          packaged: true,
          platform: 'darwin',
          arch: 'arm64',
        },
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const batch = JSON.parse(init.body as string).batch as any[];
    const trace = batch[0].body;
    const generation = bodyOf(batch, 'generation-create', 'llm');

    // Turn-level: trace metadata + tags carry it for filtering / grouping.
    expect(trace.metadata.model).toBe('claude-sonnet-4-5');
    expect(trace.metadata.reasoning).toBe('high');
    expect(trace.metadata.skillId).toBe('landing-page');
    expect(trace.metadata.designSystemId).toBe('mission-control');
    expect(trace.tags).toEqual(
      expect.arrayContaining([
        'model:claude-sonnet-4-5',
        'skill:landing-page',
        'ds:mission-control',
        'client:desktop',
      ]),
    );

    // Runtime / build info on every trace.
    expect(trace.metadata.appVersion).toBe('0.5.0');
    expect(trace.metadata.appChannel).toBe('beta');
    expect(trace.metadata.packaged).toBe(true);
    expect(trace.metadata.clientType).toBe('desktop');
    expect(typeof trace.metadata.os).toBe('string');
    expect(typeof trace.metadata.nodeVersion).toBe('string');

    // Generation: model is a first-class Langfuse field (not just metadata),
    // and reasoning lands on modelParameters where Langfuse expects it.
    expect(generation.model).toBe('claude-sonnet-4-5');
    expect(generation.modelParameters).toEqual({ reasoning: 'high' });
  });

  it('omits content + artifacts when those gates are off', async () => {
    await writeAppCfg({
      installationId: 'install-1',
      telemetry: {
        metrics: true,
        content: false,
        artifactManifest: false,
      },
    });
    const messages: FakeMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'sensitive output',
        producedFiles: [{ name: 'secret.html', kind: 'html', size: 1 }],
      },
    ];
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({ 'conv-1': messages }),
        dataDir,
        run: makeRun() as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const trace = JSON.parse(init.body as string).batch[0].body;
    expect(trace.input).toBeUndefined();
    expect(trace.output).toBeUndefined();
    expect(trace.metadata.artifacts).toBeUndefined();
    // tokens + eventsSummary are still in metadata since they're metrics
    expect(trace.metadata.tokens).toEqual({
      input: 100,
      output: 200,
      total: 300,
    });
  });

  it('reports only the current user turn captured on the run', async () => {
    await writeAppCfg({
      installationId: 'install-1',
      telemetry: { metrics: true, content: true },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'latest answer',
            },
          ],
        }),
        dataDir,
        run: makeRun({ userPrompt: 'post-consent revision' }) as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const payload = init.body as string;
    const batch = JSON.parse(payload).batch as any[];
    expect(batch[0].body.input).toBe('post-consent revision');
    expect(bodyOf(batch, 'span-create', 'agent-run').input).toBe(
      'post-consent revision',
    );
    expect(payload).not.toContain('pre-consent brief');
  });

  it('passes status=failed and a clipped error message through', async () => {
    await writeAppCfg({
      installationId: 'install-1',
      telemetry: { metrics: true },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({ 'conv-1': [] }),
        dataDir,
        run: makeRun({
          status: 'failed',
          events: [
            {
              id: 1,
              event: 'error',
              data: { error: { message: 'agent stream blew up' } },
            },
          ],
        }) as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const batch = JSON.parse(init.body as string).batch as any[];
    expect(batch[0].body.metadata.status).toBe('failed');
    expect(batch[0].body.metadata.success).toBe(false);
    expect(batch[0].body.metadata.error).toBe('agent stream blew up');
    expect(bodyOf(batch, 'span-create', 'agent-run').level).toBe('ERROR');
    expect(bodyOf(batch, 'generation-create', 'llm').level).toBe('ERROR');
    expect(bodyOf(batch, 'generation-create', 'llm').statusMessage).toBe(
      'agent stream blew up',
    );
    expect(bodyOf(batch, 'event-create', 'run-error').statusMessage).toBe(
      'agent stream blew up',
    );
  });

  it('survives a missing assistant message (web has not PUT yet)', async () => {
    await writeAppCfg({
      installationId: 'install-1',
      telemetry: { metrics: true, content: true },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({ 'conv-1': [] }),
        dataDir,
        run: makeRun() as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const trace = JSON.parse(init.body as string).batch[0].body;
    expect(trace.input).toBe('design a coffee landing page');
    // truncate() drops empty strings, so output is omitted entirely.
    expect(trace.output).toBeUndefined();
  });

  it('uses the persisted terminal status when the in-memory run has not settled yet', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: false, artifactManifest: false },
    });
    const run = makeRun({
      status: 'cancelRequested',
      updatedAt: 1_700_000_009_000,
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({ 'conv-1': [] }),
        dataDir,
        run: run as any,
        persistedRunStatus: 'canceled',
        persistedEndedAt: run.createdAt + 2500,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const batch = JSON.parse(init.body as string).batch as any[];
    const trace = batch[0].body;
    const span = bodyOf(batch, 'span-create', 'agent-run');
    expect(trace.metadata.status).toBe('canceled');
    expect(trace.metadata.eventsSummary.durationMs).toBe(2500);
    expect(span.metadata.status).toBe('canceled');
    expect(span.endTime).toBe(new Date(run.createdAt + 2500).toISOString());
  });
});

// listMessages reads from a `prepare(...).all(cid)` call against
// better-sqlite3. To avoid spinning up SQLite in unit tests we provide a
// stub that satisfies the same shape used in `apps/daemon/src/db.ts`.
function makeDbWithListMessages(messagesByConvo: Record<string, FakeMessage[]>) {
  // Mirror db.ts: SELECT returns *Json columns and listMessages runs them
  // through normalizeMessage which JSON.parses producedFilesJson into
  // producedFiles. Tests pass producedFiles directly, so we round-trip
  // through JSON.stringify to match the real-world shape.
  return {
    prepare(_sql: string) {
      return {
        all(cid: string) {
          return (messagesByConvo[cid] ?? []).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            agentId: null,
            agentName: null,
            runId: null,
            runStatus: null,
            lastRunEventId: null,
            eventsJson: null,
            attachmentsJson: null,
            commentAttachmentsJson: null,
            producedFilesJson: m.producedFiles
              ? JSON.stringify(m.producedFiles)
              : null,
            createdAt: 0,
            startedAt: null,
            endedAt: null,
            position: 0,
          }));
        },
      };
    },
  };
}
