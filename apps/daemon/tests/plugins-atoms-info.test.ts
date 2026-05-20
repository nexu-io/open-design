// Plan §3.AA2 — atoms catalog promotion + atom info.

import { describe, expect, it } from 'vitest';
import { findAtom, FIRST_PARTY_ATOMS, isImplementedAtom } from '../src/plugins/atoms.js';

describe('atoms catalog — Phase 6/7/8 promotion', () => {
  const promotedIds = [
    'code-import',
    'design-extract',
    'figma-extract',
    'token-map',
    'rewrite-plan',
    'patch-edit',
    'build-test',
    'diff-review',
    'handoff',
  ];

  it.each(promotedIds)('atom %s is now status=implemented', (id) => {
    const atom = findAtom(id);
    expect(atom).toBeDefined();
    expect(atom?.status).toBe('implemented');
    expect(isImplementedAtom(id)).toBe(true);
  });

  it("'build-test' is registered with the matching daemon impl", () => {
    const atom = findAtom('build-test');
    expect(atom?.label).toMatch(/Build/);
    expect(atom?.taskKinds).toContain('code-migration');
  });

  it('the catalog has no remaining planned atoms (after the §3.AA2 promotion)', () => {
    const planned = FIRST_PARTY_ATOMS.filter((a) => a.status === 'planned');
    expect(planned.map((a) => a.id)).toEqual([]);
  });

  it('every atom in the catalog has a non-empty taskKinds[]', () => {
    for (const atom of FIRST_PARTY_ATOMS) {
      expect(atom.taskKinds.length).toBeGreaterThan(0);
    }
  });
});
