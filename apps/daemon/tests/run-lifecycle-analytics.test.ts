import { describe, expect, it } from 'vitest';
import {
  __forTestRetryFinalResultForRunStatus,
  __forTestRunRetryEventsForAnalytics,
  __forTestResolveRunProjectKindForAnalytics,
  __forTestScanRunEventsForRetrySideEffects,
  __forTestScanRunEventsForFinishedProps,
} from '../src/server.js';
import { hasExplicitRequestedModelForAnalytics } from '../src/run-analytics-observability.js';

describe('run lifecycle analytics', () => {
  it('falls back to stored project metadata when analytics hints omit project kind', () => {
    expect(
      __forTestResolveRunProjectKindForAnalytics({
        hintProjectKind: null,
        projectMetadata: { kind: 'prototype' },
      }),
    ).toBe('prototype');
  });

  it('maps project metadata kind to the analytics project_kind enum', () => {
    expect(
      __forTestResolveRunProjectKindForAnalytics({
        hintProjectKind: null,
        projectMetadata: { kind: 'deck' },
      }),
    ).toBe('slide_deck');
  });

  it('preserves explicit analytics hints over project metadata', () => {
    expect(
      __forTestResolveRunProjectKindForAnalytics({
        hintProjectKind: 'design_system',
        projectMetadata: { kind: 'other' },
      }),
    ).toBe('design_system');
  });

  it('classifies design-system workspace projects when hints are absent', () => {
    expect(
      __forTestResolveRunProjectKindForAnalytics({
        hintProjectKind: null,
        projectMetadata: { kind: 'other', importedFrom: 'design-system' },
      }),
    ).toBe('design_system');
  });
});

describe('scanRunEventsForFinishedProps', () => {
  function usageEvent(inputTokens: number, outputTokens: number) {
    return { event: 'agent', data: { type: 'usage', usage: { input_tokens: inputTokens, output_tokens: outputTokens } } };
  }

  function initializingEvent(model: string) {
    return { event: 'agent', data: { type: 'status', label: 'initializing', model } };
  }

  function modelEvent(model: string) {
    return { event: 'agent', data: { type: 'status', label: 'model', model } };
  }

  it('extracts agent model from initializing event when usage event follows it (real run order)', () => {
    // Append order mirrors a real run: initializing first, usage last.
    // Reverse scan must not stop at usage before reading the model signal.
    const events = [initializingEvent('claude-opus-4'), usageEvent(100, 200)];
    const result = __forTestScanRunEventsForFinishedProps(events, '');
    expect(result.agentReportedModel).toBe('claude-opus-4');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(200);
  });

  it('extracts agent model from ACP status:model event when usage follows it', () => {
    const events = [modelEvent('gpt-4o'), usageEvent(50, 75)];
    const result = __forTestScanRunEventsForFinishedProps(events, '');
    expect(result.agentReportedModel).toBe('gpt-4o');
    expect(result.inputTokens).toBe(50);
  });

  it('reads model from detail field when model field is absent', () => {
    const events = [
      { event: 'agent', data: { type: 'status', label: 'initializing', detail: 'gemini-pro' } },
      usageEvent(10, 20),
    ];
    const result = __forTestScanRunEventsForFinishedProps(events, '');
    expect(result.agentReportedModel).toBe('gemini-pro');
  });

  it('stops early on usage when reqBodyModel is set (no need to scan for agent model)', () => {
    // When the user picked a model, needAgentModel=false so the loop exits
    // as soon as usage tokens are found — it does not need to walk back to
    // the initializing event.
    const events = [initializingEvent('claude-opus-4'), usageEvent(30, 40)];
    const result = __forTestScanRunEventsForFinishedProps(events, 'claude-haiku-4-5');
    expect(result.inputTokens).toBe(30);
    expect(result.outputTokens).toBe(40);
    // agentReportedModel may or may not be found (early exit), but the caller
    // ignores it when reqBodyModel is set — no assertion on its value here.
  });

  it('treats synthetic default request model as unresolved and reads the agent model', () => {
    const events = [initializingEvent('gpt-5.4-mini'), usageEvent(30, 40)];
    const result = __forTestScanRunEventsForFinishedProps(events, 'default');
    expect(result.agentReportedModel).toBe('gpt-5.4-mini');
    expect(result.inputTokens).toBe(30);
    expect(result.outputTokens).toBe(40);
  });

  it('returns null agentReportedModel when no status event is present', () => {
    const events = [usageEvent(5, 10)];
    const result = __forTestScanRunEventsForFinishedProps(events, '');
    expect(result.agentReportedModel).toBeNull();
    expect(result.inputTokens).toBe(5);
  });

  it('handles empty event list', () => {
    const result = __forTestScanRunEventsForFinishedProps([], '');
    expect(result.agentReportedModel).toBeNull();
    expect(result.inputTokens).toBeUndefined();
    expect(result.outputTokens).toBeUndefined();
  });

  it('uses terminal usage event tokens when multiple usage events exist', () => {
    // Multi-step/multi-turn runs emit one usage event per step/turn (json-event-stream,
    // pi-rpc). Reverse scan hits the terminal (highest-index) usage first; the
    // !haveUsageTokens guard must prevent earlier usage events from overwriting those values
    // while the loop continues scanning back for agentReportedModel.
    const events = [
      initializingEvent('claude-opus-4'),
      usageEvent(100, 200), // step 1 — must NOT overwrite terminal values
      usageEvent(500, 750), // terminal turn — seen first in reverse, values must survive
    ];
    const result = __forTestScanRunEventsForFinishedProps(events, '');
    expect(result.agentReportedModel).toBe('claude-opus-4');
    expect(result.inputTokens).toBe(500);
    expect(result.outputTokens).toBe(750);
  });
});

describe('hasExplicitRequestedModelForAnalytics', () => {
  it('only treats concrete non-default model strings as explicit selections', () => {
    expect(hasExplicitRequestedModelForAnalytics(null)).toBe(false);
    expect(hasExplicitRequestedModelForAnalytics('')).toBe(false);
    expect(hasExplicitRequestedModelForAnalytics(' default ')).toBe(false);
    expect(hasExplicitRequestedModelForAnalytics('claude-opus-4-7')).toBe(true);
  });
});

describe('run retry analytics helpers', () => {
  it('detects retry-blocking side effects from run events', () => {
    expect(__forTestScanRunEventsForRetrySideEffects([
      { event: 'stderr', data: { chunk: 'HTTP 503' } },
    ])).toEqual({
      userVisibleOutputSeen: false,
      toolCallSeen: false,
      artifactWriteSeen: false,
      liveArtifactSeen: false,
    });

    expect(__forTestScanRunEventsForRetrySideEffects([
      { event: 'agent', data: { type: 'text_delta', delta: 'hello' } },
      { event: 'agent', data: { type: 'tool_use', id: 't1', name: 'Read', input: {} } },
      { event: 'agent', data: { type: 'live_artifact' } },
    ])).toMatchObject({
      userVisibleOutputSeen: true,
      toolCallSeen: true,
      liveArtifactSeen: true,
    });
  });

  it('derives retry final result from terminal status and attempt count', () => {
    expect(__forTestRetryFinalResultForRunStatus('succeeded', 0)).toBe('not_attempted');
    expect(__forTestRetryFinalResultForRunStatus('failed', 0)).toBe('suppressed');
    expect(__forTestRetryFinalResultForRunStatus('succeeded', 1)).toBe('success');
    expect(__forTestRetryFinalResultForRunStatus('failed', 1)).toBe('failed');
    expect(__forTestRetryFinalResultForRunStatus('canceled', 1)).toBe('suppressed');
  });

  it('selects retry events for daemon-side analytics replay', () => {
    const events = [
      { event: 'start', data: {} },
      { event: 'run_retry_attempted', data: { retry_attempt_index: 1 } },
      { event: 'run_retry_finished', data: { retry_result: 'success' } },
      { event: 'end', data: {} },
    ];
    expect(__forTestRunRetryEventsForAnalytics(events).map((event) => event.event)).toEqual([
      'run_retry_attempted',
      'run_retry_finished',
    ]);
  });
});
