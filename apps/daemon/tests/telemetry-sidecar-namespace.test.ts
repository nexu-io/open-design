import { describe, expect, it } from 'vitest';

import { resolveInstallerObservationNamespace } from '../src/routes/telemetry.js';

describe('installer observation namespace', () => {
  it('uses the daemon runtime namespace instead of ambient sidecar env', () => {
    const previous = process.env.OD_SIDECAR_NAMESPACE;
    process.env.OD_SIDECAR_NAMESPACE = 'stale-env-namespace';
    try {
      expect(resolveInstallerObservationNamespace('release-beta')).toBe('release-beta');
      expect(resolveInstallerObservationNamespace(undefined)).toBe('default');
    } finally {
      if (previous == null) delete process.env.OD_SIDECAR_NAMESPACE;
      else process.env.OD_SIDECAR_NAMESPACE = previous;
    }
  });
});
