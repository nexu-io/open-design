import { describe, expect, it } from 'vitest';
import { isPluginAuthoringRun } from '../../src/runtimes/plugin-authoring.js';

describe('isPluginAuthoringRun', () => {
  it('matches the direct plugin id', () => {
    expect(isPluginAuthoringRun({ pluginId: 'od-plugin-authoring' }, () => null)).toBe(true);
  });

  it('matches a snapshot plugin id', () => {
    const calls: string[] = [];
    const result = isPluginAuthoringRun({ appliedPluginSnapshotId: 'snapshot-1' }, (id) => {
      calls.push(id);
      return { pluginId: 'od-plugin-authoring' };
    });

    expect(result).toBe(true);
    expect(calls).toEqual(['snapshot-1']);
  });

  it('does not look up absent or unrelated references', () => {
    let calls = 0;
    expect(isPluginAuthoringRun({ pluginId: 'other' }, () => { calls += 1; return null; })).toBe(false);
    expect(isPluginAuthoringRun({ appliedPluginSnapshotId: 'snapshot-2' }, () => {
      calls += 1;
      return { pluginId: 'other' };
    })).toBe(false);
    expect(calls).toBe(1);
  });
});
