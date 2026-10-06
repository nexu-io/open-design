import { describe, expect, it, vi } from 'vitest';

import {
  deriveRunTelemetryExportExpectation,
  exportRunObservation,
  type RunObservationExporter,
} from '../../src/observability/run-exporter.js';

describe('run telemetry export expectation', () => {
  it.each([
    {
      prefs: { metrics: false, content: true, artifactManifest: true },
      hasEffectiveSink: true,
      expected: {
        expected: false,
        status: 'not_expected',
        reason: 'metrics_consent_off',
      },
    },
    {
      prefs: { metrics: true, content: false, artifactManifest: true },
      hasEffectiveSink: true,
      expected: {
        expected: false,
        status: 'not_expected',
        reason: 'content_consent_off',
      },
    },
    {
      prefs: { metrics: true, content: true, artifactManifest: true },
      hasEffectiveSink: false,
      expected: {
        expected: false,
        status: 'not_expected',
        reason: 'missing_sink_config',
      },
    },
    {
      prefs: { metrics: true, content: true, artifactManifest: true },
      hasEffectiveSink: true,
      expected: { expected: true, status: 'queued' },
    },
  ])('derives $expected.reason without provider types', ({
    prefs,
    hasEffectiveSink,
    expected,
  }) => {
    expect(
      deriveRunTelemetryExportExpectation(prefs, hasEffectiveSink),
    ).toEqual(expected);
  });
});

describe('run observation exporter seam', () => {
  it('passes daemon facts and adapter options through without reshaping them', async () => {
    const facts = { runId: 'run-1', promptHash: 'sha256:fixture' };
    const options = { sink: 'fixture' as const };
    const exportRun = vi.fn(async () => ({ status: 'accepted' as const }));
    const exporter: RunObservationExporter<
      typeof facts,
      typeof options,
      { status: 'accepted' }
    > = {
      id: 'fixture-exporter',
      exportRun,
    };

    await expect(
      exportRunObservation(exporter, facts, options),
    ).resolves.toEqual({ status: 'accepted' });
    expect(exportRun).toHaveBeenCalledWith(facts, options);
  });
});
