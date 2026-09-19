// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignSystemGalleryRail } from '../../src/components/DesignSystemGalleryRail';

let notifyResize: () => void;
let reducedMotion: boolean;

beforeEach(() => {
  reducedMotion = false;
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: reducedMotion })));
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(callback: ResizeObserverCallback) {
      notifyResize = () => callback([], this as unknown as ResizeObserver);
    }
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function cards(count: number) {
  return Array.from({ length: count }, (_, index) => <article key={index}>System {index + 1}</article>);
}

function gallery() {
  const view = render(<DesignSystemGalleryRail>{cards(15)}</DesignSystemGalleryRail>);
  const rail = screen.getByTestId('design-systems-list');
  // 200px card pitch and a viewport containing six full cards plus half of the next.
  const dimensions = { width: 1300, content: 3000, position: 0 };
  Object.defineProperties(rail, {
    clientWidth: { configurable: true, get: () => dimensions.width },
    scrollWidth: { configurable: true, get: () => dimensions.content },
    scrollLeft: { configurable: true, get: () => dimensions.position },
  });
  Array.from(rail.children).forEach((child, index) => {
    Object.defineProperties(child, {
      offsetLeft: { configurable: true, value: index * 200 },
      offsetWidth: { configurable: true, value: 172 },
    });
  });
  const scrollBy = vi.fn();
  Object.defineProperty(rail, 'scrollBy', { configurable: true, value: scrollBy });
  act(() => notifyResize());
  return {
    ...view, rail, dimensions, scrollBy,
    previous: screen.getByTestId('design-systems-previous'),
    next: screen.getByTestId('design-systems-next'),
  };
}

describe('DesignSystemGalleryRail', () => {
  it('shows previous only away from the start and keeps next disabled at the end', () => {
    const { rail, dimensions, scrollBy, previous, next } = gallery();
    expect(previous).toHaveAccessibleName('Previous');
    expect(next).toHaveAccessibleName('Next');
    expect(previous).toHaveAttribute('aria-controls', rail.id);
    expect(next).toHaveAttribute('aria-controls', rail.id);
    expect(previous).toBeDisabled();
    expect(previous).not.toBeVisible();
    expect(next).toBeEnabled();
    expect(next).toBeVisible();

    fireEvent.click(previous);
    expect(scrollBy).not.toHaveBeenCalled();
    fireEvent.click(next);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 1200, behavior: 'smooth' });

    dimensions.position = 1200;
    fireEvent.scroll(rail);
    expect(previous).toBeEnabled();
    expect(previous).toBeVisible();
    expect(next).toBeEnabled();
    fireEvent.click(previous);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -1200, behavior: 'smooth' });

    dimensions.position = dimensions.content - dimensions.width;
    fireEvent.scroll(rail);
    expect(previous).toBeEnabled();
    expect(previous).toBeVisible();
    expect(next).toBeDisabled();
    expect(next).toBeVisible();
    dimensions.position = 0;
    fireEvent.scroll(rail);
    expect(previous).toBeDisabled();
    expect(previous).not.toBeVisible();
    expect(next).toBeEnabled();
    expect(next).toBeVisible();
  });

  it('hides navigation when resizing or filtering removes overflow and restores it when needed', () => {
    const { rerender, dimensions, previous, next } = gallery();
    expect(next).toBeVisible();

    dimensions.width = dimensions.content;
    act(() => notifyResize());
    expect(previous).not.toBeVisible();
    expect(next).not.toBeVisible();

    dimensions.width = 1300;
    act(() => notifyResize());
    expect(next).toBeVisible();
    expect(next).toBeEnabled();

    dimensions.content = 1000;
    rerender(<DesignSystemGalleryRail>{cards(5)}</DesignSystemGalleryRail>);
    expect(previous).not.toBeVisible();
    expect(next).not.toBeVisible();

    dimensions.content = 3000;
    rerender(<DesignSystemGalleryRail>{cards(15)}</DesignSystemGalleryRail>);
    expect(next).toBeVisible();
    expect(next).toBeEnabled();
  });

  it('respects reduced motion when paging', () => {
    reducedMotion = true;
    const { next, scrollBy } = gallery();
    fireEvent.click(next);
    expect(scrollBy).toHaveBeenCalledWith({ left: 1200, behavior: 'auto' });
  });

  it('pages and detects both boundaries in a right-to-left gallery', () => {
    const { rail, dimensions, scrollBy, previous, next } = gallery();
    rail.style.direction = 'rtl';
    expect(previous).not.toBeVisible();
    fireEvent.click(next);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -1200, behavior: 'smooth' });

    dimensions.position = -1200;
    fireEvent.scroll(rail);
    expect(previous).toBeEnabled();
    expect(previous).toBeVisible();
    expect(next).toBeEnabled();
    fireEvent.click(previous);
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 1200, behavior: 'smooth' });

    dimensions.position = -(dimensions.content - dimensions.width);
    fireEvent.scroll(rail);
    expect(previous).toBeEnabled();
    expect(previous).toBeVisible();
    expect(next).toBeDisabled();
    expect(next).toBeVisible();

    dimensions.position = 0;
    fireEvent.scroll(rail);
    expect(previous).toBeDisabled();
    expect(previous).not.toBeVisible();
    expect(next).toBeEnabled();
  });
});
