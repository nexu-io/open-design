// Dumb overlay: draws the hover/active target box(es) for a comment snapshot,
// including the per-member chip layout for a multi-element pod selection.
import type { CSSProperties } from 'react';
import { overlayBoundsFromSnapshot, type PreviewCommentSnapshot } from '../../../comments';
import { podDisplayMembers, podOverlayWeights } from '../rules';

export function CommentTargetOverlay({
  snapshot,
  scale,
  offset,
  selected,
  hoveredMemberId,
}: {
  snapshot: PreviewCommentSnapshot;
  scale: number;
  offset?: { x: number; y: number };
  selected: boolean;
  hoveredMemberId?: string | null;
}) {
  const overlayOffset = offset ?? { x: 0, y: 0 };
  const displayMembers = podDisplayMembers(snapshot);
  if (displayMembers.length > 0) {
    const overlayWeights = podOverlayWeights(displayMembers);
    return (
      <>
        {displayMembers.map((member, index) => {
          const bounds = overlayBoundsFromSnapshot(member, scale, overlayOffset);
          const overlayWeight = overlayWeights[index] ?? {
            backgroundOpacity: 0.24,
            outlineOpacity: 0.72,
            ringOpacity: 0.18,
          };
          const overlayStyle: CSSProperties & Record<string, string | number> = {
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
            '--comment-overlay-bg': `rgba(22, 119, 255, ${overlayWeight.backgroundOpacity})`,
            '--comment-overlay-ring': `rgba(22, 119, 255, ${overlayWeight.ringOpacity})`,
            '--comment-overlay-border': `rgba(22, 119, 255, ${overlayWeight.outlineOpacity})`,
          };
          const isHoverFocused = hoveredMemberId === member.elementId;
          return (
            <div
              key={`${member.elementId}-${index}`}
              className={`comment-target-overlay comment-target-overlay--member${selected ? ' selected' : ''}${isHoverFocused ? ' is-hover-focused' : ''}`}
              style={overlayStyle}
              data-testid="comment-target-overlay"
            >
              <span className="comment-target-overlay-label">{snapshot.elementId}</span>
            </div>
          );
        })}
      </>
    );
  }
  // Non-member fallback: single-element snapshots have no per-member chips,
  // so the hover-focus channel never reaches this branch — no is-hover-focused
  // class needed here.
  const bounds = overlayBoundsFromSnapshot(snapshot, scale, overlayOffset);
  return (
    <div
      className={`comment-target-overlay${selected ? ' selected' : ''}`}
      style={{
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
      }}
      data-testid="comment-target-overlay"
    >
      <span className="comment-target-overlay-label">{snapshot.elementId}</span>
    </div>
  );
}
