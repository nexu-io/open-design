// @vitest-environment jsdom
// Issue #3849: the mention picker renders inside CaretFloatingLayer, which
// computed its "above the caret" placement from the popover height at open
// time. Switching tabs inside the picker swaps the content list and changes
// the height, but nothing re-ran the placement — the box stayed pinned by its
// top edge while its bottom lifted away from the composer, so the picker
// "floated" mid-panel instead of staying anchored to the input line.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { CaretFloatingLayer } from '../../../src/components/composer/CaretFloatingLayer';

const CARET = { top: 700, bottom: 720, left: 40, right: 40 };
const GAP = 8;

// jsdom has no ResizeObserver and no layout engine. The stub lets the test
// fire size changes explicitly; the scrollHeight spy stands in for layout.
class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }
  // Real observers deliver an initial entry on observe(); mirror that so the
  // component's subscription path is exercised on mount.
  observe(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
  fire(): void {
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
  let fakeScrollHeight: number;
  let scrollHeightSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    MockResizeObserver.instances = [];
    fakeScrollHeight = 400;
    vi.stubGlobal(
      'ResizeObserver',
      MockResizeObserver as unknown as typeof ResizeObserver,
    );
    scrollHeightSpy = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockImplementation(() => fakeScrollHeight);
  });

  afterEach(() => {
    // The portal mounts into document.body and vitest globals are off, so
    // @testing-library's auto-cleanup never registers — stale layers from a
    // previous test would shadow `div[data-placement]` queries here.
    cleanup();
    scrollHeightSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  const layer = (): HTMLElement => {
    // Locate by the behavioral placement attribute, not a styling class:
    // chat tests must not couple to CSS class names.
    const el = document.querySelector<HTMLElement>('div[data-placement]');
    expect(el).not.toBeNull();
    return el!;
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
      fakeScrollHeight = 100;
      MockResizeObserver.instances[0]?.fire();
    });

    // Bottom edge must return to caret.top - GAP; a shorter box means a
    // LARGER top, not the stale one from the tall content.
    expect(layer().style.top).toBe(`${CARET.top - GAP - 100}px`);
  });

  it('re-anchors when the popover content grows back', () => {
    render(<Harness />);
    act(() => {
      fireEvent.click(screenToggle());
      fakeScrollHeight = 100;
      MockResizeObserver.instances[0]?.fire();
    });
    expect(layer().style.top).toBe(`${CARET.top - GAP - 100}px`);
    act(() => {
      fireEvent.click(screenToggle());
      fakeScrollHeight = 400;
      MockResizeObserver.instances[0]?.fire();
    });
    expect(layer().style.top).toBe(`${CARET.top - GAP - 400}px`);
  });
});

function screenToggle(): HTMLButtonElement {
  const btn = document.querySelector<HTMLButtonElement>('button');
  if (!btn) throw new Error('toggle button missing');
  return btn;
}
