import { describe, expect, it } from 'vitest';
import { findChip } from '../src/components/home-hero/chips';
import {
  advanceTypewriter,
  DEFAULT_TYPEWRITER_TIMING,
  initialTypewriterState,
  PLACEHOLDER_BASE_HINT_KEY,
  PLACEHOLDER_SCENARIO_DEFS,
  type TypewriterState,
} from '../src/components/home-hero/placeholderScenarios';
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

  it('only binds create templates that actually render a carousel', () => {
    // The composer filters scenarios by the selected chip; a scenario pointing
    // at a media/live-artifact template (no scenarios → no carousel) would be
    // unreachable once that template is picked. Lock the supported set.
    const SUPPORTED = new Set(['document', 'deck', 'prototype', 'wireframe', 'mobile', 'hyperframes']);
    const used = new Set(PLACEHOLDER_SCENARIO_DEFS.map((d) => d.chipId));
    for (const chipId of used) {
      expect(SUPPORTED.has(chipId), `chipId "${chipId}" is not a carousel template`).toBe(true);
    }
    // Every supported template must keep at least one scenario so picking it
    // never strands the user on an empty (non-cycling) carousel.
    for (const chipId of SUPPORTED) {
      expect(
        PLACEHOLDER_SCENARIO_DEFS.some((d) => d.chipId === chipId),
        `template "${chipId}" has no scenario`,
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
