import { describe, expect, it } from 'vitest';

import {
  selectAutoOpenProducedArtifact,
  selectAutoOpenProducedArtifacts,
  selectAutoOpenTurnArtifact,
  selectAutoOpenTurnArtifacts,
} from '../../src/components/auto-open-file';

// OPEND-2588 (product ruling 2026-09-04): a finished turn opens ALL of its
// primary artifacts, not one. The criterion for "primary" is unchanged, so
// these cases mostly assert what must NOT have widened.
describe('selectAutoOpenProducedArtifacts', () => {
  const image = (name: string, mtime: number) => ({ name, path: name, kind: 'image', mtime });

  it('opens every equally-ranked artifact of a batch generation', () => {
    expect(
      selectAutoOpenProducedArtifacts([
        image('a.png', 1),
        image('b.png', 2),
        image('c.png', 3),
        image('d.png', 4),
      ]),
    ).toEqual({
      focused: 'd.png',
      open: ['a.png', 'b.png', 'c.png', 'd.png'],
    });
  });

  it('focuses exactly what the single-selection heuristic picked', () => {
    const produced = [image('a.png', 9), image('b.png', 2), image('c.png', 5)];
    expect(selectAutoOpenProducedArtifacts(produced).focused)
      .toBe(selectAutoOpenProducedArtifact(produced));
  });

  it('keeps lower-ranked kinds closed: a page does not drag its notes and shots along', () => {
    // "All the PRIMARY artifacts" — HTML is the turn's deliverable, the
    // markdown note and the screenshots it embeds are incidental to it.
    expect(
      selectAutoOpenProducedArtifacts([
        { name: 'index.html', path: 'index.html', kind: 'html', mtime: 1 },
        { name: 'plan.md', path: 'plan.md', kind: 'text', mtime: 2 },
        image('shot.png', 3),
      ]),
    ).toEqual({ focused: 'index.html', open: ['index.html'] });
  });

  it('never opens a non-previewable file, whatever the turn also produced', () => {
    expect(
      selectAutoOpenProducedArtifacts([
        { name: 'deck.pptx', path: 'deck.pptx', kind: 'presentation', mtime: 5 },
        { name: 'notes.txt', path: 'notes.txt', kind: 'text', mtime: 6 },
        { name: 'board.sketch.json', path: 'board.sketch.json', kind: 'sketch', mtime: 7 },
        image('hero.png', 1),
      ]),
    ).toEqual({ focused: 'hero.png', open: ['hero.png'] });
  });

  it('returns nothing when the turn produced nothing previewable', () => {
    expect(
      selectAutoOpenProducedArtifacts([
        { name: 'deck.pptx', path: 'deck.pptx', kind: 'presentation', mtime: 1 },
      ]),
    ).toEqual({ focused: null, open: [] });
  });

  it('opens only the site entry for a website-clone turn', () => {
    // A clone's deliverable is the SITE; opening every produced page would be
    // one tab per route.
    expect(
      selectAutoOpenProducedArtifacts(
        [
          { name: 'index.html', path: 'index.html', kind: 'html', mtime: 1 },
          { name: 'about.html', path: 'about.html', kind: 'html', mtime: 2 },
          { name: 'zh/index.html', path: 'zh/index.html', kind: 'html', mtime: 3 },
        ],
        { preferSiteEntry: true },
      ),
    ).toEqual({ focused: 'index.html', open: ['index.html'] });
  });

  it('deduplicates by name so a file cannot claim two tabs', () => {
    expect(
      selectAutoOpenProducedArtifacts([image('a.png', 1), image('a.png', 2), image('b.png', 3)]).open,
    ).toEqual(['a.png', 'b.png']);
  });
});

describe('selectAutoOpenTurnArtifacts', () => {
  it('sees the same candidates as selectAutoOpenTurnArtifact, including in-place rewrites', () => {
    const produced = [{ name: 'new.png', path: 'new.png', kind: 'image', mtime: 1_000_500 }];
    const allFiles = [
      { name: 'new.png', path: 'new.png', kind: 'image', mtime: 1_000_500 },
      { name: 'rewritten.png', path: 'rewritten.png', kind: 'image', mtime: 1_000_400 },
      { name: 'untouched.png', path: 'untouched.png', kind: 'image', mtime: 5 },
    ];
    const options = { turnStartedAt: 1_000_000, turnEndedAt: 1_002_000 };

    const selection = selectAutoOpenTurnArtifacts(produced, allFiles, options);
    expect(selection.open).toEqual(['new.png', 'rewritten.png']);
    expect(selection.focused).toBe(selectAutoOpenTurnArtifact(produced, allFiles, options));
  });

  it('falls back to produced-only when the turn has no start stamp', () => {
    const produced = [{ name: 'new.png', path: 'new.png', kind: 'image', mtime: 1_500 }];
    const allFiles = [
      ...produced,
      { name: 'other.png', path: 'other.png', kind: 'image', mtime: 1_600 },
    ];
    expect(selectAutoOpenTurnArtifacts(produced, allFiles).open).toEqual(['new.png']);
  });
});
