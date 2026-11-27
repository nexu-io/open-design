// @vitest-environment jsdom
// Issue #3849: the mention picker renders inside CaretFloatingLayer, which
// computed its "above the caret" placement from the popover height at open
// time. Switching tabs inside the picker swaps the content list and changes
// the height, but nothing re-ran the placement — the box stayed pinned by its
// top edge while its bottom lifted away from the composer, so the picker
// "floated" mid-panel instead of staying anchored to the input line.
//
// Review follow-up (#8138): jsdom has no layout engine, so a test where the
// observer is fired unconditionally proves nothing about the real picker — a
// stylesheet-pinned box never produces a delivery at all. The mock below
// mirrors the real delivery contract instead: a callback fires only when the
// simulated measured box height actually changes. The stylesheet side of that
// contract (`.mention-popover` must not pin a fixed `height`) is enforced by
// tests/styles/mention-popover-height.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { CaretFloatingLayer } from '../../../src/components/composer/CaretFloatingLayer';

const CARET = { top: 700, bottom: 720, left: 40, right: 40 };
const GAP = 8;

// jsdom has no ResizeObserver and no layout engine. The stub stands in for
// both: `boxHeight` is the border-box a real observer watches, `contentHeight`
// feeds the scrollHeight the placement math measures, and `fire()` delivers
// only when the box value moved since the last delivery.
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  static boxHeight = 400;
  static contentHeight = 400;
  callback: ResizeObserverCallback;
  deliveries = 0;
  lastSeenBoxHeight = 0;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }
  // Real observers deliver an initial entry on observe(); mirror that so the
  // component's subscription path is exercised on mount.
  observe(): void {
    this.lastSeenBoxHeight = MockResizeObserver.boxHeight;
    this.deliver();
  }
  // Re-check like a real observer tick: an unchanged box produces no
  // delivery, so tests cannot fake a resize by calling this alone.
  fire(): void {
    if (MockResizeObserver.boxHeight === this.lastSeenBoxHeight) return;
    this.lastSeenBoxHeight = MockResizeObserver.boxHeight;
    this.deliver();
  }
  unobserve(): void {}
  disconnect(): void {}
  private deliver(): void {
    this.deliveries += 1;
    this.callback([], this as unknown as ResizeObserver);
  }
}

function Harness() {
  const [tall, setTall] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setTall((v) => !v)}>
        toggle
      </button>
      <CaretFloatingLayer caret={CARET} open={true}>
        <div style={{ height: tall ? 400 : 100 }}>content</div>
      </CaretFloatingLayer>
    </>
  );
}

describe('CaretFloatingLayer (#3849 mention picker anchoring)', () => {
  let scrollHeightSpy: ReturnType<typeof vi.spyOn>;
  let offsetHeightSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    MockResizeObserver.instances = [];
    MockResizeObserver.boxHeight = 400;
    MockResizeObserver.contentHeight = 400;
    vi.stubGlobal(
      'ResizeObserver',
      MockResizeObserver as unknown as typeof ResizeObserver,
    );
    scrollHeightSpy = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockImplementation(() => MockResizeObserver.contentHeight);
    // The placement measures the layer's box width/height; jsdom reports 0,
    // so the simulated box value stands in for layout here too.
    offsetHeightSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(() => MockResizeObserver.boxHeight);
  });

  afterEach(() => {
    // The portal mounts into document.body and vitest globals are off, so
    // @testing-library's auto-cleanup never registers — stale layers from a
    // previous test would shadow `div[data-placement]` queries here.
    cleanup();
    scrollHeightSpy.mockRestore();
    offsetHeightSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  const layer = (): HTMLElement => {
    // Locate by the behavioral placement attribute, not a styling class:
    // chat tests must not couple to CSS class names.
    const el = document.querySelector<HTMLElement>('div[data-placement]');
    expect(el).not.toBeNull();
    return el!;
  };

  const observer = (): MockResizeObserver => {
    const instance = MockResizeObserver.instances[0];
    if (!instance) throw new Error('no ResizeObserver subscribed');
    return instance;
  };

  it('places the popover above the caret on open', () => {
    render(<Harness />);
    // above placement: top = caret.top - GAP - height(400)
    expect(layer().style.top).toBe(`${CARET.top - GAP - 400}px`);
  });

  it('re-anchors when the popover content shrinks (tab switch)', () => {
    render(<Harness />);
    expect(layer().style.top).toBe(`${CARET.top - GAP - 400}px`);

    act(() => {
      fireEvent.click(screenToggle());
      // Content-derived picker: the shrunken list shrinks the observed box
      // with it, so the delivery is a genuine resize, not a forced one.
      MockResizeObserver.contentHeight = 100;
      MockResizeObserver.boxHeight = 100;
      observer().fire();
    });

    // Bottom edge must return to caret.top - GAP; a shorter box means a
    // LARGER top, not the stale one from the tall content.
    expect(layer().style.top).toBe(`${CARET.top - GAP - 100}px`);
  });

  it('re-anchors when the popover content grows back', () => {
    render(<Harness />);
    act(() => {
      fireEvent.click(screenToggle());
      MockResizeObserver.contentHeight = 100;
      MockResizeObserver.boxHeight = 100;
      observer().fire();
    });
    expect(layer().style.top).toBe(`${CARET.top - GAP - 100}px`);
    act(() => {
      fireEvent.click(screenToggle());
      MockResizeObserver.contentHeight = 400;
      MockResizeObserver.boxHeight = 400;
      observer().fire();
    });
    expect(layer().style.top).toBe(`${CARET.top - GAP - 400}px`);
  });

  it('delivers nothing while the rendered box stays pinned — a fixed picker height keeps the stale anchor', () => {
    render(<Harness />);
    const deliveriesAfterMount = observer().deliveries;

    act(() => {
      // Content swaps (tab switch) but the box stays at 400 — exactly what
      // the real `.mention-popover` did while it pinned `height` to
      // `--cfl-max-h`. No resize, no delivery, no reposition: this is why
      // the stylesheet must keep the picker height content-derived.
      fireEvent.click(screenToggle());
      MockResizeObserver.contentHeight = 100;
      observer().fire();
    });

    expect(observer().deliveries).toBe(deliveriesAfterMount);
    expect(layer().style.top).toBe(`${CARET.top - GAP - 400}px`);
  });
});

function screenToggle(): HTMLButtonElement {
  const btn = document.querySelector<HTMLButtonElement>('button');
  if (!btn) throw new Error('toggle button missing');
  return btn;
}
