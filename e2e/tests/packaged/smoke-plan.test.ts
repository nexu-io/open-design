import { describe, expect, it } from 'vitest';

import {
  MAC_PACKAGED_SMOKE_SCENARIOS,
  MAC_SHELL_PROOF_SCENARIO_IDS,
  resolvePackagedSmokeLanes,
  type PackagedSmokeDomain,
  WIN_PACKAGED_SMOKE_SCENARIOS,
  WIN_SHELL_PROOF_SCENARIO_IDS,
} from '@/vitest/packaged-smoke-plan';

describe('packaged smoke plan', () => {
  it('keeps the existing core and full defaults', () => {
    expect(resolvePackagedSmokeLanes('core', undefined)).toEqual(['shell', 'standalone']);
    expect(resolvePackagedSmokeLanes('full', '')).toEqual(['shell', 'standalone', 'migration']);
    expect(resolvePackagedSmokeLanes('skip', undefined)).toEqual([]);
  });

  it('allows a proven Shell and installer boundary to leave Standalone acceptance hot', () => {
    expect(resolvePackagedSmokeLanes('full', 'standalone')).toEqual(['standalone']);
  });

  it('normalizes order and duplicate lanes', () => {
    expect(resolvePackagedSmokeLanes('full', 'migration, shell, migration')).toEqual(['shell', 'migration']);
  });

  it('rejects malformed and unsupported lane selections', () => {
    expect(() => resolvePackagedSmokeLanes('full', 'shell,,migration')).toThrow(/empty lane/);
    expect(() => resolvePackagedSmokeLanes('full', 'closure')).toThrow(/unsupported packaged smoke lane/);
    expect(() => resolvePackagedSmokeLanes('skip', 'shell')).toThrow(/profile is skip/);
  });

  it('keeps Shell lifecycle and installer migration in the Shell proof boundary', () => {
    const scenarios = Object.values(MAC_PACKAGED_SMOKE_SCENARIOS);
    expect(MAC_SHELL_PROOF_SCENARIO_IDS).toEqual([
      'mac-shell-lifecycle',
      'mac-shell-silent-update',
      'mac-shell-rollback',
      'mac-legacy-migration',
    ]);
    expect(scenarios
      .filter((scenario) => scenario.lane === 'shell' || scenario.lane === 'migration')
      .map((scenario) => scenario.id))
      .toEqual(MAC_SHELL_PROOF_SCENARIO_IDS);
    expect(scenarios.some((scenario) =>
      (scenario.domains as readonly PackagedSmokeDomain[]).includes('standalone'))).toBe(true);
    expect(scenarios.some((scenario) =>
      (scenario.domains as readonly PackagedSmokeDomain[]).includes('distribution'))).toBe(true);
  });

  it('keeps Windows installer lifecycle and migration outside Closure-only reruns', () => {
    const scenarios = Object.values(WIN_PACKAGED_SMOKE_SCENARIOS);
    expect(WIN_SHELL_PROOF_SCENARIO_IDS).toEqual([
      'win-shell-lifecycle',
      'win-shell-silent-update',
      'win-shell-rollback',
      'win-legacy-migration',
    ]);
    expect(scenarios
      .filter((scenario) => scenario.lane === 'shell' || scenario.lane === 'migration')
      .map((scenario) => scenario.id))
      .toEqual(WIN_SHELL_PROOF_SCENARIO_IDS);
    expect(scenarios.find((scenario) => scenario.id === 'win-standalone-closure')?.lane).toBe('standalone');
  });
});
