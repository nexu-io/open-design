import type { PreviewCommentMember } from '@open-design/contracts';
import type { PreviewCommentSnapshot } from '../comments';

export function removePodMember(
  members: PreviewCommentMember[],
  elementId: string,
): PreviewCommentMember[] {
  return members.filter((member) => member.elementId !== elementId);
}

export type PodMemberRemovalResult = {
  next: PreviewCommentSnapshot | null;
  shouldClose: boolean;
};

export function applyPodMemberRemoval(
  current: PreviewCommentSnapshot | null,
  elementId: string,
): PodMemberRemovalResult {
  if (!current || current.selectionKind !== 'pod' || !current.podMembers) {
    return { next: current, shouldClose: false };
  }
  const nextMembers = removePodMember(current.podMembers, elementId);
  if (nextMembers.length === 0) {
    return { next: null, shouldClose: true };
  }
  return {
    next: { ...current, podMembers: nextMembers, memberCount: nextMembers.length },
    shouldClose: false,
  };
}
