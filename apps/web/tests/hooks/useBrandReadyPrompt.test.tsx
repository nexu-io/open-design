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

function mockBrandsResponse(): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({
      brands: [
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
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

afterEach(() => {
  window.sessionStorage.clear();
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
    expect(result.current.prompt).toBeNull();
  });
});
