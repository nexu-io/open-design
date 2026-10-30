import type { CSSProperties } from 'react';
import type { PreviewCommentSnapshot } from '../comments/anchor';
import { clippedCommentTarget, commentTargetLabelLayout, type CommentCanvasRect } from '../comments/canvas-geometry';
import styles from './CommentCanvasTarget.module.css';

/** Single-element canvas feedback. Pod member selection remains with the existing
 * CommentTargetOverlay so its per-member hover emphasis is preserved. */
export function CommentCanvasTarget({ snapshot, scale, offset, canvas, selected = false, color }: {
  snapshot: PreviewCommentSnapshot; scale: number; offset?: { x: number; y: number };
  canvas: CommentCanvasRect; selected?: boolean; color?: { bg: string; fg: string };
}) {
  const rect = clippedCommentTarget(snapshot, { scale, offset }, canvas);
  if (!rect) return null;
  const label = snapshot.label || snapshot.elementId;
  const labelStyle = commentTargetLabelLayout(rect, canvas);
  return <div className={styles.clip} style={{ left: canvas.left, top: canvas.top, width: canvas.width, height: canvas.height, ...(color ? { '--comment-target-color': color.bg, '--comment-target-text': color.fg } : {}) } as CSSProperties}>
    <div className={`${styles.outline}${selected ? ` ${styles.selected}` : ''}`} title={label}
      data-testid="comment-target-overlay" style={{ left: rect.left - canvas.left, top: rect.top - canvas.top, width: rect.width, height: rect.height }} />
    <span className={styles.label} title={label} style={{ ...labelStyle, left: labelStyle.left - canvas.left, top: labelStyle.top - canvas.top }}>{label}</span>
  </div>;
}
