// @vitest-environment jsdom

// Red spec for issue #549: "annotation display does not update in the Mark
// tool". The reproduction matrix pinned the failure to cross-tool paths:
// switching the mark tool mid-gesture leaves the interrupted gesture's state
// (`boxDraftRef` / `drawingRef`) hanging, and every later pointer interaction
// is misrouted through that stale gesture — the new annotation never shows up
// on the canvas while a ghost of the abandoned one keeps repainting.
//
// These tests observe the actual painted canvas frames (not just the refs)
// through a recording 2D context, per the jsdom caveats in the tech spec:
// redraw() bails out unless `window.CanvasRenderingContext2D` is defined, so
// the stub must exist before the overlay renders.

import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewDrawOverlay } from '../../src/components/PreviewDrawOverlay';

class FakeCanvasRenderingContext2D {}

// Deterministic rAF: scheduleRedraw()'s coalesced frames land in this queue
// and only run when the test flushes them, so "did the canvas repaint" is
// never timing-dependent.
let rafQueue = new Map<number, FrameRequestCallback>();
let nextRafId = 1;

function flushAnimationFrames() {
  const batch = [...rafQueue.values()];
  rafQueue.clear();
  for (const cb of batch) cb(0);
}

beforeEach(() => {
  rafQueue = new Map();
  nextRafId = 1;
  vi.stubGlobal('CanvasRenderingContext2D', FakeCanvasRenderingContext2D);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextRafId;
    nextRafId += 1;
    rafQueue.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafQueue.delete(id);
  });
  // Uninstrumented canvases (jsdom has no real 2D context) return null instead
  // of throwing "not implemented" noise; instrumented ones shadow this at the
  // instance level.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as never);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface PaintedFrame {
  boxes: number;
  strokePaths: Array<{ segments: number }>;
}

// Record what redraw() actually paints. Every clearRect() starts a new frame;
// strokeRect() marks a box (committed or draft), and each beginPath/lineTo/
// stroke sequence marks one freehand path with its segment count — a hanging
// single-point stroke paints zero segments, a real drawn line paints >= 1.
function instrumentCanvas(canvas: HTMLCanvasElement) {
  const frames: PaintedFrame[] = [];
  let current: PaintedFrame | null = null;
  let pendingPath: { segments: number } | null = null;
  const ctx = {
    clearRect: () => {
      current = { boxes: 0, strokePaths: [] };
      frames.push(current);
    },
    strokeRect: () => {
      if (current) current.boxes += 1;
    },
    beginPath: () => {
      pendingPath = { segments: 0 };
    },
    lineTo: () => {
      if (pendingPath) pendingPath.segments += 1;
    },
    stroke: () => {
      if (current && pendingPath) current.strokePaths.push(pendingPath);
      pendingPath = null;
    },
    moveTo: () => {},
    fillRect: () => {},
    fillText: () => {},
    setLineDash: () => {},
    save: () => {},
    restore: () => {},
    measureText: () => ({ width: 0 }),
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
    strokeStyle: '',
    fillStyle: '',
    font: '',
  };
  canvas.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  canvas.getBoundingClientRect = () =>
    ({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200,
      toJSON: () => ({}),
    }) as DOMRect;
  return {
    lastFrame: () => frames.at(-1) ?? null,
    frameCount: () => frames.length,
  };
}

function renderOverlay() {
  const utils = render(
    <PreviewDrawOverlay active>
      <div style={{ width: 320, height: 200 }} />
    </PreviewDrawOverlay>,
  );
  const canvas = utils.container.querySelector<HTMLCanvasElement>('canvas')!;
  const paint = instrumentCanvas(canvas);
  return { ...utils, canvas, paint };
}

function switchMarkTool(
  getByRole: ReturnType<typeof render>['getByRole'],
  from: string,
  to: string,
) {
  fireEvent.click(getByRole('button', { name: from }));
  fireEvent.click(getByRole('menuitemradio', { name: to }));
}

describe('PreviewDrawOverlay redraw sync (issue #549)', () => {
  it('paints the pen stroke drawn after a box drag was abandoned by a tool switch', () => {
    const { canvas, paint, getByRole } = renderOverlay();

    // Start a box drag; before it ends, a second pointer (touch, or a pointer
    // whose pointerup the canvas never saw) switches the tool from the menu.
    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: 80, pointerId: 1 });
    switchMarkTool(getByRole, 'Box select', 'Pen');

    // Draw a pen stroke with a fresh pointer. Its ink must appear, and the
    // abandoned drag must not resurface as a ghost rectangle.
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 140, clientY: 140, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 140, clientY: 140, pointerId: 2 });
    flushAnimationFrames();

    const frame = paint.lastFrame();
    expect(frame).not.toBeNull();
    expect(frame!.boxes).toBe(0);
    expect(frame!.strokePaths).toHaveLength(1);
    expect(frame!.strokePaths[0]!.segments).toBeGreaterThan(0);
  });

  it('ignores the abandoned pointer’s pointerup while a new pointer is mid-stroke (multi-touch)', () => {
    const { canvas, paint, getByRole } = renderOverlay();

    // Finger 1 starts a box drag; finger 2 taps the toolbar and switches to
    // Pen (clearing the draft); finger 3 begins the new pen stroke while
    // finger 1 is still down.
    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: 80, pointerId: 1 });
    switchMarkTool(getByRole, 'Box select', 'Pen');
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 3 });

    // Finger 1 finally lifts. Pointer capture routes its pointerup here; it
    // must not commit-and-clear the stroke finger 3 is still drawing.
    fireEvent.pointerUp(canvas, { clientX: 80, clientY: 80, pointerId: 1 });

    fireEvent.pointerMove(canvas, { clientX: 130, clientY: 130, pointerId: 3 });
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 160, pointerId: 3 });
    fireEvent.pointerUp(canvas, { clientX: 160, clientY: 160, pointerId: 3 });
    flushAnimationFrames();

    // The full stroke (down + both moves) survives as one committed path; the
    // abandoned drag leaves no box behind.
    const frame = paint.lastFrame();
    expect(frame).not.toBeNull();
    expect(frame!.boxes).toBe(0);
    expect(frame!.strokePaths).toHaveLength(1);
    expect(frame!.strokePaths[0]!.segments).toBe(2);
  });

  it('does not grow ghost ink from hover moves after a pen stroke was abandoned by a tool switch', () => {
    const { canvas, paint, getByRole } = renderOverlay();
    switchMarkTool(getByRole, 'Box select', 'Pen');

    // Start a pen stroke, then switch tools mid-stroke; the gesture never gets
    // its pointerup on the canvas.
    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 40, clientY: 40, pointerId: 1 });
    switchMarkTool(getByRole, 'Pen', 'Box select');

    // Later the mouse merely hovers the canvas (no button pressed). No ink may
    // appear from those moves.
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 120, pointerId: 3 });
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 160, pointerId: 3 });
    flushAnimationFrames();

    const frame = paint.lastFrame();
    expect(frame).not.toBeNull();
    expect(frame!.strokePaths).toHaveLength(0);
  });

  it('does not resurrect the abandoned box draft while placing a text label', () => {
    const { canvas, paint, getByRole } = renderOverlay();

    // Interrupted box drag, then the user switches to the text tool.
    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: 80, pointerId: 1 });
    switchMarkTool(getByRole, 'Box select', 'Text');

    // Dropping a label and moving the pointer must not repaint (or resize) the
    // abandoned rectangle.
    fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 2 });
    fireEvent.pointerMove(canvas, { clientX: 150, clientY: 150, pointerId: 2 });
    flushAnimationFrames();

    const frame = paint.lastFrame();
    expect(frame).not.toBeNull();
    expect(frame!.boxes).toBe(0);
  });

  it('keeps coalescing pointermove repaints into a single animation frame', () => {
    const { canvas, paint, getByRole } = renderOverlay();
    switchMarkTool(getByRole, 'Box select', 'Pen');

    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 20, pointerId: 1 });
    const framesAfterDown = paint.frameCount();

    // A high-Hz pointer burst schedules at most one pending repaint.
    fireEvent.pointerMove(canvas, { clientX: 30, clientY: 30, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 40, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 50, clientY: 50, pointerId: 1 });
    expect(paint.frameCount()).toBe(framesAfterDown);

    flushAnimationFrames();
    expect(paint.frameCount()).toBe(framesAfterDown + 1);
  });
});
