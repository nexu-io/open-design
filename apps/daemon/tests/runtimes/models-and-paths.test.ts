import { homedir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  isKnownModel,
  rememberLiveModels,
  sanitizeCustomModel,
} from '../../src/runtimes/models.js';
import { expandConfiguredEnv, expandHomePath } from '../../src/runtimes/paths.js';
import type { RuntimeAgentDef } from '../../src/runtimes/types.js';

function defWith(id: string, fallbackIds: string[]): RuntimeAgentDef {
  return {
    id,
    name: id,
    bin: id,
    versionArgs: ['--version'],
    fallbackModels: fallbackIds.map((mid) => ({ id: mid, label: mid })),
    buildArgs: () => [],
    streamFormat: 'text',
  };
}

describe('isKnownModel', () => {
  it('accepts a model id present in the live cache', () => {
    const def = defWith('alpha-isknown-live', []);
    rememberLiveModels(def.id, [{ id: 'live-1', label: 'live-1' }]);
    expect(isKnownModel(def, 'live-1')).toBe(true);
  });

  it('falls back to the static fallbackModels list when no live cache entry matches', () => {
    const def = defWith('alpha-isknown-fallback', ['static-1']);
    expect(isKnownModel(def, 'static-1')).toBe(true);
  });

  it('rejects an unknown model id (not in live cache and not in fallback)', () => {
    const def = defWith('alpha-isknown-unknown', ['static-1']);
    rememberLiveModels(def.id, [{ id: 'live-1', label: 'live-1' }]);
    expect(isKnownModel(def, 'nope')).toBe(false);
  });

  it('rejects empty or nullish modelId', () => {
    const def = defWith('alpha-isknown-empty', ['static-1']);
    expect(isKnownModel(def, '')).toBe(false);
    expect(isKnownModel(def, null)).toBe(false);
    expect(isKnownModel(def, undefined)).toBe(false);
  });
});

describe('rememberLiveModels', () => {
  it('overwrites the per-agent live cache so the most recent listing wins', () => {
    const def = defWith('alpha-remember-overwrite', []);
    rememberLiveModels(def.id, [{ id: 'a', label: 'a' }]);
    rememberLiveModels(def.id, [{ id: 'b', label: 'b' }]);
    expect(isKnownModel(def, 'a')).toBe(false);
    expect(isKnownModel(def, 'b')).toBe(true);
  });

  it('is idempotent: repeating the same call leaves cache membership unchanged', () => {
    const def = defWith('alpha-remember-idempotent', []);
    const list = [{ id: 'x', label: 'x' }];
    rememberLiveModels(def.id, list);
    rememberLiveModels(def.id, list);
    expect(isKnownModel(def, 'x')).toBe(true);
  });

  it('ignores a non-array input without throwing', () => {
    const def = defWith('alpha-remember-nonarray', []);
    expect(() => rememberLiveModels(def.id, undefined as never)).not.toThrow();
    expect(isKnownModel(def, 'anything')).toBe(false);
  });
});

describe('sanitizeCustomModel', () => {
  it('accepts a valid model id (alphanumeric with permitted punctuation)', () => {
    expect(sanitizeCustomModel('claude-3-5-sonnet-20241022')).toBe('claude-3-5-sonnet-20241022');
    expect(sanitizeCustomModel('vendor/model:tag@1.0')).toBe('vendor/model:tag@1.0');
  });

  it('trims surrounding whitespace before validating', () => {
    expect(sanitizeCustomModel('  gpt-4o  ')).toBe('gpt-4o');
  });

  it('rejects flag-like strings that start with a dash', () => {
    expect(sanitizeCustomModel('--inject-flag')).toBeNull();
    expect(sanitizeCustomModel('-x')).toBeNull();
  });

  it('rejects strings containing whitespace or control characters', () => {
    expect(sanitizeCustomModel('model name')).toBeNull();
    expect(sanitizeCustomModel('model\nname')).toBeNull();
  });

  it('rejects empty / whitespace-only / non-string / oversize input', () => {
    expect(sanitizeCustomModel('')).toBeNull();
    expect(sanitizeCustomModel('   ')).toBeNull();
    expect(sanitizeCustomModel(null)).toBeNull();
    expect(sanitizeCustomModel(undefined)).toBeNull();
    expect(sanitizeCustomModel('a'.repeat(201))).toBeNull();
  });
});

describe('expandHomePath', () => {
  it('returns the home directory for a bare "~"', () => {
    expect(expandHomePath('~')).toBe(homedir());
  });

  it('expands "~/relative" to <home>/relative', () => {
    expect(expandHomePath('~/projects')).toBe(path.join(homedir(), 'projects'));
  });

  it('leaves non-tilde paths untouched', () => {
    expect(expandHomePath('/abs/path')).toBe('/abs/path');
    expect(expandHomePath('relative/path')).toBe('relative/path');
  });
});

describe('expandConfiguredEnv', () => {
  it('expands tilde paths in each string value', () => {
    const out = expandConfiguredEnv({
      CLAUDE_CONFIG_DIR: '~/.claude',
      OTHER: '/etc/x',
    });
    expect(out.CLAUDE_CONFIG_DIR).toBe(path.join(homedir(), '.claude'));
    expect(out.OTHER).toBe('/etc/x');
  });

  it('skips non-string values and returns an empty object for non-object input', () => {
    const out = expandConfiguredEnv({ A: 'str', B: 42, C: null });
    expect(out).toEqual({ A: 'str' });
    expect(expandConfiguredEnv(null)).toEqual({});
    expect(expandConfiguredEnv(undefined)).toEqual({});
    expect(expandConfiguredEnv('not-an-object' as never)).toEqual({});
  });
});
