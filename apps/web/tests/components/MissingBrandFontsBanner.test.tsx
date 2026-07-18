// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MissingBrandFontsBanner } from '../../src/components/MissingBrandFontsBanner';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('MissingBrandFontsBanner (issue #2814)', () => {
  it('shows add-font-files + keep-substitutes actions when not dismissed', () => {
    render(<MissingBrandFontsBanner projectId="p1" onUploadAssets={() => {}} />);
    expect(screen.getByText('Brand font files missing')).toBeTruthy();
    expect(screen.getByRole('button', { name: /add brand font files/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /keep substitutes/i })).toBeTruthy();
  });

  it('dismisses the banner for the project when Keep substitutes is clicked', () => {
    const { container } = render(
      <MissingBrandFontsBanner projectId="p1" onUploadAssets={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /keep substitutes/i }));
    expect(container.querySelector('.ds-project-warning-card')).toBeNull();
    expect(window.localStorage.getItem('od:font-banner-dismissed:p1')).toBe('1');
  });

  it('renders nothing when already dismissed for that project', () => {
    window.localStorage.setItem('od:font-banner-dismissed:p1', '1');
    const { container } = render(<MissingBrandFontsBanner projectId="p1" />);
    expect(container.firstChild).toBeNull();
  });

  it('keeps the dismissal scoped per project', () => {
    window.localStorage.setItem('od:font-banner-dismissed:p1', '1');
    render(<MissingBrandFontsBanner projectId="p2" />);
    // p2 was not dismissed, so the banner still shows.
    expect(screen.getByText('Brand font files missing')).toBeTruthy();
  });

  it('resyncs dismissal when the same instance switches projects', () => {
    // FileWorkspace renders the banner without a per-project key, so one
    // instance is reused as the user moves between projects.
    const { rerender, container } = render(<MissingBrandFontsBanner projectId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: /keep substitutes/i }));
    expect(container.querySelector('.ds-project-warning-card')).toBeNull();
    expect(window.localStorage.getItem('od:font-banner-dismissed:p1')).toBe('1');

    // Switching to a project that was never dismissed shows the banner again.
    rerender(<MissingBrandFontsBanner projectId="p2" />);
    expect(screen.getByText('Brand font files missing')).toBeTruthy();

    // Switching back to the dismissed project hides it again.
    rerender(<MissingBrandFontsBanner projectId="p1" />);
    expect(container.querySelector('.ds-project-warning-card')).toBeNull();
  });

  it('invokes onUploadAssets when Add brand font files is clicked', () => {
    const onUploadAssets = vi.fn();
    render(<MissingBrandFontsBanner projectId="p1" onUploadAssets={onUploadAssets} />);
    fireEvent.click(screen.getByRole('button', { name: /add brand font files/i }));
    expect(onUploadAssets).toHaveBeenCalledOnce();
  });

  it('omits Add brand font files when no handler is provided', () => {
    render(<MissingBrandFontsBanner projectId="p3" />);
    expect(screen.queryByRole('button', { name: /add brand font files/i })).toBeNull();
    expect(screen.getByRole('button', { name: /keep substitutes/i })).toBeTruthy();
  });
});
