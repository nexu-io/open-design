import { describe, expect, it } from 'vitest';

import {
  createShellSmokeAcceptanceDigest,
  shellSmokeAcceptanceSourcePaths,
} from '../../../.github/scripts/release/shell-smoke-acceptance.ts';

describe('release Shell smoke acceptance identity', () => {
  it('keeps platform-owned smoke sources out of the opposite proof', () => {
    const macArm64 = shellSmokeAcceptanceSourcePaths('mac_arm64');
    const macX64 = shellSmokeAcceptanceSourcePaths('mac_x64');
    const win = shellSmokeAcceptanceSourcePaths('win_x64');
    expect(macArm64).toContain('e2e/specs/mac.spec.ts');
    expect(macArm64).toContain('.github/actions/release/platform/mac/exact/action.yml');
    expect(macArm64).not.toContain('e2e/specs/win.spec.ts');
    expect(macX64).toEqual(macArm64);
    expect(win).toContain('e2e/specs/win.spec.ts');
    expect(win).toContain('.github/actions/release/platform/win/exact/action.yml');
    expect(win).not.toContain('e2e/specs/mac.spec.ts');
    expect(macArm64).toContain('e2e/lib/vitest/packaged-smoke-contract.ts');
    expect(win).toContain('e2e/lib/vitest/packaged-smoke-contract.ts');
  });

  it('hashes source content and labels deterministically', () => {
    const shared = { body: 'shared-v1', label: 'shared.ts' };
    const platform = { body: 'platform-v1', label: 'platform.yml' };
    const initial = createShellSmokeAcceptanceDigest([shared, platform]);

    expect(createShellSmokeAcceptanceDigest([platform, shared])).toBe(initial);
    expect(createShellSmokeAcceptanceDigest([shared, { ...platform, body: 'platform-v2' }])).not.toBe(initial);
    expect(createShellSmokeAcceptanceDigest([shared, { ...platform, label: 'other.yml' }])).not.toBe(initial);
  });
});
