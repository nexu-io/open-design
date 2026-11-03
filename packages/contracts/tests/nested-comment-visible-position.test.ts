import { describe, expect, it } from 'vitest';
import { NESTED_COMMENT_HELPERS } from '../src/runtime/nested-comment-helpers';

type Rect = { x: number; y: number; width: number; height: number };
type Ancestor = {
  parentElement: Ancestor | null;
  ownerDocument: { defaultView: { getComputedStyle: (node: Ancestor) => { overflowX: string; overflowY: string } } };
  overflowX: string; overflowY: string;
  offsetWidth: number; offsetHeight: number;
  clientLeft: number; clientTop: number; clientWidth: number; clientHeight: number;
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number };
};

const visiblePosition = new Function(`${NESTED_COMMENT_HELPERS}\nreturn commentVisiblePosition;`)() as
  (node: { parentElement: Ancestor | null }, rect: Rect) => Rect;

function ancestor(options: Partial<Ancestor> = {}): Ancestor {
  return {
    parentElement: null,
    ownerDocument: { defaultView: { getComputedStyle: node => node } },
    overflowX: 'visible', overflowY: 'visible',
    offsetWidth: 144, offsetHeight: 104,
    clientLeft: 2, clientTop: 2, clientWidth: 140, clientHeight: 100,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 144, height: 104 }),
    ...options,
  };
}

describe('injected commentVisiblePosition', () => {
  const rect = { x: 0, y: 0, width: 260, height: 200 };

  it('leaves the original rect and unclipped axes unchanged', () => {
    expect(visiblePosition({ parentElement: ancestor() }, rect)).toEqual(rect);
    expect(visiblePosition({ parentElement: ancestor({ overflowX: 'hidden' }) }, rect))
      .toEqual({ x: 12, y: 0, width: 140, height: 200 });
    expect(rect).toEqual({ x: 0, y: 0, width: 260, height: 200 });
  });

  it('intersects nested axis-specific client boxes, accounting for borders and scale', () => {
    const outer = ancestor({ overflowY: 'auto', getBoundingClientRect: () => ({ left: 0, top: 30, width: 72, height: 52 }) });
    const inner = ancestor({ parentElement: outer, overflowX: 'clip', getBoundingClientRect: () => ({ left: 10, top: 20, width: 72, height: 52 }) });
    expect(visiblePosition({ parentElement: inner }, rect)).toEqual({ x: 11, y: 31, width: 70, height: 50 });
  });

  it('returns zero width or height when fully clipped', () => {
    const parent = ancestor({ overflowX: 'scroll', overflowY: 'hidden' });
    expect(visiblePosition({ parentElement: parent }, { x: 200, y: 200, width: 10, height: 10 }))
      .toEqual({ x: 200, y: 200, width: 0, height: 0 });
  });
});
