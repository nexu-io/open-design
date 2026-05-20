// Plan §3.3 of plugin-driven-flow-plan — kind → bundled scenario plugin
// mapping. Web (`EntryShell`) and daemon (`/api/projects`, `/api/runs`)
// share this resolver; the test pins the table so a drift between the
// two surfaces is impossible.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENARIO_PLUGIN_BY_KIND,
  DEFAULT_SCENARIO_PLUGIN_BY_TASK_KIND,
  DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
  defaultScenarioPluginIdForKind,
  defaultScenarioPluginIdForTaskKind,
} from '../src/plugins/scenario-defaults.js';

describe('defaultScenarioPluginIdForKind', () => {
  it('maps every supported ProjectKind to a bundled scenario id', () => {
    const expected: Record<string, string> = {
      // Surfaces with a battle-tested seed template + layouts +
      // checklist bind to the specialised example plugin, not the
      // generic od-new-generation router. See scenario-defaults.ts.
      prototype: 'example-web-prototype',
      deck:      'example-simple-deck',
      template:  'od-new-generation',
      image:     'od-media-generation',
      video:     'od-media-generation',
      audio:     'od-media-generation',
      other:     'od-new-generation',
    };
    for (const [kind, pluginId] of Object.entries(expected)) {
      expect(defaultScenarioPluginIdForKind(kind as never)).toBe(pluginId);
      expect(DEFAULT_SCENARIO_PLUGIN_BY_KIND[kind as never]).toBe(pluginId);
    }
  });

  it('returns null for an undefined kind so the daemon can skip the fallback', () => {
    expect(defaultScenarioPluginIdForKind(undefined)).toBeNull();
  });

  it('exposes the hidden free-form Home fallback plugin separately from kind defaults', () => {
    expect(DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID).toBe('od-default');
    expect(DEFAULT_SCENARIO_PLUGIN_BY_KIND.other).toBe('od-new-generation');
  });
});

describe('defaultScenarioPluginIdForTaskKind', () => {
  it('maps every taskKind to the matching scenario plugin', () => {
    expect(defaultScenarioPluginIdForTaskKind('new-generation')).toBe('od-new-generation');
    expect(defaultScenarioPluginIdForTaskKind('figma-migration')).toBe('od-figma-migration');
    expect(defaultScenarioPluginIdForTaskKind('code-migration')).toBe('od-code-migration');
    expect(defaultScenarioPluginIdForTaskKind('tune-collab')).toBe('od-tune-collab');
    expect(DEFAULT_SCENARIO_PLUGIN_BY_TASK_KIND['new-generation']).toBe('od-new-generation');
  });

  it('returns null when the taskKind is missing', () => {
    expect(defaultScenarioPluginIdForTaskKind(undefined)).toBeNull();
  });
});
