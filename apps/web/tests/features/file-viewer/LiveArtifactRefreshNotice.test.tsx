// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveArtifactRefreshNotice } from '../../../src/features/file-viewer/components/LiveArtifactRefreshNotice';

afterEach(cleanup);

describe('LiveArtifactRefreshNotice', () => {
  it('renders an error notice with role="alert"', () => {
    render(<LiveArtifactRefreshNotice tone="error" message="It failed" action="Try again" />);
    const notice = screen.getByRole('alert');
    expect(notice.className).toContain('live-artifact-refresh-notice error');
    expect(screen.getByText('It failed')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('renders a running/success notice with role="status"', () => {
    render(<LiveArtifactRefreshNotice tone="running" message="Refreshing" action="Please wait" />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('omits the dismiss button when onDismiss is not provided', () => {
    render(<LiveArtifactRefreshNotice tone="success" message="Done" action="ok" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders a dismiss button and calls onDismiss when clicked', () => {
    const onDismiss = vi.fn();
    render(
      <LiveArtifactRefreshNotice
        tone="success"
        message="Done"
        action="ok"
        onDismiss={onDismiss}
        dismissLabel="Close"
      />,
    );
    const button = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(button);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
