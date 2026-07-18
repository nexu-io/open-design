// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import type { ProjectMetadata } from '@open-design/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useBrandReadyPrompt } from '../../src/runtime/useBrandReadyPrompt';

const BRAND_METADATA: ProjectMetadata = {
  kind: 'brand',
  importedFrom: 'brand-extraction',
  brandId: 'brand-1',
};

function mockBrandsResponse(brands: unknown[] = [
  {
    meta: {
      id: 'brand-1',
      status: 'ready',
      designSystemId: 'user:brand-1',
    },
    brand: {
      name: 'Nexu',
    },
  },
]): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(brandResponse(brands));
}

function mockBrandsResponses(...responses: unknown[][]): void {
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  responses.forEach((brands) => {
    fetchMock.mockResolvedValueOnce(brandResponse(brands));
  });
  fetchMock.mockResolvedValue(brandResponse(responses.at(-1) ?? []));
}

function brandResponse(brands: unknown[]): Response {
  return new Response(JSON.stringify({
    brands,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  window.sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useBrandReadyPrompt', () => {
  it('exposes ready state even when the one-shot prompt was already dismissed', async () => {
    window.sessionStorage.setItem('od:brand-ready-prompt:brand-1', '1');
    mockBrandsResponse();

    const { result } = renderHook(() => useBrandReadyPrompt(BRAND_METADATA));

    await waitFor(() => {
      expect(result.current.ready).toEqual({
        designSystemId: 'user:brand-1',
        brandName: 'Nexu',
      });
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.prompt).toBeNull();
  });

  it('does not surface browser assist for an ordinary failed extraction', async () => {
    mockBrandsResponse([
      {
        meta: {
          id: 'brand-1',
          status: 'failed',
          sourceUrl: 'https://www.economist.com/',
          error: 'Brand extraction failed in the backing project.',
        },
        brand: null,
      },
    ]);

    const { result } = renderHook(() => useBrandReadyPrompt(BRAND_METADATA));

    await waitFor(() => {
      expect(result.current.status).toBe('failed');
    });
    expect(result.current.browserAssist).toBeNull();
  });

  it('keeps polling after a failed status so a same-brand retry can surface ready', async () => {
    const realSetTimeout = window.setTimeout.bind(window);
    vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, timeout?: number) => {
      if (timeout === 5000 && typeof handler === 'function') {
        void Promise.resolve().then(() => handler());
        return 1;
      }
      return realSetTimeout(handler, timeout);
    }) as typeof window.setTimeout);
    mockBrandsResponses(
      [
        {
          meta: {
            id: 'brand-1',
            status: 'failed',
            sourceUrl: 'https://www.economist.com/',
            error: 'Brand extraction failed in the backing project.',
          },
          brand: null,
        },
      ],
      [
        {
          meta: {
            id: 'brand-1',
            status: 'ready',
            designSystemId: 'user:brand-1',
          },
          brand: {
            name: 'Nexu',
          },
        },
      ],
    );

    const { result } = renderHook(() => useBrandReadyPrompt(BRAND_METADATA));

    await waitFor(() => {
      expect(result.current.ready).toEqual({
        designSystemId: 'user:brand-1',
        brandName: 'Nexu',
      });
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.prompt).toEqual({
      designSystemId: 'user:brand-1',
      brandName: 'Nexu',
    });
  });

  it('resets the browser assist stall timer when a same-brand retry starts extracting', async () => {
    const initialNow = 1_000_000;
    let now = initialNow;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const realSetTimeout = window.setTimeout.bind(window);
    let pollTimers = 0;
    vi.spyOn(window, 'setTimeout').mockImplementation(((handler: TimerHandler, timeout?: number) => {
      if (timeout === 5000 && typeof handler === 'function') {
        pollTimers += 1;
        if (pollTimers === 1) {
          void Promise.resolve().then(() => {
            now = initialNow + 31_000;
            handler();
          });
        }
        return pollTimers;
      }
      return realSetTimeout(handler, timeout);
    }) as typeof window.setTimeout);
    mockBrandsResponses(
      [
        {
          meta: {
            id: 'brand-1',
            status: 'failed',
            sourceUrl: 'https://www.economist.com/',
            error: 'Brand extraction failed in the backing project.',
          },
          brand: null,
        },
      ],
      [
        {
          meta: {
            id: 'brand-1',
            status: 'extracting',
            sourceUrl: 'https://www.economist.com/',
            extractionStartedAt: initialNow + 31_000,
            extractionAttemptId: 'retry-attempt',
          },
          brand: null,
        },
      ],
    );

    const { result } = renderHook(() => useBrandReadyPrompt(BRAND_METADATA));

    await waitFor(() => {
      expect(result.current.status).toBe('extracting');
    });
    expect(result.current.browserAssist).toBeNull();
    expect(window.sessionStorage.getItem('od:brand-browser-assist:brand-1')).toBeNull();
  });

  it('surfaces browser assist for an anti-bot failed extraction', async () => {
    mockBrandsResponse([
      {
        meta: {
          id: 'brand-1',
          status: 'failed',
          sourceUrl: 'https://www.economist.com/',
          blocked: true,
          blockedReason: 'Cloudflare',
          error: 'Programmatic extraction blocked by Cloudflare.',
        },
        brand: null,
      },
    ]);

    const { result } = renderHook(() => useBrandReadyPrompt(BRAND_METADATA));

    await waitFor(() => {
      expect(result.current.browserAssist).toEqual({
        brandId: 'brand-1',
        sourceUrl: 'https://www.economist.com/',
        reason: 'Cloudflare',
      });
    });
    expect(result.current.status).toBe('failed');
  });

  it('keeps browser assist discoverable even after an earlier assist display', async () => {
    window.sessionStorage.setItem('od:brand-browser-assist:brand-1', '1');
    mockBrandsResponse([
      {
        meta: {
          id: 'brand-1',
          status: 'failed',
          sourceUrl: 'https://www.economist.com/',
          blocked: true,
          blockedReason: 'Cloudflare',
          error: 'Programmatic extraction blocked by Cloudflare.',
        },
        brand: null,
      },
    ]);

    const { result } = renderHook(() => useBrandReadyPrompt(BRAND_METADATA));

    await waitFor(() => {
      expect(result.current.browserAssist).toEqual({
        brandId: 'brand-1',
        sourceUrl: 'https://www.economist.com/',
        reason: 'Cloudflare',
      });
    });
  });
});
