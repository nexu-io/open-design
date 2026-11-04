import { describe, expect, it } from 'vitest';
import { placeCommentPopover } from '../../src/comments/popover-geometry';
const viewport = { left: 0, top: 0, width: 800, height: 600 };
const avatar = { left: 300, top: 200, width: 28, height: 28 };
describe('comment popover adjacent safe placement', () => {
  it('uses right, then left, then above, then below with 12px gaps and 16px inset', () => {
    expect(placeCommentPopover(avatar, viewport, 200)).toMatchObject({ left: 340, top: 200, width: 320 });
    expect(placeCommentPopover({ ...avatar, left: 700 }, viewport, 200)).toMatchObject({ left: 368, width: 320 });
    expect(placeCommentPopover({ ...avatar, left: 180 }, { ...viewport, width: 400 }, 120)).toMatchObject({ top: 68, width: 320 });
    expect(placeCommentPopover({ ...avatar, left: 180, top: 30 }, { ...viewport, width: 400 }, 120)).toMatchObject({ top: 70, width: 320 });
  });
  it.each([[660, 280], [580, 240], [500, 208]])('narrows to the next fitting width in a short %ipx viewport', (width, expected) => {
    const result = placeCommentPopover({ ...avatar, left: width / 2 - 14, top: 40 }, { ...viewport, width, height: 160 }, 120);
    expect(result?.width).toBe(expected);
    expect(result?.left).toBe(width / 2 + 26);
    expect(result?.top).toBe(24);
  });
  it('uses the actual safe width below 240px above the avatar', () => {
    expect(placeCommentPopover({ left: 86, top: 180, width: 28, height: 28 }, { left: 0, top: 0, width: 220, height: 300 }, 120)).toMatchObject({ width: 188, top: 48, left: 16 });
  });
  it('hides when no adjacent minimum-width card fits instead of moving it away', () => {
    expect(placeCommentPopover({ left: 90, top: 40, width: 28, height: 28 }, { left: 0, top: 0, width: 200, height: 150 }, 120)).toBeNull();
  });
  it('caps tall content to safe viewport height and preserves source geometry', () => {
    const result = placeCommentPopover(avatar, viewport, 900);
    expect(result).toMatchObject({ top: 16, maxHeight: 568 });
    expect(avatar).toEqual({ left: 300, top: 200, width: 28, height: 28 });
  });
});
