import { describe, expect, it } from 'vitest';
import type {
  AnalyticsEventName,
  AnalyticsEventPayload,
  ChatArtifactCaptureResultProps,
} from '../src/analytics/events.js';

// The daemon emits this at every run's terminal chokepoint. Registering it here
// is what makes it a declared event rather than a string one module invented:
// the name belongs to the catalogue and the props belong to the payload union,
// so a downstream consumer can exhaustively switch on it.
describe('analytics chat_artifact_capture_result contract', () => {
  it('is a declared event name', () => {
    const name: AnalyticsEventName = 'chat_artifact_capture_result';
    expect(name).toBe('chat_artifact_capture_result');
  });

  it('carries the capture counts and the source-drift alarm', () => {
    const props = {
      page_name: 'studio',
      area: 'chat_artifact_capture',
      project_id: 'project-1',
      run_id: 'run-1',
      ref_count: 3,
      captured_count: 1,
      reused_count: 1,
      failed_count: 1,
      source_changed_count: 1,
      result: 'degraded',
    } satisfies ChatArtifactCaptureResultProps;
    const payload = {
      event: 'chat_artifact_capture_result',
      props,
    } satisfies Extract<AnalyticsEventPayload, { event: 'chat_artifact_capture_result' }>;

    expect(payload.props.source_changed_count).toBe(1);
    // The alarm is a lens on the failures, not a bucket carved out of them.
    expect(payload.props.failed_count).toBeGreaterThanOrEqual(
      payload.props.source_changed_count,
    );
  });

  it('is a required field, so a healthy turn still reports a zero', () => {
    const props = {
      page_name: 'studio',
      area: 'chat_artifact_capture',
      project_id: 'project-1',
      run_id: 'run-1',
      ref_count: 1,
      captured_count: 1,
      reused_count: 0,
      failed_count: 0,
      source_changed_count: 0,
      result: 'success',
    } satisfies ChatArtifactCaptureResultProps;

    // An optional counter is indistinguishable from a dropped one on the wire,
    // and the alarm needs a real denominator.
    expect(Object.prototype.hasOwnProperty.call(props, 'source_changed_count')).toBe(true);
  });
});
