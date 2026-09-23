// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppErrorBoundary } from '../../src/components/AppErrorBoundary';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';
import { KitErrorBoundary } from '../../src/components/KitErrorBoundary';

afterEach(() => cleanup());

function Thrower(): never {
  throw new Error('render boom');
}

describe('AppErrorBoundary', () => {
  it('catches a render throw and shows the translated reload fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onRetry = vi.fn();
    render(
      <AppErrorBoundary onRetry={onRetry}>
        <Thrower />
      </AppErrorBoundary>,
    );

    const alert = screen.getByTestId('app-error-boundary');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('This view ran into a problem.');

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders children normally when nothing throws', () => {
    render(
      <AppErrorBoundary>
        <div data-testid="healthy">ok</div>
      </AppErrorBoundary>,
    );
    expect(screen.getByTestId('healthy')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('KitErrorBoundary', () => {
  it('scopes the fallback to the kit subtree', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <div data-testid="outside">sibling</div>
        <KitErrorBoundary>
          <Thrower />
        </KitErrorBoundary>
      </div>,
    );

    expect(screen.getByTestId('kit-error-boundary')).toBeTruthy();
    // The crash is contained: siblings outside the boundary keep rendering.
    expect(screen.getByTestId('outside')).toBeTruthy();
  });
});

describe('ErrorBoundary', () => {
  it('retry re-renders children after the fault clears', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error('first render only');
      return <div data-testid="recovered">recovered</div>;
    }

    render(
      <ErrorBoundary
        context="test"
        fallback={(retry) => (
          <button type="button" data-testid="retry" onClick={retry}>
            retry
          </button>
        )}
      >
        <Flaky />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('retry')).toBeTruthy();
    shouldThrow = false;
    fireEvent.click(screen.getByTestId('retry'));
    expect(screen.getByTestId('recovered')).toBeTruthy();
  });
});
