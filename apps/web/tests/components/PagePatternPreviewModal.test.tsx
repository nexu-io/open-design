// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PagePatternSummary } from '@open-design/contracts';

import { PagePatternPreviewModal } from '../../src/components/PagePatternPreviewModal';

const originalFetch = globalThis.fetch;

function mockPattern(overrides: Partial<PagePatternSummary> = {}): PagePatternSummary {
  return {
    id: 'auth-login',
    name: 'auth-login',
    description: 'Login page.',
    triggers: [],
    mode: 'prototype',
    pageType: 'auth.login',
    pageInputs: [],
    pageOutputs: [],
    previewType: 'html',
    designSystemRequired: true,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: 'Build a login page.',
    aggregatesExamples: false,
    ...overrides,
  } as PagePatternSummary;
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.startsWith('/api/page-patterns/') && url.endsWith('/example')) {
      return new Response('<!doctype html><html><body>preview</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('PagePatternPreviewModal', () => {
  it('mounts inside the shared PreviewModal chrome with the pattern name as title', () => {
    render(<PagePatternPreviewModal pattern={mockPattern()} onClose={() => undefined} />);
    // The shared PreviewModal puts the backdrop on `.ds-modal-backdrop`
    // and renders the title in `.ds-modal-title`.
    const backdrop = document.querySelector('.ds-modal-backdrop');
    expect(backdrop).not.toBeNull();
    const title = document.querySelector('.ds-modal-title');
    expect(title?.textContent).toBe('auth-login');
  });

  it('uses the pageType as the subtitle', () => {
    render(<PagePatternPreviewModal pattern={mockPattern()} onClose={() => undefined} />);
    const subtitle = document.querySelector('.ds-modal-subtitle');
    expect(subtitle?.textContent).toBe('auth.login');
  });

  it('fetches the example HTML and surfaces it to the modal stage', async () => {
    render(<PagePatternPreviewModal pattern={mockPattern()} onClose={() => undefined} />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/page-patterns/auth-login/example');
    });
  });

  it('invokes onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<PagePatternPreviewModal pattern={mockPattern()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('invokes onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<PagePatternPreviewModal pattern={mockPattern()} onClose={onClose} />);
    const closeBtn = document.querySelector('.ds-modal-close') as HTMLButtonElement;
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('percent-encodes the patternId in the example URL', async () => {
    render(
      <PagePatternPreviewModal
        pattern={mockPattern({ id: 'auth/login with space', name: 'edge case' })}
        onClose={() => undefined}
      />,
    );
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/page-patterns/auth%2Flogin%20with%20space/example',
      );
    });
  });
});
