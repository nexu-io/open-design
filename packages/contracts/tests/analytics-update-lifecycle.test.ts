import { describe, expect, it } from 'vitest';

import {
  UPDATE_LIFECYCLE_STAGES,
  parseUpdateLifecycleObservation,
} from '../src/analytics/update-lifecycle.js';

describe('update lifecycle analytics contract', () => {
  it('accepts the renderer quiescence boundary as a first-class handoff stage', () => {
    expect(UPDATE_LIFECYCLE_STAGES).toContain('renderer_quiesced');
    expect(parseUpdateLifecycleObservation({
      stage: 'renderer_quiesced',
      outcome: 'completed',
    })).toEqual({
      stage: 'renderer_quiesced',
      outcome: 'completed',
    });
  });
});

import { buildClientTelemetryParams, parseClientMetricEvent } from '../src/analytics/client-metrics.js';
it('admits stage denominators through the common metric schema and strips private fields', () => {
  const props = { ...buildClientTelemetryParams({}, {
    eventId: 'flow:check:started', deviceId: 'device', clientType: 'desktop',
    captureSource: 'desktop/updater', env: 'test', appVersion: '1.0.0',
    reportedAt: '2026-10-19T00:00:00.000Z',
  }), metric_schema_version: 1, telemetry_capability: 'supported', flow_id: 'flow',
    stage: 'check', result: 'started', reason_code: null, from_version: '1.0.0', to_version: null,
    update_path: null, artifact_type: null, trigger: 'manual', duration_ms: null,
  };
  expect(parseClientMetricEvent('client_update_stage_result', { ...props, path: '/private', pid: 123 })).toEqual(props);
  for (const patch of [{ stage: 'arbitrary' }, { reason_code: '/private' }, { flow_id: '../path' }, { duration_ms: -1 }]) {
    expect(parseClientMetricEvent('client_update_stage_result', { ...props, ...patch })).toBeNull();
  }
});
