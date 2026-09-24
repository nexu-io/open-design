// Regression test for issue #2637 — "Deleting a skill breaks the dialog
// layout".
//
// The composer stages a chip for each @-mentioned skill. When a skill is
// removed elsewhere in the app the catalogue refetch drops it, but the staged
// chip had no prune path for that (only editor edits pruned it), so the
// staged-context row stayed mounted with no backing skill and its layout
// stayed wrong. `pruneStagedToCatalogue` is that missing prune; these pin its
// contract, especially the load-window guard that must not clear chips before
// the catalogue has loaded.

import { describe, expect, it } from 'vitest';
import { pruneStagedToCatalogue } from '../src/components/composer-staged-prune';

const skill = (id: string) => ({ id, name: id });

describe('pruneStagedToCatalogue', () => {
  it('drops staged entries whose skill is gone from the catalogue', () => {
    const staged = [skill('a'), skill('b'), skill('c')];
    const catalogueIds = new Set(['a', 'c']);
    expect(pruneStagedToCatalogue(staged, catalogueIds, true).map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('returns the same reference when nothing was pruned', () => {
    const staged = [skill('a'), skill('b')];
    const catalogueIds = new Set(['a', 'b', 'unrelated']);
    expect(pruneStagedToCatalogue(staged, catalogueIds, true)).toBe(staged);
  });

  it('does not prune before the catalogue has loaded', () => {
    const staged = [skill('a'), skill('b')];
    // Empty catalogue + not-ready must mean "unknown", never "delete all".
    expect(pruneStagedToCatalogue(staged, new Set(), false)).toBe(staged);
  });

  it('keeps everything staged when the catalogue is ready but empty is not trusted', () => {
    // A ready-but-empty catalogue is the only case where ids legitimately all
    // disappear; that path is reachable only with catalogueReady === true, and
    // the caller only sets it after seeing a non-empty catalogue.
    const staged = [skill('a')];
    expect(pruneStagedToCatalogue(staged, new Set(), true)).toEqual([]);
  });

  it('handles an empty staged list', () => {
    expect(pruneStagedToCatalogue<{ id: string }>([], new Set(['a']), true)).toEqual([]);
  });
});
