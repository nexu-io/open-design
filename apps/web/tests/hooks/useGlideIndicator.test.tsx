// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef, type RefObject } from 'react';

import { useGlideIndicator } from '../../src/hooks/useGlideIndicator';

// jsdom has no ResizeObserver; the hook must guard and keep working without
// live resize re-syncs.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

interface Harness {
  container: HTMLDivElement;
  indicator: HTMLDivElement;
  pill: HTMLDivElement;
  setActive: (id: string) => void;
}

function buildStrip(tabIds: string[], activeId: string): Harness {
  const container = document.createElement('div');
  const indicator = document.createElement('div');
  indicator.className = 'glide';
  const pill = document.createElement('div');
  indicator.appendChild(pill);
  container.appendChild(indicator);
  let offset = 0;
  for (const id of tabIds) {
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.id = id;
    // jsdom computes no layout: pin offsetLeft/offsetWidth per element so the
    // hook's layout-coordinate measurement has real numbers to read.
    Object.defineProperty(tab, 'offsetLeft', { value: offset, configurable: true });
    Object.defineProperty(tab, 'offsetWidth', { value: 100, configurable: true });
    offset += 102;
    container.appendChild(tab);
  }
  document.body.appendChild(container);
  const setActive = (id: string) => {
    for (const tab of container.querySelectorAll<HTMLElement>('.tab')) {
      tab.classList.toggle('is-active', tab.dataset.id === id);
    }
  };
  setActive(activeId);
  return { container, indicator, pill, setActive };
}

function renderIndicator(
  harness: Harness,
  initial: { activeKey: string; frozen?: boolean; layoutKey?: string },
) {
  return renderHook(
    ({ activeKey, frozen, layoutKey }: { activeKey: string; frozen?: boolean; layoutKey?: string }) => {
      const containerRef = useRef<HTMLElement | null>(harness.container);
      const indicatorRef = useRef<HTMLElement | null>(harness.indicator);
      const pillRef = useRef<HTMLElement | null>(harness.pill);
      useGlideIndicator({
        containerRef: containerRef as RefObject<HTMLElement | null>,
        indicatorRef: indicatorRef as RefObject<HTMLElement | null>,
        pillRef: pillRef as RefObject<HTMLElement | null>,
        activeSelector: '.tab.is-active',
        activeKey,
        ...(layoutKey === undefined ? {} : { layoutKey }),
        frozen: frozen ?? false,
      });
    },
    { initialProps: initial },
  );
}

describe('useGlideIndicator', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('positions instantly on first measure and stamps the ready markers', () => {
    const harness = buildStrip(['a', 'b', 'c'], 'b');
    renderIndicator(harness, { activeKey: 'b' });
    expect(harness.indicator.style.transform).toBe('translateX(102px)');
    expect(harness.indicator.style.width).toBe('100px');
    // First measure is the instant path: no direction stamp, both ready flags.
    expect(harness.indicator.dataset.dir).toBeUndefined();
    expect(harness.indicator.dataset.ready).toBe('');
    expect(harness.container.dataset.glideReady).toBe('');
  });

  it('animates with a direction stamp when the active key changes', () => {
    const harness = buildStrip(['a', 'b', 'c'], 'a');
    const { rerender } = renderIndicator(harness, { activeKey: 'a' });
    harness.setActive('c');
    rerender({ activeKey: 'c' });
    expect(harness.indicator.style.transform).toBe('translateX(204px)');
    expect(harness.indicator.dataset.dir).toBe('right');
    harness.setActive('a');
    rerender({ activeKey: 'a' });
    expect(harness.indicator.style.transform).toBe('translateX(0px)');
    expect(harness.indicator.dataset.dir).toBe('left');
  });

  it('suppresses the animated path while frozen (drag-reorder)', () => {
    const harness = buildStrip(['a', 'b'], 'a');
    const { rerender } = renderIndicator(harness, { activeKey: 'a' });
    harness.setActive('b');
    rerender({ activeKey: 'b', frozen: true });
    expect(harness.indicator.style.transform).toBe('translateX(102px)');
    expect(harness.indicator.dataset.dir).toBeUndefined();
  });

  it('fades the pill out when no active item matches, and re-measures fresh after', () => {
    const harness = buildStrip(['a', 'b'], 'a');
    const { rerender } = renderIndicator(harness, { activeKey: 'a' });
    for (const tab of harness.container.querySelectorAll('.tab')) {
      tab.classList.remove('is-active');
    }
    rerender({ activeKey: 'b' });
    expect(harness.indicator.dataset.ready).toBeUndefined();
    // Active returns (new layout epoch): positioned instantly — the parked
    // key was forgotten, so this is a fresh measure, not a stale slide.
    harness.setActive('b');
    rerender({ activeKey: 'b', layoutKey: 'epoch-2' });
    expect(harness.indicator.dataset.ready).toBe('');
    expect(harness.indicator.dataset.dir).toBeUndefined();
    expect(harness.indicator.style.transform).toBe('translateX(102px)');
  });
});
