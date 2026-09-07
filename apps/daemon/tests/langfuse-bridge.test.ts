import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildSafeRunQualityProjectionFromDaemon,
  reportRunCompletedFromDaemon,
} from '../src/langfuse-bridge.js';
import { buildPromptStackTelemetry } from '../src/prompt-telemetry.js';

interface FakeMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Array<Record<string, unknown>>;
  producedFiles?: Array<Record<string, unknown>>;
  traceObjectFiles?: Array<Record<string, unknown>>;
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

const TEST_VELA_TELEMETRY_URL =
  'https://vela.example.test/api/v1/open-design/telemetry';

function enableTestVelaTelemetry(): void {
  vi.stubEnv('OPEN_DESIGN_VELA_TELEMETRY', 'on');
  vi.stubEnv('VELA_CONTROL_KEY', 'ck_test');
  vi.stubEnv('VELA_API_URL', 'https://vela.example.test');
}

function velaTraceBody(call: [string, RequestInit]): Record<string, any> {
  const envelope = JSON.parse(call[1].body as string) as {
    events: Array<{ kind: string; data: Record<string, any> }>;
  };
  const event = envelope.events.find((candidate) => candidate.kind === 'trace');
  expect(event).toBeTruthy();
  return event!.data;
}

describe('langfuse-bridge.reportRunCompletedFromDaemon', () => {
  let dataDir: string;
  let telemetryRelayUrl: string | undefined;
  let objectRelayUrl: string | undefined;

  beforeEach(async () => {
    telemetryRelayUrl = process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    objectRelayUrl = process.env.OPEN_DESIGN_OBJECT_RELAY_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    delete process.env.OPEN_DESIGN_OBJECT_RELAY_URL;
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-bridge-'));
  });

  it('rebuilds Task quality from the same durable message, tool, and manifest facts', async () => {
    const run = makeRun({
      status: 'failed',
      error: 'token=sk-test-1234567890123456789012 /Users/alice/private',
      errorCode: 'AGENT_EXIT',
    });
    const quality = await buildSafeRunQualityProjectionFromDaemon({
      db: makeDbWithListMessages({
        'conv-1': [{
          id: 'user-1',
          role: 'user',
          content: 'request',
          attachments: [{ path: '/Users/alice/private.png', size: 42 }],
        }, {
          id: 'msg-1',
          role: 'assistant',
          content:
            'done token=sk-test-1234567890123456789012 <artifact>private body</artifact>',
          producedFiles: [{ path: '/Users/alice/result.html', size: 84, kind: 'html' }],
        }],
      }),
      dataDir,
      run,
      prefs: { metrics: true, content: true, artifactManifest: true },
      installationId: 'installation-fixture',
    });

    expect(quality?.result?.output?.text).toContain('[REDACTED:artifact_content]');
    expect(quality?.result?.error).toMatchObject({ code: 'AGENT_EXIT' });
    expect(quality?.tools).toHaveLength(2);
    expect(quality?.manifests).toMatchObject({
      completeness: 'complete',
      attachments: [{ object_class: 'attachment', size_bytes: 42 }],
      artifacts: [{ object_class: 'artifact', size_bytes: 84, type: 'html' }],
    });
    const serialized = JSON.stringify(quality);
    expect(serialized).not.toContain('/Users/alice');
    expect(serialized).not.toContain('sk-test-');
    expect(serialized).not.toContain('private body');

    expect(await buildSafeRunQualityProjectionFromDaemon({
      db: makeDb(),
      dataDir,
      run,
      prefs: { metrics: true, content: false, artifactManifest: true },
    })).toBeUndefined();
  });

  afterEach(async () => {
    if (telemetryRelayUrl === undefined) delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    else process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL = telemetryRelayUrl;
    if (objectRelayUrl === undefined) delete process.env.OPEN_DESIGN_OBJECT_RELAY_URL;
    else process.env.OPEN_DESIGN_OBJECT_RELAY_URL = objectRelayUrl;
    await rm(dataDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
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

  it('does nothing when conversation/tool content reporting is off', async () => {
    await writeAppCfg({
      installationId: 'install-1',
      telemetry: { metrics: true, content: false, artifactManifest: true },
    });
    const fetchSpy = vi.fn();
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'sensitive output',
              producedFiles: [{ name: 'secret.html', kind: 'html', size: 1 }],
            },
          ],
        }),
        dataDir,
        run: makeRun() as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }
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
        id: 'user-1',
        role: 'user',
        content: 'Use this reference.',
        attachments: [
          {
            path: 'uploads/brand.pdf',
            name: 'brand.pdf',
            kind: 'file',
            size: 2_481_032,
            mime: 'application/pdf',
            sha256: '1234abcd',
          },
        ],
      },
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Here is a draft …',
        producedFiles: [
          {
            name: 'index.html',
            path: '/Users/alice/private/project/index.html',
            kind: 'html',
            mime: 'text/html',
            size: 4096,
            hash: 'sha256:artifacthash',
            artifactManifest: {
              version: 1,
              kind: 'html',
              status: 'complete',
              exports: ['html'],
            },
          },
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
        run: makeRun({ agentId: 'qoder' }) as any,
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
      'event-create',
      'span-create',
      'span-create',
      'event-create',
    ]);
    const trace = batch[0].body;
    const span = bodyOf(batch, 'span-create', 'agent-run');
    const generation = bodyOf(batch, 'generation-create', 'llm');
    const bash = bodyOf(batch, 'span-create', 'tool:Bash');
    const write = bodyOf(batch, 'span-create', 'tool:Write');
    const usage = bodyOf(batch, 'event-create', 'agent-usage');
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
    expect(usage.parentObservationId).toBe('run-id-1-agent');
    expect(usage.input).toEqual({
      source: 'qoder',
      event_type: 'usage',
    });
    expect(usage.output.usage).toEqual({ input_tokens: 100, output_tokens: 200 });
    expect(artifacts.parentObservationId).toBe('run-id-1-agent');
    expect(artifacts.input).toEqual({
      source: 'agent_generated_artifacts',
      artifact_count: 2,
      artifact_manifest_enabled: true,
    });
    expect(artifacts.output).toEqual({
      artifacts: [
        { slug: 'index.html', type: 'html', sizeBytes: 4096 },
        { slug: 'style.css', type: 'code', sizeBytes: 800 },
      ],
      manifest_completeness: 'complete',
    });
    expect(artifacts.metadata.artifacts).toEqual([
      { slug: 'index.html', type: 'html', sizeBytes: 4096 },
      { slug: 'style.css', type: 'code', sizeBytes: 800 },
    ]);
    expect(trace.metadata.attachment_manifest).toEqual([
      expect.objectContaining({
        attachment_id: expect.stringMatching(/^att_[0-9a-f]{16}$/),
        object_class: 'attachment',
        storage_ref: expect.stringMatching(
          /^od:\/\/objects\/workspaces\/unknown\/projects\/proj-1\/runs\/run-id-1\/attachment\/att_[0-9a-f]{16}$/,
        ),
        project_id: 'proj-1',
        run_id: 'run-id-1',
        workspace_id: null,
        status: 'ok',
        size_bytes: 2_481_032,
        sha256: 'sha256:1234abcd',
        mime_type: 'application/pdf',
        extension: 'pdf',
        redacted: false,
        truncated: false,
        stored_in_open_design: true,
        retention_policy: 'project_lifetime',
        access_scope: 'project',
        sensitivity: 'private',
        source: 'user_upload',
        expires_at: null,
        approved_by: null,
      }),
    ]);
    expect(trace.metadata.artifact_manifest).toEqual([
      expect.objectContaining({
        artifact_id: expect.stringMatching(/^art_[0-9a-f]{16}$/),
        object_class: 'artifact',
        type: 'html',
        storage_ref: expect.stringMatching(
          /^od:\/\/objects\/workspaces\/unknown\/projects\/proj-1\/runs\/run-id-1\/artifact\/art_[0-9a-f]{16}$/,
        ),
        project_id: 'proj-1',
        run_id: 'run-id-1',
        workspace_id: null,
        status: 'ok',
        size_bytes: 4096,
        sha256: 'sha256:artifacthash',
        mime_type: 'text/html',
        extension: 'html',
        build_status: 'complete',
        preview_status: 'unavailable',
        export_status: 'available',
        redacted: false,
        truncated: false,
        stored_in_open_design: true,
        retention_policy: 'project_lifetime',
        access_scope: 'project',
        sensitivity: 'private',
        source: 'agent_generated',
        expires_at: null,
        approved_by: null,
      }),
      expect.objectContaining({
        object_class: 'artifact',
        type: 'code',
        size_bytes: 800,
        extension: 'css',
        export_status: 'unavailable',
      }),
    ]);
    expect(trace.metadata.manifest_completeness).toBe('complete');
    expect(JSON.stringify(batch)).not.toContain('/Users/alice/private/project');
    expect(JSON.stringify(batch)).not.toContain('brand.pdf');
    // Core tags must be present. The bridge also tacks on an `os:<...>`
    // tag derived from the host (`darwin` / `linux` / `win32`), which is
    // useful telemetry but varies between dev / CI environments — assert
    // its presence by prefix rather than pinning a value.
    expect(trace.tags).toEqual(
      expect.arrayContaining(['open-design', 'project:proj-1', 'agent:qoder']),
    );
    expect((trace.tags as string[]).some((t) => t.startsWith('os:'))).toBe(true);
    expect(trace.metadata.eventsSummary.toolCalls).toBe(2);
    expect(trace.metadata.eventsSummary.errors).toBe(0);
    expect(trace.metadata.tokens).toEqual({
      input: 100,
      inputProvider: 100,
      inputEffective: 100,
      output: 200,
      total: 300,
      estimatedContext: 93,
      cacheTokenSource: 'unavailable',
    });
    expect(trace.metadata.artifacts).toEqual([
      { slug: 'index.html', type: 'html', sizeBytes: 4096 },
      { slug: 'style.css', type: 'code', sizeBytes: 800 },
    ]);
    expect(trace.metadata.success).toBe(true);
  });

  it('collects runtime diagnostic agent events into Langfuse observations', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: false },
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
              content: '',
              producedFiles: [],
            },
          ],
        }),
        dataDir,
        run: makeRun({
          agentId: 'amr',
          events: [
            {
              id: 1,
              event: 'agent',
              timestamp: Date.now() - 100,
              data: {
                type: 'diagnostic',
                name: 'acp_artifact_text_suppression',
                source: 'acp-json-rpc',
                reason: 'artifact_echo',
                suppressedChars: 4096,
                openedBlocks: 1,
                closedBlocks: 1,
                fileCount: 1,
                files: ['index.html'],
              },
            },
            {
              id: 2,
              event: 'agent',
              timestamp: Date.now() - 50,
              data: {
                type: 'diagnostic',
                name: 'prompt_budget_v1',
                source: 'acp-json-rpc',
                schemaVersion: 1,
                frameBytes: 34_810,
                promptBytes: 34_222,
                promptTokenEstimate: 11_408,
                tokenEstimateMethod: 'utf8_bytes_div_3_ceil_v1',
                sessionMode: 'resume',
                modelId: 'claude-opus-5',
                contextWindowSource: 'model_metadata',
                contextWindowTokens: 200_000,
                priorSessionUsageSource: 'agent_session',
                priorSessionInputTokens: 123_456,
                prompt: 'PRIVATE_PROMPT_MUST_NOT_LEAK',
                sessionId: 'PRIVATE_SESSION_MUST_NOT_LEAK',
                command: 'PRIVATE_COMMAND_MUST_NOT_LEAK',
                path: '/PRIVATE_PATH_MUST_NOT_LEAK',
                headers: { authorization: 'PRIVATE_HEADER_MUST_NOT_LEAK' },
                toolInput: 'PRIVATE_TOOL_INPUT_MUST_NOT_LEAK',
              },
            },
            {
              id: 3,
              event: 'agent',
              timestamp: Date.now() - 25,
              data: {
                type: 'diagnostic',
                name: 'tool_execution_lifecycle',
                source: 'amr-opencode',
                elapsedMs: 50,
                schema: 'vela.tool_execution_lifecycle',
                version: 1,
                status: 'failed',
                phase: 'close',
                executionVersion: 1,
                toolCallIdHash: 'acp_0123456789abcdef01234567',
                trigger: 'deadline',
                terminal: 'interrupted',
                droppedEvents: 1,
                events: [
                  { phase: 'kill_sent', elapsedMs: 10, target: 'group', mechanism: 'process_group' },
                  { phase: 'close', stdoutClosed: true, stderrClosed: false },
                ],
                toolTerminal: { source: 'processor_cleanup', confirmed: false },
                command: 'cat /private/secret',
                headers: { authorization: 'Bearer secret' },
              },
            },
            {
              id: 4,
              event: 'agent',
              timestamp: Date.now() - 10,
              data: {
                type: 'diagnostic',
                name: 'tool_execution_lifecycle',
                source: 'amr-opencode',
                schema: 'vela.tool_execution_lifecycle',
                version: 1,
                toolCallIdHash: 'invalid-hash',
                reason: 'private-command --token super-secret-lifecycle-value',
              },
            },
          ] as any,
        }) as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const batch = JSON.parse(init.body as string).batch as any[];
    expect(
      bodyOf(batch, 'event-create', 'agent-diagnostic:acp_artifact_text_suppression'),
    ).toMatchObject({
      input: {
        source: 'amr',
        event_type: 'diagnostic',
      },
      output: {
        name: 'acp_artifact_text_suppression',
        source: 'acp-json-rpc',
        reason: 'artifact_echo',
        suppressed_chars: 4096,
        opened_blocks: 1,
        closed_blocks: 1,
        file_count: 1,
        files: ['index.html'],
      },
      metadata: {
        diagnostic_name: 'acp_artifact_text_suppression',
      },
    });
    expect(
      bodyOf(batch, 'event-create', 'agent-diagnostic:prompt_budget_v1'),
    ).toMatchObject({
      input: {
        source: 'amr',
        event_type: 'diagnostic',
      },
      output: {
        name: 'prompt_budget_v1',
        source: 'acp-json-rpc',
        schema_version: 1,
        frame_bytes: 34_810,
        prompt_bytes: 34_222,
        prompt_token_estimate: 11_408,
        token_estimate_method: 'utf8_bytes_div_3_ceil_v1',
        session_mode: 'resume',
        model_id: 'claude-opus-5',
        context_window_source: 'model_metadata',
        context_window_tokens: 200_000,
        prior_session_usage_source: 'agent_session',
        prior_session_input_tokens: 123_456,
      },
      metadata: {
        diagnostic_name: 'prompt_budget_v1',
      },
    });
    expect(batch[0].body.metadata.diagnostics).toMatchObject({
      prompt_budget_version: 'prompt_budget_v1',
      prompt_frame_bytes: 34_810,
      prompt_bytes: 34_222,
      prompt_token_estimate: 11_408,
      prompt_session_mode: 'resume',
      prompt_model_id: 'claude-opus-5',
      prompt_context_window_source: 'model_metadata',
      prompt_context_window_tokens: 200_000,
      prompt_prior_session_usage_source: 'agent_session',
      prompt_prior_session_input_tokens: 123_456,
    });
    expect(JSON.stringify(batch)).not.toContain('PRIVATE_');
    expect(
      bodyOf(batch, 'event-create', 'agent-diagnostic:tool_execution_lifecycle'),
    ).toMatchObject({
      output: {
        name: 'tool_execution_lifecycle',
        source: 'amr-opencode',
        elapsed_ms: 50,
        schema: 'vela.tool_execution_lifecycle',
        version: 1,
        tool_call_id_hash: 'acp_0123456789abcdef01234567',
        status: 'failed',
        phase: 'close',
        execution_version: 1,
        trigger: 'deadline',
        terminal: 'interrupted',
        dropped_events: 1,
        events: [
          { phase: 'kill_sent', elapsed_ms: 10, target: 'group', mechanism: 'process_group' },
          { phase: 'close', stdout_closed: true, stderr_closed: false },
        ],
        tool_terminal: { source: 'processor_cleanup', confirmed: false },
      },
      metadata: { diagnostic_name: 'tool_execution_lifecycle' },
    });
    const serializedBatch = JSON.stringify(batch);
    expect(serializedBatch).not.toContain('cat /private/secret');
    expect(serializedBatch).not.toContain('Bearer secret');
    expect(serializedBatch).not.toContain('super-secret-lifecycle-value');
  });

  it('projects a retained prompt budget after the diagnostic leaves the 2,000-event tail', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: false },
    });
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [{ id: 'msg-1', role: 'assistant', content: '', producedFiles: [] }],
        }),
        dataDir,
        run: makeRun({
          agentId: 'amr',
          events: Array.from({ length: 2_001 }, (_, index) => ({
            id: index + 2,
            event: 'agent',
            timestamp: Date.now() - 2_001 + index,
            data: { type: 'status', label: 'working' },
          })),
          promptBudgetDiagnostics: {
            prompt_budget_version: 'prompt_budget_v1',
            prompt_frame_bytes: 34_810,
            prompt_bytes: 34_222,
            prompt_token_estimate: 11_408,
            prompt_token_estimate_method: 'utf8_bytes_div_3_ceil_v1',
            prompt_session_mode: 'resume',
            prompt_model_id: 'claude-opus-5',
            prompt_context_window_source: 'model_metadata',
            prompt_context_window_tokens: 200_000,
            prompt_prior_session_usage_source: 'agent_session',
            prompt_prior_session_input_tokens: 123_456,
          },
        }) as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    const batch = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string).batch as any[];
    expect(
      bodyOf(batch, 'event-create', 'agent-diagnostic:prompt_budget_v1'),
    ).toMatchObject({
      output: {
        frame_bytes: 34_810,
        prompt_bytes: 34_222,
        prior_session_input_tokens: 123_456,
      },
    });
    expect(batch[0].body.metadata.diagnostics).toMatchObject({
      prompt_budget_version: 'prompt_budget_v1',
      prompt_frame_bytes: 34_810,
    });
  });

  it('keeps canonical tool spans without projecting ACP tool snapshot statuses', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: false },
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
              content: '',
              producedFiles: [],
            },
          ],
        }),
        dataDir,
        run: makeRun({
          agentId: 'amr',
          events: [
            {
              id: 1,
              event: 'agent',
              data: { type: 'status', label: 'initializing' },
            },
            {
              id: 2,
              event: 'agent',
              data: { type: 'status', label: 'tool_call' },
            },
            {
              id: 3,
              event: 'agent',
              data: {
                type: 'tool_use',
                id: 'call-1',
                name: 'Bash',
                input: { command: 'pwd' },
              },
            },
            {
              id: 4,
              event: 'agent',
              data: { type: 'status', label: 'tool_call_update' },
            },
            {
              id: 5,
              event: 'agent',
              data: {
                type: 'tool_result',
                toolUseId: 'call-1',
                content: '/tmp',
                isError: false,
              },
            },
          ] as any,
        }) as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const batch = JSON.parse(init.body as string).batch as any[];
    expect(bodyOf(batch, 'span-create', 'tool:Bash')).toBeTruthy();
    expect(bodyOf(batch, 'event-create', 'agent-status:initializing')).toBeTruthy();
    const names = batch
      .filter((item) => item.type === 'event-create')
      .map((item) => item.body.name);
    expect(names).not.toContain('agent-status:tool_call');
    expect(names).not.toContain('agent-status:tool_call_update');
  });

  it('marks trace-safe object manifests partial when object accounting is incomplete', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
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
              id: 'user-1',
              role: 'user',
              content: 'Use this reference.',
              attachments: [{ path: 'uploads/brand.pdf', kind: 'file' }],
            },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'Here is a draft …',
              producedFiles: [{ name: 'index.html', kind: 'html' }],
            },
          ],
        }),
        dataDir,
        run: makeRun() as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const batch = JSON.parse(init.body as string).batch as any[];
    const trace = batch[0].body;
    expect(trace.metadata.manifest_completeness).toBe('partial');
    expect(trace.metadata.attachment_manifest[0]).toMatchObject({
      object_class: 'attachment',
      status: 'partial',
      reason: 'size_unavailable',
    });
    expect(trace.metadata.artifact_manifest[0]).toMatchObject({
      object_class: 'artifact',
      status: 'partial',
      reason: 'size_unavailable',
    });
  });

  it('derives authenticated object uploads through Vela while keeping bodies out of telemetry', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
    });
    const projectDir = path.join(dataDir, 'projects', 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'brief.txt'), 'private attachment body');
    await writeFile(path.join(projectDir, 'index.html'), '<!doctype html><h1>private artifact</h1>');
    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      if (url === TEST_VELA_TELEMETRY_URL) {
        return new Response(JSON.stringify({ ok: true }), { status: 202 });
      }
      if (url.includes('/api/objects/authorize')) {
        const parsed = JSON.parse(init.body as string) as {
          objects: Array<{ storage_ref: string; sha256: string; size_bytes: number }>;
        };
        expect(parsed.objects).toHaveLength(2);
        return new Response(JSON.stringify({ upload_token: 'upload-token' }), { status: 200 });
      }
      if (url.includes('/api/objects/batch')) {
        const parsed = JSON.parse(init.body as string) as {
          upload_token: string;
          objects: Array<{ storage_ref: string; content_base64: string }>;
        };
        expect(parsed.upload_token).toBe('upload-token');
        expect(parsed.objects).toHaveLength(2);
        return new Response(
          JSON.stringify({
            objects: parsed.objects.map((object) => ({
              storage_ref: object.storage_ref,
              status: 'available',
              size_bytes: Buffer.from(object.content_base64, 'base64').byteLength,
              sha256: `sha256:${object.storage_ref.split('/').at(-1)}`,
            })),
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 207 });
    });
    const priorNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    enableTestVelaTelemetry();
    process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL = 'https://telemetry.open-design.ai/api/langfuse';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [
            {
              id: 'user-1',
              role: 'user',
              content: 'Use this reference.',
              attachments: [
                {
                  path: 'brief.txt',
                  name: 'brief.txt',
                  size: 'private attachment body'.length,
                },
              ],
            },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'Done.',
              producedFiles: [{ name: 'index.html', kind: 'html', size: 41 }],
            },
          ],
        }),
        dataDir,
        run: makeRun({
          userPrompt: 'Use this reference.',
          projectAttachmentPaths: ['brief.txt'],
        }) as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      if (priorNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = priorNodeEnv;
      }
      delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(fetchSpy.mock.calls[0]![0]).toBe(TEST_VELA_TELEMETRY_URL);
    expect(fetchSpy.mock.calls[1]![0]).toBe('https://telemetry.open-design.ai/api/objects/authorize');
    expect(fetchSpy.mock.calls[2]![0]).toBe('https://telemetry.open-design.ai/api/objects/batch');
    expect(fetchSpy.mock.calls[3]![0]).toBe(TEST_VELA_TELEMETRY_URL);
    const telemetryBody = fetchSpy.mock.calls[3]![1]!.body as string;
    expect(telemetryBody).not.toContain('private attachment body');
    expect(telemetryBody).not.toContain('<!doctype html><h1>private artifact</h1>');
    const trace = velaTraceBody(fetchSpy.mock.calls[3] as [string, RequestInit]);
    expect(trace.metadata.manifest_completeness).toBe('complete');
    expect(trace.metadata.attachment_manifest[0]).toMatchObject({
      object_class: 'attachment',
      status: 'ok',
      stored_in_open_design: true,
      size_bytes: 'private attachment body'.length,
    });
    expect(trace.metadata.artifact_manifest[0]).toMatchObject({
      object_class: 'artifact',
      status: 'ok',
      stored_in_open_design: true,
      size_bytes: '<!doctype html><h1>private artifact</h1>'.length,
    });
  });

  it('uploads trace objects with Vela-issued authority before reporting final manifests', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
    });
    const projectDir = path.join(dataDir, 'projects', 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, 'brief.txt'),
      'attachment body should stay out of langfuse',
    );
    await writeFile(
      path.join(projectDir, 'index.html'),
      '<!doctype html><h1>artifact body</h1>',
    );
    const tailMarker = 'TAIL_MARKER_SHOULD_NOT_REACH_LANGFUSE';
    const prompt = `${'长'.repeat(70 * 1024)}${tailMarker}`;
    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      if (url === TEST_VELA_TELEMETRY_URL) {
        return new Response(JSON.stringify({ ok: true }), { status: 202 });
      }
      if (url.includes('/api/objects/authorize')) {
        const parsed = JSON.parse(init.body as string) as {
          objects: Array<{ storage_ref: string; sha256: string; size_bytes: number }>;
        };
        expect(parsed.objects).toHaveLength(3);
        expect(parsed.objects.every((object) => /^sha256:[a-f0-9]{64}$/.test(object.sha256)))
          .toBe(true);
        expect(parsed.objects.map((object) => object.size_bytes)).toEqual([
          'attachment body should stay out of langfuse'.length,
          '<!doctype html><h1>artifact body</h1>'.length,
          Buffer.byteLength(prompt, 'utf8'),
        ]);
        return new Response(JSON.stringify({ upload_token: 'upload-token' }), { status: 200 });
      }
      if (url.includes('/api/objects/batch')) {
        const parsed = JSON.parse(init.body as string) as {
          upload_token: string;
          objects: Array<{ storage_ref: string; content_base64: string }>;
        };
        expect(parsed.upload_token).toBe('upload-token');
        expect(parsed.objects).toHaveLength(3);
        return new Response(
          JSON.stringify({
            objects: parsed.objects.map((object) => ({
              storage_ref: object.storage_ref,
              status: 'available',
              size_bytes: Buffer.from(object.content_base64, 'base64').byteLength,
              sha256: `sha256:${object.storage_ref.split('/').at(-1)}`,
            })),
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 207 });
    });

    enableTestVelaTelemetry();
    process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL = 'https://telemetry.open-design.ai/api/langfuse';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [
            {
              id: 'user-1',
              role: 'user',
              content: prompt,
              attachments: [
                {
                  path: 'brief.txt',
                  name: 'brief.txt',
                  size: 'attachment body should stay out of langfuse'.length,
                },
              ],
            },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'done',
              producedFiles: [{ name: 'index.html', kind: 'html', size: 35 }],
            },
          ],
        }),
        dataDir,
        run: makeRun({
          userPrompt: prompt,
          projectAttachmentPaths: ['brief.txt'],
        }) as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(fetchSpy.mock.calls[0]![0]).toBe(TEST_VELA_TELEMETRY_URL);
    const registrationTrace = velaTraceBody(
      fetchSpy.mock.calls[0] as [string, RequestInit],
    );
    expect(registrationTrace).not.toHaveProperty('input');
    expect(registrationTrace).not.toHaveProperty('output');
    expect(registrationTrace.metadata.attachment_manifest[0]).not.toHaveProperty('reason');
    expect(registrationTrace.metadata.artifact_manifest[0]).not.toHaveProperty('reason');
    expect(registrationTrace.metadata.input_text_snapshot_manifest[0]).not.toHaveProperty('reason');
    expect(fetchSpy.mock.calls[1]![0]).toContain('/api/objects/authorize');
    expect(fetchSpy.mock.calls[2]![0]).toContain('/api/objects/batch');
    expect(fetchSpy.mock.calls[3]![0]).toBe(TEST_VELA_TELEMETRY_URL);
    const telemetryBody = fetchSpy.mock.calls[3]![1]!.body as string;
    expect(telemetryBody).not.toContain('attachment body should stay out of langfuse');
    expect(telemetryBody).not.toContain('<!doctype html><h1>artifact body</h1>');
    expect(telemetryBody).not.toContain(tailMarker);
    const trace = velaTraceBody(fetchSpy.mock.calls[3] as [string, RequestInit]);
    expect(trace.metadata.manifest_completeness).toBe('complete');
    expect(trace.metadata.attachment_manifest).toHaveLength(1);
    expect(trace.metadata.artifact_manifest).toHaveLength(1);
    expect(trace.metadata.input_text_snapshot_manifest).toHaveLength(1);
    expect(trace.metadata.attachment_manifest[0]).toMatchObject({
      object_class: 'attachment',
      status: 'ok',
      stored_in_open_design: true,
      source: 'user_upload',
      retention_policy: 'observability_90d',
      access_scope: 'project',
      sensitivity: 'private',
    });
    expect(trace.metadata.attachment_manifest[0]).not.toHaveProperty('reason');
    expect(trace.metadata.artifact_manifest[0]).toMatchObject({
      object_class: 'artifact',
      status: 'ok',
      stored_in_open_design: true,
      source: 'agent_generated',
      retention_policy: 'observability_90d',
    });
    expect(trace.metadata.artifact_manifest[0]).not.toHaveProperty('reason');
    expect(trace.metadata.input_text_snapshot_manifest[0]).toMatchObject({
      object_class: 'input_text_snapshot',
      status: 'ok',
      stored_in_open_design: true,
      source: 'user_prompt',
    });
    expect(trace.metadata.input_text_snapshot_manifest[0]).not.toHaveProperty('reason');
    expect(JSON.stringify(trace.metadata)).toContain(
      'od://objects/workspaces/unknown/projects/proj-1/runs/run-id-1',
    );
  });

  it('reports a consented direct completion without an anonymous registration trace', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
    });
    const projectDir = path.join(dataDir, 'projects', 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'index.html'), '<!doctype html><h1>artifact body</h1>');
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 207 }));

    const velaTelemetryEnabled = process.env.OPEN_DESIGN_VELA_TELEMETRY;
    const velaControlKey = process.env.VELA_CONTROL_KEY;
    const amrHome = process.env.AMR_HOME;
    process.env.OPEN_DESIGN_VELA_TELEMETRY = 'on';
    delete process.env.VELA_CONTROL_KEY;
    process.env.AMR_HOME = path.join(dataDir, 'signed-out-amr-home');
    process.env.OPEN_DESIGN_OBJECT_RELAY_URL =
      'https://telemetry.open-design.ai/api/objects/batch';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [
            { id: 'user-1', role: 'user', content: 'Build it.' },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'done',
              producedFiles: [{ name: 'index.html', kind: 'html', size: 35 }],
            },
          ],
        }),
        dataDir,
        run: makeRun({ userPrompt: 'Build it.' }) as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      if (velaTelemetryEnabled === undefined) delete process.env.OPEN_DESIGN_VELA_TELEMETRY;
      else process.env.OPEN_DESIGN_VELA_TELEMETRY = velaTelemetryEnabled;
      if (velaControlKey === undefined) delete process.env.VELA_CONTROL_KEY;
      else process.env.VELA_CONTROL_KEY = velaControlKey;
      if (amrHome === undefined) delete process.env.AMR_HOME;
      else process.env.AMR_HOME = amrHome;
      delete process.env.OPEN_DESIGN_OBJECT_RELAY_URL;
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    expect(fetchSpy.mock.calls.map((call) => call[0])).toEqual([
      'https://us.cloud.langfuse.com/api/public/ingestion',
    ]);
    const batch = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string).batch as any[];
    const trace = batch[0].body;
    expect(trace.input).toBe('Build it.');
    expect(trace.output).toBe('done');
    expect(trace.metadata.registration_only).not.toBe(true);
  });

  it('reports a consented relay completion without anonymous registration or object upload', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
    });
    const projectDir = path.join(dataDir, 'projects', 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'index.html'), '<!doctype html><h1>artifact body</h1>');
    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 207 }));

    const velaTelemetryEnabled = process.env.OPEN_DESIGN_VELA_TELEMETRY;
    const velaControlKey = process.env.VELA_CONTROL_KEY;
    const amrHome = process.env.AMR_HOME;
    process.env.OPEN_DESIGN_VELA_TELEMETRY = 'on';
    delete process.env.VELA_CONTROL_KEY;
    process.env.AMR_HOME = path.join(dataDir, 'signed-out-relay-amr-home');
    process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL =
      'https://telemetry.open-design.ai/api/langfuse';
    process.env.OPEN_DESIGN_OBJECT_RELAY_URL =
      'https://telemetry.open-design.ai/api/objects/batch';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [
            { id: 'user-1', role: 'user', content: 'Build it through relay.' },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'relay done',
              producedFiles: [{ name: 'index.html', kind: 'html', size: 35 }],
            },
          ],
        }),
        dataDir,
        run: makeRun({ userPrompt: 'Build it through relay.' }) as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      if (velaTelemetryEnabled === undefined) delete process.env.OPEN_DESIGN_VELA_TELEMETRY;
      else process.env.OPEN_DESIGN_VELA_TELEMETRY = velaTelemetryEnabled;
      if (velaControlKey === undefined) delete process.env.VELA_CONTROL_KEY;
      else process.env.VELA_CONTROL_KEY = velaControlKey;
      if (amrHome === undefined) delete process.env.AMR_HOME;
      else process.env.AMR_HOME = amrHome;
      delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
      delete process.env.OPEN_DESIGN_OBJECT_RELAY_URL;
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).toBe(
      'https://telemetry.open-design.ai/api/langfuse',
    );
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/api/objects/')))
      .toBe(false);
    const batch = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string).batch as any[];
    expect(batch.filter((event) => event.type === 'trace-create')).toHaveLength(1);
    const trace = bodyOf(batch, 'trace-create');
    expect(trace.input).toBe('Build it through relay.');
    expect(trace.output).toBe('relay done');
    expect(trace.metadata).not.toHaveProperty('registration_only');
  });

  it('registers object authority through Vela without an anonymous trace shell', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
    });
    const projectDir = path.join(dataDir, 'projects', 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'index.html'), '<!doctype html><h1>artifact body</h1>');

    const velaEnvelopes: any[] = [];
    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      if (url === 'https://vela.example.test/api/v1/open-design/telemetry') {
        const envelope = JSON.parse(init.body as string);
        velaEnvelopes.push(envelope);
        return new Response(JSON.stringify({ ok: true }), { status: 202 });
      }
      if (url === 'https://telemetry.open-design.ai/api/objects/authorize') {
        const parsed = JSON.parse(init.body as string) as {
          run_id: string;
          objects: Array<{ storage_ref: string }>;
        };
        expect(parsed.run_id).toBe('run-id-1');
        expect(parsed.objects[0]?.storage_ref).toContain('/runs/run-id-1/');
        return new Response(JSON.stringify({ upload_token: 'upload-token' }), { status: 200 });
      }
      if (url === 'https://telemetry.open-design.ai/api/objects/batch') {
        const parsed = JSON.parse(init.body as string) as {
          run_id: string;
          objects: Array<{ storage_ref: string; content_base64: string }>;
        };
        expect(parsed.run_id).toBe('run-id-1');
        expect(parsed.objects[0]?.storage_ref).toContain('/runs/run-id-1/');
        return new Response(JSON.stringify({
          objects: parsed.objects.map((object) => ({
            storage_ref: object.storage_ref,
            status: 'available',
            size_bytes: Buffer.from(object.content_base64, 'base64').byteLength,
            sha256: 'sha256:uploaded-artifact',
          })),
        }), { status: 200 });
      }
      throw new Error(`unexpected telemetry request: ${url}`);
    });

    const velaTelemetryEnabled = process.env.OPEN_DESIGN_VELA_TELEMETRY;
    const velaControlKey = process.env.VELA_CONTROL_KEY;
    const velaApiUrl = process.env.VELA_API_URL;
    process.env.OPEN_DESIGN_VELA_TELEMETRY = 'on';
    process.env.VELA_CONTROL_KEY = 'ck_test';
    process.env.VELA_API_URL = 'https://vela.example.test';
    process.env.OPEN_DESIGN_OBJECT_RELAY_URL =
      'https://telemetry.open-design.ai/api/objects/batch';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [
            { id: 'user-1', role: 'user', content: 'Build it.' },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'done',
              producedFiles: [{ name: 'index.html', kind: 'html', size: 35 }],
            },
          ],
        }),
        dataDir,
        run: makeRun() as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      if (velaTelemetryEnabled === undefined) delete process.env.OPEN_DESIGN_VELA_TELEMETRY;
      else process.env.OPEN_DESIGN_VELA_TELEMETRY = velaTelemetryEnabled;
      if (velaControlKey === undefined) delete process.env.VELA_CONTROL_KEY;
      else process.env.VELA_CONTROL_KEY = velaControlKey;
      if (velaApiUrl === undefined) delete process.env.VELA_API_URL;
      else process.env.VELA_API_URL = velaApiUrl;
      delete process.env.OPEN_DESIGN_OBJECT_RELAY_URL;
    }

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(velaEnvelopes).toHaveLength(2);
    expect(fetchSpy.mock.calls.map((call) => call[0])).not.toContain(
      'https://telemetry.open-design.ai/api/langfuse',
    );

    const velaRegistrationEvent = velaEnvelopes[0].events.find(
      (event: { kind: string }) => event.kind === 'trace',
    );
    const velaRegistrationTrace = velaRegistrationEvent.data;
    expect(velaRegistrationTrace.id).toBe('run-id-1');
    expect(velaRegistrationTrace.metadata.registration_only).toBe(true);
    expect(velaRegistrationTrace.metadata.artifact_manifest[0]).toMatchObject({
      run_id: 'run-id-1',
      storage_ref: expect.stringContaining('/runs/run-id-1/'),
    });
    expect(velaRegistrationTrace).not.toHaveProperty('input');
    expect(velaRegistrationTrace).not.toHaveProperty('output');

    const velaFinalEvent = velaEnvelopes[1].events.find(
      (event: { kind: string }) => event.kind === 'trace',
    );
    const velaFinalTrace = velaFinalEvent.data;
    expect(velaFinalEvent.id).not.toBe(velaRegistrationEvent.id);
    expect(velaFinalTrace.id).toBe('run-id-1');
    expect(velaFinalTrace).toHaveProperty('input');
    expect(velaFinalTrace).toHaveProperty('output');
    expect(velaFinalTrace.metadata.artifact_manifest[0]).toMatchObject({
      run_id: 'run-id-1',
      storage_ref: expect.stringContaining('/runs/run-id-1/'),
      status: 'ok',
      stored_in_open_design: true,
    });
  });

  it('uploads modified existing files from traceObjectFiles and records object summary metadata', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
    });
    const projectDir = path.join(dataDir, 'projects', 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'existing.html'), '<!doctype html><h1>modified</h1>');
    const uploadedFilenames: string[] = [];
    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      if (url === TEST_VELA_TELEMETRY_URL) {
        return new Response(JSON.stringify({ ok: true }), { status: 202 });
      }
      if (url.includes('/api/objects/authorize')) {
        return new Response(JSON.stringify({ upload_token: 'upload-token' }), { status: 200 });
      }
      if (url.includes('/api/objects/batch')) {
        const parsed = JSON.parse(init.body as string) as {
          objects: Array<{ storage_ref: string; filename: string; content_base64: string }>;
        };
        uploadedFilenames.push(...parsed.objects.map((object) => object.filename));
        return new Response(
          JSON.stringify({
            objects: parsed.objects.map((object) => ({
              storage_ref: object.storage_ref,
              status: 'available',
              size_bytes: Buffer.from(object.content_base64, 'base64').byteLength,
              sha256: 'sha256:uploaded-artifact',
            })),
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 207 });
    });

    enableTestVelaTelemetry();
    process.env.OPEN_DESIGN_OBJECT_RELAY_URL = 'https://telemetry.open-design.ai/api/objects/batch';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [
            { id: 'user-1', role: 'user', content: 'Update the existing page.' },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'done',
              producedFiles: [],
              traceObjectFiles: [
                {
                  name: 'existing.html',
                  kind: 'html',
                  size: 34,
                  traceObjectReason: 'modified',
                },
              ],
            },
          ],
        }),
        dataDir,
        run: makeRun() as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.OPEN_DESIGN_OBJECT_RELAY_URL;
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    expect(uploadedFilenames).toEqual(['existing.html']);
    const finalTrace = velaTraceBody(
      fetchSpy.mock.calls.at(-1) as [string, RequestInit],
    );
    expect(finalTrace.metadata.trace_object_summary).toEqual({
      new_file_count: 0,
      modified_file_count: 1,
      recovered_file_count: 0,
      candidate_file_count: 1,
      uploaded_file_count: 1,
      skipped_file_count: 0,
      skip_reasons: {},
    });
    expect(finalTrace.metadata.artifacts).toEqual([
      { slug: 'existing.html', type: 'html', sizeBytes: 34 },
    ]);
  });

  it('derives manifest completeness from merged uploaded and fallback manifests', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
    });
    const projectDir = path.join(dataDir, 'projects', 'proj-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, 'index.html'), '<!doctype html><h1>artifact body</h1>');
    const fetchSpy = vi.fn(async (url: string, init: RequestInit) => {
      if (url === TEST_VELA_TELEMETRY_URL) {
        return new Response(JSON.stringify({ ok: true }), { status: 202 });
      }
      if (url.includes('/api/objects/authorize')) {
        const parsed = JSON.parse(init.body as string) as {
          objects: Array<{ storage_ref: string; object_class: string }>;
        };
        expect(parsed.objects).toHaveLength(1);
        expect(parsed.objects[0]).toMatchObject({ object_class: 'artifact' });
        return new Response(JSON.stringify({ upload_token: 'upload-token' }), { status: 200 });
      }
      if (url.includes('/api/objects/batch')) {
        const parsed = JSON.parse(init.body as string) as {
          objects: Array<{ storage_ref: string; content_base64: string }>;
        };
        return new Response(
          JSON.stringify({
            objects: parsed.objects.map((object) => ({
              storage_ref: object.storage_ref,
              status: 'available',
              size_bytes: Buffer.from(object.content_base64, 'base64').byteLength,
              sha256: 'sha256:uploaded-artifact',
            })),
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 207 });
    });

    enableTestVelaTelemetry();
    process.env.OPEN_DESIGN_OBJECT_RELAY_URL = 'https://telemetry.open-design.ai/api/objects/batch';
    process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL = 'https://telemetry.open-design.ai/api/langfuse';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [
            {
              id: 'user-1',
              role: 'user',
              content: 'Use the attached reference.',
              attachments: [{ path: 'uploads/brand.pdf', kind: 'file' }],
            },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'done',
              producedFiles: [{ name: 'index.html', kind: 'html', size: 35 }],
            },
          ],
        }),
        dataDir,
        run: makeRun() as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.OPEN_DESIGN_OBJECT_RELAY_URL;
      delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    expect(fetchSpy).toHaveBeenCalledTimes(4);
    expect(fetchSpy.mock.calls[0]![0]).toBe(TEST_VELA_TELEMETRY_URL);
    expect(fetchSpy.mock.calls[1]![0]).toContain('/api/objects/authorize');
    expect(fetchSpy.mock.calls[2]![0]).toContain('/api/objects/batch');
    expect(fetchSpy.mock.calls[3]![0]).toBe(TEST_VELA_TELEMETRY_URL);
    const trace = velaTraceBody(fetchSpy.mock.calls[3] as [string, RequestInit]);
    expect(trace.metadata.manifest_completeness).toBe('partial');
    expect(trace.metadata.attachment_manifest[0]).toMatchObject({
      object_class: 'attachment',
      status: 'partial',
      reason: 'size_unavailable',
    });
    expect(trace.metadata.artifact_manifest[0]).toMatchObject({
      object_class: 'artifact',
      status: 'ok',
      stored_in_open_design: true,
    });
  });

  it('reports imported project nested artifact manifests without leaking raw paths to Langfuse', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
    });
    const importedRoot = path.join(dataDir, 'imported-project');
    const managedRoot = path.join(dataDir, 'projects', 'proj-1');
    await mkdir(path.join(importedRoot, 'dist'), { recursive: true });
    await mkdir(managedRoot, { recursive: true });
    await writeFile(path.join(importedRoot, 'dist', 'index.html'), '<!doctype html><h1>imported</h1>');
    await writeFile(path.join(managedRoot, 'index.html'), '<!doctype html><h1>managed</h1>');

    const fetchSpy = vi.fn().mockResolvedValue(new Response('{}', { status: 207 }));

    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [
            { id: 'user-1', role: 'user', content: 'Create a nested artifact.' },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'Done.',
              producedFiles: [
                { name: 'index.html', path: 'dist/index.html', kind: 'html', size: 31 },
              ],
            },
          ],
        }),
        dataDir,
        run: makeRun({
          projectMetadata: { baseDir: importedRoot },
        }) as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]![0]).not.toContain('/api/objects/batch');
    const langfuseInit = fetchSpy.mock.calls[0]![1] as RequestInit;
    const langfuseBody = langfuseInit.body as string;
    expect(langfuseBody).not.toContain(importedRoot);
    expect(langfuseBody).not.toContain('dist/index.html');
    expect(langfuseBody).not.toContain('<!doctype html><h1>imported</h1>');
    const batch = JSON.parse(langfuseBody).batch as any[];
    const trace = batch[0].body;
    expect(trace.metadata.artifacts).toEqual([
      { slug: 'index.html', type: 'html', sizeBytes: 31 },
    ]);
    expect(trace.metadata.artifact_manifest[0]).toMatchObject({
      object_class: 'artifact',
      status: 'ok',
      stored_in_open_design: true,
      extension: 'html',
    });
  });

  it('carries prior user attachments into follow-up generation traces', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
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
              id: 'user-1',
              role: 'user',
              content: 'Use this private reference.',
              attachments: [
                {
                  path: 'uploads/private-reference.md',
                  name: 'private-reference.md',
                  size: 562,
                },
              ],
            },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: 'Please answer the discovery form.',
            },
            {
              id: 'user-2',
              role: 'user',
              content: '[form answers — discovery]\nBuild the artifact.',
            },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'Done.',
              producedFiles: [
                { name: 'index.html', kind: 'html', size: 4096 },
              ],
            },
          ],
        }),
        dataDir,
        run: (() => {
          const now = Date.now();
          return makeRun({
            analyticsTelemetry: {
              promptBuildStartAt: now - 4300,
              promptBuildEndAt: now - 4200,
            },
            promptTelemetry: buildPromptStackTelemetry({
              composedPrompt:
                '# Instructions\n\nBuild the artifact.\n\n---\n# User request\n\n[form answers — discovery]\nBuild the artifact.',
              sections: [
                { kind: 'daemonSystemPrompt', content: 'Build the artifact.' },
                {
                  kind: 'userRequest',
                  content: '[form answers — discovery]\nBuild the artifact.',
                },
              ],
            }),
          });
        })() as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const batch = JSON.parse(init.body as string).batch as any[];
    const trace = batch[0].body;
    const promptBuild = bodyOf(batch, 'span-create', 'prompt-build');
    expect(trace.metadata.attachment_manifest).toHaveLength(1);
    expect(trace.metadata.attachment_manifest[0]).toMatchObject({
      object_class: 'attachment',
      status: 'ok',
      size_bytes: 562,
      extension: 'md',
      source: 'user_upload',
      project_id: 'proj-1',
      run_id: 'run-id-1',
    });
    expect(promptBuild.input.ingredients.attachment_refs).toEqual([
      expect.objectContaining({
        object_class: 'attachment',
        status: 'ok',
        size_bytes: 562,
        extension: 'md',
        source: 'user_upload',
        attachment_id: trace.metadata.attachment_manifest[0].attachment_id,
      }),
    ]);
    const payload = JSON.stringify(batch);
    expect(payload).not.toContain('private-reference.md');
    expect(payload).not.toContain('uploads/private-reference.md');
  });

  it('counts duplicate streamed tool_use records by unique tool id', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: false },
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
            { id: 'user-1', role: 'user', content: 'Create a file.' },
            { id: 'msg-1', role: 'assistant', content: 'Done.', producedFiles: [] },
          ],
        }),
        dataDir,
        run: makeRun({
          events: [
            {
              id: 1,
              event: 'agent',
              timestamp: Date.now() - 3000,
              data: {
                type: 'tool_use',
                id: 'write-1',
                name: 'Write',
                input: { path: 'index.html', content: '<!doctype html>' },
              },
            },
            {
              id: 2,
              event: 'agent',
              timestamp: Date.now() - 2900,
              data: {
                type: 'tool_use',
                id: 'write-1',
                name: 'Write',
                input: { path: 'index.html', content: '<!doctype html>' },
              },
            },
            {
              id: 3,
              event: 'agent',
              timestamp: Date.now() - 2500,
              data: {
                type: 'tool_result',
                toolUseId: 'write-1',
                content: 'wrote index.html',
                isError: false,
              },
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
    const trace = batch[0].body;
    const toolSpans = batch.filter(
      (item) => item.type === 'span-create' && item.body.name === 'tool:Write',
    );
    expect(trace.metadata.eventsSummary.toolCalls).toBe(1);
    expect(trace.metadata.eventsSummary.errors).toBe(0);
    expect(toolSpans).toHaveLength(1);
  });

  it('redacts content-tool payloads and local paths from tool observations', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
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
              id: 'user-1',
              role: 'user',
              content: 'Use this private reference.',
              attachments: [{ path: 'uploads/private-brand-reference.txt', name: 'private-brand-reference.txt', size: 247 }],
            },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'Done.',
              producedFiles: [],
            },
          ],
        }),
        dataDir,
        run: makeRun({
          events: [
            {
              id: 1,
              event: 'agent',
              data: {
                type: 'tool_use',
                id: 'read-1',
                name: 'Read',
                input: { file_path: '/Users/alice/project/private-brand-reference.txt' },
              },
            },
            {
              id: 2,
              event: 'agent',
              data: {
                type: 'tool_result',
                toolUseId: 'read-1',
                content: 'Private brand reference: do not upload raw content',
                isError: false,
              },
            },
            {
              id: 3,
              event: 'agent',
              data: {
                type: 'tool_use',
                id: 'write-1',
                name: 'Write',
                input: { file_path: '/Users/alice/project/index.html', content: '<!doctype html><html>heavy</html>' },
              },
            },
            {
              id: 4,
              event: 'agent',
              data: {
                type: 'tool_result',
                toolUseId: 'write-1',
                content: 'File created successfully at: /Users/alice/project/index.html',
                isError: false,
              },
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
    const read = bodyOf(batch, 'span-create', 'tool:Read');
    const write = bodyOf(batch, 'span-create', 'tool:Write');
    expect(read.input).toBe('[REDACTED:tool_input:content_tool:Read]');
    expect(read.output).toBe('[REDACTED:tool_output:content_tool:Read]');
    expect(write.input).toBe('[REDACTED:tool_input:content_tool:Write]');
    expect(write.output).toBe('[REDACTED:tool_output:content_tool:Write]');
    const payload = JSON.stringify(batch);
    expect(payload).not.toContain('Private brand reference');
    expect(payload).not.toContain('/Users/alice/project');
    expect(payload).not.toContain('<!doctype html>');
  });

  it('redacts lowercase ACP content-tool names like read/write', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    const now = Date.now();
    const toolStartedAt = now - 4000;
    const toolEndedAt = now - 500;
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [
            {
              id: 'user-1',
              role: 'user',
              content: 'Use this private reference.',
              attachments: [],
            },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'Done.',
              producedFiles: [],
            },
          ],
        }),
        dataDir,
        run: makeRun({
          createdAt: now - 4500,
          updatedAt: now,
          events: [
            {
              id: 1,
              event: 'agent',
              // Event log time is late (terminal); startedAt is first frame.
              timestamp: toolEndedAt,
              data: {
                type: 'tool_use',
                id: 'read-lc',
                name: 'read',
                input: { file_path: '/Users/alice/secret.txt', content: 'SECRET_BODY' },
                startedAt: toolStartedAt,
              },
            },
            {
              id: 2,
              event: 'agent',
              timestamp: toolEndedAt,
              data: {
                type: 'tool_result',
                toolUseId: 'read-lc',
                content: 'SECRET_BODY',
                isError: false,
              },
            },
            {
              id: 3,
              event: 'agent',
              timestamp: toolEndedAt,
              data: {
                type: 'tool_use',
                id: 'write-lc',
                name: 'write',
                input: { file_path: '/Users/alice/out.html', content: '<html>SECRET</html>' },
              },
            },
            {
              id: 4,
              event: 'agent',
              timestamp: toolEndedAt,
              data: {
                type: 'tool_result',
                toolUseId: 'write-lc',
                content: 'ok',
                isError: false,
              },
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
    // Lowercase ACP kind tokens are canonicalized to Title-case family labels.
    const read = bodyOf(batch, 'span-create', 'tool:Read');
    const write = bodyOf(batch, 'span-create', 'tool:Write');
    expect(read.input).toBe('[REDACTED:tool_input:content_tool:Read]');
    expect(read.output).toBe('[REDACTED:tool_output:content_tool:Read]');
    expect(write.input).toBe('[REDACTED:tool_input:content_tool:Write]');
    expect(write.output).toBe('[REDACTED:tool_output:content_tool:Write]');
    // startedAt on tool_use should drive span startTime earlier than event log ts.
    expect(new Date(read.startTime).getTime()).toBe(toolStartedAt);
    const payload = JSON.stringify(batch);
    expect(payload).not.toContain('SECRET_BODY');
    expect(payload).not.toContain('<html>SECRET</html>');
  });

  it('fail-closed redacts kind:other custom ACP tool payloads (unknown tool names)', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: true },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    const now = Date.now();
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [
            {
              id: 'user-1',
              role: 'user',
              content: 'Read secrets via MCP.',
              attachments: [],
            },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'Done.',
              producedFiles: [],
            },
          ],
        }),
        dataDir,
        run: makeRun({
          createdAt: now - 2000,
          updatedAt: now,
          events: [
            {
              id: 1,
              event: 'agent',
              data: {
                type: 'tool_use',
                id: 'custom-mcp-1',
                // ACP kind:other preserves arbitrary adapter/MCP names.
                name: 'mcp__filesystem__read_file',
                input: {
                  path: '/Users/alice/secrets.env',
                },
              },
            },
            {
              id: 2,
              event: 'agent',
              data: {
                type: 'tool_result',
                toolUseId: 'custom-mcp-1',
                content: 'API_KEY=super-secret\nPASSWORD=also-secret\n',
                isError: false,
              },
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
    // Span label + toolName metadata use the allowlisted `other` family only.
    const custom = bodyOf(batch, 'span-create', 'tool:other');
    expect(custom.metadata.toolName).toBe('other');
    expect(custom.input).toBe('[REDACTED:tool_input:unknown_tool]');
    expect(custom.output).toBe('[REDACTED:tool_output:unknown_tool]');
    const payload = JSON.stringify(batch);
    expect(payload).not.toContain('super-secret');
    expect(payload).not.toContain('also-secret');
    expect(payload).not.toContain('/Users/alice/secrets.env');
    expect(payload).not.toContain('mcp__filesystem__read_file');
  });

  it('redacts Linux home paths in ACP Bash tool inputs when content telemetry is on', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: false },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    const now = Date.now();
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [
            {
              id: 'user-1',
              role: 'user',
              content: 'Check env.',
              attachments: [],
            },
            {
              id: 'msg-1',
              role: 'assistant',
              content: 'Done.',
              producedFiles: [],
            },
          ],
        }),
        dataDir,
        run: makeRun({
          createdAt: now - 2000,
          updatedAt: now,
          events: [
            {
              id: 1,
              event: 'agent',
              data: {
                type: 'tool_use',
                id: 'bash-linux-1',
                name: 'Bash',
                input: { command: 'cat /home/alice/.env' },
              },
            },
            {
              id: 2,
              event: 'agent',
              data: {
                type: 'tool_result',
                toolUseId: 'bash-linux-1',
                content: 'KEY=value',
                isError: false,
              },
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
    const bash = bodyOf(batch, 'span-create', 'tool:Bash');
    expect(bash.input).toContain('[REDACTED:local_path]');
    expect(bash.input).toContain('cat');
    expect(bash.input).not.toContain('/home/alice');
    expect(JSON.stringify(batch)).not.toContain('/home/alice/.env');
  });

  it('forwards run prompt telemetry into trace and generation metadata', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: false },
    });
    const promptTelemetry = buildPromptStackTelemetry({
      composedPrompt:
        '# Instructions\n\nUse /Users/alice/project\n\n---\n# User request\n\ndesign a coffee landing page',
      sections: [
        { kind: 'daemonSystemPrompt', content: 'Use /Users/alice/project' },
        { kind: 'userRequest', content: 'design a coffee landing page' },
      ],
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({
          'conv-1': [{ id: 'msg-1', role: 'assistant', content: 'Here is a draft …' }],
        }),
        dataDir,
        run: makeRun({ promptTelemetry } as any) as any,
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
    expect(trace.input).toBe('design a coffee landing page');
    expect(generation.input).toMatchObject({
      type: 'open-design.prompt-stack',
      sections: [
        expect.objectContaining({
          kind: 'daemonSystemPrompt',
          redactedContent: expect.stringContaining('[REDACTED:path]'),
        }),
        expect.objectContaining({
          kind: 'userRequest',
          redactedContent: 'design a coffee landing page',
        }),
      ],
    });
    expect(trace.metadata.promptStack).toBeUndefined();
    expect(generation.metadata.promptStack).toBeUndefined();
    expect(trace.metadata.promptStack_sectionCount).toBe(2);
    expect(generation.metadata.promptStack_sectionCount).toBe(2);
    expect(trace.metadata.promptStack_promptFingerprint).toEqual(
      generation.metadata.promptStack_promptFingerprint,
    );
  });

  it('attaches turn-level config (model / reasoning / skill / DS) to trace + generation', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-1',
      telemetry: { metrics: true, content: true, artifactManifest: false },
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
          designSystemDigest: 'digest-abc',
          designSystemSelectionSource: 'project',
          promptCache: {
            stablePromptHash: 'stable-hash-1',
            hit: true,
            missReason: null,
          },
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
    expect(trace.metadata.designSystemDigest).toBe('digest-abc');
    expect(trace.metadata.designSystemSelectionSource).toBe('project');
    expect(trace.metadata.stablePromptHash).toBe('stable-hash-1');
    expect(trace.metadata.stablePromptCacheHit).toBe(true);
    expect(trace.metadata.stablePromptCacheMissReason).toBeNull();
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

  it('labels turn.model with the agent-reported model on default-model runs', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-2',
      telemetry: { metrics: true, content: true, artifactManifest: false },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      const run = makeRun({
        // Request did not pin a model (the `default` placeholder), so the
        // resolved model must come from the agent's reported status event —
        // matching the agent-reported fallback server.ts uses for PostHog.
        model: 'default',
      }) as any;
      run.events.unshift({
        id: 0,
        event: 'agent',
        timestamp: run.createdAt + 10,
        data: { type: 'status', label: 'model', model: 'claude-opus-4-1' },
      });
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({ 'conv-1': [] }),
        dataDir,
        run,
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

    expect(trace.metadata.model).toBe('claude-opus-4-1');
    expect(trace.tags).toEqual(
      expect.arrayContaining(['model:claude-opus-4-1']),
    );
    expect(generation.model).toBe('claude-opus-4-1');
  });

  it('labels a preflight failure with its resolved model and CLI version', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-preflight',
      telemetry: { metrics: true, content: true, artifactManifest: false },
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
          agentId: 'codex',
          model: 'default',
          resolvedModelId: 'gpt-5.6-terra',
          preflightAgentCliVersion: 'codex-cli 0.142.5',
        }) as any,
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

    expect(trace.metadata.model).toBe('gpt-5.6-terra');
    expect(trace.metadata.agentCliVersion).toBe('codex-cli 0.142.5');
    expect(trace.tags).toEqual(expect.arrayContaining(['model:gpt-5.6-terra']));
    expect(generation.model).toBe('gpt-5.6-terra');
  });

  it('forwards token usage for a totalTokens-only usage event', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-3',
      telemetry: { metrics: true, content: true, artifactManifest: false },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      const run = makeRun() as any;
      // A provider that only reports an aggregate total — no input/output
      // breakdown. scanRunEventsForUsageAnalytics still surfaces total_tokens,
      // and the bridge must carry it through to Langfuse so the per-trace UI
      // does not lose token visibility and stays consistent with PostHog.
      run.events = [
        {
          id: 1,
          event: 'agent',
          timestamp: run.createdAt + 1000,
          data: { type: 'usage', usage: { total_tokens: 512 } },
        },
      ];
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({ 'conv-1': [] }),
        dataDir,
        run,
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
    // total_tokens must reach the trace metadata even with no input/output.
    expect(trace.metadata.tokens).toBeTruthy();
    expect(trace.metadata.tokens.total).toBe(512);
    expect(trace.metadata.tokens.input).toBeUndefined();
    expect(trace.metadata.tokens.output).toBeUndefined();
    // …and onto the Langfuse generation usage so cost/token views populate.
    expect(generation.usage.total).toBe(512);
  });

  it('forwards thought_tokens from ACP-shaped usage into Langfuse metadata', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-thought',
      telemetry: { metrics: true, content: true, artifactManifest: false },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      const run = makeRun() as any;
      run.events = [
        {
          id: 1,
          event: 'agent',
          timestamp: run.createdAt + 1000,
          data: {
            type: 'usage',
            usage: {
              input_tokens: 1_000,
              output_tokens: 50,
              cached_read_tokens: 200,
              thought_tokens: 77,
              total_tokens: 1_127,
            },
          },
        },
      ];
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({ 'conv-1': [] }),
        dataDir,
        run,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const batch = JSON.parse(init.body as string).batch as any[];
    const trace = batch[0].body;
    expect(trace.metadata.tokens.thought).toBe(77);
    expect(trace.metadata.tokens.total).toBe(1_127);
    expect(trace.metadata.tokens.cacheReadInput).toBe(200);
  });

  it('uses the default model bucket for a default-model run with no status/model event', async () => {
    await writeAppCfg({
      installationId: 'install-uuid-4',
      telemetry: { metrics: true, content: true, artifactManifest: false },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      // Request never pinned a concrete model (the `default` placeholder) and
      // the agent never reported one. Keep this aligned with PostHog's
      // model_id bucket so Langfuse traces remain filterable by model state.
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({ 'conv-1': [] }),
        dataDir,
        run: makeRun({ model: 'default' }) as any,
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
    expect(trace.metadata.model).toBe('default');
    expect(trace.tags).toEqual(expect.arrayContaining(['model:default']));
    expect(generation.model).toBe('default');
  });

  it('includes artifacts when content telemetry is on', async () => {
    await writeAppCfg({
      installationId: 'install-1',
      telemetry: { metrics: true, content: true },
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
    expect(trace.input).toBe('design a coffee landing page');
    expect(trace.output).toBe('sensitive output');
    expect(trace.metadata.artifacts).toEqual([
      { slug: 'secret.html', type: 'html', sizeBytes: 1 },
    ]);
    // tokens + eventsSummary are still in metadata since they're metrics
    expect(trace.metadata.tokens).toEqual({
      input: 100,
      inputProvider: 100,
      inputEffective: 100,
      output: 200,
      total: 300,
      estimatedContext: 93,
      cacheTokenSource: 'unavailable',
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
        run: makeRun({
          status: 'failed',
          events: [
            {
              id: 1,
              event: 'error',
              data: {
                error: {
                  message: 'agent stream blew up',
                  details: {
                    kind: 'opencode_prompt_error',
                    runtime: 'opencode',
                    phase: 'timeout',
                    openCodeSessionId: 'session-must-not-reach-langfuse',
                    lastEventType: 'tool_call',
                    lastToolCallId: 'call-must-not-reach-langfuse',
                    lastToolStatus: 'in_progress',
                    lastToolKind: 'write',
                  },
                },
              },
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
    expect(batch[0].body.metadata.diagnostics).toMatchObject({
      amr_opencode_error_phase: 'timeout',
      amr_opencode_last_event_type: 'tool_call',
      amr_opencode_last_tool_status: 'in_progress',
      amr_opencode_last_tool_kind: 'write',
    });
    expect(JSON.stringify(batch)).not.toContain('session-must-not-reach-langfuse');
    expect(JSON.stringify(batch)).not.toContain('call-must-not-reach-langfuse');
    expect(bodyOf(batch, 'span-create', 'agent-run').level).toBe('ERROR');
    expect(bodyOf(batch, 'generation-create', 'llm').level).toBe('ERROR');
    expect(bodyOf(batch, 'generation-create', 'llm').statusMessage).toBe(
      'agent stream blew up',
    );
    expect(bodyOf(batch, 'event-create', 'run-error').statusMessage).toBe(
      'agent stream blew up',
    );
  });

  it('adds redacted stderr tail metadata for failed runs', async () => {
    await writeAppCfg({
      installationId: 'install-1',
      telemetry: { metrics: true, content: true },
    });
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 207 }));
    const rawKey = `sk-${'a'.repeat(48)}`;
    process.env.LANGFUSE_PUBLIC_KEY = 'pk';
    process.env.LANGFUSE_SECRET_KEY = 'sk';
    try {
      await reportRunCompletedFromDaemon({
        db: makeDbWithListMessages({ 'conv-1': [] }),
        dataDir,
        run: makeRun({
          status: 'failed',
          events: [
            { id: 1, event: 'stderr', data: { chunk: `provider 429 OPENAI_API_KEY=${rawKey}\n` } },
            { id: 2, event: 'error', data: { error: { message: 'provider failed' } } },
          ],
        }) as any,
        fetchImpl: fetchSpy as any,
      });
    } finally {
      delete process.env.LANGFUSE_PUBLIC_KEY;
      delete process.env.LANGFUSE_SECRET_KEY;
    }

    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const payload = init.body as string;
    const batch = JSON.parse(payload).batch as any[];
    expect(batch[0].body.metadata.stderr).toEqual({
      tail: 'provider 429 OPENAI_API_KEY=[REDACTED:sk_key]',
      lineCount: 1,
      truncated: false,
    });
    expect(payload).not.toContain(rawKey);
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
      telemetry: { metrics: true, content: true, artifactManifest: false },
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
            attachmentsJson: m.attachments
              ? JSON.stringify(m.attachments)
              : null,
            commentAttachmentsJson: null,
            producedFilesJson: m.producedFiles
              ? JSON.stringify(m.producedFiles)
              : null,
            traceObjectFilesJson: m.traceObjectFiles
              ? JSON.stringify(m.traceObjectFiles)
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
