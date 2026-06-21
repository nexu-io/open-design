import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildFeedbackPayload,
  buildTracePayload,
  deriveLangfuseDeliveryState,
  readLangfuseConfig,
  readTelemetrySinkConfig,
  reportRunCompleted,
  reportRunFeedback,
  type FeedbackReportContext,
  type LangfuseConfig,
  type ReportContext,
  type TelemetrySinkConfig,
} from '../src/langfuse-trace.js';
import { buildPromptStackTelemetry } from '../src/prompt-telemetry.js';

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
        inputTokensProvider: 1234,
        inputTokensEffective: 1484,
        outputTokens: 567,
        totalTokens: 2051,
        cacheReadInputTokens: 200,
        cacheCreationInputTokens: 50,
        uncachedInputTokens: 1234,
        estimatedContextTokens: 1350,
        cacheHitRatio: 0.1347708894878706,
        cacheTokenSource: 'anthropic',
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

describe('readTelemetrySinkConfig', () => {
  it('prefers the Open Design telemetry relay when configured', () => {
    const cfg = readTelemetrySinkConfig({
      OPEN_DESIGN_TELEMETRY_RELAY_URL: 'https://telemetry.open-design.ai/api/langfuse//',
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_SECRET_KEY: 'sk',
    });
    expect(cfg).toEqual({
      kind: 'relay',
      relayUrl: 'https://telemetry.open-design.ai/api/langfuse',
      timeoutMs: 20_000,
      retries: 1,
    });
  });

  it('uses relay-specific timeout and retry tuning when present', () => {
    const cfg = readTelemetrySinkConfig({
      OPEN_DESIGN_TELEMETRY_RELAY_URL: 'https://telemetry.open-design.ai/api/langfuse',
      OPEN_DESIGN_TELEMETRY_TIMEOUT_MS: '30000',
      OPEN_DESIGN_TELEMETRY_RETRIES: '3',
      LANGFUSE_TIMEOUT_MS: '1',
      LANGFUSE_RETRIES: '0',
    });
    expect(cfg).toMatchObject({
      kind: 'relay',
      timeoutMs: 30_000,
      retries: 3,
    });
  });

  it('falls back to direct Langfuse config for local smoke tests', () => {
    const cfg = readTelemetrySinkConfig({
      LANGFUSE_PUBLIC_KEY: 'pk',
      LANGFUSE_SECRET_KEY: 'sk',
    });
    expect(cfg).toMatchObject({
      kind: 'langfuse',
      baseUrl: 'https://us.cloud.langfuse.com',
    });
  });
});

describe('deriveLangfuseDeliveryState', () => {
  it('marks traces not expected when metrics consent is off', () => {
    expect(
      deriveLangfuseDeliveryState(
        { metrics: false, content: true, artifactManifest: true },
        { kind: 'langfuse', ...TEST_CONFIG },
      ),
    ).toEqual({
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'metrics_consent_off',
    });
  });

  it('marks traces not expected when content consent is off', () => {
    expect(
      deriveLangfuseDeliveryState(
        { metrics: true, content: false, artifactManifest: true },
        { kind: 'langfuse', ...TEST_CONFIG },
      ),
    ).toEqual({
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'content_consent_off',
    });
  });

  it('marks traces not expected when no sink is configured', () => {
    expect(
      deriveLangfuseDeliveryState(
        { metrics: true, content: true, artifactManifest: true },
        null,
      ),
    ).toEqual({
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'missing_sink_config',
    });
  });

  it('marks eligible traces as queued at run-finished time', () => {
    expect(
      deriveLangfuseDeliveryState(
        { metrics: true, content: true, artifactManifest: true },
        { kind: 'langfuse', ...TEST_CONFIG },
      ),
    ).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'queued',
    });
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
        message: {
          messageId: 'msg-1',
          prompt: 'Make a landing page for a coffee shop.',
          output:
            'Built it.\n<artifact identifier="demo" type="text/html"><!doctype html><html>heavy</html></artifact>',
        },
      }),
    );
    const trace = (batch[0] as any).body;
    const tool = bodyOf(batch, 'span-create', 'tool:Bash');
    const write = bodyOf(batch, 'span-create', 'tool:Write');
    expect(trace.input).toMatch(/coffee shop/);
    expect(trace.output).toContain('[REDACTED:artifact_content]');
    expect(trace.output).not.toContain('<!doctype html>');
    expect(tool.input).toMatch(/ls -la/);
    expect(tool.output).toBe('total 0');
    expect(write.input).toBe('[REDACTED:tool_input:content_tool:Write]');
    expect(write.output).toBe('[REDACTED:tool_output:content_tool:Write]');
  });

  it('adds full prompt-stack content once on generation input and flat metadata elsewhere', () => {
    const promptTelemetry = buildPromptStackTelemetry({
      composedPrompt:
        '# Instructions\n\nWork in /Users/alice/project\n\n---\n# User request\n\nBuild a card',
      sections: [
        { kind: 'daemonSystemPrompt', content: 'Work in /Users/alice/project' },
        { kind: 'userRequest', content: 'Build a card' },
        { kind: 'attachments', metadata: ['src/App.tsx'] },
      ],
    });
    const batch = buildTracePayload(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
        promptTelemetry,
      }),
    );

    const trace = bodyOf(batch, 'trace-create');
    const generation = bodyOf(batch, 'generation-create', 'llm');
    expect(trace.input).toBe('Make a landing page for a coffee shop.');
    expect(generation.input).toMatchObject({
      type: 'open-design.prompt-stack',
      redactionVersion: 'prompt-stack-redaction-v1',
      sectionCount: 3,
      sections: [
        expect.objectContaining({
          kind: 'daemonSystemPrompt',
          redactedContent: expect.stringContaining('[REDACTED:path]'),
        }),
        expect.objectContaining({
          kind: 'userRequest',
          redactedContent: 'Build a card',
        }),
        expect.objectContaining({
          kind: 'attachments',
          contentMode: 'metadata-only',
        }),
      ],
    });
    expect(trace.metadata.promptStack).toBeUndefined();
    expect(generation.metadata.promptStack).toBeUndefined();
    expect(trace.metadata.promptStack_section_daemonSystemPrompt_present).toBeUndefined();
    expect(trace.metadata.promptStack_section_attachments_present).toBeUndefined();
    expect(trace.metadata.promptStack_section_daemonSystemPrompt_rawBytes).toBeUndefined();
    expect(trace.metadata.promptStack_promptFingerprint).toMatch(/^sha256:/);
    expect(generation.metadata.promptStack_promptFingerprint).toBe(
      trace.metadata.promptStack_promptFingerprint,
    );
  });

  it('adds prompt-stack byte and cache-token blame metadata for TTFT diagnosis', () => {
    const promptTelemetry = buildPromptStackTelemetry({
      composedPrompt: ['a'.repeat(1000), 'b'.repeat(500), 'c'.repeat(100)].join('\n'),
      sections: [
        { kind: 'daemonSystemPrompt', content: 'a'.repeat(1000) },
        { kind: 'pluginStagePrompt', content: 'b'.repeat(500) },
        { kind: 'userRequest', content: 'c'.repeat(100) },
      ],
    });
    const ctx = makeCtx({
      prefs: { metrics: true, content: true, artifactManifest: false },
      promptTelemetry,
    });
    ctx.run = {
      ...ctx.run,
      timings: {
        tool_call_count: 0,
        total_duration_ms: 89_162,
        time_to_first_token_ms: 26_613,
        spawn_to_first_token_ms: 26_491,
      },
    };

    const batch = buildTracePayload(ctx);
    const trace = bodyOf(batch, 'trace-create');
    const generation = bodyOf(batch, 'generation-create', 'llm');

    expect(trace.metadata.promptStack_topSectionsByBytes).toEqual([
      expect.objectContaining({
        kind: 'daemonSystemPrompt',
        rawBytes: 1000,
        redactedBytes: 1000,
        attributionBytes: 1000,
        attributionShare: 0.625,
        estimatedInputEffectiveTokens: 929,
        estimatedCacheCreationInputTokens: 32,
        estimatedCacheReadInputTokens: 126,
        estimatedUncachedInputTokens: 772,
      }),
      expect.objectContaining({
        kind: 'pluginStagePrompt',
        rawBytes: 500,
        attributionShare: 0.3125,
        estimatedCacheCreationInputTokens: 15,
      }),
      expect.objectContaining({
        kind: 'userRequest',
        rawBytes: 100,
        attributionShare: 0.0625,
        estimatedCacheCreationInputTokens: 3,
      }),
    ]);
    expect(trace.metadata.cacheCreationTokensBySection).toEqual([
      {
        kind: 'daemonSystemPrompt',
        ordinal: 0,
        attributionBytes: 1000,
        estimatedCacheCreationInputTokens: 32,
      },
      {
        kind: 'pluginStagePrompt',
        ordinal: 1,
        attributionBytes: 500,
        estimatedCacheCreationInputTokens: 15,
      },
      {
        kind: 'userRequest',
        ordinal: 2,
        attributionBytes: 100,
        estimatedCacheCreationInputTokens: 3,
      },
    ]);
    expect(trace.metadata.promptStack_ttftAttribution).toMatchObject({
      method: 'proportional_by_prompt_section_redacted_bytes',
      time_to_first_token_ms: 26_613,
      spawn_to_first_token_ms: 26_491,
      totalAttributionBytes: 1600,
      sectionCount: 3,
      primarySectionKind: 'daemonSystemPrompt',
      primarySectionAttributionShare: 0.625,
      primarySectionEstimatedCacheCreationInputTokens: 32,
      cacheTokenSource: 'anthropic',
    });
    expect(generation.metadata.promptStack_topSectionsByBytes).toEqual(
      trace.metadata.promptStack_topSectionsByBytes,
    );
    expect(generation.metadata.promptStack_ttftAttribution).toEqual(
      trace.metadata.promptStack_ttftAttribution,
    );
  });

  it('omits prompt-stack redactedContent when metrics or content consent is off', () => {
    const promptTelemetry = buildPromptStackTelemetry({
      composedPrompt: '# User request\n\nBuild a card',
      sections: [{ kind: 'userRequest', content: 'Build a card' }],
    });

    for (const prefs of [
      { metrics: true, content: false, artifactManifest: false },
      { metrics: false, content: true, artifactManifest: false },
    ]) {
      const batch = buildTracePayload(makeCtx({ prefs, promptTelemetry }));
      const trace = bodyOf(batch, 'trace-create');
      const generation = bodyOf(batch, 'generation-create', 'llm');
      expect(trace.input).toBeUndefined();
      expect(trace.metadata.promptStack).toBeUndefined();
      expect(trace.metadata.promptStack_redactedContentBytes).toBe(0);
      expect(generation.input).toMatchObject({
        type: 'open-design.prompt-stack',
        redactedContentBytes: 0,
        sections: [expect.not.objectContaining({ redactedContent: expect.any(String) })],
      });
    }
  });

  it('truncates ASCII prompt and output at 64 KB (bytes == chars)', () => {
    const longPrompt = 'a'.repeat(80_000);
    const longOutput = 'b'.repeat(80_000);
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
    expect(Buffer.byteLength(trace.input, 'utf8')).toBe(64 * 1024);
    expect(Buffer.byteLength(trace.output, 'utf8')).toBe(64 * 1024);
  });

  it('truncates by UTF-8 bytes, not by JS string length, for multi-byte text', () => {
    // Each CJK character is 3 bytes in UTF-8 but 1 unit in String.length.
    // 30_000 chars × 3 bytes = 90_000 bytes, well over the 64 KB input cap.
    const longCJK = '设'.repeat(30_000);
    expect(longCJK.length).toBe(30_000);
    expect(Buffer.byteLength(longCJK, 'utf8')).toBe(90_000);
    const batch = buildTracePayload(
      makeCtx({
        message: { messageId: 'msg-1', prompt: longCJK, output: '' },
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
    );
    const trace = (batch[0] as any).body;
    expect(Buffer.byteLength(trace.input, 'utf8')).toBeLessThanOrEqual(64 * 1024);
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
        attachmentManifest: [
          {
            attachment_id: 'att-1',
            object_class: 'attachment',
            storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/attachment/att-1',
            status: 'ok',
            project_id: 'proj-1',
            run_id: 'run-1',
            workspace_id: null,
            size_bytes: 100,
            redacted: false,
            truncated: false,
            stored_in_open_design: true,
            retention_policy: 'project_lifetime',
            access_scope: 'project',
            sensitivity: 'private',
            source: 'user_upload',
            expires_at: null,
            approved_by: null,
          },
        ],
        artifactManifest: [
          {
            artifact_id: 'art-1',
            object_class: 'artifact',
            type: 'html',
            storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/artifact/art-1',
            status: 'ok',
            project_id: 'proj-1',
            run_id: 'run-1',
            workspace_id: null,
            size_bytes: 200,
            redacted: false,
            truncated: false,
            stored_in_open_design: true,
            retention_policy: 'project_lifetime',
            access_scope: 'project',
            sensitivity: 'private',
            source: 'agent_generated',
            expires_at: null,
            approved_by: null,
          },
        ],
        manifestCompleteness: 'complete',
      }),
    );
    const trace = (batch[0] as any).body;
    expect(trace.metadata.artifacts).toBeUndefined();
    expect(trace.metadata.artifactsTruncated).toBeUndefined();
    expect(trace.metadata.attachment_manifest).toBeUndefined();
    expect(trace.metadata.artifact_manifest).toBeUndefined();
    expect(trace.metadata.manifest_completeness).toBeUndefined();
  });

  it('includes trace-safe object manifests when content telemetry is on', () => {
    const batch = buildTracePayload(
      makeCtx({
        prefs: { metrics: true, content: true },
        attachmentManifest: [
          {
            attachment_id: 'att-1',
            object_class: 'attachment',
            storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/attachment/att-1',
            status: 'ok',
            project_id: 'proj-1',
            run_id: 'run-1',
            workspace_id: null,
            size_bytes: 1024,
            sha256: 'sha256:abc',
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
          },
        ],
        artifactManifest: [
          {
            artifact_id: 'art-1',
            object_class: 'artifact',
            type: 'html',
            storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-1/artifact/art-1',
            status: 'partial',
            reason: 'size_unavailable',
            project_id: 'proj-1',
            run_id: 'run-1',
            workspace_id: null,
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
          },
        ],
        manifestCompleteness: 'partial',
      }),
    );
    const trace = (batch[0] as any).body;
    expect(trace.metadata.attachment_manifest).toEqual([
      expect.objectContaining({
        attachment_id: 'att-1',
        object_class: 'attachment',
        storage_ref: expect.stringContaining('/attachment/att-1'),
        size_bytes: 1024,
        sha256: 'sha256:abc',
        retention_policy: 'project_lifetime',
        access_scope: 'project',
        sensitivity: 'private',
        source: 'user_upload',
      }),
    ]);
    expect(trace.metadata.artifact_manifest).toEqual([
      expect.objectContaining({
        artifact_id: 'art-1',
        object_class: 'artifact',
        type: 'html',
        storage_ref: expect.stringContaining('/artifact/art-1'),
        status: 'partial',
        reason: 'size_unavailable',
        build_status: 'complete',
        export_status: 'available',
        source: 'agent_generated',
      }),
    ]);
    expect(trace.metadata.manifest_completeness).toBe('partial');
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
        prefs: { metrics: true, content: true },
      }),
    );
    const trace = (batch[0] as any).body;
    expect(trace.metadata.artifacts).toHaveLength(50);
    expect(trace.metadata.artifactsTruncated).toBe(true);
  });

  it('caps artifact manifests at 50 entries with a truncation flag', () => {
    const many = Array.from({ length: 75 }, (_, i) => ({
      artifact_id: `art-${i}`,
      object_class: 'artifact' as const,
      type: 'html',
      storage_ref: `od://objects/workspaces/unknown/projects/proj-1/runs/run-1/artifact/art-${i}`,
      status: 'ok' as const,
      project_id: 'proj-1',
      run_id: 'run-1',
      workspace_id: null,
      size_bytes: 1,
      redacted: false,
      truncated: false,
      stored_in_open_design: true,
      retention_policy: 'project_lifetime' as const,
      access_scope: 'project' as const,
      sensitivity: 'private' as const,
      source: 'agent_generated' as const,
      expires_at: null,
      approved_by: null,
    }));
    const batch = buildTracePayload(
      makeCtx({
        artifactManifest: many,
        manifestCompleteness: 'complete',
        prefs: { metrics: true, content: true },
      }),
    );
    const trace = (batch[0] as any).body;
    expect(trace.metadata.artifact_manifest).toHaveLength(50);
    expect(trace.metadata.artifact_manifest_truncated).toBe(true);
  });

  it('caps attachment manifests and prompt-build refs at 50 entries', () => {
    const many = Array.from({ length: 75 }, (_, i) => ({
      attachment_id: `att-${i}`,
      object_class: 'attachment' as const,
      storage_ref: `od://objects/workspaces/unknown/projects/proj-1/runs/run-1/attachment/att-${i}`,
      status: 'ok' as const,
      project_id: 'proj-1',
      run_id: 'run-1',
      workspace_id: null,
      size_bytes: i + 1,
      sha256: `sha256:att-${i}`,
      mime_type: 'application/pdf',
      extension: 'pdf',
      redacted: false,
      truncated: false,
      stored_in_open_design: true,
      retention_policy: 'project_lifetime' as const,
      access_scope: 'project' as const,
      sensitivity: 'private' as const,
      source: 'user_upload' as const,
      expires_at: null,
      approved_by: null,
    }));
    const batch = buildTracePayload(
      makeCtx({
        attachmentManifest: many,
        manifestCompleteness: 'complete',
        prefs: { metrics: true, content: true },
        run: {
          runId: 'run-1',
          status: 'succeeded',
          startedAt: 1_700_000_000_000,
          endedAt: 1_700_000_004_500,
          timingMarks: {
            promptBuildStartAt: 1_700_000_000_100,
            promptBuildEndAt: 1_700_000_000_200,
          },
        },
      }),
    );
    const trace = (batch[0] as any).body;
    const promptBuild = bodyOf(batch, 'span-create', 'prompt-build');

    expect(trace.metadata.attachment_manifest).toHaveLength(50);
    expect(trace.metadata.attachment_manifest_truncated).toBe(true);
    expect(promptBuild.input.ingredients.attachment_refs).toHaveLength(50);
    expect(promptBuild.input.ingredients.attachment_refs_truncated).toBe(true);
    expect(promptBuild.input.ingredients.attachment_refs.at(-1)).toMatchObject({
      attachment_id: 'att-49',
      sha256: 'sha256:att-49',
    });
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
      inputProvider: 1234,
      inputEffective: 1484,
      output: 567,
      total: 2051,
      cacheReadInput: 200,
      cacheCreationInput: 50,
      uncachedInput: 1234,
      estimatedContext: 1350,
      cacheHitRatio: 0.1347708894878706,
      cacheTokenSource: 'anthropic',
    });
    expect(gen.usage).toEqual({
      input: 1484,
      output: 567,
      total: 2051,
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

  it('uses an agent-runtime span instead of an llm generation for session-init failures with no model usage', () => {
    const batch = buildTracePayload(
      makeCtx({
        run: {
          runId: 'run-auth',
          status: 'failed',
          startedAt: 1,
          endedAt: 2,
          error: 'Not logged in · Please run /login',
          errorCode: 'AGENT_AUTH_REQUIRED',
          failure: {
            failure_category: 'auth',
            failure_detail: 'auth_required',
            failure_stage: 'session_init',
            retryable: false,
            user_action: 'login',
          },
          timingMarks: {
            modelCallStartAt: 1,
          },
        },
        message: {
          messageId: 'msg-auth',
          prompt: 'make an artifact',
          output: 'Not logged in · Please run /login',
          usage: {
            inputTokens: 0,
            inputTokensProvider: 0,
            inputTokensEffective: 0,
            outputTokens: 0,
            totalTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
            uncachedInputTokens: 0,
            estimatedContextTokens: 0,
            cacheTokenSource: 'anthropic',
          },
        },
        tools: [],
        eventsSummary: { toolCalls: 0, errors: 1, durationMs: 2 },
      }),
    );
    expect(
      (batch as Array<{ type: string; body: Record<string, any> }>).find(
        (item) => item.type === 'generation-create' && item.body.name === 'llm',
      ),
    ).toBeUndefined();
    const runtime = bodyOf(batch, 'span-create', 'agent-runtime');
    expect(runtime.level).toBe('ERROR');
    expect(runtime.statusMessage).toBe('Not logged in · Please run /login');
    expect(runtime.metadata.reason).toBe('no_model_generation');
    expect(bodyOf(batch, 'span-create', 'runtime-call').parentObservationId).toBe(
      'run-auth-runtime',
    );
    const metadata = (batch[0] as any).body.metadata;
    expect(metadata.status).toBe('failed');
    expect(metadata.success).toBe(false);
    expect(metadata.error_code).toBe('AGENT_AUTH_REQUIRED');
    expect(metadata.failure_category).toBe('auth');
  });

  it('mirrors structured failure fields into trace metadata', () => {
    const batch = buildTracePayload(
      makeCtx({
        run: {
          runId: 'run-rate-limit',
          status: 'failed',
          startedAt: 1,
          endedAt: 2,
          error: 'session limit reached',
          errorCode: 'RATE_LIMITED',
          failure: {
            failure_category: 'rate_limit',
            failure_detail: 'hard_quota',
            failure_stage: 'session_init',
            retryable: false,
            user_action: 'none',
          },
        },
      }),
    );
    const metadata = (batch[0] as any).body.metadata;
    expect(metadata.error_code).toBe('RATE_LIMITED');
    expect(metadata.langfuse_trace_id).toBe('run-rate-limit');
    expect(metadata.langfuse_expected).toBe(false);
    expect(metadata.langfuse_delivery_status).toBe('not_expected');
    expect(metadata.langfuse_drop_reason).toBe('content_consent_off');
    expect(metadata.failure_category).toBe('rate_limit');
    expect(metadata.failure_detail).toBe('hard_quota');
    expect(metadata.failure_stage).toBe('session_init');
    expect(metadata.retryable).toBe(false);
    expect(metadata.user_action).toBe('none');
  });

  it('mirrors run timing fields into trace metadata', () => {
    const batch = buildTracePayload(
      makeCtx({
        run: {
          runId: 'run-timing',
          status: 'succeeded',
          startedAt: 1,
          endedAt: 2,
          timings: {
            queue_duration_ms: 10,
            pre_spawn_duration_ms: 20,
            process_spawn_duration_ms: 30,
            time_to_first_token_ms: 40,
            spawn_to_first_token_ms: 50,
            generation_duration_ms: 60,
            tool_call_count: 2,
            tool_duration_ms: 70,
            finalize_duration_ms: 5,
            total_duration_ms: 100,
          },
        },
      }),
    );
    const metadata = (batch[0] as any).body.metadata;
    expect(metadata.queue_duration_ms).toBe(10);
    expect(metadata.process_spawn_duration_ms).toBe(30);
    expect(metadata.time_to_first_token_ms).toBe(40);
    expect(metadata.tool_call_count).toBe(2);
    expect(metadata.total_duration_ms).toBe(100);
  });

  it('adds duration spans for run timing marks', () => {
    const promptTelemetry = buildPromptStackTelemetry({
      composedPrompt:
        '# System\n\nUse /Users/alice/project safely\n\n---\n# User request\n\nBuild the card\n\n---\n# Attachments\n\nbrand.pdf',
      sections: [
        {
          kind: 'daemonSystemPrompt',
          content: 'Use /Users/alice/project safely',
        },
        { kind: 'userRequest', content: 'Build the card' },
        {
          kind: 'attachments',
          metadata: [{ name: 'brand.pdf', size: 1024, mime: 'application/pdf' }],
        },
      ],
    });
    const batch = buildTracePayload(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: true },
        promptTelemetry,
        attachmentManifest: [
          {
            attachment_id: 'att-1',
            object_class: 'attachment',
            storage_ref: 'od://objects/workspaces/unknown/projects/proj-1/runs/run-spans/attachment/att-1',
            status: 'ok',
            project_id: 'proj-1',
            run_id: 'run-spans',
            workspace_id: null,
            size_bytes: 1024,
            sha256: 'sha256:attachment',
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
          },
        ],
        run: {
          runId: 'run-spans',
          status: 'succeeded',
          startedAt: 1_700_000_000_000,
          endedAt: 1_700_000_004_500,
          timingMarks: {
            startChatRunStartedAt: 1_700_000_000_100,
            promptBuildStartAt: 1_700_000_000_200,
            promptBuildEndAt: 1_700_000_000_260,
            processSpawnStartedAt: 1_700_000_000_300,
            processSpawnedAt: 1_700_000_000_380,
            modelCallStartAt: 1_700_000_000_420,
            firstTokenAt: 1_700_000_001_000,
            finalizeStartAt: 1_700_000_004_200,
          },
        },
      }),
    );

    const spans = (batch as any[])
      .filter((item) => item.type === 'span-create')
      .map((item) => item.body);
    expect(spans.map((span) => span.name)).toEqual(
      expect.arrayContaining([
        'queue',
        'prompt-build',
        'spawn',
        'agent-call',
        'stream-output',
        'finalize',
      ]),
    );
    expect(bodyOf(batch, 'span-create', 'prompt-build')).toMatchObject({
      input: {
        phase: 'prompt-build',
        ingredients: {
          agent: 'claude',
          model: 'unknown',
          skill_id: null,
          design_system_id: null,
          user_request_available: true,
          attachment_refs: [
            expect.objectContaining({
              attachment_id: 'att-1',
              storage_ref: expect.stringContaining('/attachment/att-1'),
              sha256: 'sha256:attachment',
              sensitivity: 'private',
            }),
          ],
        },
      },
      output: {
        status: 'prompt_stack_ready',
        content_policy: 'redacted_prompt_stack_on_generation_input_with_object_refs',
        prompt_stack_available: true,
        section_count: 3,
        stack_fingerprint: expect.stringMatching(/^sha256:/),
      },
    });
    expect(bodyOf(batch, 'span-create', 'prompt-build').input.prompt_stack).toBeUndefined();
    expect(bodyOf(batch, 'span-create', 'prompt-build').output.prompt_stack).toBeUndefined();
    expect(bodyOf(batch, 'span-create', 'spawn')).toMatchObject({
      id: 'run-spans-phase-spawn',
      parentObservationId: 'run-spans-gen',
      input: {
        phase: 'spawn',
        agent: 'claude',
        cwd_ref: 'project',
        raw_path_included: false,
      },
      output: {
        duration_ms: 80,
        status: 'process_spawned',
      },
      metadata: {
        durationMs: 80,
        boundary: 'processSpawnStartedAt -> processSpawnedAt',
      },
    });
    expect(bodyOf(batch, 'span-create', 'agent-call')).toMatchObject({
      input: {
        phase: 'agent-call',
        model: 'unknown',
        tool_call_count: 2,
        generation_observation: true,
      },
      output: {
        status: 'succeeded',
        tool_call_count: 2,
        token_usage: {
          input: 1234,
          input_effective: 1484,
          output: 567,
          total: 2051,
        },
      },
    });
    expect(bodyOf(batch, 'span-create', 'finalize')).toMatchObject({
      input: {
        phase: 'finalize',
        artifact_manifest_enabled: true,
      },
      output: {
        status: 'succeeded',
        artifact_count: 0,
        attachment_count: 1,
        manifest_completeness: 'unavailable',
      },
    });
    expect(bodyOf(batch, 'span-create', 'tool:Bash').parentObservationId).toBe(
      'run-spans-phase-agent-call',
    );
  });

  it('nests agent status and usage events under agent-call', () => {
    const batch = buildTracePayload(
      makeCtx({
        run: {
          runId: 'run-agent-events',
          status: 'succeeded',
          startedAt: 1_700_000_000_000,
          endedAt: 1_700_000_004_500,
          timingMarks: {
            modelCallStartAt: 1_700_000_000_420,
          },
        },
        agentEvents: [
          {
            id: 'status-initializing-0',
            name: 'agent-status:initializing',
            timestamp: 1_700_000_000_500,
            input: { source: 'claude-code-stream', event_type: 'status' },
            output: { label: 'initializing', model: 'claude-opus-4-8[1m]' },
          },
          {
            id: 'thinking-start-0',
            name: 'agent-thinking-start',
            timestamp: 1_700_000_000_800,
            input: {
              source: 'claude-code-stream',
              event_type: 'thinking_start',
            },
            output: { status: 'started' },
          },
          {
            id: 'usage-0',
            name: 'agent-usage',
            timestamp: 1_700_000_004_000,
            input: { source: 'claude-code-stream', event_type: 'usage' },
            output: {
              usage: { input_tokens: 10, output_tokens: 20 },
              cost_usd: 0.01,
              stop_reason: 'end_turn',
            },
          },
        ],
      }),
    );

    expect(bodyOf(batch, 'event-create', 'agent-status:initializing')).toMatchObject({
      parentObservationId: 'run-agent-events-phase-agent-call',
      input: {
        source: 'claude-code-stream',
        event_type: 'status',
      },
      output: {
        label: 'initializing',
        model: 'claude-opus-4-8[1m]',
      },
    });
    expect(bodyOf(batch, 'event-create', 'agent-thinking-start')).toMatchObject({
      parentObservationId: 'run-agent-events-phase-agent-call',
      input: {
        source: 'claude-code-stream',
        event_type: 'thinking_start',
      },
      output: { status: 'started' },
    });
    expect(bodyOf(batch, 'event-create', 'agent-usage')).toMatchObject({
      parentObservationId: 'run-agent-events-phase-agent-call',
      input: {
        source: 'claude-code-stream',
        event_type: 'usage',
      },
      output: {
        usage: { input_tokens: 10, output_tokens: 20 },
        cost_usd: 0.01,
        stop_reason: 'end_turn',
      },
    });
  });

  it('emits cost and performance diagnostics for cost governance', () => {
    const batch = buildTracePayload(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: true },
        artifacts: [
          { slug: 'index.html', type: 'html', sizeBytes: 4096 },
          { slug: 'brand-spec.md', type: 'text', sizeBytes: 1024 },
        ],
        run: {
          runId: 'run-cost-perf',
          status: 'succeeded',
          startedAt: 1_700_000_000_000,
          endedAt: 1_700_000_006_000,
          timings: {
            generation_duration_ms: 5000,
            tool_call_count: 2,
            tool_duration_ms: 1700,
            total_duration_ms: 6000,
          },
          timingMarks: {
            promptBuildStartAt: 1_700_000_000_100,
            promptBuildEndAt: 1_700_000_000_200,
            modelCallStartAt: 1_700_000_000_300,
            firstTokenAt: 1_700_000_001_000,
            finalizeStartAt: 1_700_000_005_500,
          },
        },
        agentEvents: [
          {
            id: 'usage-0',
            name: 'agent-usage',
            timestamp: 1_700_000_005_400,
            input: { source: 'claude-code-stream', event_type: 'usage' },
            output: {
              usage: { input_tokens: 100, output_tokens: 200 },
              cost_usd: 0.1234,
              duration_ms: 5400,
            },
          },
        ],
      }),
    );

    const trace = bodyOf(batch, 'trace-create');
    const generation = bodyOf(batch, 'generation-create', 'llm');
    const agentCall = bodyOf(batch, 'span-create', 'agent-call');
    const bash = bodyOf(batch, 'span-create', 'tool:Bash');
    const write = bodyOf(batch, 'span-create', 'tool:Write');
    const artifacts = bodyOf(batch, 'event-create', 'artifact-summary');

    expect(trace.metadata).toMatchObject({
      cost_usd: 0.1234,
      currency: 'USD',
      pricing_version: 'provider_reported',
      cost_source: 'agent_usage_event',
      cost_status: 'available',
      cost_breakdown: {
        cost_usd: 0.1234,
        currency: 'USD',
        phase_costs: {
          prompt_build: {
            phase: 'prompt-build',
            cost_usd: null,
            cost_status: 'not_metered',
          },
          agent_call: {
            phase: 'agent-call',
            cost_usd: 0.1234,
            cost_status: 'available',
          },
          artifact_generation: {
            phase: 'artifact-generation',
            cost_status: 'included_in_agent_call',
          },
          verification: {
            phase: 'verification',
            cost_status: 'not_instrumented',
          },
        },
      },
      performance_diagnostics: {
        tool_performance: {
          tool_call_count: 2,
          total_tool_duration_ms: 1700,
          retry_count_available: false,
          retry_count: null,
          by_tool: expect.arrayContaining([
            expect.objectContaining({
              tool_name: 'Bash',
              call_count: 1,
              total_duration_ms: 800,
              failure_types: ['none'],
            }),
            expect.objectContaining({
              tool_name: 'Write',
              call_count: 1,
              total_duration_ms: 900,
              failure_types: ['none'],
            }),
          ]),
        },
        artifact_write: {
          artifact_count: 2,
          total_artifact_size_bytes: 5120,
          write_tool_count: 1,
          write_tool_duration_ms: 900,
          correlation_status: 'heuristic_by_write_tool_total',
        },
        preview_verify: {
          status: 'not_instrumented',
          screenshot_check: 'not_reported',
          responsive_check: 'not_reported',
        },
        semantic_phases: {
          semantic_phase_timing_status: 'partial',
          missing_semantic_phases: expect.arrayContaining([
            'route-task-kind',
            'preview-verify',
            'evaluator',
          ]),
        },
      },
    });
    expect(generation.metadata.cost_usd).toBe(0.1234);
    expect(generation.metadata.performance_diagnostics.preview_verify.status).toBe(
      'not_instrumented',
    );
    expect(agentCall.output.cost).toMatchObject({
      phase: 'agent-call',
      cost_usd: 0.1234,
      cost_status: 'available',
    });
    expect(bash.metadata).toMatchObject({
      durationMs: 800,
      failureType: 'none',
      retryCount: null,
      retryDetection: 'not_instrumented',
    });
    expect(write.metadata).toMatchObject({
      durationMs: 900,
      failureType: 'none',
    });
    expect(artifacts.metadata.artifact_write_diagnostics).toMatchObject({
      total_artifact_size_bytes: 5120,
      write_tool_duration_ms: 900,
    });
  });

  it('marks cost unavailable when the runtime does not report provider cost', () => {
    const batch = buildTracePayload(makeCtx());
    const trace = bodyOf(batch, 'trace-create');
    expect(trace.metadata).toMatchObject({
      cost_usd: null,
      currency: 'USD',
      pricing_version: 'unavailable',
      cost_source: 'unavailable',
      cost_status: 'unavailable',
      cost_breakdown: {
        unavailable_reason: 'agent runtime did not report total_cost_usd',
        phase_costs: {
          agent_call: {
            cost_usd: null,
            cost_status: 'unavailable',
          },
        },
      },
    });
  });

  it('keeps prompt-build ingredient keys stable when optional inputs are absent', () => {
    const batch = buildTracePayload(
      makeCtx({
        run: {
          runId: 'run-prompt-ingredients',
          status: 'succeeded',
          startedAt: 1_700_000_000_000,
          endedAt: 1_700_000_001_000,
          timingMarks: {
            promptBuildStartAt: 1_700_000_000_100,
            promptBuildEndAt: 1_700_000_000_200,
          },
        },
      }),
    );

    expect(bodyOf(batch, 'span-create', 'prompt-build').input).toMatchObject({
      phase: 'prompt-build',
      ingredients: {
        agent: 'claude',
        model: 'unknown',
        skill_id: null,
        design_system_id: null,
        user_request_available: true,
        attachment_refs: [],
      },
    });
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
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: false, content: true, artifactManifest: true },
      }),
      { config: TEST_CONFIG, fetchImpl: fetchSpy as any },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'metrics_consent_off',
    });
  });

  it('does nothing when content gate is off', async () => {
    const fetchSpy = vi.fn();
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: false },
      }),
      { config: TEST_CONFIG, fetchImpl: fetchSpy as any },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'content_consent_off',
    });
  });

  it('does nothing when no Langfuse config is available', async () => {
    const fetchSpy = vi.fn();
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
      {
        config: null,
        fetchImpl: fetchSpy as any,
      },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      langfuse_expected: false,
      langfuse_delivery_status: 'not_expected',
      langfuse_drop_reason: 'missing_sink_config',
    });
  });

  it('POSTs to /api/public/ingestion with Basic auth and a JSON batch body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
      {
        config: TEST_CONFIG,
        fetchImpl: fetchSpy as any,
      },
    );
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
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'accepted',
    });
  });

  it('keeps a max-budget prompt stack under the hard batch cap', async () => {
    const maxBudgetSection = 'x'.repeat(64 * 1024);
    const promptTelemetry = buildPromptStackTelemetry({
      composedPrompt: maxBudgetSection.repeat(8),
      sections: [
        { kind: 'daemonSystemPrompt', content: maxBudgetSection.repeat(2) },
        { kind: 'runtimeToolPrompt', content: maxBudgetSection },
        { kind: 'clientSystemPrompt', content: maxBudgetSection },
        { kind: 'skillPrompt', content: maxBudgetSection },
        { kind: 'designSystemPrompt', content: maxBudgetSection },
        { kind: 'pluginStagePrompt', content: maxBudgetSection },
        { kind: 'researchCommandContract', content: maxBudgetSection },
      ],
    });
    expect(promptTelemetry.redactedContentBytes).toBe(512 * 1024);

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
        promptTelemetry,
      }),
      {
        config: TEST_CONFIG,
        fetchImpl: fetchSpy as any,
      },
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const serialized = init.body as string;
    expect(Buffer.byteLength(serialized, 'utf8')).toBeLessThan(1024 * 1024);
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'accepted',
    });
  });

  it('keeps stderr out of trace input/output and stores only a redacted metadata tail', () => {
    const batch = buildTracePayload(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
        run: {
          runId: 'run-err',
          status: 'failed',
          startedAt: 1_700_000_000_000,
          endedAt: 1_700_000_004_500,
          error: 'provider failed',
          stderr: {
            tail: 'HTTP 429 OPENAI_API_KEY=[REDACTED:openai_key]',
            lineCount: 12,
            truncated: true,
          },
        },
      }),
    ) as any[];

    const trace = bodyOf(batch, 'trace-create');
    const generation = bodyOf(batch, 'generation-create', 'llm');

    expect(trace.input).toBe('Make a landing page for a coffee shop.');
    expect(trace.output).toBe('Here is a landing page draft …');
    expect(generation.input).toBe('Make a landing page for a coffee shop.');
    expect(generation.output).toBe('Here is a landing page draft …');
    expect(trace.metadata.stderr).toEqual({
      tail: 'HTTP 429 OPENAI_API_KEY=[REDACTED:openai_key]',
      lineCount: 12,
      truncated: true,
    });
    expect(JSON.stringify(batch)).not.toContain('sk-raw');
  });

  it('POSTs serialized ingestion batches to the Open Design telemetry relay', async () => {
    const relayConfig: TelemetrySinkConfig = {
      kind: 'relay',
      relayUrl: 'https://telemetry.open-design.ai/api/langfuse',
      timeoutMs: 20_000,
      retries: 0,
    };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200 }),
    );
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
      {
        config: relayConfig,
        fetchImpl: fetchSpy as any,
      },
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0]!;
    const url = call[0] as string;
    const init = call[1] as RequestInit & { headers: Record<string, string> };
    expect(url).toBe('https://telemetry.open-design.ai/api/langfuse');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers['X-Open-Design-Telemetry']).toBe('langfuse-ingestion-v1');
    const body = JSON.parse(init.body as string);
    expect(Array.isArray(body.batch)).toBe(true);
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'accepted',
    });
  });

  it('warns when the relay returns per-event errors', async () => {
    const relayConfig: TelemetrySinkConfig = {
      kind: 'relay',
      relayUrl: 'https://telemetry.open-design.ai/api/langfuse',
      timeoutMs: 20_000,
      retries: 0,
    };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ successes: [], errors: [{ id: 'bad', status: 400 }] }),
        { status: 207 },
      ),
    );
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
      {
        config: relayConfig,
        fetchImpl: fetchSpy as any,
      },
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Relay per-event errors (1)'),
    );
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'langfuse_4xx',
    });
  });


  it('classifies relay 413 responses as relay_413', async () => {
    const relayConfig: TelemetrySinkConfig = {
      kind: 'relay',
      relayUrl: 'https://telemetry.open-design.ai/api/langfuse',
      timeoutMs: 20_000,
      retries: 0,
    };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('payload too large', { status: 413 }),
    );
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
      {
        config: relayConfig,
        fetchImpl: fetchSpy as any,
      },
    );
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'relay_413',
    });
  });

  it('classifies relay 5xx responses as relay_5xx', async () => {
    const relayConfig: TelemetrySinkConfig = {
      kind: 'relay',
      relayUrl: 'https://telemetry.open-design.ai/api/langfuse',
      timeoutMs: 20_000,
      retries: 0,
    };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('upstream unavailable', { status: 503 }),
    );
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
      {
        config: relayConfig,
        fetchImpl: fetchSpy as any,
      },
    );
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'relay_5xx',
    });
  });

  it('classifies direct Langfuse 5xx responses as langfuse_5xx', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('server error', { status: 503 }),
    );
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
      {
        config: TEST_CONFIG,
        fetchImpl: fetchSpy as any,
      },
    );
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'langfuse_5xx',
    });
  });

  it('classifies relay per-event 429s separately from generic 4xx', async () => {
    const relayConfig: TelemetrySinkConfig = {
      kind: 'relay',
      relayUrl: 'https://telemetry.open-design.ai/api/langfuse',
      timeoutMs: 20_000,
      retries: 0,
    };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ successes: [], errors: [{ id: 'throttled', status: 429 }] }),
        { status: 207 },
      ),
    );
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
      {
        config: relayConfig,
        fetchImpl: fetchSpy as any,
      },
    );
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'relay_429',
    });
  });

  it('classifies direct Langfuse per-event 5xx responses as langfuse_5xx', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ successes: [], errors: [{ id: 'lf-down', status: 503 }] }),
        { status: 207 },
      ),
    );
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
      {
        config: TEST_CONFIG,
        fetchImpl: fetchSpy as any,
      },
    );
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'langfuse_5xx',
    });
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
    const result = await reportRunCompleted(
      makeCtx({
        artifacts: fatArtifacts,
        prefs: { metrics: true, content: true, artifactManifest: true },
      }),
      { config: TEST_CONFIG, fetchImpl: fetchSpy as any },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Batch too large'),
    );
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'payload_too_large',
    });
  });

  it('only warns (does not throw) when fetch rejects', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(
      reportRunCompleted(
        makeCtx({
          prefs: { metrics: true, content: true, artifactManifest: false },
        }),
        {
          config: TEST_CONFIG,
          fetchImpl: fetchSpy as any,
        },
      ),
    ).resolves.toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'network_error',
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Fetch error'),
    );
  });

  it('retries once when fetch rejects before warning', async () => {
    const fetchSpy = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(new Response('{}', { status: 207 }));
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
      {
        config: { ...TEST_CONFIG, retries: 1 },
        fetchImpl: fetchSpy as any,
      },
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'accepted',
    });
  });

  it('only warns (does not throw) when ingestion responds non-2xx', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
      {
        config: TEST_CONFIG,
        fetchImpl: fetchSpy as any,
      },
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Ingestion failed 429'),
    );
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'langfuse_4xx',
    });
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
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
      {
        config: TEST_CONFIG,
        fetchImpl: fetchSpy as any,
      },
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Per-event errors (1)'),
    );
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'langfuse_4xx',
    });
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
    const result = await reportRunCompleted(
      makeCtx({
        prefs: { metrics: true, content: true, artifactManifest: false },
      }),
      {
        config: TEST_CONFIG,
        fetchImpl: fetchSpy as any,
      },
    );
    expect(warnSpy).not.toHaveBeenCalled();
    expect(result).toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'accepted',
    });
  });
});

function makeFeedbackCtx(
  overrides: Partial<FeedbackReportContext> = {},
): FeedbackReportContext {
  return {
    runId: 'run-feedback-1',
    installationId: 'install-uuid-1',
    prefs: { metrics: true, content: true },
    rating: 'positive',
    reasonCodes: ['matched_request'],
    hasCustomReason: false,
    customReason: '',
    ...overrides,
  };
}

describe('buildFeedbackPayload', () => {
  it('emits a numeric user_rating score plus per-reason categorical scores', () => {
    const batch = buildFeedbackPayload(
      makeFeedbackCtx({
        rating: 'negative',
        reasonCodes: ['missed_request', 'weak_visual'],
        hasCustomReason: true,
        customReason: 'It got the layout wrong on tablet',
      }),
    ) as Array<Record<string, any>>;
    expect(batch).toHaveLength(3);
    const ratingScore = batch[0]!;
    expect(ratingScore.type).toBe('score-create');
    expect(ratingScore.body.traceId).toBe('run-feedback-1');
    expect(ratingScore.body.name).toBe('user_rating');
    expect(ratingScore.body.value).toBe(-1);
    expect(ratingScore.body.dataType).toBe('NUMERIC');
    expect(ratingScore.body.comment).toBe('negative');
    expect(ratingScore.body.metadata).toMatchObject({
      reasonCount: 2,
      customReason: 'It got the layout wrong on tablet',
      hasCustomReason: true,
    });
    for (const reasonScore of batch.slice(1)) {
      expect(reasonScore.body.name).toBe('user_rating_reason');
      expect(reasonScore.body.dataType).toBe('CATEGORICAL');
      expect(reasonScore.body.comment).toBe('negative');
      expect(reasonScore.body.traceId).toBe('run-feedback-1');
    }
    expect(batch[1]!.body.value).toBe('missed_request');
    expect(batch[2]!.body.value).toBe('weak_visual');
  });

  it('does not emit reason scores when no codes were submitted', () => {
    const batch = buildFeedbackPayload(
      makeFeedbackCtx({ reasonCodes: [] }),
    ) as Array<Record<string, any>>;
    expect(batch).toHaveLength(1);
    expect(batch[0]!.body.name).toBe('user_rating');
    expect(batch[0]!.body.value).toBe(1);
  });
});

describe('reportRunFeedback', () => {
  const TEST_CONFIG: LangfuseConfig = {
    baseUrl: 'https://us.cloud.langfuse.com',
    authHeader: 'Basic Zm9vOmJhcg==',
    retries: 0,
    timeoutMs: 1000,
  };

  beforeEach(() => {
    vi.useRealTimers();
  });

  it('skips when metrics consent is off', async () => {
    const fetchSpy = vi.fn();
    await reportRunFeedback(makeFeedbackCtx({ prefs: { metrics: false, content: true } }), {
      config: TEST_CONFIG,
      fetchImpl: fetchSpy as any,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('skips when content consent is off', async () => {
    const fetchSpy = vi.fn();
    await reportRunFeedback(makeFeedbackCtx({ prefs: { metrics: true, content: false } }), {
      config: TEST_CONFIG,
      fetchImpl: fetchSpy as any,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts a score-create batch to /api/public/ingestion when consent is on', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ successes: [], errors: [] }), { status: 207 }),
    );
    await reportRunFeedback(
      makeFeedbackCtx({ reasonCodes: ['matched_request'] }),
      { config: TEST_CONFIG, fetchImpl: fetchSpy as any },
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://us.cloud.langfuse.com/api/public/ingestion');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.batch).toHaveLength(2);
    expect(body.batch[0].type).toBe('score-create');
    expect(body.batch[0].body.value).toBe(1);
  });
});
