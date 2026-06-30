// Red-spec for the design-kit upload bug (broken "upload" image tiles): the
// single-file upload route POST /api/projects/:id/files resolved the caller's
// desired name with sanitizeName(), which replaces "/" with "_". A kit upload
// sends name="imagery/hero.png" so the file landed at the project root as
// "imagery_hero.png" while brand.json still referenced "imagery/hero.png" — the
// gallery <img> then 404'd and rendered the broken-image glyph, and finalize's
// copyProjectDirToBrand('imagery') missed the orphaned root file entirely.
//
// The fix routes path-bearing names through sanitizePath(), which sanitizes each
// segment but PRESERVES the directory separator. This test pins that contract:
// a subdirectory in the desired name must survive name resolution.

import { describe, expect, it } from 'vitest';
import { sanitizeName, sanitizePath } from '../src/projects.js';

describe('project upload name resolution preserves subdirectories', () => {
  it('sanitizeName flattens a subdirectory path (the pre-fix behavior)', () => {
    // Documents WHY the route must not use sanitizeName for a path-bearing name.
    expect(sanitizeName('imagery/hero.png')).toBe('imagery_hero.png');
  });

  it('sanitizePath keeps the subdirectory the design-kit uploader intends', () => {
    expect(sanitizePath('imagery/hero.png')).toBe('imagery/hero.png');
    expect(sanitizePath('logos/wordmark.svg')).toBe('logos/wordmark.svg');
  });

  it('sanitizePath rejects traversal and sanitizes each segment', () => {
    // A "../" escape is refused outright (the route's try/catch turns this into
    // an error response) rather than silently mangled, and ordinary segments
    // are still cleaned of whitespace/garbage.
    expect(() => sanitizePath('imagery/../evil.png')).toThrow();
    expect(sanitizePath('imagery/he ro.png')).toBe('imagery/he-ro.png');
  });
});
