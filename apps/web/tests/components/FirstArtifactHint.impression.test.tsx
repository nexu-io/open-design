// @vitest-environment jsdom
//
// Regression for the hint-impression inflation bug (PR #5111 review). The card
// returns `null` until the 600ms layout-settle window elapses, but the
// `surface_view` impression used to fire on mount regardless of `settled`. A
// mount removed during settle would then record an impression the user never
// saw, inflating the `onboarding_first_artifact_hint` denominator. The fix
// gates the impression on `settled`.

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  surfaceView: vi.fn(),
  clickFn: vi.fn(),
  seen: { value: false },
}));

vi.mock('../../src/analytics/events', () => ({
  trackStudioOnboardingHintSurfaceView: mocks.surfaceView,
  trackStudioOnboardingHintClick: mocks.clickFn,
}));

vi.mock('../../src/onboarding/first-artifact-hint', () => ({
  hasSeenFirstArtifactHint: () => mocks.seen.value,
  markFirstArtifactHintSeen: () => {
    mocks.seen.value = true;
  },
}));

import { I18nProvider } from '../../src/i18n';
import { FirstArtifactHint } from '../../src/components/FirstArtifactHint';

beforeEach(() => {
  mocks.surfaceView.mockClear();
  mocks.clickFn.mockClear();
  mocks.seen.value = false;
  // motion/react's useReducedMotion reads matchMedia; jsdom omits it.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    vi.runOnlyPendingTimers();
  });
  vi.useRealTimers();
  cleanup();
});

function renderHint() {
  return render(
    <I18nProvider initial="en">
      <FirstArtifactHint />
    </I18nProvider>,
  );
}

describe('FirstArtifactHint — surface_view impression', () => {
  it('does not fire before the settle window elapses', () => {
    act(() => {
      renderHint();
    });
    expect(mocks.surfaceView).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(mocks.surfaceView).not.toHaveBeenCalled();
  });

  it('fires exactly once after the card becomes renderable', () => {
    act(() => {
      renderHint();
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(mocks.surfaceView).toHaveBeenCalledTimes(1);
    // Later re-measures / resizes must not re-fire.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(mocks.surfaceView).toHaveBeenCalledTimes(1);
  });

  it('never fires for a mount removed during the settle window', () => {
    let unmount = () => {};
    act(() => {
      unmount = renderHint().unmount;
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    act(() => {
      unmount();
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(mocks.surfaceView).not.toHaveBeenCalled();
  });
});
