import { describe, expect, it } from 'vitest';

import {
  MAC_PACKAGED_SMOKE_SCENARIOS,
  MAC_SHELL_SMOKE_SCENARIO_IDS,
  resolvePackagedSmokeLanes,
  type PackagedSmokeDomain,
} from '@/vitest/packaged-smoke-plan';

describe('packaged smoke plan', () => {
  it('keeps the existing core and full defaults', () => {
    expect(resolvePackagedSmokeLanes('core', undefined)).toEqual(['shell', 'standalone']);
    expect(resolvePackagedSmokeLanes('full', '')).toEqual(['shell', 'standalone', 'migration']);
    expect(resolvePackagedSmokeLanes('skip', undefined)).toEqual([]);
  });

  it('allows a proven Shell to leave Standalone and migration acceptance hot', () => {
    expect(resolvePackagedSmokeLanes('full', 'standalone,migration')).toEqual(['standalone', 'migration']);
  });

  it('normalizes order and duplicate lanes', () => {
    expect(resolvePackagedSmokeLanes('full', 'migration, shell, migration')).toEqual(['shell', 'migration']);
  });

  it('rejects malformed and unsupported lane selections', () => {
    expect(() => resolvePackagedSmokeLanes('full', 'shell,,migration')).toThrow(/empty lane/);
    expect(() => resolvePackagedSmokeLanes('full', 'closure')).toThrow(/unsupported packaged smoke lane/);
    expect(() => resolvePackagedSmokeLanes('skip', 'shell')).toThrow(/profile is skip/);
  });

  it('keeps every Shell proof scenario in the Shell responsibility lane', () => {
    const scenarios = Object.values(MAC_PACKAGED_SMOKE_SCENARIOS);
    expect(MAC_SHELL_SMOKE_SCENARIO_IDS).toEqual([
      'mac-shell-lifecycle',
      'mac-shell-silent-update',
      'mac-shell-rollback',
    ]);
    expect(scenarios.filter((scenario) => scenario.lane === 'shell').map((scenario) => scenario.id))
      .toEqual(MAC_SHELL_SMOKE_SCENARIO_IDS);
    expect(scenarios.some((scenario) =>
      (scenario.domains as readonly PackagedSmokeDomain[]).includes('standalone'))).toBe(true);
    expect(scenarios.some((scenario) =>
      (scenario.domains as readonly PackagedSmokeDomain[]).includes('distribution'))).toBe(true);
  });
});
