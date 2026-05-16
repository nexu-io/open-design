import type { PreviewCommentMember } from '@open-design/contracts';

export function removePodMember(
  members: PreviewCommentMember[],
  elementId: string,
): PreviewCommentMember[] {
  return members.filter((member) => member.elementId !== elementId);
}
