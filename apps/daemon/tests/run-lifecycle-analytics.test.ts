import { describe, expect, it } from 'vitest';
import {
  __forTestResolveRunProjectKindForAnalytics,
  __forTestScanRunEventsForFinishedProps,
} from '../src/server.js';

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
