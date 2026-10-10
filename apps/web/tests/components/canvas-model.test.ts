import { describe, expect, it } from 'vitest';
import { MAX_PROJECT_CANVAS_NODES, type ProjectCanvasState } from '@open-design/contracts';
import {
  addArtifactNode,
  bringNodeToFront,
  canRedo,
  canUndo,
  commitCanvasState,
  createCanvasHistory,
  DEFAULT_CANVAS_NODE_HEIGHT,
  DEFAULT_CANVAS_NODE_WIDTH,
  emptyCanvasState,
  hasNodeForRef,
  moveNode,
  nextCanvasNodeId,
  redoCanvas,
  removeNode,
  resizeNode,
  setCanvasViewport,
  undoCanvas,
} from '../../src/components/canvas/canvas-model';

describe('canvas-model spatial ops', () => {
  it('adds an artifact node with default size and top z', () => {
    const state = addArtifactNode(emptyCanvasState(), { id: 'node-1', ref: 'a.html' });
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0]).toMatchObject({
      id: 'node-1',
      ref: 'a.html',
      w: DEFAULT_CANVAS_NODE_WIDTH,
      h: DEFAULT_CANVAS_NODE_HEIGHT,
      z: 1,
    });
  });

  it('cascades successive nodes and raises z each time', () => {
    let state = addArtifactNode(emptyCanvasState(), { id: 'node-1', ref: 'a.html' });
    state = addArtifactNode(state, { id: 'node-2', ref: 'b.html' });
    expect(state.nodes[1]!.x).toBeGreaterThan(state.nodes[0]!.x);
    expect(state.nodes[1]!.z).toBe(2);
  });

  it('honors explicit coordinates when provided', () => {
    const state = addArtifactNode(emptyCanvasState(), {
      id: 'node-1',
      ref: 'a.html',
      x: 100,
      y: 200,
      w: 640,
      h: 480,
    });
    expect(state.nodes[0]).toMatchObject({ x: 100, y: 200, w: 640, h: 480 });
  });

  it('refuses to add past the node cap', () => {
    let state: ProjectCanvasState = emptyCanvasState();
    for (let i = 0; i < MAX_PROJECT_CANVAS_NODES; i += 1) {
      state = addArtifactNode(state, { id: `node-${i}`, ref: `f${i}.html` });
    }
    expect(state.nodes).toHaveLength(MAX_PROJECT_CANVAS_NODES);
    const capped = addArtifactNode(state, { id: 'overflow', ref: 'x.html' });
    expect(capped).toBe(state);
  });

  it('rejects blank id or ref', () => {
    const base = emptyCanvasState();
    expect(addArtifactNode(base, { id: '  ', ref: 'a.html' })).toBe(base);
    expect(addArtifactNode(base, { id: 'node-1', ref: '  ' })).toBe(base);
  });

  it('reports whether a ref is already on the board', () => {
    const state = addArtifactNode(emptyCanvasState(), { id: 'node-1', ref: 'a.html' });
    expect(hasNodeForRef(state, 'a.html')).toBe(true);
    expect(hasNodeForRef(state, 'b.html')).toBe(false);
  });

  it('moves and resizes a node, returning the same ref on no-op', () => {
    const state = addArtifactNode(emptyCanvasState(), { id: 'node-1', ref: 'a.html', x: 0, y: 0 });
    const moved = moveNode(state, 'node-1', 50, 60);
    expect(moved.nodes[0]).toMatchObject({ x: 50, y: 60 });
    expect(moveNode(moved, 'node-1', 50, 60)).toBe(moved);

    const resized = resizeNode(moved, 'node-1', 800, 600);
    expect(resized.nodes[0]).toMatchObject({ w: 800, h: 600 });
    const clamped = resizeNode(resized, 'node-1', -10, 0);
    expect(clamped.nodes[0]).toMatchObject({ w: 1, h: 1 });
  });

  it('brings a node to front only when it is not already top', () => {
    let state = addArtifactNode(emptyCanvasState(), { id: 'node-1', ref: 'a.html' });
    state = addArtifactNode(state, { id: 'node-2', ref: 'b.html' });
    const raised = bringNodeToFront(state, 'node-1');
    expect(raised.nodes[0]!.z).toBeGreaterThan(raised.nodes[1]!.z);
    expect(bringNodeToFront(raised, 'node-1')).toBe(raised);
  });

  it('removes a node and no-ops on unknown id', () => {
    const state = addArtifactNode(emptyCanvasState(), { id: 'node-1', ref: 'a.html' });
    expect(removeNode(state, 'node-1').nodes).toHaveLength(0);
    expect(removeNode(state, 'missing')).toBe(state);
  });

  it('stores a viewport', () => {
    const state = setCanvasViewport(emptyCanvasState(), { x: 10, y: 20, zoom: 1.5 });
    expect(state.viewport).toEqual({ x: 10, y: 20, zoom: 1.5 });
  });

  it('generates unique node ids that avoid collisions', () => {
    const state = addArtifactNode(emptyCanvasState(), { id: 'node-1', ref: 'a.html' });
    expect(nextCanvasNodeId(state)).toBe('node-2');
  });
});

describe('canvas-model history', () => {
  it('tracks undo/redo across commits', () => {
    const start = emptyCanvasState();
    let history = createCanvasHistory(start);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);

    const withNode = addArtifactNode(start, { id: 'node-1', ref: 'a.html' });
    history = commitCanvasState(history, withNode);
    expect(history.present).toBe(withNode);
    expect(canUndo(history)).toBe(true);

    history = undoCanvas(history);
    expect(history.present).toBe(start);
    expect(canRedo(history)).toBe(true);

    history = redoCanvas(history);
    expect(history.present).toBe(withNode);
  });

  it('ignores a commit that does not change the present reference', () => {
    const start = emptyCanvasState();
    const history = createCanvasHistory(start);
    expect(commitCanvasState(history, start)).toBe(history);
  });

  it('drops the redo stack after a fresh commit', () => {
    const start = emptyCanvasState();
    const a = addArtifactNode(start, { id: 'node-1', ref: 'a.html' });
    const b = addArtifactNode(a, { id: 'node-2', ref: 'b.html' });
    let history = commitCanvasState(createCanvasHistory(start), a);
    history = commitCanvasState(history, b);
    history = undoCanvas(history);
    expect(canRedo(history)).toBe(true);
    const c = addArtifactNode(history.present, { id: 'node-3', ref: 'c.html' });
    history = commitCanvasState(history, c);
    expect(canRedo(history)).toBe(false);
  });
});
