// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import AntonIndicatorDefault, { AntonIndicator } from '../src/anton-indicator';

afterEach(() => {
  cleanup();
});

describe('AntonIndicator', () => {
  it('is exported both as a named and the default export', () => {
    expect(AntonIndicator).toBeTypeOf('function');
    expect(AntonIndicatorDefault).toBe(AntonIndicator);
  });

  it('renders the orbit-morph host wired to its state and size', () => {
    const { container } = render(<AntonIndicator state="thinking" size="72px" />);

    const host = container.querySelector('.orbit-morph') as HTMLElement | null;
    expect(host).toBeTruthy();
    expect(host?.getAttribute('data-theme')).toBe('dark');
    expect(host?.getAttribute('data-state')).toBe('thinking');
    expect(host?.getAttribute('aria-hidden')).toBe('true');
    expect(host?.style.getPropertyValue('--om-size')).toBe('72px');
  });

  it('builds the animated SVG inside the host and honors state changes', () => {
    const { container, rerender } = render(<AntonIndicator state="idle" />);

    const host = container.querySelector('.orbit-morph') as HTMLElement;
    // The effect mounts the imperatively-built SVG synchronously.
    expect(host.querySelector('svg')).toBeTruthy();

    rerender(<AntonIndicator state="done" />);
    expect(host.getAttribute('data-state')).toBe('done');
  });
});
