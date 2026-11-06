import { describe, expect, it } from 'vitest';
import { findChip } from '../src/components/home-hero/chips';
import {
  advanceTypewriter,
  buildPlaceholderScenarios,
  DEFAULT_TYPEWRITER_TIMING,
  initialTypewriterState,
  PLACEHOLDER_BASE_HINT_KEY,
  PLACEHOLDER_SCENARIO_DEFS,
  type TypewriterState,
} from '../src/components/home-hero/placeholderScenarios';
import { subChipsForChip } from '../src/components/home-hero/sub-chips';
import { en } from '../src/i18n/locales/en';

const TIMING = DEFAULT_TYPEWRITER_TIMING;

describe('PLACEHOLDER_SCENARIO_DEFS bindings', () => {
  it('binds every scenario to an apply-scenario create chip that exists', () => {
    for (const def of PLACEHOLDER_SCENARIO_DEFS) {
      const chip = findChip(def.chipId);
      expect(chip, `chip "${def.chipId}" for scenario "${def.id}"`).toBeDefined();
      // One-click create reuses the rail's apply-scenario path; a chip that
      // navigates away (create-plugin / template / brand-kit) would dead-end.
      expect(chip?.action.kind, `scenario "${def.id}"`).toBe('apply-scenario');
      expect(chip?.group).toBe('create');
    }
  });

  it('binds a scene-specific scenario to a real second-level scene of its chip', () => {
    // A scene is a refinement of its parent chip, not a template of its own, so
    // a scenario names the parent AND the scene under it — never a scene alone.
    for (const def of PLACEHOLDER_SCENARIO_DEFS) {
      if (!def.prototypeSubtypeId) continue;
      expect(def.chipId, `scenario "${def.id}"`).toBe('prototype');
      expect(
        subChipsForChip(def.chipId, []).map((sub) => sub.slug),
        `scene "${def.prototypeSubtypeId}" for scenario "${def.id}"`,
      ).toContain(def.prototypeSubtypeId);
    }
  });

  it('only binds create templates that actually render a carousel', () => {
    // These are the templates with hand-curated carousel lines. Other templates
    // can still render a carousel through prompt-example or label fallbacks.
    const SUPPORTED = new Set(['document', 'deck', 'prototype', 'hyperframes']);
    const used = new Set(PLACEHOLDER_SCENARIO_DEFS.map((d) => d.chipId));
    for (const chipId of used) {
      expect(SUPPORTED.has(chipId), `chipId "${chipId}" is not a carousel template`).toBe(true);
    }
    // Every supported template must keep at least one scenario of its OWN (not
    // only scene-specific ones) so picking it never strands the user on an
    // empty (non-cycling) carousel.
    for (const chipId of SUPPORTED) {
      expect(
        PLACEHOLDER_SCENARIO_DEFS.some((d) => d.chipId === chipId && !d.prototypeSubtypeId),
        `template "${chipId}" has no scenario`,
      ).toBe(true);
    }
  });

  it('keeps a curated carousel for each Prototype scene that had one as a chip', () => {
    // Mobile app and Wireframe were first-level chips with their own lines;
    // selecting the scene must still narrow to exactly those lines.
    for (const slug of ['mobile', 'wireframe']) {
      expect(
        PLACEHOLDER_SCENARIO_DEFS.some(
          (d) => d.chipId === 'prototype' && d.prototypeSubtypeId === slug,
        ),
        `scene "${slug}" has no scenario`,
      ).toBe(true);
    }
  });

  it('has unique scenario ids and a resolvable, non-empty English string per key', () => {
    const ids = PLACEHOLDER_SCENARIO_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Every textKey (and the base hint) must resolve in the English Dict — the
    // typecheck enforces all 19 locales carry the key; this catches an empty
    // English value, which would render a blank placeholder.
    for (const def of PLACEHOLDER_SCENARIO_DEFS) {
      expect(en[def.textKey]?.trim().length, `en[${def.textKey}]`).toBeGreaterThan(0);
    }
    expect(en[PLACEHOLDER_BASE_HINT_KEY]?.trim().length, 'en[base hint]').toBeGreaterThan(0);
  });
});

describe('buildPlaceholderScenarios', () => {
  function idsFor(activeChipId: string | null, activePrototypeSubtypeId?: string | null) {
    return buildPlaceholderScenarios({
      activeChipId,
      activePrototypeSubtypeId,
      resolveTextKey: (key) => en[key],
    }).map((scenario) => scenario.id);
  }

  it('shows a task type its own lines and never another scene’s', () => {
    // Selecting 原型 alone must not start suggesting mobile-app or wireframe
    // lines: those belong to scenes the user has not chosen.
    expect(idsFor('prototype')).toEqual(['signup-flow', 'orders-dashboard', 'landing-intro']);
  });

  it('narrows to a scene’s own lines once that scene is selected', () => {
    expect(idsFor('prototype', 'mobile')).toEqual(['app-idea']);
    expect(idsFor('prototype', 'wireframe')).toEqual(['product-detail', 'landing-layout']);
  });

  it('keeps the parent’s lines for a scene that curates none of its own', () => {
    expect(idsFor('prototype', 'app-prototypes')).toEqual(idsFor('prototype'));
  });

  it('carries the scene a line belongs to so an empty-composer send can bind it', () => {
    // Nothing is selected yet, so the full rotation is offered; a scene line
    // still has to say which scene it would bind, or one-click create would
    // land on the bare parent and drop the refinement.
    const rotation = buildPlaceholderScenarios({
      activeChipId: null,
      resolveTextKey: (key) => en[key],
    });
    expect(rotation.find((scenario) => scenario.id === 'app-idea')).toMatchObject({
      chipId: 'prototype',
      prototypeSubtypeId: 'mobile',
    });
    expect(rotation.find((scenario) => scenario.id === 'signup-flow')?.prototypeSubtypeId)
      .toBeUndefined();
  });

  it('uses prompt examples as selected-chip carousel scenarios when no curated scenario exists', () => {
    const scenarios = buildPlaceholderScenarios({
      activeChipId: 'audio',
      resolveTextKey: (key) => en[key],
      examplesForChip: (chipId) => (
        chipId === 'audio'
          ? ['Generate a product startup sound']
          : []
      ),
    });

    expect(scenarios).toEqual([
      {
        id: 'audio-prompt-example-1',
        chipId: 'audio',
        text: 'Generate a product startup sound',
      },
    ]);
  });

  it('creates a submittable selected-chip fallback when neither curated scenarios nor prompt examples exist', () => {
    const scenarios = buildPlaceholderScenarios({
      activeChipId: 'live-artifact',
      resolveTextKey: (key) => en[key],
      fallbackForChip: (chipId) => (
        chipId === 'live-artifact'
          ? 'Create a Live artifact: Data-backed live dashboards'
          : null
      ),
    });

    expect(scenarios).toEqual([
      {
        id: 'live-artifact-fallback',
        chipId: 'live-artifact',
        text: 'Create a Live artifact: Data-backed live dashboards',
      },
    ]);
  });
});

describe('advanceTypewriter', () => {
  // Run the machine to the next state that satisfies `done`, capping steps so a
  // logic regression fails fast instead of looping forever.
  function runUntil(
    start: TypewriterState,
    length: number,
    count: number,
    done: (s: TypewriterState) => boolean,
  ): TypewriterState {
    let state = start;
    for (let i = 0; i < 10_000; i += 1) {
      ({ state } = advanceTypewriter(state, length, count, TIMING, false));
      if (done(state)) return state;
    }
    throw new Error('advanceTypewriter did not reach the target state');
  }

  it('types one character at a time at the typing cadence', () => {
    const { state, delayMs } = advanceTypewriter(
      { index: 0, charCount: 0, phase: 'typing' },
      10,
      3,
      TIMING,
      false,
    );
    expect(state).toEqual({ index: 0, charCount: 1, phase: 'typing' });
    expect(delayMs).toBe(TIMING.typeMs);
  });

  it('holds once the full line is typed', () => {
    const { state, delayMs } = advanceTypewriter(
      { index: 0, charCount: 10, phase: 'typing' },
      10,
      3,
      TIMING,
      false,
    );
    expect(state.phase).toBe('holding');
    expect(delayMs).toBe(TIMING.holdMs);
  });

  it('cycles type → hold → delete → pause → next index with wraparound', () => {
    const length = 5;
    const count = 2;
    // From a fully typed last scenario, the next typing state must wrap to 0.
    const typed: TypewriterState = { index: 1, charCount: length, phase: 'typing' };
    const next = runUntil(typed, length, count, (s) => s.phase === 'typing' && s.charCount === 0);
    expect(next.index).toBe(0);
    expect(next.phase).toBe('typing');
    expect(next.charCount).toBe(0);
  });

  it('reduced motion advances whole lines and keeps full charCount', () => {
    const { state, delayMs } = advanceTypewriter(
      { index: 0, charCount: 0, phase: 'typing' },
      12,
      3,
      TIMING,
      true,
    );
    expect(state.index).toBe(1);
    expect(state.charCount).toBe(12);
    expect(delayMs).toBe(TIMING.holdMs);
  });

  it('starts empty on the first scenario', () => {
    expect(initialTypewriterState()).toEqual({ index: 0, charCount: 0, phase: 'typing' });
  });
});
