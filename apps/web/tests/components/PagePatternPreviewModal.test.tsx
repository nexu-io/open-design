// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { PagePatternPreviewModal } from '../../src/components/PagePatternPreviewModal';

afterEach(() => {
  cleanup();
});

describe('PagePatternPreviewModal', () => {
  it('renders an iframe pointing at the pattern example endpoint', () => {
    render(<PagePatternPreviewModal patternId="auth-login" onClose={() => undefined} />);
    const iframe = screen.getByTitle(/auth-login/i) as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('/api/page-patterns/auth-login/example');
  });

  it('invokes onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<PagePatternPreviewModal patternId="auth-login" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('page-pattern-preview-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('invokes onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<PagePatternPreviewModal patternId="auth-login" onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close when clicking inside the modal content', () => {
    const onClose = vi.fn();
    render(<PagePatternPreviewModal patternId="auth-login" onClose={onClose} />);
    const iframe = screen.getByTitle(/auth-login/i);
    fireEvent.click(iframe);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('percent-encodes the patternId in the example URL', () => {
    render(
      <PagePatternPreviewModal patternId="auth/login with space" onClose={() => undefined} />,
    );
    const iframe = screen.getByTitle(/auth\/login with space/i) as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe(
      '/api/page-patterns/auth%2Flogin%20with%20space/example',
    );
  });
});
