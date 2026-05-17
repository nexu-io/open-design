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
  const anchor = recomputePodAnchor(nextMembers);
  if (!anchor) {
    return { next: null, shouldClose: true };
  }
  return {
    next: {
      ...current,
      ...anchor,
      podMembers: nextMembers,
      memberCount: nextMembers.length,
    },
    shouldClose: false,
  };
}

type PodMemberLike = Pick<
  PreviewCommentMember,
  'elementId' | 'selector' | 'label' | 'text' | 'position' | 'htmlHint'
>;

export type PodAnchorFields = Pick<
  PreviewCommentSnapshot,
  'selector' | 'label' | 'text' | 'position' | 'htmlHint'
>;

// Recomputes the snapshot-level fields that address a multi-member Pod as
// one region. Output shape (slice limits, htmlHint cap, position rounding)
// mirrors `buildPodSnapshot` so an anchor rebuilt after removal stays
// structurally identical to the one created at capture time.
export function recomputePodAnchor(
  members: readonly PodMemberLike[],
): PodAnchorFields | null {
  if (members.length === 0) return null;

  const xs = members.map((m) => m.position.x);
  const ys = members.map((m) => m.position.y);
  const rights = members.map((m) => m.position.x + m.position.width);
  const bottoms = members.map((m) => m.position.y + m.position.height);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...rights);
  const bottom = Math.max(...bottoms);

  const selector =
    members
      .slice(0, 8)
      .map((m) => m.selector)
      .filter((s): s is string => Boolean(s))
      .join(', ') || 'body *';

  const summaryParts = members
    .slice(0, 3)
    .map(summarizeAnchorMember)
    .filter((s) => s.length > 0);
  const label = summaryParts.join(' · ') || `Pod of ${members.length} items`;

  const text = members
    .slice(0, 4)
    .map((m) => m.text)
    .filter((s): s is string => Boolean(s))
    .join(' · ');

  const htmlHint = members
    .slice(0, 4)
    .map((m) => m.htmlHint)
    .filter((s): s is string => Boolean(s))
    .join(' ')
    .slice(0, 180);

  return {
    selector,
    label,
    text,
    position: {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.max(1, Math.round(right - left)),
      height: Math.max(1, Math.round(bottom - top)),
    },
    htmlHint,
  };
}

// 28-char truncation matches `buildPodSnapshot`'s label-summary rule; the
// chip-level summary lives in BoardComposerPopover with a tighter 24-char cap.
function summarizeAnchorMember(member: PodMemberLike): string {
  const raw = String(member.text || '').trim();
  if (!raw) return member.label || member.elementId;
  const trimmed = raw.length > 28 ? `${raw.slice(0, 25)}...` : raw;
  return `${member.label || member.elementId} · ${trimmed}`;
}
