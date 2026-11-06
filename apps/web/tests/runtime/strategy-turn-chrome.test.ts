import { describe, expect, it } from 'vitest';

import {
  isInternalStrategySnapshot,
  shouldShowSessionModeChip,
} from '../../src/runtime/strategy-turn-chrome';

const strategyBinding = {
  schema: 'open-design.applied-strategy/v2',
  id: 'od-next-strategy',
  version: '2.0.0',
  packageHash: 'b'.repeat(64),
  assetDigests: [{ path: './assets/task-profiles/prototype.md', sha256: 'b'.repeat(64) }],
  selectedTaskProfile: {
    taskType: 'prototype',
    path: './assets/task-profiles/prototype.md',
    sha256: 'b'.repeat(64),
    version: '2',
  },
  taskProfileVersions: ['2'],
  promptRecipe: 'od-next-plan-build-v2',
} as never;

describe('isInternalStrategySnapshot', () => {
  it('recognizes a daemon-applied strategy snapshot', () => {
    expect(isInternalStrategySnapshot({ strategy: strategyBinding })).toBe(true);
  });

  it('leaves ordinary plugin snapshots alone', () => {
    expect(isInternalStrategySnapshot({})).toBe(false);
    expect(isInternalStrategySnapshot({ strategy: null })).toBe(false);
    expect(isInternalStrategySnapshot(null)).toBe(false);
    expect(isInternalStrategySnapshot(undefined)).toBe(false);
  });
});

describe('shouldShowSessionModeChip', () => {
  it('drops the default Design label', () => {
    expect(shouldShowSessionModeChip('design')).toBe(false);
  });

  it('keeps Ask and Plan labelled', () => {
    for (const sessionMode of ['chat', 'plan'] as const) {
      expect(shouldShowSessionModeChip(sessionMode)).toBe(true);
    }
  });

  it('renders nothing when the message carries no session mode', () => {
    expect(shouldShowSessionModeChip(undefined)).toBe(false);
  });
});
