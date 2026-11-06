import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { buildStructuredMainRunObservationV1 } from '../../src/observability/main-run-observation.js';
import { buildSafeRunQualityProjectionV1 } from '../../src/langfuse-trace.js';
import {
  bindOdNextExactSendPromptEvidence,
  buildPromptStackTelemetry,
} from '../../src/prompt-telemetry.js';
import { scanRunEventsForUsageAnalytics } from '../../src/run-analytics-observability.js';

describe('buildStructuredMainRunObservationV1', () => {
  it('keeps only bounded model and agent identifiers', () => {
    const safe = buildStructuredMainRunObservationV1({
      runId: 'run-runtime-safe',
      taskRunIndex: 0,
      stage: 'request',
      status: 'succeeded',
      modelId: 'openai/gpt-5.6-codex',
      agentId: 'codex',
    });
    expect(safe.attributes).toMatchObject({
      modelId: 'openai/gpt-5.6-codex',
      agentId: 'codex',
    });

    const unsafe = buildStructuredMainRunObservationV1({
      runId: 'run-runtime-unsafe',
      taskRunIndex: 0,
      stage: 'request',
      status: 'failed',
      modelId: 'model token=sk-secret',
      agentId: '/Users/alice/private-agent',
    });
    expect(unsafe.attributes).not.toHaveProperty('modelId');
    expect(unsafe.attributes).not.toHaveProperty('agentId');
  });

  it('carries the failed-Run process outcome the single-Run trace used to report', () => {
    const quality = buildSafeRunQualityProjectionV1({
      prefs: { metrics: true, content: true, artifactManifest: false },
      errorMessage: 'agent exited',
      exitCode: 1,
      signal: null,
      stderr: {
        tail: 'HTTP 401 at /opt/od/agent from /Users/alice/.config/od/creds.json',
        lineCount: 7,
        truncated: true,
      },
      stdout: { tail: 'partial model output', lineCount: 2, truncated: false },
      diagnostics: {
        diagnostic_source: 'stderr',
        stderr_present: true,
        stderr_line_count_bucket: '6_20',
        stdout_present: true,
        stdout_line_count_bucket: '1_5',
        rpc_close_reason: 'exit_nonzero',
        first_token_seen: false,
        user_visible_output_seen: true,
        tool_call_seen: false,
        tool_result_sent: false,
        approval_requested: false,
        artifact_write_seen: false,
        live_artifact_seen: false,
        resume_auto_reseeded: false,
      },
    });
    expect(quality?.process?.exitCode).toBe(1);
    expect(quality?.process?.signal).toBeUndefined();
    expect(quality?.process?.stderr?.lineCount).toBe(7);
    expect(quality?.process?.stderr?.truncated).toBe(true);
    expect(quality?.process?.stderr?.tail?.redacted).toBe(true);
    // Both the trace-level and the wider Prompt-stack path rules run, so a
    // home directory and an /opt path are masked before transport.
    expect(quality?.process?.stderr?.tail?.text).not.toContain('/Users/alice');
    expect(quality?.process?.stderr?.tail?.text).not.toContain('/opt/od/agent');
    expect(quality?.process?.stderr?.tail?.text).toContain('HTTP 401');
    expect(quality?.process?.stdout?.tail?.text).toBe('partial model output');
    expect(quality?.process?.diagnostics).toMatchObject({
      diagnostic_source: 'stderr',
      rpc_close_reason: 'exit_nonzero',
      stderr_present: true,
    });
  });

  it('reports a terminating signal and withholds the stdout tail without content consent', () => {
    const quality = buildSafeRunQualityProjectionV1({
      prefs: { metrics: true, content: false, artifactManifest: false },
      errorCode: 'AGENT_EXECUTION_FAILED',
      exitCode: null,
      signal: 'SIGTERM',
      stderr: { tail: 'inactivity timeout', lineCount: 1, truncated: false },
      stdout: { tail: 'model said something', lineCount: 3, truncated: false },
      diagnostics: { rpc_close_reason: 'signal', stderr_present: true } as never,
    });
    expect(quality?.process?.signal).toBe('SIGTERM');
    expect(quality?.process?.exitCode).toBeUndefined();
    // stderr is a diagnostic channel and follows the run error message rule.
    expect(quality?.process?.stderr?.tail?.text).toBe('inactivity timeout');
    // stdout is the agent's own output, so it needs content consent; the
    // structural facts still survive with an explicit reason.
    expect(quality?.process?.stdout?.tail).toBeUndefined();
    expect(quality?.process?.stdout?.lineCount).toBe(3);
    expect(quality?.process?.stdout?.limitations)
      .toEqual(['stdout_tail_requires_content_consent']);
  });

  it('drops unbounded diagnostic values instead of shipping them as text', () => {
    const quality = buildSafeRunQualityProjectionV1({
      prefs: { metrics: true, content: true, artifactManifest: false },
      errorCode: 'AGENT_EXECUTION_FAILED',
      diagnostics: {
        rpc_close_reason: 'exit_nonzero',
        free_text: 'failed while reading /Users/alice/secret',
      } as never,
    });
    expect(quality?.process?.diagnostics).toEqual({ rpc_close_reason: 'exit_nonzero' });
  });

  it('reuses the single-Run safe projection for output, errors, tools, and manifests', () => {
    const quality = buildSafeRunQualityProjectionV1({
      prefs: { metrics: true, content: true, artifactManifest: true },
      messageOutput:
        'done token=sk-test-1234567890123456789012 <artifact>private body</artifact>',
      errorMessage: 'failed at /Users/alice/private token=sk-test-1234567890123456789012',
      errorCode: 'AGENT_EXIT',
      failure: {
        failure_category: 'auth',
        failure_detail: 'auth_required',
        failure_stage: 'session_init',
        retryable: false,
        user_action: 'login',
      },
      tools: [{
        id: 'tool-1',
        name: 'Bash',
        startedAt: 1_000,
        endedAt: 1_050,
        input: 'cat /Users/alice/private token=sk-test-1234567890123456789012',
        output: 'done /home/alice/private',
      }, {
        id: 'tool-2',
        name: 'Write',
        startedAt: 1_100,
        endedAt: 1_150,
        input: 'private file content',
        output: 'private result',
      }],
      attachmentManifest: [{
        object_class: 'attachment',
        attachment_id: 'att-1',
        storage_ref: 'od://objects/attachment/att-1',
        status: 'ok',
        project_id: 'project-1',
        run_id: 'run-1',
        workspace_id: null,
        redacted: false,
        truncated: false,
        stored_in_open_design: true,
        retention_policy: 'project_lifetime',
        access_scope: 'project',
        sensitivity: 'private',
        source: 'user_upload',
        expires_at: null,
        approved_by: null,
      }],
      manifestCompleteness: 'complete',
    });
    expect(quality).toBeDefined();
    if (!quality) throw new Error('expected the safe projection');

    const observation = buildStructuredMainRunObservationV1({
      taskExecutionId: 'task-safe-quality',
      runId: 'run-safe-quality',
      taskRunIndex: 0,
      stage: 'request',
      status: 'failed',
      quality,
    });

    expect(observation.quality?.result?.output?.text).toContain(
      '[REDACTED:artifact_content]',
    );
    expect(observation.quality?.result?.error).toMatchObject({
      code: 'AGENT_EXIT',
      category: 'auth',
      detail: 'auth_required',
      stage: 'session_init',
    });
    expect(observation.quality?.tools).toHaveLength(2);
    expect(observation.quality?.tools?.[0]).toMatchObject({
      callHash: createHash('sha256').update('tool-1').digest('hex'),
      name: 'Bash',
      status: 'completed',
    });
    expect(observation.quality?.tools?.[1]?.input?.text).toContain(
      '[REDACTED:tool_input:content_tool:Write]',
    );
    expect(observation.quality?.manifests?.attachments).toHaveLength(1);
    const serialized = JSON.stringify(observation.quality);
    expect(serialized).not.toContain('/Users/alice');
    expect(serialized).not.toContain('/home/alice');
    expect(serialized).not.toContain('sk-test-');
    expect(serialized).not.toContain('private file content');
    expect(serialized).not.toContain('private body');
  });

  it.each([
    ['request', 'bundle', 'open-design.od-next-prompt-bundle/v2'],
    ['clarification', 'turn', 'open-design.od-next-request-turn/v1'],
    ['contract_repair', 'turn', 'open-design.od-next-request-turn/v1'],
    ['production', 'turn', 'open-design.od-next-request-turn/v1'],
  ] as const)(
    'uses the verified raw inner-text identity for the %s hostComposed boundary',
    (stage, kind, promptSchema) => {
      const finalText = `${stage} /Users/alice/private token=sk-test-1234567890123456789012`;
      const sha256 = createHash('sha256').update(finalText, 'utf8').digest('hex');
      const promptTelemetry = bindOdNextExactSendPromptEvidence({
        telemetry: buildPromptStackTelemetry({
          composedPrompt: finalText,
          sections: [{ kind: 'odNextExactFinalText', content: finalText }],
        }),
        finalText,
        persisted: {
          kind,
          schema: promptSchema,
          text: finalText,
          utf8Bytes: Buffer.byteLength(finalText, 'utf8'),
          sha256,
        },
        stage,
      });

      const observation = buildStructuredMainRunObservationV1({
        taskExecutionId: 'task-exact',
        runId: `run-${stage}`,
        taskRunIndex: stage === 'request' ? 0 : 1,
        stage,
        status: 'succeeded',
        promptTelemetry,
      });

      expect(promptTelemetry.promptFingerprint).not.toBe(sha256);
      expect(observation.prompt.hostComposed).toMatchObject({
        availability: 'exact',
        source: 'daemon',
        hash: sha256,
        bytes: Buffer.byteLength(finalText, 'utf8'),
        safePayload: {
          type: 'open-design.od-next-host-composed-prompt',
          schema: 'open-design.od-next-exact-send-prompt/v1',
          boundary: 'hostComposed',
          kind,
          promptSchema,
          stage,
          sha256,
          utf8Bytes: Buffer.byteLength(finalText, 'utf8'),
        },
      });
      const serialized = JSON.stringify(observation.prompt.hostComposed.safePayload);
      expect(serialized).toContain('[REDACTED:path]');
      expect(serialized).toContain('[REDACTED:sk_key]');
      expect(serialized).not.toContain('/Users/alice');
      expect(serialized).not.toContain('sk-test-');
      expect(observation.prompt.childInjected.availability).toBe('unavailable');
      expect(observation.prompt.agentEffectiveContext.availability).toBe('unobservable');
    },
  );

  it('adapts existing Prompt, usage, and host timing facts without changing their source semantics', () => {
    const promptTelemetry = buildPromptStackTelemetry({
      composedPrompt: 'system\nuser request',
      sections: [
        { kind: 'daemonSystemPrompt', content: 'system' },
        { kind: 'userRequest', content: 'user request' },
      ],
    });

    const observation = buildStructuredMainRunObservationV1({
      taskExecutionId: 'task-1',
      runId: 'run-1',
      taskRunIndex: 0,
      runtimeSessionId: 'session-1',
      stage: 'request',
      status: 'succeeded',
      promptTelemetry,
      usage: {
        input_tokens: 100,
        input_tokens_provider: 100,
        input_tokens_effective: 120,
        output_tokens: 25,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 0,
        cache_token_source: 'anthropic',
        input_accounting_mode: 'additive',
        token_count_source: 'provider_usage',
        agent_reported_model: 'anthropic/claude-sonnet-4',
      },
      timing: {
        tool_call_count: 1,
        total_duration_ms: 500,
        time_to_first_token_ms: 120,
        phase_timing_status: 'partial',
      },
      startedAtMs: 1_000,
      endedAtMs: 1_500,
      agentCliVersion: 'codex-cli 0.147.0',
      runtimeCompanionName: 'vela',
      runtimeCompanionVersion: '0.0.1-od-next-local',
      runtimeAdapterVersion: 'od-codex-json-events/v1',
    });

    expect(observation.identity).toMatchObject({
      observationId: 'task-run:task-1:run-1',
      runtimeSessionId: 'session-1',
    });
    expect(observation.prompt.hostComposed).toMatchObject({
      availability: 'exact',
      source: 'daemon',
      hash: promptTelemetry.promptFingerprint,
      bytes: promptTelemetry.rawBytes,
    });
    expect(observation.prompt.hostComposed.safePayload).toMatchObject({
      type: 'open-design.prompt-stack',
      promptFingerprint: promptTelemetry.promptFingerprint,
    });
    expect(observation.prompt.childInjected.availability).toBe('unavailable');
    expect(observation.prompt.agentEffectiveContext.availability).toBe('unobservable');
    expect(observation.usage).toMatchObject({
      availability: 'complete',
      source: 'provider_stream',
      accountingMode: 'additive',
      values: {
        inputTokens: 100,
        effectiveInputTokens: 120,
        outputTokens: 25,
      },
      valueSources: {
        inputTokens: 'provider_stream',
        effectiveInputTokens: 'derived',
        outputTokens: 'provider_stream',
        cacheReadTokens: 'provider_stream',
        cacheWriteTokens: 'provider_stream',
      },
    });
    expect(observation.usage.values).not.toHaveProperty('totalTokens');
    expect(observation.timing).toMatchObject({
      availability: 'partial',
      evidence: [{
        source: 'host_wall_clock',
        clockDomain: 'unix_epoch_ms',
        startedAtMs: 1_000,
        endedAtMs: 1_500,
        durationMs: 500,
      }],
    });
    expect(observation.attributes).toMatchObject({
      agentCliVersion: 'codex-cli 0.147.0',
      runtimeCompanionName: 'vela',
      runtimeCompanionVersion: '0.0.1-od-next-local',
      runtimeAdapterVersion: 'od-codex-json-events/v1',
    });
  });

  it('keeps unavailable Prompt and usage absent instead of fabricating zero values', () => {
    const observation = buildStructuredMainRunObservationV1({
      runId: 'run-2',
      taskRunIndex: 1,
      stage: 'production',
      status: 'cancelled',
    });

    expect(observation.status).toBe('canceled');
    expect(observation.identity.taskExecutionId).toBe('compat-run:run-2');
    expect(observation.limitations).toContain('compatibility_task_identity_from_run_id');
    expect(observation.prompt.hostComposed.availability).toBe('unavailable');
    expect(observation.usage).toEqual({
      availability: 'unavailable',
      source: 'unknown',
      accountingMode: 'unknown',
      limitations: ['usage_not_observed'],
    });
    expect(observation.timing.availability).toBe('unavailable');
    expect(observation.usage).not.toHaveProperty('values');
    expect(observation.timing).not.toHaveProperty('evidence.0.durationMs');
  });

  it('does not relabel totals synthesized by the existing usage scanner as provider facts', () => {
    const usage = scanRunEventsForUsageAnalytics(
      [{
        event: 'agent',
        data: {
          type: 'usage',
          usage: {
            input_tokens: 1_000,
            output_tokens: 50,
            cache_read_input_tokens: 250,
            cache_creation_input_tokens: 100,
          },
        },
      }],
      'claude-opus-4',
      40,
    );
    expect(usage.total_tokens).toBe(1_400);

    const observation = buildStructuredMainRunObservationV1({
      taskExecutionId: 'task-3',
      runId: 'run-3',
      taskRunIndex: 0,
      stage: 'request',
      status: 'succeeded',
      usage,
    });

    expect(observation.usage.values).toMatchObject({
      inputTokens: 1_000,
      effectiveInputTokens: 1_350,
      outputTokens: 50,
      uncachedInputTokens: 1_000,
      estimatedContextTokens: 1_310,
    });
    expect(observation.usage.values).not.toHaveProperty('totalTokens');
    expect(observation.usage.valueSources).toMatchObject({
      inputTokens: 'provider_stream',
      outputTokens: 'provider_stream',
      effectiveInputTokens: 'derived',
      uncachedInputTokens: 'derived',
      estimatedContextTokens: 'derived',
    });
    expect(observation.usage.limitations).toEqual(expect.arrayContaining([
      'effective_input_tokens_are_derived',
      'uncached_input_tokens_are_derived',
      'estimated_context_tokens_are_derived',
      'total_tokens_omitted_without_raw_provenance',
    ]));
  });
});
