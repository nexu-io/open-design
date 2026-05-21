// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PagePatternSummary } from '@open-design/contracts';

import { PagePatternsTab } from '../../src/components/PagePatternsTab';

const originalFetch = globalThis.fetch;
const originalIntersectionObserver = globalThis.IntersectionObserver;

// PagePatternsTab lazy-mounts thumbnail iframes through an
// IntersectionObserver in the real card. Stub it to behave like a
// no-op so the test doesn't need a layout engine to flush the cards.
class IdleIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  globalThis.IntersectionObserver =
    IdleIntersectionObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  globalThis.IntersectionObserver = originalIntersectionObserver;
  vi.restoreAllMocks();
});

function mockPatterns(): PagePatternSummary[] {
  // PagePatternSummary extends SkillSummary, but the gallery only
  // reads `id`, `name`, `description`, and `pageType`, so we don't
  // need to fill every SkillSummary field for this test.
  return [
    {
      id: 'auth-login',
      name: 'auth-login',
      description: 'Standard login page.',
      pageType: 'auth.login',
      pageInputs: [],
      pageOutputs: [],
      hasBody: true,
    } as unknown as PagePatternSummary,
    {
      id: 'board-list',
      name: 'board-list',
      description: 'Board list page.',
      pageType: 'list.board',
      pageInputs: [],
      pageOutputs: [],
      hasBody: true,
    } as unknown as PagePatternSummary,
  ];
}

describe('PagePatternsTab', () => {
  it('renders cards from /api/page-patterns and filters by category', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/page-patterns') {
        return new Response(JSON.stringify({ patterns: mockPatterns() }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    render(<PagePatternsTab onUsePattern={() => undefined} onPreview={() => undefined} />);

    await screen.findByTestId('page-pattern-card-auth-login');
    expect(screen.getByTestId('page-pattern-card-board-list')).toBeTruthy();

    // Filter by 'auth' category.
    fireEvent.change(screen.getByTestId('page-patterns-category-select'), {
      target: { value: 'auth' },
    });
    await waitFor(() => {
      expect(screen.queryByTestId('page-pattern-card-board-list')).toBeNull();
    });
    expect(screen.getByTestId('page-pattern-card-auth-login')).toBeTruthy();
  });

  it('invokes onPreview when a card thumbnail is clicked', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ patterns: mockPatterns() }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const onPreview = vi.fn();
    render(<PagePatternsTab onUsePattern={() => undefined} onPreview={onPreview} />);

    const thumb = await screen.findByTestId('page-pattern-preview-auth-login');
    fireEvent.click(thumb);
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview.mock.calls[0]?.[0]?.id).toBe('auth-login');
  });
});
