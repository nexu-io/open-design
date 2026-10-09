import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveCommentAnchor } from '../src/comments/anchor';

type CorpusCase = {
  name: string;
  input: { comment: Record<string, unknown>; snapshots: Array<Record<string, unknown>>; currentVersion?: number };
  expected: { state: string; snapshotElementId: string | null; snapshotPosition: unknown };
};

const corpus = JSON.parse(readFileSync(new URL('./fixtures/anchor-corpus.json', import.meta.url), 'utf8')) as {
  cases: CorpusCase[];
};

describe('portable anchor corpus', () => {
  it('keeps the real 23 generated cases field-for-field', () => {
    expect(corpus.cases).toHaveLength(23);
    for (const fixture of corpus.cases) {
      const snapshots = new Map(fixture.input.snapshots.map((snapshot) => [String(snapshot.elementId), snapshot]));
      const actual = resolveCommentAnchor(fixture.input.comment as never, snapshots as never, fixture.input.currentVersion);
      expect(actual.state, fixture.name).toBe(fixture.expected.state);
      expect(actual.snapshot?.elementId ?? null, fixture.name).toBe(fixture.expected.snapshotElementId);
      expect(actual.snapshot?.position ?? null, fixture.name).toEqual(fixture.expected.snapshotPosition);
    }
  });

  it('keeps proximity below the content gate and exact text at the gate', () => {
    const byName = new Map(corpus.cases.map((fixture) => [fixture.name, fixture]));
    expect(byName.get('fuzzy-proximity-only-below-threshold')?.expected.state).toBe('lost');
    expect(byName.get('fuzzy-text-only-at-threshold')?.expected.state).toBe('stale');
  });
});
