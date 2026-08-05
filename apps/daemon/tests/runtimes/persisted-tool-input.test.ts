import { describe, expect, it } from 'vitest';

import { normalizePersistedToolInput } from '../../src/runtimes/persisted-tool-input.js';

describe('normalizePersistedToolInput', () => {
  it('maps the legacy filePath key to the canonical file_path key', () => {
    expect(normalizePersistedToolInput({ filePath: 'index.html', content: '<main />' })).toEqual({
      filePath: 'index.html',
      file_path: 'index.html',
      content: '<main />',
    });
  });

  it('preserves canonical inputs and their object identity', () => {
    const input = { file_path: 'index.html' };

    expect(normalizePersistedToolInput(input)).toBe(input);
  });

  it('passes through nullish, primitive, and non-string legacy values', () => {
    expect(normalizePersistedToolInput(null)).toBeNull();
    expect(normalizePersistedToolInput('input')).toBe('input');
    const input = { filePath: 42 };
    expect(normalizePersistedToolInput(input)).toBe(input);
  });
});
