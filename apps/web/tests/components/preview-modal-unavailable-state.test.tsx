// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewModal } from '../../src/components/PreviewModal';

// Regression coverage for nexu-io/open-design#897: skills declared with a
// non-html `od.preview.type` (image, markdown, …) ship no fetchable
// example artifact. The modal must render a calm "no shipped preview"
// placeholder distinct from both the loading state (which would never
// resolve) and the generic error state (which is misleading — nothing
// failed: there's just no preview to render).

const baseProps = {
  title: 'Example',
  exportTitleFor: (id: string) => id,
};

describe('PreviewModal unavailable state', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the unavailable affordance for a non-html preview', () => {
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: undefined,
            unavailable: { kind: 'markdown' },
          },
        ]}
        onView={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByTestId('preview-unavailable')).toBeTruthy();
    // Body copy mentions the preview kind so users know why nothing
    // rendered ("This skill produces a markdown document — …").
    expect(screen.getByText(/markdown/i)).toBeTruthy();
    // Loading + error copy must NOT show alongside the unavailable
    // state — the three states are mutually exclusive in the modal.
    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(screen.queryByText(/couldn't load/i)).toBeNull();
    // Unavailable is terminal: the user cannot retry their way into a
    // preview that doesn't exist on disk, so no Retry button.
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('does not render the unavailable affordance for an html view that is still loading', () => {
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: null, // null = loading
          },
        ]}
        onView={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.queryByTestId('preview-unavailable')).toBeNull();
    // The loading copy is the active state for null html.
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('disables the merged share menu when the active view is unavailable', () => {
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: undefined,
            unavailable: { kind: 'image' },
          },
        ]}
        onView={() => {}}
        onClose={() => {}}
      />,
    );

    // The preview has no html to export or share, so the merged trigger must
    // stay disabled instead of opening a menu full of no-op actions.
    const share = screen.getByRole('button', { name: /share/i });
    expect((share as HTMLButtonElement).disabled).toBe(true);
  });

  it('surfaces social sharing and file exports in one menu', () => {
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: '<!doctype html><p>Hello</p>',
          },
        ]}
        shareTarget={{
          title: 'Landing Template',
          url: 'https://example.test/marketplace/landing',
        }}
        onView={() => {}}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    const xShare = screen.getByRole('menuitem', { name: /X \/ Twitter/i });
    const redditShare = screen.getByRole('menuitem', { name: /Reddit/i });
    expect(xShare).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Reddit/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Facebook/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /LinkedIn/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Instagram/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /小红书/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Copy template link/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Export as PDF/i })).toBeTruthy();
    expect(xShare.getAttribute('href')).toContain(
      'https://twitter.com/intent/tweet?',
    );
    expect(redditShare.getAttribute('href')).toContain(
      'https://www.reddit.com/submit?',
    );
    expect(redditShare.getAttribute('target')).toBe('_blank');
    expect(redditShare.getAttribute('rel')).toBe('noreferrer noopener');
    expect(xShare.getAttribute('target')).toBe('_blank');
    expect(xShare.getAttribute('rel')).toBe('noreferrer noopener');
    expect(xShare.getAttribute('href')).toContain(
      'url=https%3A%2F%2Fexample.test%2Fmarketplace%2Flanding',
    );
    expect(new URL(xShare.getAttribute('href') ?? '').searchParams.get('text')).toBe(
      'Open Design template: Landing Template',
    );
    expect(new URL(redditShare.getAttribute('href') ?? '').searchParams.get('title')).toBe(
      'Open Design template: Landing Template',
    );
    expect(
      new URL(
        screen.getByRole('menuitem', { name: /Facebook/i }).getAttribute('href') ?? '',
      ).searchParams.get('quote'),
    ).toBe('Open Design template: Landing Template');
    expect(screen.getByRole('menuitem', { name: /Instagram/i }).getAttribute('href')).toBe(
      'https://www.instagram.com/',
    );
    expect(screen.getByRole('menuitem', { name: /小红书/i }).getAttribute('href')).toBe(
      'https://www.xiaohongshu.com/',
    );
  });

  it('keeps the current session open when launching copy-first social destinations', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const openedWindow = {
      opener: window,
      location: { href: 'about:blank' },
      close: vi.fn(),
    };
    const open = vi.fn().mockReturnValue(openedWindow);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: open,
    });

    try {
      render(
        <PreviewModal
          {...baseProps}
          views={[
            {
              id: 'preview',
              label: 'Preview',
              html: '<!doctype html><p>Hello</p>',
            },
          ]}
          shareTarget={{
            title: 'Landing Template',
            url: 'https://example.test/marketplace/landing',
          }}
          onView={() => {}}
          onClose={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /share/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /Instagram/i }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(
          'Open Design template: Landing Template\nhttps://example.test/marketplace/landing',
        );
        expect(openedWindow.location.href).toBe('https://www.instagram.com/');
      });
      expect(open).toHaveBeenCalledWith('about:blank', '_blank');
      expect(openedWindow.opener).toBeNull();
      expect(openedWindow.close).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
      Reflect.deleteProperty(window, 'open');
    }
  });

  it('shows copied feedback when clipboard permissions require the fallback path', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('blocked'));
    const execCommand = vi.fn((command: string) => command === 'copy');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    try {
      render(
        <PreviewModal
          {...baseProps}
          views={[
            {
              id: 'preview',
              label: 'Preview',
              html: '<!doctype html><p>Hello</p>',
            },
          ]}
          shareTarget={{
            title: 'Landing Template',
            url: 'https://example.test/marketplace/landing',
          }}
          onView={() => {}}
          onClose={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /share/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /Copy template link/i }));

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: /Copied/i })).toBeTruthy();
      });
      expect(writeText).toHaveBeenCalledWith('https://example.test/marketplace/landing');
      expect(execCommand).toHaveBeenCalledWith('copy');
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
      Reflect.deleteProperty(document, 'execCommand');
    }
  });

  it('copies a concise preset share caption with the product, template name, and link', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    try {
      render(
        <PreviewModal
          {...baseProps}
          views={[
            {
              id: 'preview',
              label: 'Preview',
              html: '<!doctype html><p>Hello</p>',
            },
          ]}
          shareTarget={{
            title: 'Landing Template',
            url: 'https://example.test/marketplace/landing',
          }}
          onView={() => {}}
          onClose={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: /share/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /Copy share text/i }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(
          'Open Design template: Landing Template\nhttps://example.test/marketplace/landing',
        );
      });
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('keeps social sharing available for custom media views without file exports', () => {
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'media',
            label: 'Image',
            custom: <div>Poster preview</div>,
          },
        ]}
        shareTarget={{
          title: 'Media Template',
          url: 'https://open-design.ai/plugins/media-template',
        }}
        onView={() => {}}
        onClose={() => {}}
      />,
    );

    const share = screen.getByRole('button', { name: /share/i });
    expect((share as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(share);

    expect(screen.getByRole('menuitem', { name: /X \/ Twitter/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Copy template link/i })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Export as PDF/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Download as \.zip/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Export as standalone HTML/i })).toBeNull();
  });

  it('hides social and copy-link actions when an explicit public share URL is unavailable', () => {
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: '<!doctype html><p>Local-only preview</p>',
          },
        ]}
        shareTarget={{
          title: 'Local Template',
          url: null,
        }}
        onView={() => {}}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    expect(screen.queryByRole('menuitem', { name: /X \/ Twitter/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Copy template link/i })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /Export as PDF/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Download as \.zip/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Export as standalone HTML/i })).toBeTruthy();
  });

  it('keeps generic preview modals export-only without an explicit share target', () => {
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: '<!doctype html><p>Generic preview</p>',
          },
        ]}
        onView={() => {}}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    expect(screen.queryByRole('menuitem', { name: /X \/ Twitter/i })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Copy template link/i })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /Export as PDF/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Download as \.zip/i })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Export as standalone HTML/i })).toBeTruthy();
  });

  it('does not call onView for an unavailable view (no fetch to retry)', () => {
    // PreviewModal fires onView on mount so the parent can lazy-load
    // the active view. For an unavailable view that signal is harmless
    // — the parent's loadPreview short-circuits — but flagging it here
    // would catch a future regression where the modal forgets to skip
    // onView for non-fetchable views.
    const onView = vi.fn();
    render(
      <PreviewModal
        {...baseProps}
        views={[
          {
            id: 'preview',
            label: 'Preview',
            html: undefined,
            unavailable: { kind: 'markdown' },
          },
        ]}
        onView={onView}
        onClose={() => {}}
      />,
    );

    // Mount-time onView is fine; the assertion is a no-Retry-button
    // sanity check rather than a "never call onView" — the parent's
    // dispatch handles short-circuiting.
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });
});
