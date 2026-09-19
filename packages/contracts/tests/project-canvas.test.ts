// #8230 自由画布 v1 — 画布布局契约的归一化边界。
//
// daemon 的 tabs_state 与 web 的 tabsState 把画布布局塞进同一块 tabs JSON，
// 这里把「不可信输入 → 可持久化布局」的归一化行为钉死，两侧共用同一实现，
// 免得两边各写一份、各漂一点。

import { describe, expect, it } from 'vitest';
import {
  MAX_PROJECT_CANVAS_NODES,
  normalizeProjectCanvasState,
  type ProjectCanvasState,
} from '../src/api/canvas.js';

describe('normalizeProjectCanvasState', () => {
  it('rejects input that is not a plain object', () => {
    expect(normalizeProjectCanvasState(null)).toBeNull();
    expect(normalizeProjectCanvasState(undefined)).toBeNull();
    expect(normalizeProjectCanvasState('x')).toBeNull();
    expect(normalizeProjectCanvasState(42)).toBeNull();
    expect(normalizeProjectCanvasState([])).toBeNull();
  });

  it('returns null when there is no usable node and no viewport', () => {
    expect(normalizeProjectCanvasState({})).toBeNull();
    expect(normalizeProjectCanvasState({ nodes: [] })).toBeNull();
    expect(normalizeProjectCanvasState({ nodes: 'nope' })).toBeNull();
  });

  it('keeps a well-formed node with its geometry', () => {
    const state = normalizeProjectCanvasState({
      nodes: [{ id: 'n1', ref: 'index.html', x: 10, y: 20, w: 320, h: 240, z: 3 }],
    });
    expect(state).toEqual<ProjectCanvasState>({
      nodes: [{ id: 'n1', ref: 'index.html', x: 10, y: 20, w: 320, h: 240, z: 3 }],
    });
  });

  it('drops nodes missing a string id or ref', () => {
    const state = normalizeProjectCanvasState({
      nodes: [
        { id: '', ref: 'a.html', x: 0, y: 0, w: 10, h: 10 },
        { id: 'n2', ref: '', x: 0, y: 0, w: 10, h: 10 },
        { id: 'n3', x: 0, y: 0, w: 10, h: 10 },
        { ref: 'b.html', x: 0, y: 0, w: 10, h: 10 },
        { id: 'ok', ref: 'c.html', x: 1, y: 2, w: 30, h: 40 },
      ],
    });
    expect(state?.nodes.map((n) => n.id)).toEqual(['ok']);
  });

  it('drops nodes with non-finite geometry or non-positive size', () => {
    const state = normalizeProjectCanvasState({
      nodes: [
        { id: 'a', ref: 'a.html', x: Number.NaN, y: 0, w: 10, h: 10 },
        { id: 'b', ref: 'b.html', x: 0, y: Infinity, w: 10, h: 10 },
        { id: 'c', ref: 'c.html', x: 0, y: 0, w: 0, h: 10 },
        { id: 'd', ref: 'd.html', x: 0, y: 0, w: 10, h: -5 },
        { id: 'e', ref: 'e.html', x: 0, y: 0, w: 10, h: 10 },
      ],
    });
    expect(state?.nodes.map((n) => n.id)).toEqual(['e']);
  });

  it('defaults z to 0 when absent or non-finite', () => {
    const state = normalizeProjectCanvasState({
      nodes: [
        { id: 'a', ref: 'a.html', x: 0, y: 0, w: 10, h: 10 },
        { id: 'b', ref: 'b.html', x: 0, y: 0, w: 10, h: 10, z: Number.NaN },
      ],
    });
    expect(state?.nodes.every((n) => n.z === 0)).toBe(true);
  });

  it('keeps the first node when ids collide', () => {
    const state = normalizeProjectCanvasState({
      nodes: [
        { id: 'dup', ref: 'first.html', x: 0, y: 0, w: 10, h: 10 },
        { id: 'dup', ref: 'second.html', x: 5, y: 5, w: 20, h: 20 },
      ],
    });
    expect(state?.nodes).toHaveLength(1);
    expect(state?.nodes[0]?.ref).toBe('first.html');
  });

  it('caps the node count', () => {
    const many = Array.from({ length: MAX_PROJECT_CANVAS_NODES + 10 }, (_, i) => ({
      id: `n${i}`,
      ref: `f${i}.html`,
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    }));
    const state = normalizeProjectCanvasState({ nodes: many });
    expect(state?.nodes).toHaveLength(MAX_PROJECT_CANVAS_NODES);
  });

  it('keeps a finite viewport with positive zoom', () => {
    const state = normalizeProjectCanvasState({
      nodes: [{ id: 'n1', ref: 'a.html', x: 0, y: 0, w: 10, h: 10 }],
      viewport: { x: -100, y: 50, zoom: 1.5 },
    });
    expect(state?.viewport).toEqual({ x: -100, y: 50, zoom: 1.5 });
  });

  it('drops a viewport with non-finite fields or non-positive zoom', () => {
    const base = { id: 'n1', ref: 'a.html', x: 0, y: 0, w: 10, h: 10 };
    expect(
      normalizeProjectCanvasState({ nodes: [base], viewport: { x: 0, y: 0, zoom: 0 } })?.viewport,
    ).toBeUndefined();
    expect(
      normalizeProjectCanvasState({ nodes: [base], viewport: { x: Number.NaN, y: 0, zoom: 1 } })?.viewport,
    ).toBeUndefined();
  });

  it('preserves a viewport even when the board has no nodes', () => {
    const state = normalizeProjectCanvasState({ nodes: [], viewport: { x: 0, y: 0, zoom: 1 } });
    expect(state).not.toBeNull();
    expect(state?.nodes).toEqual([]);
    expect(state?.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});
