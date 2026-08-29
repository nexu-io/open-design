import { describe, expect, test } from 'vitest';

import { resolvePackagedSmokeNamespace } from '@/vitest/suite';

describe('packaged smoke namespace resolution', () => {
  test('keeps explicit namespace overrides authoritative', () => {
    expect(resolvePackagedSmokeNamespace('mac', {
      OD_PACKAGED_E2E_NAMESPACE: 'custom-prerelease',
      OD_PACKAGED_E2E_RELEASE_CHANNEL: 'prerelease',
    })).toBe('custom-prerelease');
  });

  test('derives prerelease namespaces from release channel when no override is set', () => {
    const env = { OD_PACKAGED_E2E_RELEASE_CHANNEL: 'prerelease' };

    expect(resolvePackagedSmokeNamespace('mac', env)).toBe('release-prerelease');
    expect(resolvePackagedSmokeNamespace('win', env)).toBe('release-prerelease-win');
    expect(resolvePackagedSmokeNamespace('linux', env)).toBe('release-prerelease-linux');
  });

  test('preserves legacy beta-oriented local defaults when release channel is absent', () => {
    expect(resolvePackagedSmokeNamespace('mac', {})).toBe('release-beta');
    expect(resolvePackagedSmokeNamespace('win', {})).toBe('release-beta-win');
    expect(resolvePackagedSmokeNamespace('linux', {})).toBe('ci-pr-linux');
  });
});
