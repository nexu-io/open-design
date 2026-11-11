import { describe, expect, it } from 'vitest';
import { amrArtifactUpgradeSessionKey } from '../../src/runtime/amr-artifact-upgrade';

describe('amrArtifactUpgradeSessionKey', () => {
  it('requires both project and conversation identity', () => {
    expect(amrArtifactUpgradeSessionKey(null, 'conversation')).toBeNull();
    expect(amrArtifactUpgradeSessionKey('project', '')).toBeNull();
    expect(amrArtifactUpgradeSessionKey(' project ', ' conversation ')).toBe(JSON.stringify(['project', 'conversation']));
  });
});
