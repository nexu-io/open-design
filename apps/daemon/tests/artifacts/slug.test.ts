import { describe, expect, it } from 'vitest';
import { sanitizeArtifactSlug } from '../../src/artifacts/slug.js';

describe('sanitizeArtifactSlug', () => {
  it('normalizes punctuation, whitespace, and underscores', () => {
    expect(sanitizeArtifactSlug('  Sales_Deck / Q4! ')).toBe('sales-deck-q4');
  });

  it('returns an empty slug for identifiers with no safe characters', () => {
    expect(sanitizeArtifactSlug('!!!')).toBe('');
  });

  it('caps the result at the artifact directory suffix limit', () => {
    expect(sanitizeArtifactSlug('a'.repeat(100))).toHaveLength(64);
  });
});
