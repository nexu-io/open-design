// Every first-level output type on Home's create rail is a product-owned
// automatic scenario: the user picks a task type, never a plugin. Such a create
// must travel as `pluginSelectionProvenance: 'automatic-default'` so
// `EntryShell` omits `pluginId` and `POST /api/projects` re-derives and stamps
// the binding itself.
//
// Seven of the ten chips were missing `automaticDefault`, so their creates
// forwarded a plugin id. That is real authority on the daemon side — naming a
// plugin opts a project out of OD Next — so the project was created with no
// `automatic_default` scenario binding, and `ProjectView` offered
// "use the system automatic scenario" on a project that had never left it.

import { describe, expect, it } from 'vitest';
import { defaultScenarioPluginIdForProjectMetadata } from '@open-design/contracts';
import type { ProjectMetadata } from '@open-design/contracts';
import { CREATE_RAIL_ORDER, HOME_HERO_CHIPS } from '../../src/components/home-hero/chips';

function railChip(chipId: string) {
  const chip = HOME_HERO_CHIPS.find((entry) => entry.id === chipId);
  if (!chip) throw new Error(`create rail names a chip that does not exist: ${chipId}`);
  if (chip.action.kind !== 'apply-scenario') {
    throw new Error(`create rail chip ${chipId} is not a scenario chip`);
  }
  return chip.action;
}

describe('create rail chips claim the automatic default', () => {
  it('marks every first-level output type as a product-owned automatic scenario', () => {
    const unmarked = CREATE_RAIL_ORDER.filter((chipId) => !railChip(chipId).automaticDefault);
    expect(unmarked).toEqual([]);
  });

  // A chip that claims the automatic default while binding some other plugin
  // would be worse than the bug: dropping `pluginId` would silently bind the
  // metadata's default instead of the plugin the card advertises.
  it('binds exactly the plugin the daemon re-derives from the chip metadata', () => {
    for (const chipId of CREATE_RAIL_ORDER) {
      const action = railChip(chipId);
      const metadata = {
        kind: action.projectKind,
        ...(action.projectMetadata ?? {}),
      } as ProjectMetadata;
      expect(defaultScenarioPluginIdForProjectMetadata(metadata), chipId)
        .toBe(action.pluginId);
    }
  });
});

// A duplicate chip id collides as a React key and makes findChip and the
// group-filtered lookups ambiguous: they observe only the first match, so a
// second entry sharing an id (as `web-clone` did) is silently shadowed and can
// drift from the entry that is actually used — e.g. quietly losing
// `automaticDefault`. Existing findChip / rail tests passed with the duplicate
// present because they only ever see the first match, so keep an explicit
// catalog-wide invariant that fails the moment an id is reused.
describe('HOME_HERO_CHIPS catalog', () => {
  it('has a unique id for every chip', () => {
    const ids = HOME_HERO_CHIPS.map((chip) => chip.id);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    expect(duplicates).toEqual([]);
    expect(new Set(ids).size).toBe(HOME_HERO_CHIPS.length);
  });
});
