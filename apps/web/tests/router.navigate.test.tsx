// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { goBack, navigate, useRoute } from '../src/router';

function RouteLabel() {
  const route = useRoute();
  const label = route.kind === 'home' ? route.view : route.kind;
  return <div data-testid="route-label">{label}</div>;
}

function NavigateFromUpdater() {
  const [didNavigate, setDidNavigate] = useState(false);

  useEffect(() => {
    if (didNavigate) return;
    setDidNavigate(() => {
      navigate({ kind: 'home', view: 'onboarding' }, { replace: true });
      return true;
    });
  }, [didNavigate]);

  return <RouteLabel />;
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('navigate / useRoute timing', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    consoleError.mockRestore();
    window.history.replaceState(null, '', '/');
  });

  it('updates history synchronously and notifies listeners after the microtask boundary', async () => {
    const onPop = vi.fn();
    window.addEventListener('popstate', onPop);

    navigate({ kind: 'home', view: 'onboarding' }, { replace: true });

    expect(window.location.pathname).toBe('/onboarding');
    expect(onPop).not.toHaveBeenCalled();

    await flushMicrotasks();

    expect(onPop).toHaveBeenCalledTimes(1);
    window.removeEventListener('popstate', onPop);
  });

  it('updates route subscribers after render-phase updater navigation without React warnings', async () => {
    render(<NavigateFromUpdater />);

    await flushMicrotasks();

    await waitFor(() => {
      expect(screen.getByTestId('route-label').textContent).toBe('onboarding');
    });
    expect(window.location.pathname).toBe('/onboarding');

    const warningCalls = consoleError.mock.calls.filter((call: unknown[]) =>
      String(call[0]).includes('Cannot update a component'),
    );
    expect(warningCalls).toEqual([]);
  });
});

describe('goBack', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('pops the history stack to the previous layer instead of a hardcoded route', async () => {
    // The user reaches a project from the Projects list — two in-app pushes.
    navigate({ kind: 'home', view: 'projects' });
    await flushMicrotasks();
    navigate({ kind: 'project', projectId: 'abc', conversationId: null, fileName: null });
    await flushMicrotasks();
    expect(window.location.pathname).toBe('/projects/abc');

    // Back must defer to the browser history stack (which lands on /projects),
    // not navigate somewhere fixed like the home view.
    const backSpy = vi.spyOn(window.history, 'back');
    goBack({ kind: 'home', view: 'home' });
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/projects/abc');
    backSpy.mockRestore();
  });

  it('falls back to the provided route on a fresh deep-link load (no in-app history)', async () => {
    // Simulate landing directly on the project URL — history.state has no depth.
    window.history.replaceState(null, '', '/projects/abc');

    const backSpy = vi.spyOn(window.history, 'back');
    goBack({ kind: 'home', view: 'projects' });
    // Never call history.back() here — it would escape the app to a foreign page.
    expect(backSpy).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(window.location.pathname).toBe('/projects');
    backSpy.mockRestore();
  });
});
