// Plan §3.3 of plugin-driven-flow-plan — kind → bundled scenario plugin
// mapping. Web (`EntryShell`) and daemon (`/api/projects`, `/api/runs`)
// share this resolver; the test pins the table so a drift between the
// two surfaces is impossible.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCENARIO_PLUGIN_BY_KIND,
  DEFAULT_SCENARIO_PLUGIN_BY_TASK_KIND,
  DEFAULT_UNSELECTED_SCENARIO_PLUGIN_ID,
  automaticStrategyTaskProfileForProjectMetadata,
  automaticStrategyTaskProfileForRouteId,
  defaultScenarioPluginIdForKind,
  defaultScenarioPluginIdForProjectMetadata,
  defaultScenarioPluginIdForTaskKind,
  defaultScenarioTaskProfileForProjectMetadata,
  hasCurrentAutomaticStrategyBinding,
  hasCurrentAutomaticScenarioBinding,
} from '../src/plugins/scenario-defaults.js';

describe('automaticStrategyTaskProfileForRouteId', () => {
  it('recognizes only the four product-owned OD Next routes', () => {
    expect(automaticStrategyTaskProfileForRouteId('prototype')).toBe('prototype');
    expect(automaticStrategyTaskProfileForRouteId('deck')).toBe('ppt');
    expect(automaticStrategyTaskProfileForRouteId('marketing')).toBe('marketing');
    expect(automaticStrategyTaskProfileForRouteId('hyperframes')).toBe('hyperframes');

    // Task types that own no OD Next route stay unrouted. `wireframe` and
    // `mobile` are catalog action ids, never route ids — the surfaces fold
    // them onto their parent Prototype route before asking.
    expect(automaticStrategyTaskProfileForRouteId('wireframe')).toBeNull();
    expect(automaticStrategyTaskProfileForRouteId('mobile')).toBeNull();
    expect(automaticStrategyTaskProfileForRouteId('image')).toBeNull();
    expect(automaticStrategyTaskProfileForRouteId('web-clone')).toBeNull();
    expect(automaticStrategyTaskProfileForRouteId('document')).toBeNull();
    expect(automaticStrategyTaskProfileForRouteId('webgl')).toBeNull();
    expect(automaticStrategyTaskProfileForRouteId('live-artifact')).toBeNull();
    expect(automaticStrategyTaskProfileForRouteId('figma')).toBeNull();
    expect(automaticStrategyTaskProfileForRouteId('template')).toBeNull();
    expect(automaticStrategyTaskProfileForRouteId(undefined)).toBeNull();
  });

  it('admits the Prototype route for the Wireframe and Mobile refinements', () => {
    expect(automaticStrategyTaskProfileForProjectMetadata({ kind: 'prototype' })).toBe('prototype');
    expect(automaticStrategyTaskProfileForProjectMetadata({ kind: 'deck' })).toBe('ppt');
    expect(automaticStrategyTaskProfileForProjectMetadata({
      kind: 'prototype',
      intent: 'marketing',
    })).toBe('marketing');
    expect(automaticStrategyTaskProfileForProjectMetadata({
      kind: 'video',
      intent: 'hyperframes',
    })).toBe('hyperframes');

    // A second-level scene refines WHAT to build, never WHETHER the parent's
    // automatic route applies: the Prototype task profile already branches on
    // fidelity and on platform targets.
    expect(automaticStrategyTaskProfileForProjectMetadata({
      kind: 'prototype',
      fidelity: 'wireframe',
    })).toBe('prototype');
    expect(automaticStrategyTaskProfileForProjectMetadata({
      kind: 'prototype',
      platform: 'auto',
      platformTargets: ['mobile-ios', 'mobile-android'],
    })).toBe('prototype');

    expect(defaultScenarioTaskProfileForProjectMetadata({
      kind: 'prototype',
      fidelity: 'wireframe',
    }, 'example-web-prototype')).toBe('prototype');
    expect(defaultScenarioTaskProfileForProjectMetadata({
      kind: 'prototype',
      platformTargets: ['mobile-ios'],
    }, 'example-web-prototype')).toBe('prototype');
    // The profile stays pinned to the plugin that owns it.
    expect(defaultScenarioTaskProfileForProjectMetadata({
      kind: 'prototype',
      fidelity: 'wireframe',
    }, 'example-simple-deck')).toBeNull();
  });

  it('keeps non-OD-Next project metadata unrouted', () => {
    for (const metadata of [
      { kind: 'prototype' as const, intent: 'web-clone' as const },
      { kind: 'prototype' as const, intent: 'live-artifact' as const },
      { kind: 'prototype' as const, intent: 'webgl-experience' as const },
      { kind: 'other' as const, intent: 'document' as const },
      { kind: 'other' as const },
      { kind: 'image' as const },
      { kind: 'video' as const },
      { kind: 'audio' as const },
      { kind: 'template' as const },
      { kind: 'brand' as const },
    ]) {
      expect(automaticStrategyTaskProfileForProjectMetadata(metadata)).toBeNull();
    }
    expect(automaticStrategyTaskProfileForProjectMetadata(null)).toBeNull();
    expect(automaticStrategyTaskProfileForProjectMetadata(undefined)).toBeNull();
  });

  it('recognizes only an exact daemon-owned strategy binding as current automatic routing', () => {
    const metadata = {
      kind: 'prototype' as const,
      strategyBinding: {
        schemaVersion: 1 as const,
        provenance: 'automatic_default' as const,
        taskProfile: 'prototype' as const,
        boundAt: 1,
      },
    };
    expect(hasCurrentAutomaticStrategyBinding(metadata)).toBe(true);
    expect(hasCurrentAutomaticScenarioBinding({
      metadata,
      appliedPluginSnapshotId: null,
    })).toBe(true);
    // A Wireframe refinement stays on the same Prototype route, so its
    // binding remains current.
    expect(hasCurrentAutomaticStrategyBinding({
      ...metadata,
      fidelity: 'wireframe' as const,
    })).toBe(true);
    // Metadata that owns no OD Next route does invalidate the binding.
    expect(hasCurrentAutomaticStrategyBinding({
      ...metadata,
      intent: 'web-clone' as const,
    })).toBe(false);
  });
});

describe('defaultScenarioPluginIdForKind', () => {
  it('maps every supported ProjectKind to a bundled scenario id', () => {
    const expected: Record<string, string> = {
      // Surfaces with a battle-tested seed template + layouts +
      // checklist bind to the specialised example plugin, not the
      // generic od-new-generation router. See scenario-defaults.ts.
      prototype: 'example-web-prototype',
      deck:      'example-simple-deck',
      template:  'od-new-generation',
      brand:     'od-new-generation',
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

  it('routes live-artifact intent to the dedicated bundled live artifact scenario', () => {
    expect(defaultScenarioPluginIdForProjectMetadata({
      kind: 'prototype',
      intent: 'live-artifact',
    })).toBe('example-live-artifact');
    expect(defaultScenarioPluginIdForProjectMetadata({ kind: 'prototype' }))
      .toBe('example-web-prototype');
    expect(defaultScenarioPluginIdForProjectMetadata(undefined)).toBeNull();
  });

  it('keeps Marketing and HyperFrames explicit while ordinary media stays generic', () => {
    expect(defaultScenarioPluginIdForProjectMetadata({
      kind: 'prototype',
      intent: 'marketing',
    })).toBe('example-web-prototype');
    expect(defaultScenarioPluginIdForProjectMetadata({
      kind: 'video',
      intent: 'hyperframes',
    })).toBe('example-hyperframes');
    expect(defaultScenarioPluginIdForProjectMetadata({ kind: 'image' }))
      .toBe('od-media-generation');
    expect(defaultScenarioPluginIdForProjectMetadata({ kind: 'video' }))
      .toBe('od-media-generation');
  });

  it('limits automatic OD Next profiles to the four approved routes', () => {
    expect(defaultScenarioTaskProfileForProjectMetadata(
      { kind: 'prototype' },
      'example-web-prototype',
    )).toBe('prototype');
    expect(defaultScenarioTaskProfileForProjectMetadata(
      { kind: 'deck' },
      'example-simple-deck',
    )).toBe('ppt');
    expect(defaultScenarioTaskProfileForProjectMetadata(
      { kind: 'prototype', intent: 'marketing' },
      'example-web-prototype',
    )).toBe('marketing');
    expect(defaultScenarioTaskProfileForProjectMetadata(
      { kind: 'video', intent: 'hyperframes' },
      'example-hyperframes',
    )).toBe('hyperframes');
    expect(defaultScenarioTaskProfileForProjectMetadata(
      { kind: 'image' },
      'od-media-generation',
    )).toBeNull();
    expect(defaultScenarioTaskProfileForProjectMetadata(
      { kind: 'video' },
      'od-media-generation',
    )).toBeNull();
    expect(defaultScenarioTaskProfileForProjectMetadata(
      { kind: 'audio' },
      'od-media-generation',
    )).toBeNull();
    expect(defaultScenarioTaskProfileForProjectMetadata(
      { kind: 'other' },
      'od-new-generation',
    )).toBeNull();
  });

  it('detects stale or tampered automatic bindings for the restore surface', () => {
    const metadata = {
      kind: 'prototype' as const,
      scenarioBinding: {
        schemaVersion: 1 as const,
        provenance: 'automatic_default' as const,
        pluginId: 'example-web-prototype',
        snapshotId: 'snapshot-1',
        taskProfile: 'prototype' as const,
        boundAt: 1,
      },
    };
    expect(hasCurrentAutomaticScenarioBinding({
      metadata,
      appliedPluginSnapshotId: 'snapshot-1',
    })).toBe(true);
    expect(hasCurrentAutomaticScenarioBinding({
      metadata,
      appliedPluginSnapshotId: 'snapshot-2',
    })).toBe(false);
    expect(hasCurrentAutomaticScenarioBinding({
      metadata: {
        ...metadata,
        scenarioBinding: { ...metadata.scenarioBinding, pluginId: 'od-media-generation' },
      },
      appliedPluginSnapshotId: 'snapshot-1',
    })).toBe(false);
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
