// @vitest-environment jsdom
//
// OPEND-3202: the Home kinetic grid only moves under a cursor, so a fresh Home
// renders as a still dot field. Once per page load a scripted attractor sweeps
// across it (the startup sweep from Demo #7635) so the effect introduces
// itself; a real cursor supersedes the sweep, and remounting the canvas on the
// same page load does NOT replay it.

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppWashKineticGrid } from '../../src/components/AppWashKineticGrid';

const REST_RADIUS = 0.55;

type ArcCall = { x: number; y: number; r: number };

function installCanvasStub(): { arcs: ArcCall[]; frames: Array<() => void> } {
  const arcs: ArcCall[] = [];
  const frames: Array<() => void> = [];
  const ctx = {
    setTransform: () => {},
    clearRect: () => {},
    beginPath: () => {},
    fill: () => {},
    arc: (x: number, y: number, r: number) => {
      arcs.push({ x, y, r });
    },
    globalAlpha: 1,
    fillStyle: '',
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    frames.push(() => cb(performance.now()));
    return frames.length;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = () => {};
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  return { arcs, frames };
}

function mountGrid() {
  const host = document.createElement('div');
  host.getBoundingClientRect = () =>
    ({ width: 400, height: 200, top: 0, left: 0, right: 400, bottom: 200, x: 0, y: 0, toJSON() {} }) as DOMRect;
  document.body.appendChild(host);
  const view = render(<AppWashKineticGrid />, { container: host });
  return { host, view };
}

function runFrames(frames: Array<() => void>, count: number): void {
  for (let i = 0; i < count; i += 1) {
    const next = frames.shift();
    if (!next) throw new Error('animation loop stopped');
    act(() => next());
  }
}

describe('AppWashKineticGrid startup sweep', () => {
  let now = 0;
  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('sweeps a scripted attractor across the field once per page load, then rests', () => {
    const stub = installCanvasStub();
    mountGrid();

    // Mid-sweep (750ms of the 1500ms intro): dots near the attractor swell
    // past their rest radius even though no pointer has ever moved.
    now = 0;
    runFrames(stub.frames, 1);
    now = 750;
    stub.arcs.length = 0;
    runFrames(stub.frames, 1);
    expect(stub.arcs.length).toBeGreaterThan(0);
    expect(stub.arcs.some((call) => call.r > REST_RADIUS + 0.05)).toBe(true);

    // After the sweep ends and the springs settle, every dot is back at rest.
    now = 1600;
    runFrames(stub.frames, 1);
    for (let i = 0; i < 40; i += 1) {
      now += 16;
      stub.arcs.length = 0;
      runFrames(stub.frames, 1);
    }
    expect(stub.arcs.every((call) => Math.abs(call.r - REST_RADIUS) < 0.02)).toBe(true);

    // A remount on the same page load (Home unmounts the canvas on every
    // navigation away) does not replay the introduction.
    cleanup();
    document.body.innerHTML = '';
    const second = installCanvasStub();
    mountGrid();
    now = 2000;
    runFrames(second.frames, 1);
    now = 2750;
    second.arcs.length = 0;
    runFrames(second.frames, 1);
    expect(second.arcs.length).toBeGreaterThan(0);
    expect(second.arcs.every((call) => Math.abs(call.r - REST_RADIUS) < 0.02)).toBe(true);
  });
});
