import { describe, expect, it } from 'vitest';

import {
  NORMALIZED_AGENT_OBSERVATION_V1_SCHEMA,
  NormalizedAgentObservationV1Schema,
  SAFE_RUN_QUALITY_V1_SCHEMA,
  SafeRunProcessOutcomeV1Schema,
  SafeRunQualityV1Schema,
  normalizeAgentObservationV1,
} from '../src/index.js';

function baseObservation(overrides: Record<string, unknown> = {}) {
  return {
    schema: NORMALIZED_AGENT_OBSERVATION_V1_SCHEMA,
    identity: {
      observationId: 'task-run:task-1:run-1',
      taskExecutionId: 'task-1',
      runId: 'run-1',
      taskRunIndex: 0,
    },
    kind: 'task_run',
    stage: 'request',
    status: 'completed',
    prompt: {
      hostComposed: {
        availability: 'exact',
        source: 'daemon',
        hash: 'sha256:prompt',
        bytes: 42,
        safePayload: { type: 'open-design.prompt-stack' },
        limitations: ['redacted_safe_payload'],
      },
      childInjected: {
        availability: 'unavailable',
        source: 'runtime',
        limitations: ['not_reported_by_runtime'],
      },
      agentEffectiveContext: {
        availability: 'unobservable',
        limitations: ['agent_effective_context_unobservable'],
      },
    },
    usage: {
      availability: 'complete',
      source: 'provider_stream',
      accountingMode: 'inclusive',
      values: {
        inputTokens: 120,
        effectiveInputTokens: 120,
        outputTokens: 30,
        cacheReadTokens: 20,
      },
      valueSources: {
        inputTokens: 'provider_stream',
        effectiveInputTokens: 'provider_stream',
        outputTokens: 'provider_stream',
        cacheReadTokens: 'provider_stream',
      },
      limitations: [],
    },
    timing: {
      availability: 'complete',
      evidence: [{
        source: 'host_wall_clock',
        clockDomain: 'unix_epoch_ms',
        startedAtMs: 1_000,
        endedAtMs: 1_300,
        durationMs: 300,
      }],
      limitations: [],
    },
    limitations: [],
    ...overrides,
  };
}

describe('NormalizedAgentObservationV1', () => {
  it('keeps complete, partial, and unavailable usage distinct without filling missing values', () => {
    const complete = NormalizedAgentObservationV1Schema.parse(baseObservation());
    expect(complete.usage).toMatchObject({
      availability: 'complete',
      source: 'provider_stream',
      accountingMode: 'inclusive',
      values: { inputTokens: 120, outputTokens: 30 },
    });

    const partial = NormalizedAgentObservationV1Schema.parse(baseObservation({
      usage: {
        availability: 'partial',
        source: 'provider_stream',
        accountingMode: 'unknown',
        values: { outputTokens: 30 },
        valueSources: { outputTokens: 'provider_stream' },
        limitations: ['provider_omitted_input_tokens'],
      },
    }));
    expect(partial.usage.values).toEqual({ outputTokens: 30 });

    const unavailable = normalizeAgentObservationV1({
      ...baseObservation(),
      usage: undefined,
    });
    expect(unavailable.usage).toEqual({
      availability: 'unavailable',
      source: 'unknown',
      accountingMode: 'unknown',
      limitations: ['usage_not_observed'],
    });
    expect(unavailable.usage).not.toHaveProperty('values');
  });

  it('records exact host Prompt separately from unavailable child Prompt and unobservable effective context', () => {
    const observation = NormalizedAgentObservationV1Schema.parse(baseObservation());
    expect(observation.prompt.hostComposed).toMatchObject({
      availability: 'exact',
      source: 'daemon',
      hash: 'sha256:prompt',
      bytes: 42,
    });
    expect(observation.prompt.childInjected).not.toHaveProperty('hash');
    expect(observation.prompt.agentEffectiveContext).toEqual({
      availability: 'unobservable',
      limitations: ['agent_effective_context_unobservable'],
    });
  });

  it('accepts sourced partial Prompt evidence and rejects contradictory Prompt provenance', () => {
    const partial = NormalizedAgentObservationV1Schema.parse(baseObservation({
      prompt: {
        ...(baseObservation().prompt as Record<string, unknown>),
        childInjected: {
          availability: 'partial',
          source: 'runtime',
          hash: 'sha256:child-prompt',
          limitations: ['runtime_omitted_prompt_bytes'],
        },
      },
    }));
    expect(partial.prompt.childInjected).toMatchObject({
      availability: 'partial',
      source: 'runtime',
      hash: 'sha256:child-prompt',
    });

    for (const availability of ['exact', 'partial'] as const) {
      expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
        prompt: {
          ...(baseObservation().prompt as Record<string, unknown>),
          childInjected: {
            availability,
            source: 'unknown',
            hash: 'sha256:child-prompt',
            ...(availability === 'exact'
              ? { bytes: 10, safePayload: { redacted: true } }
              : {}),
            limitations: ['source_not_known'],
          },
        },
      }))).toThrow(/requires a source/i);
    }

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      prompt: {
        ...(baseObservation().prompt as Record<string, unknown>),
        agentEffectiveContext: {
          availability: 'unobservable',
          source: 'runtime',
          limitations: ['agent_effective_context_unobservable'],
        },
      },
    }))).toThrow(/must not claim a source/i);
  });

  it('keeps host and runtime clocks as separate evidence and never derives a cross-clock duration', () => {
    const observation = NormalizedAgentObservationV1Schema.parse(baseObservation({
      timing: {
        availability: 'partial',
        evidence: [
          {
            source: 'host_wall_clock',
            clockDomain: 'unix_epoch_ms',
            startedAtMs: 1_000,
          },
          {
            source: 'runtime',
            clockDomain: 'runtime_monotonic_ms',
            endedAtMs: 80,
          },
        ],
        limitations: ['clock_domains_not_comparable'],
      },
    }));
    expect(observation.timing.evidence).toHaveLength(2);
    expect(observation.timing).not.toHaveProperty('durationMs');
    expect((observation.timing.evidence ?? []).every(
      (item) => item.durationMs === undefined,
    )).toBe(true);
  });

  it('rejects a host timing source paired with the wrong clock domain', () => {
    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      timing: {
        availability: 'partial',
        evidence: [{
          source: 'host_wall_clock',
          clockDomain: 'runtime_monotonic_ms',
          startedAtMs: 10,
        }],
        limitations: ['clock_domain_mismatch'],
      },
    }))).toThrow(/conflicts with clock domain/i);
  });

  it('normalizes cancelled and unknown statuses while preserving forward-compatible fields', () => {
    const canceled = normalizeAgentObservationV1({
      ...baseObservation(),
      status: 'cancelled',
      futureRoot: { enabled: true },
      identity: {
        ...(baseObservation().identity as Record<string, unknown>),
        futureIdentity: 'kept',
      },
      usage: {
        ...(baseObservation().usage as Record<string, unknown>),
        futureProviderCounter: 7,
      },
    });
    expect(canceled.status).toBe('canceled');
    expect(canceled.futureRoot).toEqual({ enabled: true });
    expect(canceled.identity.futureIdentity).toBe('kept');
    expect(canceled.usage.futureProviderCounter).toBe(7);

    const unknown = normalizeAgentObservationV1({
      ...baseObservation(),
      status: 'future_terminal_state',
    });
    expect(unknown.status).toBe('unknown');
    expect(unknown.limitations).toContain('unrecognized_status:future_terminal_state');
  });

  it('keeps a recovered parent completed while its child remains failed', () => {
    const parent = NormalizedAgentObservationV1Schema.parse(baseObservation());
    const child = NormalizedAgentObservationV1Schema.parse(baseObservation({
      identity: {
        observationId: 'child:task-1:run-1:child-1',
        taskExecutionId: 'task-1',
        runId: 'run-1',
        taskRunIndex: 0,
        parentObservationId: parent.identity.observationId,
        runtimeSessionId: 'child-session-1',
      },
      kind: 'child_agent',
      status: 'failed',
    }));

    expect(parent.status).toBe('completed');
    expect(child.status).toBe('failed');
    expect(child.identity.parentObservationId).toBe(parent.identity.observationId);
  });

  it('supports parented model-call and tool facts without adding provider wire fields', () => {
    for (const [kind, observationId] of [
      ['model_call', 'model-call:task-1:run-1:call-1'],
      ['tool', 'tool:task-1:run-1:tool-1'],
    ] as const) {
      const observation = NormalizedAgentObservationV1Schema.parse(baseObservation({
        identity: {
          observationId,
          taskExecutionId: 'task-1',
          runId: 'run-1',
          taskRunIndex: 0,
          parentObservationId: 'task-run:task-1:run-1',
        },
        kind,
        status: 'completed',
      }));
      expect(observation.kind).toBe(kind);
      expect(observation.identity.parentObservationId).toBe('task-run:task-1:run-1');
      expect(observation).not.toHaveProperty('langfuse');
    }
  });

  it('accepts only the versioned safe Run quality projection fields', () => {
    const quality = {
      schema: 'open-design.safe-run-quality/v1',
      result: {
        output: {
          text: 'redacted assistant result',
          redacted: true,
          truncated: false,
        },
        error: {
          message: {
            text: '[REDACTED:sk_key]',
            redacted: true,
            truncated: false,
          },
          code: 'AGENT_EXIT',
          category: 'runtime',
          detail: 'provider_error',
          stage: 'agent_call',
        },
      },
      tools: [{
        callHash: 'a'.repeat(64),
        name: 'Bash',
        input: {
          text: 'ls [REDACTED:local_path]',
          redacted: true,
          truncated: false,
        },
        output: {
          text: 'done',
          redacted: true,
          truncated: false,
        },
        status: 'completed',
        isError: false,
      }],
      manifests: {
        completeness: 'complete',
        attachments: [{
          object_class: 'attachment',
          attachment_id: 'att-1',
          storage_ref: 'od://objects/attachment/att-1',
          status: 'ok',
          redacted: false,
          truncated: false,
        }],
        artifacts: [],
        inputTextSnapshots: [],
      },
    } as const;
    const parsed = NormalizedAgentObservationV1Schema.parse(baseObservation({ quality }));
    expect(parsed.quality).toEqual(quality);

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      quality: {
        ...quality,
        manifests: {
          ...quality.manifests,
          attachments: [{
            ...quality.manifests.attachments[0],
            rawContent: { secret: 'must-not-cross-the-contract' },
          }],
        },
      },
    }))).toThrow(/unrecognized key/i);
  });

  it('rejects guessed usage values and self-parent relationships', () => {
    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      usage: {
        availability: 'unavailable',
        source: 'unknown',
        accountingMode: 'unknown',
        values: { inputTokens: 0 },
        limitations: ['guessed_zero'],
      },
    }))).toThrow(/unavailable usage must not carry values/i);

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      identity: {
        observationId: 'same',
        taskExecutionId: 'task-1',
        runId: 'run-1',
        taskRunIndex: 0,
        parentObservationId: 'same',
      },
    }))).toThrow(/cannot parent itself/i);
  });

  it('rejects completeness labels that overstate the evidence', () => {
    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      usage: {
        availability: 'complete',
        source: 'provider_stream',
        accountingMode: 'unknown',
        values: { outputTokens: 10 },
        valueSources: { outputTokens: 'provider_stream' },
        limitations: [],
      },
    }))).toThrow(/complete usage requires/i);

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      usage: {
        availability: 'partial',
        source: 'provider_stream',
        accountingMode: 'unknown',
        values: { outputTokens: 10 },
        valueSources: { outputTokens: 'provider_stream' },
        limitations: [],
      },
    }))).toThrow(/partial usage requires a limitation/i);

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      prompt: {
        ...(baseObservation().prompt as Record<string, unknown>),
        hostComposed: {
          availability: 'exact',
          source: 'daemon',
          hash: 'sha256:prompt',
          bytes: 42,
          limitations: [],
        },
      },
    }))).toThrow(/safe payload/i);

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      timing: {
        availability: 'complete',
        evidence: [{
          source: 'host_wall_clock',
          clockDomain: 'unix_epoch_ms',
          startedAtMs: 1_000,
        }],
        limitations: [],
      },
    }))).toThrow(/complete timing requires/i);

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      usage: {
        availability: 'complete',
        source: 'derived',
        accountingMode: 'inclusive',
        values: { inputTokens: 10, outputTokens: 5 },
        valueSources: { inputTokens: 'derived', outputTokens: 'derived' },
        limitations: [],
      },
    }))).toThrow(/complete usage requires/i);

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      usage: {
        availability: 'unavailable',
        source: 'provider_stream',
        accountingMode: 'unknown',
        limitations: ['provider_did_not_report_usage'],
      },
    }))).toThrow(/unknown source and accounting mode/i);

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      usage: {
        availability: 'complete',
        source: 'provider_stream',
        accountingMode: 'unknown',
        values: { inputTokens: 10, outputTokens: 5 },
        valueSources: {
          inputTokens: 'provider_stream',
          outputTokens: 'provider_stream',
        },
        limitations: [],
      },
    }))).toThrow(/unknown accounting mode requires a limitation/i);

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      timing: {
        availability: 'complete',
        evidence: [{
          source: 'host_wall_clock',
          clockDomain: 'unix_epoch_ms',
          startedAtMs: 1_000,
          endedAtMs: 1_200,
          durationMs: 900,
        }],
        limitations: [],
      },
    }))).toThrow(/duration disagree/i);
  });

  it('rejects contradictory per-value usage provenance', () => {
    const completeUsage = baseObservation().usage as Record<string, unknown>;
    const completeValues = completeUsage.values as Record<string, unknown>;
    const completeSources = completeUsage.valueSources as Record<string, unknown>;

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      usage: {
        ...completeUsage,
        values: { ...completeValues, futureCounter: 1 },
      },
    }))).toThrow(/futureCounter requires an explicit source/i);

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      usage: {
        ...completeUsage,
        valueSources: { ...completeSources, missingCounter: 'provider_stream' },
      },
    }))).toThrow(/missingCounter has no matching numeric value/i);

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      usage: {
        ...completeUsage,
        values: { ...completeValues, totalTokens: 150 },
        valueSources: { ...completeSources, totalTokens: 'derived' },
        limitations: ['total_tokens_derived'],
      },
    }))).toThrow(/total tokens must not be inferred/i);

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      usage: {
        ...completeUsage,
        valueSources: { ...completeSources, effectiveInputTokens: 'derived' },
        limitations: [],
      },
    }))).toThrow(/derived usage values require a limitation/i);

    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      usage: {
        ...completeUsage,
        valueSources: { ...completeSources, inputTokens: 'rollout' },
      },
    }))).toThrow(/complete usage requires/i);
  });

  it('requires explicit evidence before complete zero-child coverage', () => {
    expect(() => NormalizedAgentObservationV1Schema.parse(baseObservation({
      childEvidenceCoverage: {
        availability: 'complete',
        source: 'codex_rollout',
        knownChildCount: 0,
        explicitZero: false,
        limitations: [],
        diagnosticCounts: [],
      },
    }))).toThrow(/must be explicitly observed/i);

    expect(NormalizedAgentObservationV1Schema.parse(baseObservation({
      childEvidenceCoverage: {
        availability: 'complete',
        source: 'codex_rollout',
        knownChildCount: 0,
        explicitZero: true,
        limitations: [],
        diagnosticCounts: [],
      },
    })).childEvidenceCoverage).toMatchObject({
      availability: 'complete',
      explicitZero: true,
      knownChildCount: 0,
    });
  });
});

describe('SafeRunProcessOutcomeV1Schema', () => {
  it('accepts the terminal process evidence a failed Run reports', () => {
    const parsed = SafeRunProcessOutcomeV1Schema.parse({
      exitCode: 1,
      signal: 'SIGTERM',
      stderr: {
        tail: { text: 'HTTP 401 Unauthorized', redacted: true, truncated: false },
        lineCount: 3,
        truncated: false,
      },
      diagnostics: { rpc_close_reason: 'exit_nonzero', stderr_present: true },
    });
    expect(parsed.exitCode).toBe(1);
    expect(parsed.stderr?.tail?.text).toBe('HTTP 401 Unauthorized');
    expect(parsed.diagnostics).toEqual({
      rpc_close_reason: 'exit_nonzero',
      stderr_present: true,
    });
  });

  it('requires a limitation when a stream summary withholds its tail text', () => {
    expect(() => SafeRunProcessOutcomeV1Schema.parse({
      stdout: { lineCount: 4, truncated: false },
    })).toThrow();
    expect(SafeRunProcessOutcomeV1Schema.parse({
      stdout: {
        lineCount: 4,
        truncated: false,
        limitations: ['stdout_tail_requires_content_consent'],
      },
    }).stdout?.lineCount).toBe(4);
  });

  it('rejects free text and unbounded keys in the diagnostics record', () => {
    expect(() => SafeRunProcessOutcomeV1Schema.parse({
      diagnostics: { rpc_close_reason: 'failed while reading /Users/alice/secret file' },
    })).toThrow();
    expect(() => SafeRunProcessOutcomeV1Schema.parse({
      diagnostics: { 'Not A Key': true },
    })).toThrow();
  });

  it('keeps the process outcome on the run quality projection', () => {
    const quality = SafeRunQualityV1Schema.parse({
      schema: SAFE_RUN_QUALITY_V1_SCHEMA,
      process: { exitCode: 0 },
    });
    expect(quality.process?.exitCode).toBe(0);
  });
});
