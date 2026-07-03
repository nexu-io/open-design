// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderMarkdownToSafeHtml } from '../../src/artifacts/markdown';
import {
  buildScrollAnchors,
  extractMarkdownBlockLines,
  mapScrollPosition,
  measurePreviewBlockOffsets,
} from '../../src/components/markdown-scroll-sync';

function topLevelElementCount(markdown: string): number {
  const host = document.createElement('div');
  host.innerHTML = renderMarkdownToSafeHtml(markdown);
  return Array.from(host.children).filter((child) => child instanceof HTMLElement).length;
}

describe('extractMarkdownBlockLines', () => {
  it('returns one source line per top-level block in document order', () => {
    const markdown = [
      '# Title', // 1
      '', // 2
      'Intro paragraph that is long enough to wrap somewhere.', // 3
      '', // 4
      '## Section A', // 5
      '', // 6
      '- item one', // 7
      '- item two', // 8
      '', // 9
      'Another paragraph.', // 10
      '', // 11
      '```bash', // 12
      '# not a heading inside a fence', // 13
      'echo hi', // 14
      '```', // 15
      '', // 16
      '> a quote', // 17
      '', // 18
      '### Section B', // 19
      '', // 20
      'Final paragraph.', // 21
    ].join('\n');
    expect(extractMarkdownBlockLines(markdown)).toEqual([1, 3, 5, 7, 10, 12, 17, 19, 21]);
  });

  it('collapses nested list items into their top-level list', () => {
    const markdown = ['- top', '  - nested a', '  - nested b', '- top two', '', 'after'].join('\n');
    // The whole list is a single top-level block starting on line 1.
    expect(extractMarkdownBlockLines(markdown)).toEqual([1, 6]);
  });

  it('treats a setext heading as a single block (no double count)', () => {
    const markdown = ['Heading', '=======', '', 'body'].join('\n');
    expect(extractMarkdownBlockLines(markdown)).toEqual([1, 4]);
  });

  it('returns an empty array for empty input', () => {
    expect(extractMarkdownBlockLines('')).toEqual([]);
  });
});

describe('block count invariant (extraction matches rendered DOM)', () => {
  // Split-view alignment maps block N's source line to the Nth rendered
  // top-level element, so the two counts MUST agree for every block shape we
  // render. If they ever diverge the preview-side measurement bails to ratio
  // sync, but these common shapes should always line up exactly.
  const cases: Array<[string, string]> = [
    ['headings + paragraphs', ['# A', '', 'one', '', '## B', '', 'two'].join('\n')],
    ['lists', ['- a', '- b', '', '1. c', '2. d'].join('\n')],
    ['fenced code', ['intro', '', '```js', 'const x = 1;', '```', '', 'outro'].join('\n')],
    ['blockquote', ['> quote line one', '> quote line two', '', 'after'].join('\n')],
    ['gfm table', ['| a | b |', '| - | - |', '| 1 | 2 |', '', 'tail'].join('\n')],
    ['thematic break', ['above', '', '---', '', 'below'].join('\n')],
    ['setext heading', ['Title', '=====', '', 'body'].join('\n')],
  ];

  for (const [name, markdown] of cases) {
    it(`${name}: extracted block count equals rendered top-level element count`, () => {
      expect(extractMarkdownBlockLines(markdown).length).toBe(topLevelElementCount(markdown));
    });
  }
});

describe('buildScrollAnchors', () => {
  it('brackets block offsets with a top (0) and bottom (scrollHeight) anchor', () => {
    expect(buildScrollAnchors([40, 120, 260], 600)).toEqual([0, 40, 120, 260, 600]);
  });

  it('clamps to the scroll range and enforces monotonicity', () => {
    expect(buildScrollAnchors([120, 80, 9999], 500)).toEqual([0, 120, 120, 500, 500]);
  });
});

describe('measurePreviewBlockOffsets', () => {
  it('returns null when the browser cannot report distinct block geometry', () => {
    const pane = document.createElement('div');
    pane.innerHTML = '<article class="markdown-rendered"><p>one</p><p>two</p></article>';
    expect(measurePreviewBlockOffsets(pane, 2)).toBeNull();
  });
});

describe('mapScrollPosition', () => {
  const source = [0, 100, 300, 600];
  const target = [0, 250, 400, 900];

  it('maps each anchor exactly onto its paired anchor (blocks stay aligned)', () => {
    source.forEach((value, index) => {
      expect(mapScrollPosition(value, source, target)).toBeCloseTo(target[index] ?? -1);
    });
  });

  it('linearly interpolates between bracketing anchors', () => {
    // Halfway between source[1]=100 and source[2]=300 -> halfway in target.
    expect(mapScrollPosition(200, source, target)).toBeCloseTo(325);
  });

  it('clamps below the first and above the last anchor', () => {
    expect(mapScrollPosition(-50, source, target)).toBe(0);
    expect(mapScrollPosition(9999, source, target)).toBe(900);
  });

  it('handles degenerate (zero-length) segments without dividing by zero', () => {
    const result = mapScrollPosition(100, [0, 100, 100, 200], [0, 50, 80, 120]);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(50);
    expect(result).toBeLessThanOrEqual(80);
  });
});
