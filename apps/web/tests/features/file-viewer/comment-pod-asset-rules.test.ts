import { describe, expect, it } from 'vitest';

import {
  commentActivityAt,
  commentCreatedAt,
  commentSideDropEdgeForEvent,
  reorderPreviewCommentIds,
  podDisplayMembers,
  podOverlayWeights,
  roundOverlayOpacity,
  buildPodSnapshot,
  pruneContainerSelections,
  summarizeSnapshot,
  selectionHitsSnapshot,
  finiteBridgeInteger,
  normalizeAnnotationStyle,
  clampBridgeCoordinate,
  baseDirFor,
  toOwnerRelativePath,
  isBlockedPreviewAssetScheme,
  hasRelativeAssetRefs,
  resolveProjectRelativePath,
  readHtmlAttr,
  escapeHtmlAttr,
  isHtmlVersionableFile,
  fileVersionSourceClassName,
  markdownDirectory,
  normalizeMarkdownProjectPath,
  markdownRelativeProjectPath,
  decodeHtmlAttribute,
  escapeHtmlAttribute,
  markdownScrollRange,
  markdownScrollRatio,
  markdownScrollTopForRatio,
  mergeMarkdownSaveOptions,
  isMarkdownImageFile,
  markdownImageAlt,
  humanSize,
  exportReadyNudgeKey,
} from '../../../src/features/file-viewer/rules';
import type { PreviewComment } from '../../../src/types';
import type { PreviewCommentSnapshot } from '../../../src/comments';

function makeComment(overrides: Partial<PreviewComment> = {}): PreviewComment {
  return {
    id: 'c1',
    elementId: 'el-1',
    text: '',
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  } as PreviewComment;
}

describe('commentActivityAt / commentCreatedAt', () => {
  it('uses the max of updatedAt/createdAt for activity', () => {
    expect(commentActivityAt(makeComment({ createdAt: 100, updatedAt: 200 }))).toBe(200);
  });

  it('falls back to activity when createdAt is not finite', () => {
    expect(commentCreatedAt(makeComment({ createdAt: NaN, updatedAt: 150 }))).toBe(150);
  });
});

describe('commentSideDropEdgeForEvent', () => {
  it('reports before when the pointer is in the top half', () => {
    const event = {
      currentTarget: { getBoundingClientRect: () => ({ top: 100, height: 40 }) },
      clientY: 110,
    };
    expect(commentSideDropEdgeForEvent(event)).toBe('before');
  });

  it('reports after when the pointer is in the bottom half', () => {
    const event = {
      currentTarget: { getBoundingClientRect: () => ({ top: 100, height: 40 }) },
      clientY: 135,
    };
    expect(commentSideDropEdgeForEvent(event)).toBe('after');
  });
});

describe('reorderPreviewCommentIds', () => {
  it('moves the dragged id after the target', () => {
    const comments = ['a', 'b', 'c'].map((id) => makeComment({ id }));
    expect(reorderPreviewCommentIds(comments, 'a', 'c', 'after')).toEqual(['b', 'c', 'a']);
  });

  it('returns the original order when the dragged id is unknown', () => {
    const comments = ['a', 'b'].map((id) => makeComment({ id }));
    expect(reorderPreviewCommentIds(comments, 'zzz', 'a', 'before')).toEqual(['a', 'b']);
  });
});

function makeSnapshot(overrides: Partial<PreviewCommentSnapshot> = {}): PreviewCommentSnapshot {
  return {
    filePath: 'index.html',
    elementId: 'el-1',
    selector: '[data-od-id="el-1"]',
    label: 'Button',
    text: '',
    position: { x: 0, y: 0, width: 100, height: 20 },
    htmlHint: '',
    selectionKind: 'element',
    ...overrides,
  } as PreviewCommentSnapshot;
}

describe('roundOverlayOpacity', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundOverlayOpacity(0.12345)).toBe(0.12);
  });
});

describe('podOverlayWeights', () => {
  it('gives the smallest member the highest emphasis', () => {
    const members = [
      makeSnapshot({ elementId: 'big', position: { x: 0, y: 0, width: 200, height: 200 } }),
      makeSnapshot({ elementId: 'small', position: { x: 0, y: 0, width: 10, height: 10 } }),
    ];
    const [bigWeight, smallWeight] = podOverlayWeights(members);
    expect(smallWeight!.backgroundOpacity).toBeGreaterThan(bigWeight!.backgroundOpacity);
  });
});

describe('pruneContainerSelections', () => {
  it('drops an outer container when it just wraps two contained members', () => {
    const container = makeSnapshot({ elementId: 'container', position: { x: 0, y: 0, width: 200, height: 200 } });
    const childA = makeSnapshot({ elementId: 'a', position: { x: 10, y: 10, width: 20, height: 20 } });
    const childB = makeSnapshot({ elementId: 'b', position: { x: 100, y: 100, width: 20, height: 20 } });
    const kept = pruneContainerSelections([container, childA, childB]);
    expect(kept.map((s) => s.elementId)).toEqual(['a', 'b']);
  });

  it('keeps a single item untouched', () => {
    const only = makeSnapshot({ elementId: 'only' });
    expect(pruneContainerSelections([only])).toEqual([only]);
  });
});

describe('summarizeSnapshot', () => {
  it('combines label and truncated text', () => {
    expect(summarizeSnapshot(makeSnapshot({ label: 'Card', text: 'a'.repeat(40) }))).toBe(
      `Card · ${'a'.repeat(25)}...`,
    );
  });

  it('falls back to elementId when there is no label', () => {
    expect(summarizeSnapshot(makeSnapshot({ label: '', elementId: 'el-9', text: '' }))).toBe('el-9');
  });
});

describe('selectionHitsSnapshot', () => {
  it('hits when a stroke point lands inside the snapshot bounds', () => {
    const snapshot = makeSnapshot({ position: { x: 0, y: 0, width: 100, height: 100 } });
    expect(
      selectionHitsSnapshot({ points: [{ x: 50, y: 50 }], snapshot, closedLoop: false }),
    ).toBe(true);
  });

  it('misses when the stroke never crosses the bounds and the loop is open', () => {
    const snapshot = makeSnapshot({ position: { x: 0, y: 0, width: 10, height: 10 } });
    expect(
      selectionHitsSnapshot({ points: [{ x: 500, y: 500 }], snapshot, closedLoop: false }),
    ).toBe(false);
  });
});

describe('buildPodSnapshot', () => {
  it('returns null for fewer than 2 stroke points', () => {
    expect(buildPodSnapshot({ filePath: 'index.html', strokePoints: [{ x: 0, y: 0 }], liveTargets: new Map() })).toBeNull();
  });

  it('unions the bounds of every hit target', () => {
    const liveTargets = new Map<string, PreviewCommentSnapshot>([
      ['a', makeSnapshot({ elementId: 'a', position: { x: 0, y: 0, width: 10, height: 10 } })],
      ['b', makeSnapshot({ elementId: 'b', position: { x: 50, y: 50, width: 10, height: 10 } })],
    ]);
    const strokePoints = [
      { x: -5, y: -5 },
      { x: 65, y: -5 },
      { x: 65, y: 65 },
      { x: -5, y: 65 },
      { x: -5, y: -5 },
    ];
    const pod = buildPodSnapshot({ filePath: 'index.html', strokePoints, liveTargets });
    expect(pod?.selectionKind).toBe('pod');
    expect(pod?.memberCount).toBe(2);
    expect(pod?.position).toEqual({ x: 0, y: 0, width: 60, height: 60 });
  });
});

describe('podDisplayMembers', () => {
  it('returns empty for a non-pod snapshot', () => {
    expect(podDisplayMembers(makeSnapshot({ selectionKind: 'element' }))).toEqual([]);
  });

  it('expands pod members into element snapshots', () => {
    const pod = makeSnapshot({
      selectionKind: 'pod',
      podMembers: [
        { elementId: 'a', selector: '[data-od-id="a"]', label: 'A', text: '', position: { x: 0, y: 0, width: 10, height: 10 }, htmlHint: '' },
      ],
    } as Partial<PreviewCommentSnapshot>);
    const members = podDisplayMembers(pod);
    expect(members).toHaveLength(1);
    expect(members[0]?.elementId).toBe('a');
  });
});

describe('finiteBridgeInteger / clampBridgeCoordinate', () => {
  it('rejects non-finite values', () => {
    expect(finiteBridgeInteger(Number.NaN)).toBeUndefined();
    expect(finiteBridgeInteger(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('clamps a huge coordinate to the bridge max', () => {
    expect(clampBridgeCoordinate(10_000_000)).toBe(1_000_000);
    expect(clampBridgeCoordinate(-10_000_000)).toBe(-1_000_000);
  });

  it('rounds a finite value', () => {
    expect(finiteBridgeInteger(4.6)).toBe(5);
  });
});

describe('normalizeAnnotationStyle', () => {
  it('keeps only allow-listed string facets, trimmed and length-capped', () => {
    const style = normalizeAnnotationStyle({ color: '  red  ', fontSize: 12, notAllowed: 'x' });
    expect(style).toEqual({ color: 'red' });
  });

  it('returns undefined for a non-object input', () => {
    expect(normalizeAnnotationStyle(null)).toBeUndefined();
    expect(normalizeAnnotationStyle('nope')).toBeUndefined();
  });
});

describe('HTML preview asset-path rules', () => {
  it('baseDirFor extracts the directory prefix', () => {
    expect(baseDirFor('assets/img/logo.png')).toBe('assets/img/');
    expect(baseDirFor('logo.png')).toBe('');
  });

  it('toOwnerRelativePath resolves a sibling path relative to the owner file', () => {
    expect(toOwnerRelativePath('pages/index.html', 'pages/assets/logo.png')).toBe('assets/logo.png');
    expect(toOwnerRelativePath('pages/sub/index.html', 'assets/logo.png')).toBe('../../assets/logo.png');
  });

  it('isBlockedPreviewAssetScheme blocks javascript: and data: urls', () => {
    expect(isBlockedPreviewAssetScheme('javascript:alert(1)')).toBe(true);
    expect(isBlockedPreviewAssetScheme('data:text/html,hi')).toBe(true);
    expect(isBlockedPreviewAssetScheme('./assets/logo.png')).toBe(false);
  });

  it('isBlockedPreviewAssetScheme strips whitespace/control chars before checking', () => {
    expect(isBlockedPreviewAssetScheme('java\tscript:alert(1)')).toBe(true);
  });

  it('hasRelativeAssetRefs finds a relative src/href not covered by an absolute scheme', () => {
    expect(hasRelativeAssetRefs('<img src="./logo.png">')).toBe(true);
    expect(hasRelativeAssetRefs('<img src="https://cdn.example.com/logo.png">')).toBe(false);
  });

  it('resolveProjectRelativePath resolves a same-directory relative reference', () => {
    expect(resolveProjectRelativePath('pages/index.html', './logo.png')).toBe('pages/logo.png');
  });

  it('resolveProjectRelativePath rejects a blocked scheme before touching the URL', () => {
    expect(resolveProjectRelativePath('index.html', 'javascript:alert(1)')).toBeNull();
  });

  it('resolveProjectRelativePath clamps a traversal past the root instead of escaping it', () => {
    // The WHATWG URL algorithm (both plain and percent-encoded `../`) can't
    // produce an origin change from a relative reference, so a `../` chain
    // longer than the owner's own directory depth just clamps at the origin
    // root rather than escaping it — same as a browser would resolve it.
    expect(resolveProjectRelativePath('pages/index.html', '../../etc/passwd')).toBe('etc/passwd');
  });

  it('readHtmlAttr / escapeHtmlAttr round-trip an attribute value', () => {
    expect(readHtmlAttr('<link rel="stylesheet" href="a.css">', 'href')).toBe('a.css');
    expect(escapeHtmlAttr('a & "b"')).toBe('a &amp; &quot;b&quot;');
  });
});

describe('file-version rules', () => {
  it('isHtmlVersionableFile matches html kind or extension', () => {
    expect(isHtmlVersionableFile({ kind: 'html', name: 'x' })).toBe(true);
    expect(isHtmlVersionableFile({ kind: 'other', name: 'index.htm' })).toBe(true);
    expect(isHtmlVersionableFile({ kind: 'other', name: 'notes.md' })).toBe(false);
  });

  it('fileVersionSourceClassName maps each source to a CSS class', () => {
    expect(fileVersionSourceClassName({ source: 'manual' })).toBe('manual');
    expect(fileVersionSourceClassName({ source: 'restore' })).toBe('restore');
    expect(fileVersionSourceClassName({ source: 'ai' })).toBe('ai');
  });
});

describe('markdown source-path rules', () => {
  it('markdownDirectory returns the containing directory', () => {
    expect(markdownDirectory('docs/guide/readme.md')).toBe('docs/guide');
    expect(markdownDirectory('readme.md')).toBe('');
  });

  it('normalizeMarkdownProjectPath squashes . and .. segments', () => {
    expect(normalizeMarkdownProjectPath('docs/./guide/../readme.md')).toBe('docs/readme.md');
  });

  it('markdownRelativeProjectPath computes a path relative to the from-file directory', () => {
    expect(markdownRelativeProjectPath('docs/guide/readme.md', 'docs/guide/images/a.png')).toBe('images/a.png');
    expect(markdownRelativeProjectPath('docs/guide/readme.md', 'assets/a.png')).toBe('../../assets/a.png');
  });

  it('decodeHtmlAttribute / escapeHtmlAttribute round-trip entities', () => {
    expect(decodeHtmlAttribute('a &amp; &quot;b&quot;')).toBe('a & "b"');
    expect(escapeHtmlAttribute('a & "b"')).toBe('a &amp; &quot;b&quot;');
  });
});

describe('markdown scroll rules', () => {
  const element = { scrollHeight: 1000, clientHeight: 400, scrollTop: 150 };

  it('markdownScrollRange is the scrollable overflow', () => {
    expect(markdownScrollRange(element)).toBe(600);
  });

  it('markdownScrollRatio is scrollTop over the range', () => {
    expect(markdownScrollRatio(element)).toBeCloseTo(0.25);
  });

  it('markdownScrollTopForRatio is the inverse of markdownScrollRatio', () => {
    expect(markdownScrollTopForRatio(element, 0.25)).toBe(150);
  });

  it('markdownScrollRatio is 0 when there is nothing to scroll', () => {
    expect(markdownScrollRatio({ scrollHeight: 100, clientHeight: 100, scrollTop: 0 })).toBe(0);
  });
});

describe('mergeMarkdownSaveOptions', () => {
  it('defaults both flags to true unless either side explicitly disables them', () => {
    expect(mergeMarkdownSaveOptions({}, {})).toEqual({ refreshFiles: true, showSaving: true });
  });

  it('stays disabled only when both sides disable the flag', () => {
    expect(mergeMarkdownSaveOptions({ refreshFiles: false }, { refreshFiles: false })).toEqual({
      refreshFiles: false,
      showSaving: true,
    });
    expect(mergeMarkdownSaveOptions({ refreshFiles: false }, { refreshFiles: true })).toEqual({
      refreshFiles: true,
      showSaving: true,
    });
  });
});

describe('isMarkdownImageFile / markdownImageAlt', () => {
  it('matches by mime type or extension', () => {
    expect(isMarkdownImageFile({ type: 'image/png', name: 'a.bin' })).toBe(true);
    expect(isMarkdownImageFile({ type: '', name: 'photo.jpg' })).toBe(true);
    expect(isMarkdownImageFile({ type: '', name: 'notes.txt' })).toBe(false);
  });

  it('derives an alt text from the filename', () => {
    expect(markdownImageAlt('hero_image-01.png')).toBe('hero image 01');
    expect(markdownImageAlt('.png')).toBe('image');
  });
});

describe('humanSize', () => {
  it('formats bytes, kilobytes, and megabytes', () => {
    expect(humanSize(500)).toBe('500 B');
    expect(humanSize(2048)).toBe('2.0 KB');
    expect(humanSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('exportReadyNudgeKey', () => {
  it('builds a stable per-project-and-file storage key', () => {
    expect(exportReadyNudgeKey('proj-1', 'index.html')).toBe(
      'open-design:export-ready-nudge:proj-1:index.html',
    );
  });
});
