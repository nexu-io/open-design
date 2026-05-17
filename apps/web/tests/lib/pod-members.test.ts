import { describe, expect, it } from 'vitest';

import type { PreviewCommentMember } from '@open-design/contracts';

import type { PreviewCommentSnapshot } from '../../src/comments';
import { applyPodMemberRemoval, removePodMember } from '../../src/lib/pod-members';

function member(elementId: string, label = elementId): PreviewCommentMember {
  return {
    elementId,
    selector: `#${elementId}`,
    label,
    text: '',
    position: { x: 0, y: 0, width: 10, height: 10 },
    htmlHint: '',
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
    selector: '',
    label: 'Pod',
    text: '',
    position: { x: 0, y: 0, width: 100, height: 60 },
    htmlHint: '',
    selectionKind: 'pod',
    memberCount: members.length,
    podMembers: members,
  };
}

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
});
