import { describe, expect, it } from 'vitest';
import {
  DESIGN_DIRECTIONS,
  findDirectionByLabel,
} from '../src/prompts/directions.js';

describe('findDirectionByLabel', () => {
  it('matches by exact label', () => {
    const monocle = findDirectionByLabel('Editorial — Monocle / FT magazine');
    expect(monocle?.id).toBe('editorial-monocle');
  });

  it('matches by kebab-case id', () => {
    const found = findDirectionByLabel('editorial-monocle');
    expect(found?.id).toBe('editorial-monocle');
  });

  it('trims leading/trailing whitespace before matching', () => {
    expect(findDirectionByLabel('  editorial-monocle  ')?.id).toBe('editorial-monocle');
  });

  it('returns undefined when nothing matches', () => {
    expect(findDirectionByLabel('not a real direction')).toBeUndefined();
    expect(findDirectionByLabel('')).toBeUndefined();
  });

  it('finds every direction by both id and label', () => {
    for (const d of DESIGN_DIRECTIONS) {
      expect(findDirectionByLabel(d.id)?.id).toBe(d.id);
      expect(findDirectionByLabel(d.label)?.id).toBe(d.id);
    }
  });
});
