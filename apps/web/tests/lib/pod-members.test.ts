import { describe, expect, it } from 'vitest';

import type { PreviewCommentMember } from '@open-design/contracts';

import type { PreviewCommentSnapshot } from '../../src/comments';
import { applyPodMemberRemoval, recomputePodAnchor, removePodMember } from '../../src/lib/pod-members';

function member(
  elementId: string,
  label = elementId,
  overrides: Partial<PreviewCommentMember> = {},
): PreviewCommentMember {
  return {
    elementId,
    selector: `#${elementId}`,
    label,
    text: '',
    position: { x: 0, y: 0, width: 10, height: 10 },
    htmlHint: '',
    ...overrides,
  };
}

describe('removePodMember', () => {
  it('removes the matching member while preserving order of the remaining items', () => {
    const a = member('a');
    const b = member('b');
    const c = member('c');

    const result = removePodMember([a, b, c], 'b');

    expect(result).toEqual([a, c]);
  });

  it('returns an equivalent array when the elementId is absent', () => {
    const a = member('a');
    const b = member('b');
    const input = [a, b];

    const result = removePodMember(input, 'missing');

    expect(result).toEqual([a, b]);
    expect(result).not.toBe(input);
  });

  it('returns an empty array for empty input', () => {
    expect(removePodMember([], 'anything')).toEqual([]);
  });

  it('does not mutate the caller\'s array', () => {
    const a = member('a');
    const b = member('b');
    const input = [a, b];

    removePodMember(input, 'a');

    expect(input).toEqual([a, b]);
    expect(input).toHaveLength(2);
  });

  it('removes every entry when the same elementId appears more than once', () => {
    const a1 = member('a', 'first');
    const a2 = member('a', 'second');
    const b = member('b');

    const result = removePodMember([a1, b, a2], 'a');

    expect(result).toEqual([b]);
  });
});

function podSnapshot(members: PreviewCommentMember[]): PreviewCommentSnapshot {
  return {
    filePath: 'index.html',
    elementId: 'pod-1',
    selector: 'stale, stale, stale',
    label: 'stale label',
    text: 'stale text',
    position: { x: 999, y: 999, width: 999, height: 999 },
    htmlHint: '<stale>',
    selectionKind: 'pod',
    memberCount: members.length,
    podMembers: members,
  };
}

describe('recomputePodAnchor', () => {
  it('returns null for an empty member list', () => {
    expect(recomputePodAnchor([])).toBeNull();
  });

  it('joins selectors from the first 8 members and falls back to body * when all are empty', () => {
    const empty = recomputePodAnchor([member('a', 'a', { selector: '' })]);
    expect(empty?.selector).toBe('body *');

    const many = Array.from({ length: 10 }, (_, i) => member(`m${i}`));
    const joined = recomputePodAnchor(many);
    expect(joined?.selector.split(', ')).toHaveLength(8);
  });

  it('computes the tightest bounding rect across every member position', () => {
    const result = recomputePodAnchor([
      member('a', 'a', { position: { x: 10, y: 20, width: 30, height: 40 } }),
      member('b', 'b', { position: { x: 100, y: 200, width: 50, height: 60 } }),
    ]);

    expect(result?.position).toEqual({ x: 10, y: 20, width: 140, height: 240 });
  });

  it('rounds position fields and enforces minimum 1x1 dimensions', () => {
    const result = recomputePodAnchor([
      member('a', 'a', { position: { x: 0.49, y: 0.49, width: 0.49, height: 0.49 } }),
    ]);

    expect(result?.position).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('renders a "Pod of N items" label when every member summary collapses to empty', () => {
    const result = recomputePodAnchor([
      member('', '', { elementId: '', label: '' }),
      member('', '', { elementId: '', label: '' }),
    ]);

    expect(result?.label).toBe('Pod of 2 items');
  });

  it('caps htmlHint at 180 chars to match the buildPodSnapshot creation path', () => {
    const longHint = 'x'.repeat(300);
    const result = recomputePodAnchor([member('a', 'a', { htmlHint: longHint })]);

    expect(result?.htmlHint).toHaveLength(180);
  });
});

describe('applyPodMemberRemoval', () => {
  it('signals shouldClose when the last member is removed', () => {
    const result = applyPodMemberRemoval(podSnapshot([member('only')]), 'only');

    expect(result.shouldClose).toBe(true);
    expect(result.next).toBeNull();
  });

  it('returns the trimmed snapshot when other members remain', () => {
    const a = member('a');
    const b = member('b');

    const result = applyPodMemberRemoval(podSnapshot([a, b]), 'a');

    expect(result.shouldClose).toBe(false);
    expect(result.next?.podMembers).toEqual([b]);
    expect(result.next?.memberCount).toBe(1);
  });

  it('keeps memberCount in sync with podMembers.length', () => {
    const result = applyPodMemberRemoval(podSnapshot([member('a'), member('b'), member('c')]), 'b');

    expect(result.next?.memberCount).toBe(2);
    expect(result.next?.podMembers).toHaveLength(2);
  });

  it('is a no-op when current is null', () => {
    expect(applyPodMemberRemoval(null, 'a')).toEqual({ next: null, shouldClose: false });
  });

  it('is a no-op when the target is not a pod', () => {
    const elementTarget: PreviewCommentSnapshot = {
      ...podSnapshot([member('a')]),
      selectionKind: 'element',
    };

    const result = applyPodMemberRemoval(elementTarget, 'a');

    expect(result.shouldClose).toBe(false);
    expect(result.next).toBe(elementTarget);
  });

  it('is a no-op when the elementId is absent', () => {
    const a = member('a');
    const input = podSnapshot([a]);

    const result = applyPodMemberRemoval(input, 'missing');

    expect(result.shouldClose).toBe(false);
    expect(result.next?.podMembers).toEqual([a]);
  });

  it('rebuilds selector, label, position, text, htmlHint from the remaining members', () => {
    const hero = member('hero', 'hero', {
      selector: '[data-od-id="hero"]',
      label: 'section.hero',
      text: 'Hero title',
      position: { x: 10, y: 20, width: 200, height: 100 },
      htmlHint: '<section data-od-id="hero">',
    });
    const chart = member('chart', 'chart', {
      selector: '[data-od-id="chart"]',
      label: 'section.chart',
      text: 'Chart value',
      position: { x: 120, y: 80, width: 190, height: 120 },
      htmlHint: '<section data-od-id="chart">',
    });

    const result = applyPodMemberRemoval(podSnapshot([hero, chart]), 'hero');

    expect(result.next).toMatchObject({
      selector: '[data-od-id="chart"]',
      label: 'section.chart · Chart value',
      text: 'Chart value',
      position: { x: 120, y: 80, width: 190, height: 120 },
      htmlHint: '<section data-od-id="chart">',
      memberCount: 1,
    });
    expect(JSON.stringify(result.next)).not.toContain('hero');
    expect(JSON.stringify(result.next)).not.toContain('stale');
  });
});
