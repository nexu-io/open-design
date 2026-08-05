import { describe, expect, it } from 'vitest';
import { shouldReportRunCompletedFromMessage } from '../../src/runtimes/telemetry-message.js';

describe('shouldReportRunCompletedFromMessage', () => {
  it('requires a run id, terminal status, and finalization marker', () => {
    expect(shouldReportRunCompletedFromMessage({ runId: 'run-1', runStatus: 'succeeded' }, {})).toBe(false);
    expect(shouldReportRunCompletedFromMessage({ runId: 'run-1', runStatus: 'running' }, { telemetryFinalized: true })).toBe(false);
    expect(shouldReportRunCompletedFromMessage({ runId: 'run-1', runStatus: 'succeeded' }, { telemetryFinalized: true })).toBe(true);
  });

  it('rejects absent or incomplete persisted messages', () => {
    expect(shouldReportRunCompletedFromMessage(null, { telemetryFinalized: true })).toBe(false);
    expect(shouldReportRunCompletedFromMessage({ runStatus: 'failed' }, { telemetryFinalized: true })).toBe(false);
    expect(shouldReportRunCompletedFromMessage({ runId: 'run-1' }, { telemetryFinalized: true })).toBe(false);
  });
});
