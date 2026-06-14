// Regression for the active-plugin chip visibility gate (#3997 review).
//
// The gate decides whether the composer shows a dedicated plugin chip (with its
// own clear ×) or lets a task-type chip stand in. It must key off the persisted
// `explicitPick` flag — set when the user picks an example-prompt preset or a
// Community card — NOT off `record.id !== defaultPluginIdForChip(chipId)`. The
// prototype rail's default plugin is `example-web-prototype` (see
// home-hero/chips.ts), so a preset pick of that very plugin would be wrongly
// classified as a task-default binding and never surface its chip under the old
// id-equality heuristic.

import { describe, expect, it } from 'vitest';
import {
  shouldShowActivePluginChip,
  type ActivePlugin,
} from '../../src/components/HomeView';

function activeFor(
  pluginId: string,
  chipId: string | null,
  explicitPick: boolean,
): ActivePlugin {
  // Only `record.id`, `chipId`, and `explicitPick` drive the gate; the rest is
  // padded to satisfy the type.
  return {
    record: { id: pluginId } as ActivePlugin['record'],
    result: null,
    inputs: {},
    inputFields: [],
    inputsValid: true,
    queryTemplate: null,
    lastRenderedPrompt: null,
    projectKind: null,
    chipId,
    mediaSurface: null,
    projectMetadata: null,
    editableInputNames: [],
    preserveInputFields: false,
    suppressPromptSync: false,
    explicitPick,
  };
}

describe('shouldShowActivePluginChip', () => {
  it('surfaces an explicit example-prompt preset even when its plugin id equals the chip default', () => {
    // prototype → default plugin example-web-prototype; explicit preset pick.
    expect(
      shouldShowActivePluginChip(
        activeFor('example-web-prototype', 'prototype', true),
      ),
    ).toBe(true);
  });

  it('suppresses the plugin chip for a task-chip default-plugin binding', () => {
    // Same plugin + chip, but bound through the type chip (not an explicit pick):
    // the task chip stands in, so no separate plugin chip.
    expect(
      shouldShowActivePluginChip(
        activeFor('example-web-prototype', 'prototype', false),
      ),
    ).toBe(false);
  });

  it('surfaces a non-explicit plugin that is not the chip default', () => {
    expect(
      shouldShowActivePluginChip(
        activeFor('some-other-plugin', 'prototype', false),
      ),
    ).toBe(true);
  });

  it('surfaces a Community pick (no chip) and ignores null active', () => {
    expect(
      shouldShowActivePluginChip(activeFor('community-plugin', null, true)),
    ).toBe(true);
    expect(shouldShowActivePluginChip(null)).toBe(false);
  });
});
