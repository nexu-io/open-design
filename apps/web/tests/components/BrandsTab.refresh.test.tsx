// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrandSummary } from '@open-design/contracts';

// EntryShell keeps the Brands sub-view mounted and only toggles visibility, so
// the route is the signal for "Brands is the active view". A mutable hoisted
// route lets each test drive activation transitions across rerenders.
const routerState = vi.hoisted(() => ({
  route: { kind: 'home', view: 'brands', brandId: undefined } as Record<string, unknown>,
}));
const fetchBrandsMock = vi.hoisted(() => vi.fn(async (): Promise<BrandSummary[]> => []));

vi.mock('../../src/router', () => ({
  useRoute: () => routerState.route,
  navigate: vi.fn(),
}));
vi.mock('../../src/runtime/brands', () => ({
  fetchBrands: fetchBrandsMock,
}));
vi.mock('../../src/runtime/useBrandExtract', () => ({
  useBrandExtract: () => ({ state: { phase: 'idle' }, run: vi.fn() }),
}));
vi.mock('../../src/runtime/brand-intent', () => ({
  NEW_BRAND_KIT_INTENT_EVENT: 'od:new-brand-kit-intent',
  consumePendingNewBrandKit: () => false,
}));
// Heavy children are out of scope for the refresh contract.
vi.mock('../../src/components/BrandPreviewCard', () => ({
  BrandPreviewCard: () => null,
  BrandLogo: () => null,
  hostnameOf: (url?: string) => url ?? '',
}));
vi.mock('../../src/components/BrandReferencePicker', () => ({
  BrandReferencePicker: () => null,
}));
vi.mock('../../src/components/NewBrandModal', () => ({
  NewBrandModal: () => null,
}));

import { BrandsTab } from '../../src/components/BrandsTab';
import { I18nProvider } from '../../src/i18n';

function renderBrandsTab() {
  return render(
    <I18nProvider initial="en">
      <BrandsTab />
    </I18nProvider>,
  );
}

function brandSummary(id: string, status: BrandSummary['meta']['status']): BrandSummary {
  return {
    meta: {
      id,
      status,
      sourceUrl: `https://${id}.example`,
      designSystemId: status === 'ready' ? `user:${id}` : undefined,
    },
    brand: { name: id },
  } as unknown as BrandSummary;
}

describe('BrandsTab refresh reconciliation', () => {
  beforeEach(() => {
    routerState.route = { kind: 'home', view: 'brands', brandId: undefined };
    fetchBrandsMock.mockReset();
    fetchBrandsMock.mockResolvedValue([]);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('refetches /api/brands when the Brands view becomes active again', async () => {
    const { rerender } = renderBrandsTab();
    await waitFor(() => expect(fetchBrandsMock).toHaveBeenCalledTimes(1));

    // Navigate away to another entry sub-view; BrandsTab stays mounted (hidden).
    routerState.route = { kind: 'home', view: 'home' };
    rerender(
      <I18nProvider initial="en">
        <BrandsTab />
      </I18nProvider>,
    );

    // Return to Brands — a completed extraction elsewhere must now reconcile.
    routerState.route = { kind: 'home', view: 'brands', brandId: undefined };
    rerender(
      <I18nProvider initial="en">
        <BrandsTab />
      </I18nProvider>,
    );

    await waitFor(() => expect(fetchBrandsMock).toHaveBeenCalledTimes(2));
  });

  it('polls while a brand is extracting and stops once it settles', async () => {
    vi.useFakeTimers();
    fetchBrandsMock.mockResolvedValue([brandSummary('acme', 'extracting')]);
    renderBrandsTab();

    // Initial activation fetch resolves; the extracting brand arms the poll.
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchBrandsMock).toHaveBeenCalledTimes(1);

    // The poll fires while extraction is in flight.
    await vi.advanceTimersByTimeAsync(4000);
    await vi.waitFor(() => expect(fetchBrandsMock).toHaveBeenCalledTimes(2));

    // Extraction settles to ready — the next poll tick tears the interval down.
    fetchBrandsMock.mockResolvedValue([brandSummary('acme', 'ready')]);
    await vi.advanceTimersByTimeAsync(4000);
    const afterSettle = fetchBrandsMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetchBrandsMock).toHaveBeenCalledTimes(afterSettle);
  });
});
