import type { CommentCanvasRect } from './canvas-geometry';

/** All rectangles use the same CSS-pixel coordinate space as the displayed avatar. */
export function placeCommentPopover(
  avatar: CommentCanvasRect,
  viewport: CommentCanvasRect,
  contentHeight: number,
) {
  const gap = 12;
  const left = viewport.left + 16, top = viewport.top + 16;
  const right = viewport.left + viewport.width - 16, bottom = viewport.top + viewport.height - 16;
  const safeWidth = right - left, safeHeight = bottom - top;
  const minHeight = Math.min(contentHeight, 120);
  if (safeWidth < 160 || safeHeight < minHeight) return null;
  const avatarRight = avatar.left + avatar.width, avatarBottom = avatar.top + avatar.height;
  const verticalSpace = Math.max(avatar.top - gap - top, bottom - avatarBottom - gap);
  const actualWidth = Math.min(239, safeWidth, verticalSpace >= minHeight ? safeWidth : Math.max(right - avatarRight - gap, avatar.left - gap - left));
  const widths = [320, 280, 240, actualWidth];
  for (const width of widths) {
    if (width < 160 || width > safeWidth) continue;
    const height = Math.min(contentHeight, safeHeight);
    const besideTop = Math.max(top, Math.min(avatar.top, bottom - height));
    if (avatarRight + gap + width <= right) return { left: avatarRight + gap, top: besideTop, width, maxHeight: safeHeight };
    if (avatar.left - gap - width >= left) return { left: avatar.left - gap - width, top: besideTop, width, maxHeight: safeHeight };
    const alignedLeft = Math.max(left, Math.min(avatar.left, right - width));
    const aboveHeight = avatar.top - gap - top;
    if (aboveHeight >= minHeight) return { left: alignedLeft, top: avatar.top - gap - Math.min(height, aboveHeight), width, maxHeight: aboveHeight };
    const belowHeight = bottom - avatarBottom - gap;
    if (belowHeight >= minHeight) return { left: alignedLeft, top: avatarBottom + gap, width, maxHeight: belowHeight };
  }
  return null;
}
