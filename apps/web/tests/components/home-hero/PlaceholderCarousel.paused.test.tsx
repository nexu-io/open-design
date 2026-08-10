// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';

import { PlaceholderCarousel } from '../../../src/components/home-hero/PlaceholderCarousel';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Each committed step schedules the next timer, so one advanceTimersByTime
// only walks a single character — the loop is what actually types.
function typeAFewCharacters() {
  for (let i = 0; i < 10; i += 1) act(() => { vi.advanceTimersByTime(120); });
}

const SCENARIOS = [
  { id: 'a', text: 'Design a landing page', chipId: 'prototype' },
  { id: 'b', text: 'Clone this website', chipId: 'web-clone' },
] as const;

describe('PlaceholderCarousel — paused while the editor has focus (#118)', () => {
  it('renders nothing and schedules no timer once paused', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <PlaceholderCarousel
        scenarios={[...SCENARIOS]}
        active
        onScenarioChange={() => {}}
      />,
    );
    // The typewriter starts at zero characters; let it type a few first so the
    // assertion below distinguishes "paused" from "has not started yet".
    typeAFewCharacters();
    expect(container.textContent).not.toBe('');

    // A caret in the editor: the animated text must stop AND disappear, so it
    // cannot read as a second cursor next to the real one.
    rerender(
      <PlaceholderCarousel
        scenarios={[...SCENARIOS]}
        active
        paused
        onScenarioChange={() => {}}
      />,
    );
    expect(container.textContent).toBe('');
    expect(vi.getTimerCount()).toBe(0);

    // And it stays silent: with the animation loop stopped, further time
    // passing must not bring any text back under the caret.
    typeAFewCharacters();
    expect(container.textContent).toBe('');
  });

  it('keeps animating while unpaused', () => {
    vi.useFakeTimers();
    render(
      <PlaceholderCarousel
        scenarios={[...SCENARIOS]}
        active
        onScenarioChange={() => {}}
      />,
    );
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('resumes when focus leaves', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <PlaceholderCarousel
        scenarios={[...SCENARIOS]}
        active
        paused
        onScenarioChange={() => {}}
      />,
    );
    expect(container.textContent).toBe('');

    rerender(
      <PlaceholderCarousel
        scenarios={[...SCENARIOS]}
        active
        onScenarioChange={() => {}}
      />,
    );
    typeAFewCharacters();
    expect(container.textContent).not.toBe('');
  });
});
