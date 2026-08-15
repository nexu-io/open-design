import { describe, expect, it } from 'vitest';

import { createPackagedColdStartObservation } from '../lib/vitest/packaged-cold-start.ts';
import { assertPackagedClosureBinding } from '../lib/vitest/packaged-closure-binding.ts';

const digest = `sha256:${'a'.repeat(64)}`;
const expected = {
  channel: 'beta',
  namespace: 'release-beta',
  releaseVersion: '0.19.1-beta.4',
  target: 'darwin-arm64',
  version: '0.19.1-beta.4',
};

function binding() {
  return {
    active: {
      releaseVersion: expected.releaseVersion,
      standalone: { ...expected, digest, protocolVersion: 1 },
    },
  };
}

describe('packaged Closure release evidence', () => {
  it('accepts an exact committed binding and rejects target drift', () => {
    expect(assertPackagedClosureBinding(binding(), expected)).toEqual(binding());
    expect(() => assertPackagedClosureBinding(binding(), { ...expected, target: 'win32-x64' }))
      .toThrow(/target mismatch/u);
  });

  it('records launch and readiness independently under the functional timeout', () => {
    expect(createPackagedColdStartObservation({
      launchFinishedAt: 1_750,
      launchStartedAt: 1_000,
      readinessBudgetMs: 90_000,
      readyAt: 4_000,
    })).toEqual({
      schemaVersion: 1,
      status: 'success',
      timing: {
        launchDurationMs: 750,
        readinessBudgetMs: 90_000,
        readinessDurationMs: 2_250,
        totalDurationMs: 3_000,
      },
    });
  });
});
