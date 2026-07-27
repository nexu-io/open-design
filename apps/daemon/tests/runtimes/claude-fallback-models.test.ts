import { expect, test } from 'vitest';

import { claude } from './helpers/test-helpers.js';

// `claude` ships no list-models subcommand, so the picker falls back to the
// static list in runtimes/defs/claude.ts whenever no mmd/MMS route file is
// present. That list is the ONLY source of model options for a default
// install, which makes it silently rot every time Anthropic ships a new
// family — it sat on the 4-5 generation long enough that Opus 5 could not be
// selected at all. These specs pin the shape and flag the staleness.

const ALIAS_IDS = ['fable', 'opus', 'sonnet', 'haiku'];

function modelIds(): string[] {
  return claude.fallbackModels.map((m) => m.id);
}

test('claude fallback models offer the family aliases documented by `claude --model`', () => {
  const ids = modelIds();
  // `--model` help text: "Provide an alias for the latest model (e.g. 'fable',
  // 'opus', or 'sonnet') or a model's full name (e.g. 'claude-fable-5')".
  // Aliases always resolve to the newest model in the family, so they are the
  // part of this list that cannot go stale — keep them all offered.
  for (const alias of ALIAS_IDS) {
    expect(ids).toContain(alias);
  }
  expect(ids[0]).toBe('default');
});

test('claude fallback models offer a current-generation Opus to pin', () => {
  // Regression guard: the list previously topped out at `claude-opus-4-5`, so
  // a user who wanted the newest Opus had no explicit id to select and had to
  // rely on the bare `opus` alias. Bump this id when a newer Opus ships.
  expect(modelIds()).toContain('claude-opus-5');
});

test('claude fallback models do not offer superseded 4-5 generation ids', () => {
  // `claude-haiku-4-5` is deliberately absent from this list: it is still the
  // current Haiku, unlike the Opus/Sonnet entries it shipped alongside.
  const ids = modelIds();
  expect(ids).not.toContain('claude-opus-4-5');
  expect(ids).not.toContain('claude-sonnet-4-5');
});

test('claude fallback model ids are unique and well formed', () => {
  const ids = modelIds();
  expect(new Set(ids).size).toBe(ids.length);
  for (const model of claude.fallbackModels) {
    expect(model.label.trim()).not.toBe('');
    // Every entry is either the synthetic `default`, a bare family alias, or a
    // fully-qualified `claude-*` id — anything else would be handed straight
    // to `claude --model` and rejected at spawn time.
    const wellFormed =
      model.id === 'default' ||
      ALIAS_IDS.includes(model.id) ||
      /^claude-[a-z0-9-]+$/.test(model.id);
    expect(wellFormed, `unexpected model id: ${model.id}`).toBe(true);
  }
});
