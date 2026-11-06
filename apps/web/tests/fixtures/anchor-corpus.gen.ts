/**
 * Generator for the cross-end anchor corpus.
 *
 * Run it, commit what it writes, and never hand-edit the output. The corpus
 * records what `resolveCommentAnchor` DOES today; it is the reference the
 * share page's port must reproduce, so it has to come from the real function
 * rather than from someone's reading of it.
 *
 * Cases are enumerated from the function's decision space, not scraped from
 * existing tests. The existing suites were written to catch specific bugs, so
 * they cluster where bugs were found and leave whole branches untouched — a
 * corpus built from them would inherit those blind spots and look thorough
 * while missing the cases a re-implementation is most likely to get wrong.
 *
 *   pnpm exec tsx apps/web/tests/fixtures/anchor-corpus.gen.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveCommentAnchor } from '../../src/comments';
import type { PreviewComment } from '@open-design/contracts';

type Snapshot = Parameters<typeof resolveCommentAnchor>[1] extends Map<string, infer S>
  ? S
  : never;

const POS = { x: 100, y: 100, width: 50, height: 20 };
const FAR = { x: 3000, y: 3000, width: 50, height: 20 };

function comment(patch: Partial<PreviewComment> = {}): PreviewComment {
  return {
    id: 'c1',
    projectId: 'p1',
    conversationId: 'conv1',
    filePath: 'index.html',
    elementId: 'el-1',
    selector: '[data-od-id="el-1"]',
    label: 'h1',
    text: 'Hello world',
    htmlHint: '<h1 data-od-id="el-1">',
    position: POS,
    note: 'a note',
    status: 'open',
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  } as PreviewComment;
}

function snapshot(patch: Partial<Snapshot> = {}): Snapshot {
  return {
    elementId: 'el-1',
    filePath: 'index.html',
    selector: '[data-od-id="el-1"]',
    label: 'h1',
    text: 'Hello world',
    htmlHint: '<h1 data-od-id="el-1">',
    position: POS,
    ...patch,
  } as Snapshot;
}

function snaps(...items: Snapshot[]): Map<string, Snapshot> {
  return new Map(items.map((s) => [s.elementId, s]));
}

interface Case {
  name: string;
  why: string;
  comment: PreviewComment;
  snapshots: Snapshot[];
  currentVersion?: number;
}

const CASES: Case[] = [
  // ---- branch 1: exact element hit -------------------------------------
  {
    name: 'exact-hit',
    why: 'Element still present with a valid box — the ordinary case.',
    comment: comment(),
    snapshots: [snapshot()],
  },
  {
    name: 'exact-hit-other-file',
    why: 'Same elementId in a DIFFERENT file must not count as an exact hit.',
    comment: comment(),
    snapshots: [snapshot({ filePath: 'other.html' })],
  },
  {
    name: 'exact-hit-invalid-box',
    why: 'Present but with a degenerate box: the exact branch is refused.',
    comment: comment(),
    snapshots: [snapshot({ position: { x: 0, y: 0, width: 0, height: 0 } })],
  },

  // ---- version ladder: anchored vs reanchored --------------------------
  {
    name: 'version-differs-reanchored',
    why: 'Both versions known and unequal — the "based on older vN" badge.',
    comment: comment({ anchoredVersion: 1 }),
    snapshots: [snapshot()],
    currentVersion: 2,
  },
  {
    name: 'version-equal-anchored',
    why: 'Equal versions are not drift.',
    comment: comment({ anchoredVersion: 2 }),
    snapshots: [snapshot()],
    currentVersion: 2,
  },
  {
    name: 'version-missing-current-anchored',
    why: 'Unknown current version cannot prove drift, so it must not claim it.',
    comment: comment({ anchoredVersion: 1 }),
    snapshots: [snapshot()],
  },
  {
    name: 'version-missing-anchored-anchored',
    why: 'A comment with no recorded version likewise cannot be shown as drifted.',
    comment: comment(),
    snapshots: [snapshot()],
    currentVersion: 2,
  },

  // ---- branch 2: pin- shortcut ------------------------------------------
  {
    name: 'pin-prefix-no-snapshot',
    why: 'A free-floating pin carries its own position and needs no element.',
    comment: comment({ elementId: 'pin-abc' }),
    snapshots: [],
  },
  {
    name: 'pin-prefix-invalid-position',
    why: 'A pin with a degenerate box falls through to the ladder below.',
    comment: comment({ elementId: 'pin-abc', position: { x: 0, y: 0, width: 0, height: 0 } }),
    snapshots: [],
  },

  // ---- branch 3: fuzzy scoring -----------------------------------------
  {
    name: 'fuzzy-selector-only',
    why: 'Selector match scores 4 on its own — comfortably over the threshold.',
    comment: comment({ elementId: 'gone' }),
    snapshots: [snapshot({ elementId: 'el-2', htmlHint: 'different', text: 'different', position: FAR })],
  },
  {
    name: 'fuzzy-hint-only',
    why: 'Html hint alone scores 3.',
    comment: comment({ elementId: 'gone' }),
    snapshots: [snapshot({ elementId: 'el-2', selector: 'different', text: 'different', position: FAR })],
  },
  {
    name: 'fuzzy-text-only-at-threshold',
    why: 'Text alone scores exactly 2, and the gate is >= 2 — the boundary case.',
    comment: comment({ elementId: 'gone' }),
    snapshots: [snapshot({ elementId: 'el-2', selector: 'different', htmlHint: 'different', position: FAR })],
  },
  {
    name: 'fuzzy-proximity-only-below-threshold',
    why: 'Proximity maxes out at 1, so nearness ALONE can never re-anchor. '
      + 'A port that weights position more heavily silently reattaches comments to whatever is nearby.',
    comment: comment({ elementId: 'gone' }),
    snapshots: [snapshot({ elementId: 'el-2', selector: 'different', htmlHint: 'different', text: 'different' })],
  },
  {
    name: 'fuzzy-picks-highest-score',
    why: 'Two candidates: the selector match must win over the text match.',
    comment: comment({ elementId: 'gone' }),
    snapshots: [
      snapshot({ elementId: 'el-text', selector: 'different', htmlHint: 'different', position: FAR }),
      snapshot({ elementId: 'el-sel', htmlHint: 'different', text: 'different', position: FAR }),
    ],
  },
  {
    name: 'fuzzy-rejects-other-file',
    why: 'filePath is a hard filter, not a score.',
    comment: comment({ elementId: 'gone' }),
    snapshots: [snapshot({ elementId: 'el-2', filePath: 'other.html' })],
  },
  {
    name: 'fuzzy-rejects-other-slide',
    why: 'slideIndex is a hard filter; absent counts as -1 and must not equal 0.',
    comment: comment({ elementId: 'gone' }),
    snapshots: [snapshot({ elementId: 'el-2', slideIndex: 0 } as Partial<Snapshot>)],
  },
  {
    name: 'fuzzy-matches-same-slide',
    why: 'Same explicit slideIndex passes the filter.',
    comment: comment({ elementId: 'gone', slideIndex: 3 } as Partial<PreviewComment>),
    snapshots: [snapshot({ elementId: 'el-2', slideIndex: 3 } as Partial<Snapshot>)],
  },
  {
    name: 'fuzzy-ignores-whitespace-differences',
    why: 'Hint and text are normalized before comparison, so reformatted HTML still matches.',
    comment: comment({ elementId: 'gone', htmlHint: '<h1   data-od-id="el-1">\n' }),
    snapshots: [snapshot({ elementId: 'el-2', selector: 'different', text: 'different', position: FAR })],
  },

  // ---- branch 4/5: lost -------------------------------------------------
  {
    name: 'lost-with-last-good-position',
    why: 'Nothing matches: the ghost pin sits at the stored last-good box, '
      + 'NOT at the creation-time position which may now point somewhere unrelated.',
    comment: comment({
      elementId: 'gone',
      selector: 'no-match',
      htmlHint: 'no-match',
      text: 'no-match',
      lastGoodPosition: { x: 500, y: 500, width: 10, height: 10 },
    }),
    snapshots: [],
  },
  {
    name: 'lost-falls-back-to-creation-position',
    why: 'No stored last-good box: the creation position is the only anchor left.',
    comment: comment({ elementId: 'gone', selector: 'no-match', htmlHint: 'no-match', text: 'no-match' }),
    snapshots: [],
  },
  {
    name: 'lost-with-no-position-at-all',
    why: 'Nothing to draw: the only case that yields a null snapshot. '
      + 'A port that invents {0,0,0,0} here parks a pin in the corner of the page.',
    comment: comment({
      elementId: 'gone',
      selector: 'no-match',
      htmlHint: 'no-match',
      text: 'no-match',
      position: { x: 0, y: 0, width: 0, height: 0 },
    }),
    snapshots: [],
  },
  {
    name: 'lost-prefers-last-good-over-creation',
    why: 'Both present: last-good wins.',
    comment: comment({
      elementId: 'gone',
      selector: 'no-match',
      htmlHint: 'no-match',
      text: 'no-match',
      position: { x: 1, y: 1, width: 10, height: 10 },
      lastGoodPosition: { x: 900, y: 900, width: 10, height: 10 },
    }),
    snapshots: [],
  },
  {
    name: 'empty-snapshot-map',
    why: 'First render before any snapshot has been reported.',
    comment: comment(),
    snapshots: [],
  },
];

const corpus = {
  $schema: 'anchor-corpus/v1',
  generatedFrom: 'apps/web/src/comments.ts#resolveCommentAnchor',
  note:
    'Generated output — do not hand-edit. Re-run the generator and commit the '
    + 'diff. A change here means anchoring behaviour changed, which both ends '
    + 'must adopt together.',
  cases: CASES.map((c) => {
    const resolution = resolveCommentAnchor(c.comment, snaps(...c.snapshots), c.currentVersion);
    return {
      name: c.name,
      why: c.why,
      input: {
        comment: c.comment,
        snapshots: c.snapshots,
        ...(c.currentVersion === undefined ? {} : { currentVersion: c.currentVersion }),
      },
      expected: {
        state: resolution.state,
        snapshotElementId: resolution.snapshot?.elementId ?? null,
        snapshotPosition: resolution.snapshot?.position ?? null,
      },
    };
  }),
};

const out = resolve(dirname(fileURLToPath(import.meta.url)), 'anchor-corpus.json');
writeFileSync(out, `${JSON.stringify(corpus, null, 2)}\n`);
console.log(`wrote ${corpus.cases.length} cases to ${out}`);
for (const c of corpus.cases) console.log(`  ${c.expected.state.padEnd(11)} ${c.name}`);
