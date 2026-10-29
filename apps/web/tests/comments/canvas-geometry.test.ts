import { describe, expect, it } from 'vitest';
import { preserveCommentPoint, type PreviewCommentSnapshot } from '../../src/comments/anchor';
import { clippedCommentTarget, commentPointInCanvas, commentTargetLabelLayout, groupCommentMarkers, layoutCommentMarkerCluster, projectCommentPoint } from '../../src/comments/canvas-geometry';
const target: PreviewCommentSnapshot = { filePath: 'a.html', elementId: 'cmt:a', selector: '[data-od-comment-id="a"]', label: 'Title', text: '', htmlHint: '', position: { x: 100, y: 200, width: 400, height: 80, anchor: { u: .25, v: .75 } } };
const canvas = { left: 0, top: 0, width: 800, height: 600 };
describe('current comment canvas geometry', () => {
  it('projects the existing u/v path once at 75% and 50%, with portal offset only when supplied', () => {
    expect(projectCommentPoint(target, { scale: .75 })).toEqual({ x: 150, y: 195 });
    expect(projectCommentPoint(target, { scale: .5, offset: { x: 24, y: 30 } })).toEqual({ x: 124, y: 160 });
    const moved = preserveCommentPoint(target, { ...target, position: { x: 200, y: 300, width: 200, height: 120 } });
    expect(projectCommentPoint(moved, { scale: .5 })).toEqual({ x: 125, y: 195 });
    expect(target.position.anchor).toEqual({ u: .25, v: .75 });
  });
  it.each([{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 0, y: 600 }, { x: 800, y: 600 }])('keeps an extreme avatar fully inside the 16 CSS px inset: %o', point => {
    const layout = layoutCommentMarkerCluster(point, 1, canvas)!;
    expect(layout.left).toBeGreaterThanOrEqual(16); expect(layout.top).toBeGreaterThanOrEqual(16);
    expect(layout.left + layout.width).toBeLessThanOrEqual(784); expect(layout.top + layout.height).toBeLessThanOrEqual(584);
    expect(layout.point).toEqual(point);
  });
  it('does not move a normal anchor and keeps CSS avatar size at 50%', () => {
    const point = projectCommentPoint(target, { scale: .5 });
    expect(layoutCommentMarkerCluster(point, 1, canvas)).toMatchObject({ left: 100, top: 102, width: 28, height: 28 });
  });
  it('checks the true origin before clamping, even when the element still intersects the canvas', () => {
    const scrolled = { ...target, position: { x: 10, y: -40, width: 200, height: 80, anchor: { u: .5, v: .1 } } };
    expect(clippedCommentTarget(scrolled, { scale: 1 }, canvas)).not.toBeNull();
    expect(layoutCommentMarkerCluster(projectCommentPoint(scrolled, { scale: 1 }), 1, canvas)).toBeNull();
    expect(commentPointInCanvas({ x: -0.01, y: 30 }, canvas)).toBe(false);
  });
  it('keeps every same-point comment in rows of at most five, and separates distinct targets and points', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: String(i), target }));
    const groups = groupCommentMarkers([...items, { id: 'other', target: { ...target, elementId: 'cmt:b' } }, { id: 'point', target: { ...target, hoverPoint: { x: 300, y: 300 }, position: { ...target.position, anchor: { u: .5, v: .5 } } } }], { scale: 1 }, canvas);
    expect(groups).toHaveLength(3); expect(groups[0]?.members).toHaveLength(8); expect(groups[0]?.visibleMembers).toHaveLength(8);
    expect(groups[0]?.layout.width).toBe(116); expect(groups[0]?.layout.avatars[1]?.left).toBe(222);
    expect(groups[0]?.layout).toMatchObject({ height: 64, contentHeight: 64, columns: 5, rows: 2 });
    expect(groups[0]?.layout.avatars[5]).toEqual({ left: 200, top: 268, width: 28, height: 28 });
    expect(groups[0]?.visibleMembers.map(item => item.id)).toEqual(items.map(item => item.id));
  });
  it('recomputes a whole cluster when the dock reduces space, never shrinking avatars', () => {
    const layout = layoutCommentMarkerCluster({ x: 89, y: 60 }, 8, { left: 0, top: 0, width: 100, height: 100 })!;
    expect(layout.visibleCount).toBe(8); expect(layout.width).toBe(50); expect(layout.left).toBe(34);
    expect(layout).toMatchObject({ top: 16, height: 68, contentWidth: 50, contentHeight: 136, columns: 2, rows: 4 });
    expect(layout.avatars[7]).toEqual({ left: 56, top: 124, width: 28, height: 28 });
    expect(layout.avatars.every(rect => rect.width === 28)).toBe(true);
    expect(layoutCommentMarkerCluster({ x: 10, y: 10 }, 1, { ...canvas, width: 59 })).toBeNull();
  });
  it('keeps sixty markers in twelve full-size rows and exposes scroll content on a short canvas', () => {
    const point = { x: 790, y: 590 };
    const layout = layoutCommentMarkerCluster(point, 60, { ...canvas, top: 500, height: 100 })!;
    expect(layout).toMatchObject({ left: 668, top: 516, width: 116, height: 68, contentWidth: 116, contentHeight: 424, columns: 5, rows: 12, visibleCount: 60, point });
    expect(layout.avatars).toHaveLength(60);
    expect(layout.avatars[59]).toEqual({ left: 756, top: 912, width: 28, height: 28 });
    expect(layout.avatars.every(rect => rect.width === 28 && rect.height === 28)).toBe(true);
    expect(layoutCommentMarkerCluster(point, 0, canvas)).toBeNull();
  });
  it('hides lost and offscreen at rendering only, leaving the source rows untouched', () => {
    const items = [{ id: 'lost', target, anchorState: 'lost' }, { id: 'ok', target }, { id: 'outside', target: { ...target, position: { ...target.position, y: 900 } } }];
    expect(groupCommentMarkers(items, { scale: 1 }, canvas)[0]?.members.map(item => item.id)).toEqual(['ok']);
    expect(items).toHaveLength(3); expect(items[0]?.anchorState).toBe('lost');
  });
  it('clips huge and 4px targets without inflating their bounds; labels stay inside the canvas', () => {
    const huge = clippedCommentTarget({ ...target, position: { x: -50, y: -20, width: 1000, height: 900 } }, { scale: 1 }, canvas)!;
    expect(huge).toEqual(canvas); expect(commentTargetLabelLayout(huge, canvas).top).toBeLessThanOrEqual(578);
    expect(clippedCommentTarget({ ...target, position: { x: 798, y: 598, width: 4, height: 4 } }, { scale: 1 }, canvas)).toEqual({ left: 798, top: 598, width: 2, height: 2 });
    expect(clippedCommentTarget({ ...target, position: { x: 900, y: 20, width: 4, height: 4 } }, { scale: 1 }, canvas)).toBeNull();
  });
});
