// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { goBack, navigate, registerNavigationGuard, useRoute } from '../src/router';

function RouteLabel() {
  const route = useRoute();
  const label = route.kind === 'home' ? route.view : route.kind;
  return <div data-testid="route-label">{label}</div>;
}

function RerenderableRouteLabel() {
  const route = useRoute();
  const [renderCount, setRenderCount] = useState(0);
  const label = route.kind === 'home' ? route.view : route.kind;
  return (
    <div>
      <div data-testid="route-label">{label}</div>
      <button type="button" onClick={() => setRenderCount((count) => count + 1)}>
        Rerender {renderCount}
      </button>
    </div>
  );
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

  it('waits for an active navigation guard and commits only the latest destination', async () => {
    let release!: (allowed: boolean) => void;
    const gate = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const guard = vi.fn(() => gate);
    const unregister = registerNavigationGuard(guard);

    navigate({ kind: 'home', view: 'projects' });
    navigate({ kind: 'home', view: 'onboarding' });
    expect(window.location.pathname).toBe('/');

    release(true);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(guard).toHaveBeenCalledTimes(2);
    expect(window.location.pathname).toBe('/onboarding');
    unregister();
  });

  it('invalidates an older guarded navigation when a newer unguarded navigation commits', async () => {
    // Keep a route subscriber mounted so unregistering the guard does not tear
    // down the coordinator and independently advance its sequence. The newer
    // no-guard navigate call itself must invalidate the older waiter.
    render(<RouteLabel />);
    let release!: (allowed: boolean) => void;
    const gate = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const unregister = registerNavigationGuard(() => gate);

    navigate({ kind: 'home', view: 'projects' });
    expect(window.location.pathname).toBe('/');

    unregister();
    navigate({ kind: 'home', view: 'onboarding' });
    expect(window.location.pathname).toBe('/onboarding');

    release(true);
    await flushMicrotasks();
    await flushMicrotasks();

    expect(window.location.pathname).toBe('/onboarding');
  });

  it('guards native Back and restores the accepted history entry without recursively guarding the repair', async () => {
    render(<RouteLabel />);
    navigate({ kind: 'home', view: 'projects' });
    await flushMicrotasks();
    navigate({ kind: 'project', projectId: 'abc', conversationId: null, fileName: null });
    await flushMicrotasks();

    let release!: (allowed: boolean) => void;
    const gate = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const guard = vi.fn(() => gate);
    const unregister = registerNavigationGuard(guard);
    const onPop = vi.fn();
    window.addEventListener('popstate', onPop);

    window.history.back();
    await waitFor(() => expect(guard).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('route-label').textContent).toBe('project');

    release(false);
    await waitFor(() => expect(window.location.pathname).toBe('/projects/abc'));
    expect(screen.getByTestId('route-label').textContent).toBe('project');
    expect(guard).toHaveBeenCalledTimes(1);
    expect(onPop).toHaveBeenCalledTimes(2);

    window.removeEventListener('popstate', onPop);
    unregister();
  });

  it('does not expose a native Back destination through getRouteSnapshot while its guard is pending', async () => {
    render(<RerenderableRouteLabel />);
    navigate({ kind: 'home', view: 'projects' });
    await flushMicrotasks();
    navigate({ kind: 'project', projectId: 'abc', conversationId: null, fileName: null });
    await flushMicrotasks();

    let release!: (allowed: boolean) => void;
    const gate = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const guard = vi.fn(() => gate);
    const unregister = registerNavigationGuard(guard);

    window.history.back();
    await waitFor(() => expect(guard).toHaveBeenCalledTimes(1));
    expect(window.location.pathname).toBe('/projects');
    expect(screen.getByTestId('route-label').textContent).toBe('project');

    fireEvent.click(screen.getByRole('button', { name: 'Rerender 0' }));
    const pendingRouteLabel = screen.getByTestId('route-label').textContent;

    release(false);
    await waitFor(() => expect(window.location.pathname).toBe('/projects/abc'));
    unregister();
    expect(pendingRouteLabel).toBe('project');
  });

  it('repairs native Back when it and a newer programmatic navigation are both denied', async () => {
    render(<RouteLabel />);
    navigate({ kind: 'home', view: 'projects' });
    await flushMicrotasks();
    navigate({ kind: 'project', projectId: 'abc', conversationId: null, fileName: null });
    await flushMicrotasks();

    let releaseNative!: (allowed: boolean) => void;
    const nativeGate = new Promise<boolean>((resolve) => {
      releaseNative = resolve;
    });
    let releaseProgrammatic!: (allowed: boolean) => void;
    const programmaticGate = new Promise<boolean>((resolve) => {
      releaseProgrammatic = resolve;
    });
    const guard = vi.fn()
      .mockImplementationOnce(() => nativeGate)
      .mockImplementationOnce(() => programmaticGate);
    const unregister = registerNavigationGuard(guard);

    try {
      window.history.back();
      await waitFor(() => expect(guard).toHaveBeenCalledTimes(1));
      expect(window.location.pathname).toBe('/projects');

      navigate({ kind: 'home', view: 'onboarding' });
      await waitFor(() => expect(guard).toHaveBeenCalledTimes(2));

      releaseProgrammatic(false);
      releaseNative(false);
      await flushMicrotasks();
      await flushMicrotasks();

      await waitFor(() => expect(window.location.pathname).toBe('/projects/abc'));
      expect(screen.getByTestId('route-label').textContent).toBe('project');
    } finally {
      unregister();
    }
  });

  it('guards native Back and Forward and publishes each destination only after approval', async () => {
    render(<RouteLabel />);
    navigate({ kind: 'home', view: 'projects' });
    await flushMicrotasks();
    navigate({ kind: 'project', projectId: 'abc', conversationId: null, fileName: null });
    await flushMicrotasks();

    const guard = vi.fn(() => true);
    const unregister = registerNavigationGuard(guard);

    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/projects'));
    await waitFor(() => expect(screen.getByTestId('route-label').textContent).toBe('projects'));

    window.history.forward();
    await waitFor(() => expect(window.location.pathname).toBe('/projects/abc'));
    await waitFor(() => expect(screen.getByTestId('route-label').textContent).toBe('project'));
    expect(guard).toHaveBeenCalledTimes(2);

    unregister();
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
    const backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {});
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

  it('does not leave the current route when an active guard rejects the transition', async () => {
    window.history.replaceState(null, '', '/projects/abc');
    const unregister = registerNavigationGuard(() => false);
    const backSpy = vi.spyOn(window.history, 'back');

    goBack({ kind: 'home', view: 'projects' });
    await flushMicrotasks();

    expect(backSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/projects/abc');
    unregister();
    backSpy.mockRestore();
  });

  it('treats a rejected safe-exit promise as a denied Back navigation', async () => {
    window.history.replaceState({ odIndex: 1 }, '', '/projects/abc');
    const unregister = registerNavigationGuard(() => Promise.reject(new Error('save failed')));
    const backSpy = vi.spyOn(window.history, 'back');

    goBack({ kind: 'home', view: 'projects' });
    await flushMicrotasks();

    expect(backSpy).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/projects/abc');
    unregister();
    backSpy.mockRestore();
  });

  it('runs the safe-exit guard once when goBack traverses accepted history', async () => {
    render(<RouteLabel />);
    navigate({ kind: 'home', view: 'projects' });
    await flushMicrotasks();
    navigate({ kind: 'project', projectId: 'abc', conversationId: null, fileName: null });
    await flushMicrotasks();

    const guard = vi.fn(() => true);
    const unregister = registerNavigationGuard(guard);
    goBack({ kind: 'home', view: 'home' });

    await waitFor(() => expect(window.location.pathname).toBe('/projects'));
    await waitFor(() => expect(screen.getByTestId('route-label').textContent).toBe('projects'));
    expect(guard).toHaveBeenCalledTimes(1);

    unregister();
  });
});
