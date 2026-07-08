import { describe, expect, it } from 'vitest';
import {
  createRunLifecycleTracer,
  runLifecycleMarkersForStreamEvent,
} from '../src/run-lifecycle-tracer.js';

describe('runLifecycleMarkersForStreamEvent', () => {
  it('captures live artifacts emitted through the agent stream path', () => {
    expect(
      runLifecycleMarkersForStreamEvent('agent', { type: 'live_artifact' }),
    ).toEqual({
      firstVisibleOutput: false,
      firstArtifactWrite: true,
    });
  });

  it('keeps tool-first events out of visible output and artifact timing', () => {
    expect(
      runLifecycleMarkersForStreamEvent('agent', { type: 'tool_use' }),
    ).toEqual({
      firstModelEventType: 'tool_use',
      firstVisibleOutput: false,
      firstArtifactWrite: false,
    });
  });
});

describe('createRunLifecycleTracer', () => {
  it('only records first timestamps for repeated lifecycle marks', () => {
    const run = {};
    const lifecycle = createRunLifecycleTracer(run);

    lifecycle.mark('first_artifact_write', 1_000);
    lifecycle.mark('first_artifact_write', 2_000);
    lifecycle.markFirstModelEvent('tool_use', 3_000);
    lifecycle.markFirstModelEvent('text_delta', 4_000);

    expect(run).toEqual({
      analyticsTelemetry: {
        firstArtifactWriteAt: 1_000,
        firstModelEventAt: 3_000,
        firstModelEventType: 'tool_use',
      },
    });
  });
});
