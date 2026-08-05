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
    anchors.mockClear();
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
    anchors.mockClear();
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
    anchors.mockClear();
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

  it('resets the probe budget when the file changes under the open overlay', async () => {
    frame.w = 692;
    frame.h = 666;
    const restoreRect = installFrameGeometry();
    const observer = installResizeObserver();
    const anchors = vi.mocked(requestPreviewAnchorTargets);
    anchors.mockClear();
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
