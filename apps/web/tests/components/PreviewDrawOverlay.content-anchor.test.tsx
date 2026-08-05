// @vitest-environment jsdom

// Issue #6361, the half the frame-geometry fix cannot reach: the artifact
// *reflows*. Narrowing the preview frame rewraps the header text and pushes
// every band down 19.5px, so a mark held at any frame-relative position lands
// between bands. The mark therefore anchors to the element it was drawn on and
// is re-projected from that element's current box before the annotation is read.
//
// Measured on the reported artifact: BAND 05 sits at y=342 in a 692x666 frame
// and at y=322.5 in a 804x744 frame.

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PreviewDrawOverlay } from '../../src/components/PreviewDrawOverlay';
import { requestPreviewAnchorTargets } from '../../src/runtime/exports';

vi.mock('../../src/runtime/exports', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtime/exports')>();
  return {
    ...actual,
    requestPreviewSnapshot: vi.fn(async () => null),
    requestPreviewAnchorTargets: vi.fn(async () => ({ answered: false, targets: [] })),
  };
});

afterEach(() => cleanup());

const frame = { w: 692, h: 666 };

/** Bands are 40px tall on a 50px pitch under a header whose height reflows. */
function targetsFor(headerH: number, frameW: number) {
  return [
    { elementId: 'header', selector: '#h', position: { x: 0, y: 0, width: frameW, height: headerH } },
    ...Array.from({ length: 10 }, (_, i) => ({
      elementId: `band-${i + 1}`,
      selector: `#b${i + 1}`,
      position: { x: 32, y: headerH + 28 + i * 50, width: frameW - 64, height: 40 },
    })),
  ];
}
const ZOOMED = targetsFor(114, 692); // BAND 05 at 342
const RESTORED = targetsFor(94.5, 804); // BAND 05 at 322.5

function installFrameGeometry() {
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: frame.w,
        height: frame.h,
        right: frame.w,
        bottom: frame.h,
        toJSON: () => ({}),
      }) as DOMRect,
  );
  return () => spy.mockRestore();
}

function installResizeObserver() {
  let cb: ResizeObserverCallback | null = null;
  class RO {
    constructor(c: ResizeObserverCallback) {
      cb = c;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const prev = (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: RO as unknown as typeof ResizeObserver,
  });
  return {
    trigger: () => cb?.([], {} as ResizeObserver),
    restore: () => {
      if (prev) {
        Object.defineProperty(globalThis, 'ResizeObserver', {
          configurable: true,
          writable: true,
          value: prev,
        });
      } else {
        delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
      }
    },
  };
}

/**
 * Composite-recording mocks: capture the rects the compositor paints into the
 * annotation PNG so tests can assert painted-pixels ↔ structured-bounds
 * alignment (the #6361 three-way invariant) without decoding an image.
 */
function installRecordingCompositeMocks() {
  const painted: Array<{ x: number; y: number; w: number; h: number }> = [];
  const originalImage = globalThis.Image;
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      window.setTimeout(() => this.onload?.(), 0);
    }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: MockImage, writable: true });
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn((x: number, y: number, w: number, h: number) => {
      painted.push({ x, y, w, h });
    }),
    fillText: vi.fn(),
    lineCap: 'round',
    lineJoin: 'round',
    lineTo: vi.fn(),
    lineWidth: 1,
    measureText: vi.fn(() => ({ width: 10 })),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    font: '',
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext);
  const toBlob = vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation((callback: BlobCallback) => callback(new Blob(['png'], { type: 'image/png' })));
  return {
    painted,
    restore() {
      Object.defineProperty(globalThis, 'Image', { configurable: true, value: originalImage, writable: true });
      getContext.mockRestore();
      toBlob.mockRestore();
    },
  };
}

describe('PreviewDrawOverlay content anchoring (issue #6361)', () => {
  it('follows the marked element when the artifact reflows', async () => {
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockImplementation(async () => ({ answered: true, targets: ZOOMED }) as never);

    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (r: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" />
        </PreviewDrawOverlay>,
      );
      const wrap = container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      // Mark BAND 05 where it sits while zoomed: 342..382.
      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 342, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      await waitFor(() => expect(anchors).toHaveBeenCalled());

      // Cmd 0: the frame grows back and the header un-wraps, so every band
      // moves UP by 19.5px — the opposite direction from the frame growth.
      frame.w = 804;
      frame.h = 744;
      anchors.mockImplementation(async () => ({ answered: true, targets: RESTORED }) as never);
      observer.trigger();

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input')!;
      fireEvent.change(input, { target: { value: 'This band is missing its label.' } });
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      const detail = (annotation.mock.calls[0]?.[0] as CustomEvent<{
        bounds?: { x: number; y: number; width: number; height: number };
      }>).detail;

      // BAND 05's new home, not the 342 a frame-relative rule would preserve
      // and not the 382 the original bug produced.
      expect(detail.bounds!.y).toBeCloseTo(322.5, 0);
      expect(detail.bounds!.height).toBeCloseTo(40, 0);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      observer.restore();
      restoreRect();
    }
  });

  it('re-projects undone strokes too, so undo → reflow → redo restores the artifact region', async () => {
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockImplementation(async () => ({ answered: true, targets: ZOOMED }) as never);

    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (r: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" />
        </PreviewDrawOverlay>,
      );
      const wrap = container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      // Pen-stroke BAND 05 where it sits while zoomed (342..382), then undo it.
      fireEvent.click(getByRole('button', { name: 'Pen' }));
      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 352, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 300, clientY: 362, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 372, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 372, pointerId: 1 });
      await waitFor(() => expect(anchors).toHaveBeenCalled());
      // The commit-time anchor pass is async; let it write the anchor back
      // before the stroke moves onto the undo stack.
      await new Promise((r) => setTimeout(r, 350));
      fireEvent.click(getByRole('button', { name: 'Undo' }));

      // Reflow while the stroke sits on the undo stack.
      frame.w = 804;
      frame.h = 744;
      anchors.mockImplementation(async () => ({ answered: true, targets: RESTORED }) as never);
      observer.trigger();
      // Let the settle-paced content re-anchor run before redoing.
      await waitFor(() => expect(anchors.mock.calls.length).toBeGreaterThan(1));
      await new Promise((r) => setTimeout(r, 350));

      fireEvent.click(getByRole('button', { name: 'Redo' }));

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input')!;
      fireEvent.change(input, { target: { value: 'Redo must land on the same band.' } });
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      const detail = (annotation.mock.calls[0]?.[0] as CustomEvent<{
        bounds?: { x: number; y: number; width: number; height: number };
      }>).detail;

      // BAND 05 now spans 322.5..362.5. The stroke rode rows 352..372 inside
      // the zoomed band (342..382); the same relative rows re-projected are
      // 332.5..352.5, so with strokeRect's 8px pad the bounds start ~324.5.
      // The pre-fix behavior leaves the stroke at 352..372 (bounds y=344) —
      // a full half-band low, on the neighbouring band.
      expect(detail.bounds!.y).toBeLessThan(335);
      expect(detail.bounds!.y).toBeGreaterThan(315);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      observer.restore();
      restoreRect();
    }
  });

  it('keeps probing after an answered-empty response, so late targets still anchor', async () => {
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    // A live bridge with no annotated elements yet — e.g. a dynamic app that
    // renders its data-od-id nodes a moment later.
    anchors.mockImplementation(async () => ({ answered: true, targets: [] }) as never);

    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (r: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" />
        </PreviewDrawOverlay>,
      );
      const wrap = container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      // First mark: bridge answers with zero targets (no anchor acquired).
      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 342, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      await waitFor(() => expect(anchors).toHaveBeenCalled());
      const probesAfterEmpty = anchors.mock.calls.length;

      // Targets appear; a reflow follows. The pre-fix latch recorded the empty
      // response as "no bridge" and never asked again, leaving the mark at its
      // stale frame fraction.
      anchors.mockImplementation(async () => ({ answered: true, targets: ZOOMED }) as never);
      observer.trigger();
      await waitFor(() => expect(anchors.mock.calls.length).toBeGreaterThan(probesAfterEmpty));
      await new Promise((r) => setTimeout(r, 350));

      frame.w = 804;
      frame.h = 744;
      anchors.mockImplementation(async () => ({ answered: true, targets: RESTORED }) as never);
      observer.trigger();

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input')!;
      fireEvent.change(input, { target: { value: 'Anchors must attach late.' } });
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      const detail = (annotation.mock.calls[0]?.[0] as CustomEvent<{
        bounds?: { x: number; y: number; width: number; height: number };
      }>).detail;

      // BAND 05's post-reflow home — anchoring engaged despite the empty
      // first response.
      expect(detail.bounds!.y).toBeCloseTo(322.5, 0);
      expect(detail.bounds!.height).toBeCloseTo(40, 0);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      observer.restore();
      restoreRect();
    }
  });

  it('probes the ACTIVE iframe, not the hidden srcDoc twin', async () => {
    // With urlAnchorBridge the URL/powered iframe stays active in draw mode.
    // The hidden srcDoc twin can diverge (independent scroll, or a powered
    // artifact that does not execute in the opaque sandbox), so anchor
    // requests against it produce wrong boxes. The probe must go to the frame
    // marked data-od-active="true".
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockReset();
    const probed: Array<string | null> = [];
    anchors.mockImplementation(async (iframe: HTMLIFrameElement) => {
      probed.push(iframe.getAttribute('title'));
      return { answered: true, targets: ZOOMED } as never;
    });

    try {
      const { container } = render(
        <PreviewDrawOverlay active>
          <iframe title="url-active" data-od-render-mode="url-load" data-od-active="true" />
          <iframe title="srcdoc-twin" data-od-render-mode="srcdoc" data-od-active="false" />
        </PreviewDrawOverlay>,
      );
      const wrap = container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 342, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      await waitFor(() => expect(anchors).toHaveBeenCalled());

      expect(probed.length).toBeGreaterThan(0);
      expect([...new Set(probed)]).toEqual(['url-active']);
    } finally {
      observer.restore();
      restoreRect();
    }
  });

  it('recovers a bridge that becomes ready after the silent-probe budget is spent', async () => {
    // Two early probes can time out while a slow document is still loading.
    // That must be a cooldown, not a permanent verdict: once the bridge is
    // ready, a later probe (after the cooldown window) re-engages anchoring.
    vi.useFakeTimers();
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockReset();
    // Bridge not loaded yet: unanswered.
    anchors.mockImplementation(async () => ({ answered: false, targets: [] }) as never);

    try {
      const { container } = render(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" data-od-active="true" />
        </PreviewDrawOverlay>,
      );
      const wrap = container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      async function drawAndSettle(y1: number, y2: number) {
        fireEvent.pointerDown(canvas, { clientX: 40, clientY: y1, pointerId: 1 });
        fireEvent.pointerMove(canvas, { clientX: 600, clientY: y2, pointerId: 1 });
        fireEvent.pointerUp(canvas, { clientX: 600, clientY: y2, pointerId: 1 });
        // run the settle-paced content re-anchor + async probe
        await vi.advanceTimersByTimeAsync(500);
      }

      // Spend the silent-probe budget (2 unanswered probes).
      await drawAndSettle(342, 382);
      await drawAndSettle(292, 332);
      const spent = anchors.mock.calls.length;
      expect(spent).toBeGreaterThanOrEqual(2);

      // Within the cooldown: no new probe fires.
      await drawAndSettle(242, 282);
      expect(anchors.mock.calls.length).toBe(spent);

      // Bridge finishes loading; after the cooldown a retry probes again.
      anchors.mockImplementation(async () => ({ answered: true, targets: ZOOMED }) as never);
      await vi.advanceTimersByTimeAsync(5200);
      await drawAndSettle(342, 382);
      expect(anchors.mock.calls.length).toBeGreaterThan(spent);
    } finally {
      vi.useRealTimers();
      observer.restore();
      restoreRect();
    }
  });

  it('discards an anchor reply that resolves after the active iframe swapped', async () => {
    // The probe await spans up to 1.5s. Draw can start on the srcDoc twin and
    // switch to the URL/powered iframe when bridge-ready advertises
    // markAnchors; a reply from the OLD frame (whose scroll position and boxes
    // differ) must not be committed against the shared mark refs.
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockReset();
    // The old frame's document scrolled 100px between the two probes, so its
    // stale reply reports every band 100px higher than the anchor remembers.
    const SCROLLED = ZOOMED.map((t) => ({
      ...t,
      position: { ...t.position, y: t.position.y - 100 },
    }));
    let releaseStale: (() => void) | null = null;
    anchors
      // commit-time probe: answers fast, anchor acquired against ZOOMED.
      .mockImplementationOnce(async () => ({ answered: true, targets: ZOOMED }) as never)
      // next probe hangs until we release it with the stale scrolled boxes.
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseStale = () => resolve({ answered: true, targets: SCROLLED } as never);
          }) as never,
      );
    // Everything after: a live bridge with no targets, so nothing re-corrects
    // the marks between the stale commit and the send.
    anchors.mockImplementation(async () => ({ answered: true, targets: [] }) as never);

    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (r: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active>
          <iframe title="first" data-od-render-mode="srcdoc" data-od-active="true" />
          <iframe title="second" data-od-render-mode="url-load" data-od-active="false" />
        </PreviewDrawOverlay>,
      );
      const wrap = container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      // Mark BAND 05 (342..382); commit-time probe anchors it.
      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 342, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      await waitFor(() => expect(anchors).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 350));

      // A resize kicks off probe #2, which hangs.
      observer.trigger();
      await waitFor(() => expect(anchors).toHaveBeenCalledTimes(2));

      // The active iframe swaps while probe #2 is in flight; THEN the stale
      // reply (old frame's scrolled boxes) lands.
      const first = container.querySelector<HTMLIFrameElement>('iframe[title="first"]')!;
      const second = container.querySelector<HTMLIFrameElement>('iframe[title="second"]')!;
      first.setAttribute('data-od-active', 'false');
      second.setAttribute('data-od-active', 'true');
      releaseStale!();
      await new Promise((r) => setTimeout(r, 50));

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input')!;
      fireEvent.change(input, { target: { value: 'Stale replies must be dropped.' } });
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      const detail = (annotation.mock.calls[0]?.[0] as CustomEvent<{
        bounds?: { x: number; y: number; width: number; height: number };
      }>).detail;

      // The mark must stay where the user drew it (342). Committing the stale
      // scrolled reply would re-project it 100px up (242) — the old frame's
      // geometry applied to the new frame's marks.
      expect(detail.bounds!.y).toBeCloseTo(342, 0);
      expect(detail.bounds!.height).toBeCloseTo(40, 0);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      observer.restore();
      restoreRect();
    }
  });

  it('discards a probe reply that resolves after the overlay was reopened', async () => {
    // A pending probe survives deactivate -> reopen on the SAME iframe node
    // with the SAME frame size, so the node/size guards cannot catch it. Only
    // the generation token can: the stale reply carries the pre-reopen
    // document's (scrolled) boxes, and committing it would re-project the
    // fresh, already-anchored mark 100px off just before the send.
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockReset();
    const SCROLLED = ZOOMED.map((t) => ({
      ...t,
      position: { ...t.position, y: t.position.y - 100 },
    }));
    let releaseStale: (() => void) | null = null;
    anchors
      // probe 1: pre-reopen mark's commit pass — answers fast.
      .mockImplementationOnce(async () => ({ answered: true, targets: ZOOMED }) as never)
      // probe 2: hangs; will resolve with the pre-reopen scrolled boxes AFTER
      // the overlay is reopened and a fresh anchored mark exists.
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseStale = () => resolve({ answered: true, targets: SCROLLED } as never);
          }) as never,
      )
      // probe 3 (post-reopen commit pass): current boxes anchor the new mark.
      .mockImplementationOnce(async () => ({ answered: true, targets: ZOOMED }) as never)
      // probe 4+ (incl. the pre-capture sync): a live bridge with no targets,
      // so nothing re-corrects a mark corrupted by the stale commit.
      .mockImplementation(async () => ({ answered: true, targets: [] }) as never);

    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (r: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const view = render(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" data-od-active="true" />
        </PreviewDrawOverlay>,
      );
      const wrap = view.container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      let canvas = view.container.querySelector<HTMLCanvasElement>('canvas')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      // Pre-reopen mark: probe 1 anchors it. A resize then starts probe 2,
      // which hangs.
      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 342, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      await waitFor(() => expect(anchors).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 350));
      observer.trigger();
      await waitFor(() => expect(anchors).toHaveBeenCalledTimes(2));

      // Reopen on the same iframe node / same frame size.
      view.rerender(
        <PreviewDrawOverlay active={false}>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" data-od-active="true" />
        </PreviewDrawOverlay>,
      );
      view.rerender(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" data-od-active="true" />
        </PreviewDrawOverlay>,
      );
      observer.trigger();
      canvas = view.container.querySelector<HTMLCanvasElement>('canvas')!;

      // Fresh mark. Its commit-time sync coalesces behind the still-hanging
      // pre-reopen probe, so no new bridge call yet.
      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 342, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      await new Promise((r) => setTimeout(r, 200));

      // NOW the pre-reopen probe resolves with scrolled boxes. Committing it
      // would corrupt the fresh mark (anchor it against 100px-off boxes).
      // Discarding it lets the trailing pass anchor against current boxes.
      releaseStale!();
      await waitFor(() => expect(anchors.mock.calls.length).toBeGreaterThanOrEqual(3));
      await new Promise((r) => setTimeout(r, 350));

      const input = view.container.querySelector<HTMLInputElement>('.preview-draw-note-input')!;
      fireEvent.change(input, { target: { value: 'Reopen must not resurrect stale replies.' } });
      fireEvent.click(view.getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      const detail = (annotation.mock.calls[0]?.[0] as CustomEvent<{
        bounds?: { x: number; y: number; width: number; height: number };
      }>).detail;

      expect(detail.bounds!.y).toBeCloseTo(342, 0);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      observer.restore();
      restoreRect();
    }
  });

  it('discards a probe reply that resolves after the same iframe reloaded', async () => {
    // Same node, same size, same file: only the document changed (reloadKey /
    // URL navigation). The iframe load event must invalidate the pending
    // generation so the pre-reload reply cannot re-project the marks.
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockReset();
    const SCROLLED = ZOOMED.map((t) => ({
      ...t,
      position: { ...t.position, y: t.position.y - 100 },
    }));
    let releaseStale: (() => void) | null = null;
    anchors
      // commit-time probe answers fast; the mark anchors against ZOOMED.
      .mockImplementationOnce(async () => ({ answered: true, targets: ZOOMED }) as never)
      // resize-triggered probe hangs; resolves with pre-reload boxes later.
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseStale = () => resolve({ answered: true, targets: SCROLLED } as never);
          }) as never,
      )
      // post-reload probes: live bridge, no targets — nothing re-corrects a
      // mark corrupted by a stale commit.
      .mockImplementation(async () => ({ answered: true, targets: [] }) as never);

    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (r: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" data-od-active="true" />
        </PreviewDrawOverlay>,
      );
      const wrap = container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      const iframe = container.querySelector<HTMLIFrameElement>('iframe')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      // Mark; commit probe anchors it. A resize starts the hanging probe.
      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 342, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      await waitFor(() => expect(anchors).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 350));
      observer.trigger();
      await waitFor(() => expect(anchors).toHaveBeenCalledTimes(2));

      // The document reloads in the SAME iframe node at the SAME size; then
      // the stale pre-reload reply lands.
      fireEvent.load(iframe);
      releaseStale!();
      await new Promise((r) => setTimeout(r, 400));

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input')!;
      fireEvent.change(input, { target: { value: 'Reload must invalidate pending probes.' } });
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      const detail = (annotation.mock.calls[0]?.[0] as CustomEvent<{
        bounds?: { x: number; y: number; width: number; height: number };
      }>).detail;

      // The mark stays where the user drew it; the stale reply would have
      // re-projected it 100px up.
      expect(detail.bounds!.y).toBeCloseTo(342, 0);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      observer.restore();
      restoreRect();
    }
  });

  it('coalesces probes during a scroll burst on a slow bridge', async () => {
    // Scroll events arrive ~every frame. With a bridge that answers slowly,
    // each live tick must NOT stack another in-flight probe — one runs, one
    // trailing pass is remembered, the rest collapse.
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockReset();
    const pending: Array<() => void> = [];
    anchors.mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(() => resolve({ answered: true, targets: [] } as never));
        }) as never,
    );

    try {
      const { container } = render(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" data-od-active="true" />
        </PreviewDrawOverlay>,
      );
      const wrap = container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      const iframe = container.querySelector<HTMLIFrameElement>('iframe')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      // A mark so the sync has something to do.
      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 342, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      await waitFor(() => expect(anchors).toHaveBeenCalledTimes(1));

      // 30 scroll messages while the first probe is still pending.
      for (let i = 0; i < 30; i++) {
        fireEvent(
          window,
          new MessageEvent('message', {
            data: { type: 'od:preview-scroll', canvasTop: i },
            source: iframe.contentWindow,
          }),
        );
        await new Promise((r) => setTimeout(r, 5));
      }
      // Still just the one probe in flight — the burst coalesced.
      expect(anchors.mock.calls.length).toBe(1);
      expect(pending.length).toBe(1);

      // Resolving it releases exactly one trailing pass.
      pending.shift()!();
      await waitFor(() => expect(anchors.mock.calls.length).toBe(2));
      await new Promise((r) => setTimeout(r, 200));
      expect(anchors.mock.calls.length).toBe(2);
    } finally {
      observer.restore();
      restoreRect();
    }
  });

  it('makes Send await an in-flight probe so bounds reflect the final anchors', async () => {
    // Send can arrive while a content-anchor probe is mid-await. The
    // pre-capture sync must JOIN that probe (and its trailing pass), not
    // resolve early — otherwise the capture composites and the structured
    // bounds are read from pre-probe refs.
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockReset();
    let releaseSlow: (() => void) | null = null;
    anchors
      // commit-time probe: fast, anchors the mark against ZOOMED.
      .mockImplementationOnce(async () => ({ answered: true, targets: ZOOMED }) as never)
      // scroll-triggered probe: hangs until released with RESTORED boxes
      // (the artifact reflowed 19.5px while the probe was in flight).
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseSlow = () => resolve({ answered: true, targets: RESTORED } as never);
          }) as never,
      )
      .mockImplementation(async () => ({ answered: true, targets: RESTORED }) as never);

    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (r: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" data-od-active="true" />
        </PreviewDrawOverlay>,
      );
      const wrap = container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      const iframe = container.querySelector<HTMLIFrameElement>('iframe')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      // Mark BAND 05 while zoomed; the commit probe anchors it (342).
      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 342, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      await waitFor(() => expect(anchors).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 350));

      // A scroll starts the slow probe...
      fireEvent(
        window,
        new MessageEvent('message', {
          data: { type: 'od:preview-scroll', canvasTop: 1 },
          source: iframe.contentWindow,
        }),
      );
      await waitFor(() => expect(anchors).toHaveBeenCalledTimes(2));

      // ...and Send fires BEFORE it resolves.
      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input')!;
      fireEvent.change(input, { target: { value: 'Send must wait for the probe.' } });
      fireEvent.click(getByRole('button', { name: 'Send' }));
      await new Promise((r) => setTimeout(r, 100));
      expect(annotation).not.toHaveBeenCalled();

      // The probe resolves with the post-reflow boxes; the awaited pre-capture
      // sync (joined onto the same chain) must land the mark on 322.5.
      releaseSlow!();

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      const detail = (annotation.mock.calls[0]?.[0] as CustomEvent<{
        bounds?: { x: number; y: number; width: number; height: number };
      }>).detail;

      expect(detail.bounds!.y).toBeCloseTo(322.5, 0);
      expect(detail.bounds!.height).toBeCloseTo(40, 0);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      observer.restore();
      restoreRect();
    }
  });

  it('a dragged text label keeps its new position through the pre-send sync', async () => {
    // Once a probe attaches an anchor to a text label, every later sync
    // re-projects the label from its stored element. Dragging the label picks
    // a NEW position — the commit must drop/rebind the anchor, or the awaited
    // pre-capture sync in Send snaps the label back to the old element.
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockReset();
    anchors.mockImplementation(async () => ({ answered: true, targets: ZOOMED }) as never);

    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (r: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" data-od-active="true" />
        </PreviewDrawOverlay>,
      );
      const wrap = container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      // Drop a label on BAND 05 (y=342) and type into it; the commit-time
      // probe anchors it to that band.
      fireEvent.click(getByRole('button', { name: 'Text' }));
      fireEvent.pointerDown(canvas, { clientX: 100, clientY: 352, pointerId: 1 });
      const textarea = container.querySelector<HTMLTextAreaElement>('.preview-draw-text-layer textarea')!;
      fireEvent.change(textarea, { target: { value: 'moved label' } });
      fireEvent.blur(textarea);
      await waitFor(() => expect(anchors).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 350));

      // Drag the placed label from BAND 05 down to BAND 08 (y≈495).
      const label = container.querySelector<HTMLElement>('.preview-draw-text-mark')!;
      fireEvent.pointerDown(label, { clientX: 100, clientY: 352, pointerId: 2 });
      fireEvent.pointerMove(label, { clientX: 100, clientY: 495, pointerId: 2 });
      fireEvent.pointerUp(label, { clientX: 100, clientY: 495, pointerId: 2 });
      await new Promise((r) => setTimeout(r, 350));

      // Send. The pre-capture sync runs; the label must stay near BAND 08.
      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input')!;
      fireEvent.change(input, { target: { value: 'Label must stay where I dropped it.' } });
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      // Read the label's committed normalized position from the DOM style.
      const topPct = Number.parseFloat(label.style.top);
      // 495/666 ≈ 74.3%. The pre-fix snap-back would restore ~352/666 ≈ 52.9%.
      expect(topPct).toBeGreaterThan(65);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      observer.restore();
      restoreRect();
    }
  });

  it('freezes anchor writes during capture so bounds match the captured pixels', async () => {
    // requestSnapshot drains pending settle timers into one awaited sync, then
    // freezes anchor writes until send() has read the bounds. A probe reply
    // landing DURING the (slow) capture must not re-project the marks: the
    // pixels were already taken, so a post-capture write would make the
    // structured bounds disagree with the PNG — the #6361 invariant.
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockReset();
    // Boxes shifted 100px: what a mid-capture scroll probe would report.
    const SHIFTED = ZOOMED.map((t) => ({
      ...t,
      position: { ...t.position, y: t.position.y - 100 },
    }));
    anchors
      // commit probe + the drained pre-capture sync: stable ZOOMED boxes.
      .mockImplementationOnce(async () => ({ answered: true, targets: ZOOMED }) as never)
      .mockImplementationOnce(async () => ({ answered: true, targets: ZOOMED }) as never)
      // anything after (a mid-capture pass, if the freeze fails): shifted.
      .mockImplementation(async () => ({ answered: true, targets: SHIFTED }) as never);

    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (r: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    // Slow host capture: the freeze window is wide open while it runs.
    let midCapture: (() => Promise<void>) | null = null;
    const captureSnapshot = vi.fn(async () => {
      if (midCapture) await midCapture();
      return { dataUrl: 'data:image/png;base64,cG5n', w: 692, h: 666 };
    });

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active captureSnapshot={captureSnapshot}>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" data-od-active="true" />
        </PreviewDrawOverlay>,
      );
      const wrap = container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      const iframe = container.querySelector<HTMLIFrameElement>('iframe')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      // Mark BAND 05; commit probe anchors it at 342.
      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 342, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      await waitFor(() => expect(anchors).toHaveBeenCalledTimes(1));
      await new Promise((r) => setTimeout(r, 350));

      // While the capture runs: scroll events try to trigger a re-anchor pass
      // that would apply the SHIFTED boxes.
      midCapture = async () => {
        for (let i = 0; i < 3; i++) {
          fireEvent(
            window,
            new MessageEvent('message', {
              data: { type: 'od:preview-scroll', canvasTop: i },
              source: iframe.contentWindow,
            }),
          );
          await new Promise((r) => setTimeout(r, 60));
        }
      };

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input')!;
      fireEvent.change(input, { target: { value: 'Freeze the refs during capture.' } });
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      const detail = (annotation.mock.calls[0]?.[0] as CustomEvent<{
        bounds?: { x: number; y: number; width: number; height: number };
      }>).detail;

      // Bounds must reflect the state the pixels were captured from (342) —
      // NOT the shifted boxes a mid-capture pass would have applied (242).
      expect(detail.bounds!.y).toBeCloseTo(342, 0);
      expect(detail.bounds!.height).toBeCloseTo(40, 0);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      observer.restore();
      restoreRect();
    }
  });

  it('a resize during capture cannot rewrite marks before bounds are read', async () => {
    // The ResizeObserver's geometric re-anchor is a mark-ref writer too. If a
    // resize (zoom/sidebar/device frame) lands while the compositor holds the
    // pixels, rewriting the refs would make annotationBounds disagree with
    // the PNG. The freeze must defer the frame re-anchor until after send.
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockReset();
    // Bridge answers empty: marks stay purely frame-relative, isolating the
    // geometric (resize) writer from the content-anchor writer.
    anchors.mockImplementation(async () => ({ answered: true, targets: [] }) as never);

    const annotation = vi.fn((event: Event) => {
      const detail = (event as CustomEvent<{ ack?: (r: { ok: boolean }) => void }>).detail;
      detail.ack?.({ ok: true });
    });
    window.addEventListener('opendesign:annotation', annotation);

    // Host capture that resizes the frame mid-flight.
    let midCapture: (() => Promise<void>) | null = null;
    const captureSnapshot = vi.fn(async () => {
      if (midCapture) await midCapture();
      return { dataUrl: 'data:image/png;base64,cG5n', w: 692, h: 666 };
    });
    const composite = installRecordingCompositeMocks();

    try {
      const { container, getByRole } = render(
        <PreviewDrawOverlay active captureSnapshot={captureSnapshot}>
          <iframe title="srcdoc" data-od-render-mode="srcdoc" data-od-active="true" />
        </PreviewDrawOverlay>,
      );
      const wrap = container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      // Box over BAND 05's zoomed position (342..382).
      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 342, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      await new Promise((r) => setTimeout(r, 350));

      // Mid-capture: the frame grows (e.g. Cmd-0 zoom restore) and the
      // observer fires. The geometric re-anchor must be DEFERRED.
      midCapture = async () => {
        frame.w = 804;
        frame.h = 744;
        observer.trigger();
        await new Promise((r) => setTimeout(r, 60));
      };

      const input = container.querySelector<HTMLInputElement>('.preview-draw-note-input')!;
      fireEvent.change(input, { target: { value: 'Resize must not split PNG from bounds.' } });
      fireEvent.click(getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(annotation).toHaveBeenCalledTimes(1));
      const detail = (annotation.mock.calls[0]?.[0] as CustomEvent<{
        bounds?: { x: number; y: number; width: number; height: number };
      }>).detail;

      // The pixels were captured in the 692x666 frame, so the bounds must be
      // the 692x666-frame values (y=342). A mid-capture geometric re-anchor
      // would have scaled them toward the 744-tall frame (y≈382).
      expect(detail.bounds!.y).toBeCloseTo(342, 0);
      expect(detail.bounds!.height).toBeCloseTo(40, 0);

      // Three-way invariant: the box the compositor painted into the PNG
      // (fillRect in snapshot space, 692x666 here) must coincide with the
      // structured bounds. Pre-fix, the mid-capture re-anchor rewrote the
      // normalized marks and the painted rect slid ~18px up while the bounds
      // stayed put — PNG and position disagreed.
      const markRect = composite.painted.find((r) => r.w > 500 && r.h > 20 && r.h < 100)!;
      expect(markRect).toBeTruthy();
      expect(markRect.y).toBeCloseTo(detail.bounds!.y, 0);
      expect(markRect.h).toBeCloseTo(detail.bounds!.height, 0);
    } finally {
      window.removeEventListener('opendesign:annotation', annotation);
      composite.restore();
      observer.restore();
      restoreRect();
    }
  });

  it('resets the probe budget when the file changes under the open overlay', async () => {
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockReset();
    anchors.mockImplementation(async () => ({ answered: false, targets: [] }) as never);

    try {
      const view = render(
        <PreviewDrawOverlay active filePath="a.html">
          <iframe title="srcdoc" data-od-render-mode="srcdoc" data-od-active="true" />
        </PreviewDrawOverlay>,
      );
      const wrap = view.container.querySelector<HTMLElement>('.preview-draw-overlay')!;
      const canvas = view.container.querySelector<HTMLCanvasElement>('canvas')!;
      Object.defineProperty(wrap, 'offsetWidth', { configurable: true, get: () => frame.w });
      Object.defineProperty(wrap, 'offsetHeight', { configurable: true, get: () => frame.h });
      observer.trigger();

      // Exhaust the budget on file A (same reused iframe element).
      for (const y of [342, 292]) {
        fireEvent.pointerDown(canvas, { clientX: 40, clientY: y, pointerId: 1 });
        fireEvent.pointerMove(canvas, { clientX: 600, clientY: y + 40, pointerId: 1 });
        fireEvent.pointerUp(canvas, { clientX: 600, clientY: y + 40, pointerId: 1 });
        await waitFor(() => expect(anchors.mock.calls.length).toBeGreaterThan(0));
        await new Promise((r) => setTimeout(r, 350));
      }
      const spent = anchors.mock.calls.length;

      // Switch files without unmounting; file B's bridge answers.
      anchors.mockImplementation(async () => ({ answered: true, targets: ZOOMED }) as never);
      view.rerender(
        <PreviewDrawOverlay active filePath="b.html">
          <iframe title="srcdoc" data-od-render-mode="srcdoc" data-od-active="true" />
        </PreviewDrawOverlay>,
      );

      fireEvent.pointerDown(canvas, { clientX: 40, clientY: 342, pointerId: 1 });
      fireEvent.pointerMove(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      fireEvent.pointerUp(canvas, { clientX: 600, clientY: 382, pointerId: 1 });
      await waitFor(() => expect(anchors.mock.calls.length).toBeGreaterThan(spent));
    } finally {
      observer.restore();
      restoreRect();
    }
  });
});
