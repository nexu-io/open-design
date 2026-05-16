// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewModal } from '../../src/components/PreviewModal';

// Regression coverage for nexu-io/open-design#860: when the example HTML
// fetch fails, the modal must render an explicit error/retry affordance
// instead of staying stuck at "Loading…" with the share menu disabled
// and no recovery path.

const baseProps = {
  title: 'Example',
  exportTitleFor: (id: string) => id,
};

describe('PreviewModal error state', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the error UI when the active view carries an error', () => {
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: undefined,
            error: 'simulated failure',
          },
        ]}
        onView={() => {}}
        onClose={() => {}}
      />,
    );

    expect(
      screen.getByText("Couldn't load this example."),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /retry/i }),
    ).toBeTruthy();
    // Loading copy must NOT show alongside the error state.
    expect(screen.queryByText(/loading/i)).toBeNull();
  });

  it('fires onView when Retry is clicked so the parent can re-run the fetch', () => {
    const onView = vi.fn();
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: undefined,
            error: 'simulated failure',
          },
        ]}
        onView={onView}
        onClose={() => {}}
      />,
    );

    // Mount fires onView once with the initial activeId; clear the spy
    // so the assertion targets only the Retry click.
    onView.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onView).toHaveBeenCalledWith('preview');
  });

  it('does not re-fire onView on re-render when the same callback identity is passed', () => {
    // Codex P2 regression: an inline `onView={() => loadPreview(...)}` was
    // recreated on every parent render, and PreviewModal's mount effect
    // re-fired onView on identity change, turning a persistent error into
    // an automatic retry loop. The fix in ExamplesTab is to pass a
    // stable-identity callback; this test pins that contract on the
    // modal side by asserting that re-rendering with the same onView
    // reference does not re-fire it.
    const onView = vi.fn();
    const { rerender } = render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: undefined,
            error: 'simulated failure',
          },
        ]}
        onView={onView}
        onClose={() => {}}
      />,
    );
    expect(onView).toHaveBeenCalledTimes(1);

    rerender(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: undefined,
            error: 'simulated failure',
          },
        ]}
        onView={onView}
        onClose={() => {}}
      />,
    );
    expect(onView).toHaveBeenCalledTimes(1);
  });
});
