/**
 * Spawn-input glue coverage for the rollout resolver (Phase 15 wireup).
 *
 * Pins the boundary-narrowing behavior of `normalizeCritiquePolicy`
 * (skill-frontmatter input) and `narrowProjectCritiqueOverride`
 * (project-metadata input) in isolation from the spawn handler. The
 * resolver itself is covered by `critique-rollout.test.ts` against
 * direct inputs; this file covers the glue that constructs those
 * inputs from runtime state.
 *
 * Added for PerishCode P3 on PR #1338: the boolean guard on the
 * metadata blob and the trim/lowercase/typo-reject on the skill
 * frontmatter token were previously only exercised indirectly via
 * the spawn-handler's branches, so a refactor that loosens either
 * guard could silently let a string `'true'` or a misspelled
 * `'OPT_IN'` accidentally activate the feature.
 */

import { describe, expect, it } from 'vitest';

import { normalizeCritiquePolicy } from '../src/skills.js';
import { narrowProjectCritiqueOverride } from '../src/critique/spawn-inputs.js';

describe('normalizeCritiquePolicy (skill frontmatter input)', () => {
  it('passes through the three canonical tokens', () => {
    expect(normalizeCritiquePolicy('required')).toBe('required');
    expect(normalizeCritiquePolicy('opt-in')).toBe('opt-in');
    expect(normalizeCritiquePolicy('opt-out')).toBe('opt-out');
  });

  it('lowercases mixed-case tokens (YAML allows REQUIRED / Required)', () => {
    expect(normalizeCritiquePolicy('REQUIRED')).toBe('required');
    expect(normalizeCritiquePolicy('Required')).toBe('required');
    expect(normalizeCritiquePolicy('OPT-IN')).toBe('opt-in');
    expect(normalizeCritiquePolicy('Opt-Out')).toBe('opt-out');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(normalizeCritiquePolicy('  required  ')).toBe('required');
    expect(normalizeCritiquePolicy('\trequired\n')).toBe('required');
  });

  it('rejects typos to null (cannot accidentally force panel on/off)', () => {
    // Underscore instead of hyphen is the most likely YAML-author typo.
    expect(normalizeCritiquePolicy('opt_in')).toBeNull();
    expect(normalizeCritiquePolicy('opt_out')).toBeNull();
    expect(normalizeCritiquePolicy('require')).toBeNull();
    expect(normalizeCritiquePolicy('optional')).toBeNull();
    expect(normalizeCritiquePolicy('off')).toBeNull();
    expect(normalizeCritiquePolicy('on')).toBeNull();
  });

  it('falls through to null for non-string inputs', () => {
    expect(normalizeCritiquePolicy(undefined)).toBeNull();
    expect(normalizeCritiquePolicy(null)).toBeNull();
    expect(normalizeCritiquePolicy(true)).toBeNull();
    expect(normalizeCritiquePolicy(1)).toBeNull();
    expect(normalizeCritiquePolicy({})).toBeNull();
    expect(normalizeCritiquePolicy([])).toBeNull();
  });

  it('returns null on empty / whitespace-only strings', () => {
    expect(normalizeCritiquePolicy('')).toBeNull();
    expect(normalizeCritiquePolicy('   ')).toBeNull();
    expect(normalizeCritiquePolicy('\t\n')).toBeNull();
  });
});

describe('narrowProjectCritiqueOverride (project metadata input)', () => {
  it('returns the boolean when metadata.critiqueTheaterEnabled is a real boolean', () => {
    expect(narrowProjectCritiqueOverride({ critiqueTheaterEnabled: true }))
      .toBe(true);
    expect(narrowProjectCritiqueOverride({ critiqueTheaterEnabled: false }))
      .toBe(false);
  });

  it('returns null when the metadata object has no critiqueTheaterEnabled key', () => {
    expect(narrowProjectCritiqueOverride({}))
      .toBeNull();
    expect(narrowProjectCritiqueOverride({ kind: 'design', templateId: 't' }))
      .toBeNull();
  });

  it('rejects string "true" / "false" to null (cannot accidentally activate via stringified value)', () => {
    // This is the load-bearing case: a metadata blob with a stringified
    // toggle (from a malformed PATCH or a future serializer drift) must
    // NOT activate the feature. The resolver falls through to env / phase.
    expect(narrowProjectCritiqueOverride({ critiqueTheaterEnabled: 'true' }))
      .toBeNull();
    expect(narrowProjectCritiqueOverride({ critiqueTheaterEnabled: 'false' }))
      .toBeNull();
  });

  it('rejects number 1 / 0 to null (cannot accidentally activate via numeric coercion)', () => {
    expect(narrowProjectCritiqueOverride({ critiqueTheaterEnabled: 1 }))
      .toBeNull();
    expect(narrowProjectCritiqueOverride({ critiqueTheaterEnabled: 0 }))
      .toBeNull();
  });

  it('rejects nested objects / arrays to null', () => {
    expect(narrowProjectCritiqueOverride({ critiqueTheaterEnabled: { v: true } }))
      .toBeNull();
    expect(narrowProjectCritiqueOverride({ critiqueTheaterEnabled: [true] }))
      .toBeNull();
  });

  it('returns null when the entire metadata blob is missing or malformed', () => {
    expect(narrowProjectCritiqueOverride(null)).toBeNull();
    expect(narrowProjectCritiqueOverride(undefined)).toBeNull();
    expect(narrowProjectCritiqueOverride('not an object')).toBeNull();
    expect(narrowProjectCritiqueOverride(42)).toBeNull();
    expect(narrowProjectCritiqueOverride(true)).toBeNull();
  });

  it('preserves other metadata fields by ignoring them entirely', () => {
    // Sanity check that the narrower does not throw on or care about
    // other fields the metadata blob carries (kind, templateId, linkedDirs,
    // importedFrom, baseDir, etc.). It is a pure read of one key.
    const metadata = {
      kind: 'design',
      templateId: 'landing-page',
      linkedDirs: ['/a', '/b'],
      importedFrom: '/some/path',
      critiqueTheaterEnabled: true,
    };
    expect(narrowProjectCritiqueOverride(metadata)).toBe(true);
  });
});
