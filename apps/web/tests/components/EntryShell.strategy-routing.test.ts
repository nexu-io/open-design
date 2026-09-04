import { describe, expect, it } from 'vitest';
import { entryStrategyRoutingFields } from '../../src/components/entry-strategy-routing';

describe('EntryShell automatic strategy routing', () => {
  it.each([
    ['prototype', { kind: 'prototype' as const }],
    ['ppt', { kind: 'deck' as const }],
    ['marketing', { kind: 'prototype' as const, intent: 'marketing' as const }],
    ['hyperframes', { kind: 'video' as const, intent: 'hyperframes' as const }],
  ] as const)('lets OD Next own the %s route without implicit plugin inputs', (taskProfile, metadata) => {
    expect(entryStrategyRoutingFields({
      automaticStrategyTaskProfile: taskProfile,
      pluginInputs: { legacy: true },
    }, metadata)).toEqual({
      skillId: null,
      automaticStrategyTaskProfile: taskProfile,
    });
  });

  it.each([
    ['prototype', { kind: 'prototype' as const }],
    ['ppt', { kind: 'deck' as const }],
    ['marketing', { kind: 'prototype' as const, intent: 'marketing' as const }],
    ['hyperframes', { kind: 'video' as const, intent: 'hyperframes' as const }],
  ] as const)('carries an @-mentioned Skill onto the %s route', (taskProfile, metadata) => {
    // The daemon freezes it into `session_skills/user_selected_skills`; the
    // route is still the task type's, so nothing has to be dropped.
    expect(entryStrategyRoutingFields({
      automaticStrategyTaskProfile: taskProfile,
      skillId: 'frontend-design',
    }, metadata)).toEqual({
      skillId: 'frontend-design',
      automaticStrategyTaskProfile: taskProfile,
    });
  });

  it.each([
    { kind: 'prototype' as const, fidelity: 'wireframe' as const },
    { kind: 'prototype' as const, platform: 'auto' as const, platformTargets: ['mobile-ios' as const, 'mobile-android' as const] },
  ])('accepts a prototype claim for a second-level scene that only refines the brief', (metadata) => {
    // 移动应用 / 线框图 are refinements of 原型, not separate task types: the
    // Prototype task profile already branches on fidelity and platform, so the
    // fail-closed re-derivation must agree with the claim rather than collapse it.
    expect(entryStrategyRoutingFields({
      automaticStrategyTaskProfile: 'prototype',
      skillId: 'frontend-design',
      pluginInputs: { legacy: true },
    }, metadata)).toEqual({
      skillId: 'frontend-design',
      automaticStrategyTaskProfile: 'prototype',
    });
  });

  it.each([
    { kind: 'prototype' as const, intent: 'web-clone' as const },
    { kind: 'prototype' as const, intent: 'live-artifact' as const },
    { kind: 'other' as const },
    { kind: 'image' as const },
  ])('rejects a prototype claim for non-OD-Next metadata and preserves ordinary defaults', (metadata) => {
    expect(entryStrategyRoutingFields({
      automaticStrategyTaskProfile: 'prototype',
      skillId: 'ordinary-default-skill',
      pluginInputs: { legacy: true },
    }, metadata)).toEqual({
      skillId: 'ordinary-default-skill',
      pluginInputs: { legacy: true },
    });
  });

  it('carries the official example reference on the surviving automatic branch', () => {
    expect(entryStrategyRoutingFields({
      automaticStrategyTaskProfile: 'prototype',
      exampleReference: { pluginId: 'example-web-prototype', source: '/plugins/web-prototype' },
    }, { kind: 'prototype' })).toEqual({
      skillId: null,
      automaticStrategyTaskProfile: 'prototype',
      exampleReference: { pluginId: 'example-web-prototype', source: '/plugins/web-prototype' },
    });
  });

  it('carries the example reference for an example picked under a second-level scene', () => {
    expect(entryStrategyRoutingFields({
      automaticStrategyTaskProfile: 'prototype',
      exampleReference: { pluginId: 'example-web-prototype', source: '/plugins/web-prototype' },
    }, {
      kind: 'prototype',
      platform: 'auto',
      platformTargets: ['mobile-ios', 'mobile-android'],
    })).toEqual({
      skillId: null,
      automaticStrategyTaskProfile: 'prototype',
      exampleReference: { pluginId: 'example-web-prototype', source: '/plugins/web-prototype' },
    });
  });

  it('drops the example reference when the claimed automatic route fails re-validation', () => {
    // Fail-closed: the reference only means anything alongside the route it was
    // claimed for. Collapsing to the ordinary plugin branch must not smuggle it
    // through — the daemon would otherwise resolve example material for a
    // project that is no longer on an OD Next route.
    expect(entryStrategyRoutingFields({
      automaticStrategyTaskProfile: 'prototype',
      exampleReference: { pluginId: 'example-web-prototype', source: '/plugins/web-prototype' },
      skillId: 'ordinary-default-skill',
      pluginInputs: { legacy: true },
    }, { kind: 'prototype', intent: 'web-clone' })).toEqual({
      skillId: 'ordinary-default-skill',
      pluginInputs: { legacy: true },
    });
  });
});
