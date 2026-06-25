// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrandSummary } from '@open-design/contracts';

// EntryShell keeps the Brands sub-view mounted and only toggles visibility, so
// the route is the signal for "Brands is the active view". A mutable hoisted
// route lets each test drive activation transitions across rerenders.
const routerState = vi.hoisted(() => ({
  route: { kind: 'home', view: 'brands', brandId: undefined } as Record<string, unknown>,
}));
const fetchBrandsMock = vi.hoisted(() => vi.fn(async (): Promise<BrandSummary[]> => []));
const previewCardMock = vi.hoisted(() => vi.fn(() => null));
const brandIntentState = vi.hoisted(() => ({
  pending: false,
}));

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
  consumePendingNewBrandKit: () => {
    const wasPending = brandIntentState.pending;
    brandIntentState.pending = false;
    return wasPending;
  },
}));
// Heavy children are out of scope for the refresh contract.
vi.mock('../../src/components/BrandPreviewCard', () => ({
  BrandPreviewCard: previewCardMock,
  BrandLogo: () => null,
  hostnameOf: (url?: string) => url ?? '',
}));
vi.mock('../../src/components/BrandReferencePicker', () => ({
  BrandReferencePicker: () => null,
}));
vi.mock('../../src/components/NewBrandModal', () => ({
  NewBrandModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="new-brand-modal" /> : null,
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
    brandIntentState.pending = false;
    fetchBrandsMock.mockReset();
    fetchBrandsMock.mockResolvedValue([]);
    previewCardMock.mockClear();
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

  it('does not open the New Brand Kit modal from an intent while Brands is hidden', async () => {
    routerState.route = { kind: 'home', view: 'home' };
    renderBrandsTab();

    brandIntentState.pending = true;
    window.dispatchEvent(new CustomEvent('od:new-brand-kit-intent'));

    expect(screen.queryByTestId('new-brand-modal')).toBeNull();
    expect(brandIntentState.pending).toBe(true);
  });

  it('consumes the pending New Brand Kit intent only on active Brands entry', async () => {
    routerState.route = { kind: 'home', view: 'home' };
    const { rerender } = renderBrandsTab();

    brandIntentState.pending = true;
    window.dispatchEvent(new CustomEvent('od:new-brand-kit-intent'));
    expect(screen.queryByTestId('new-brand-modal')).toBeNull();

    routerState.route = { kind: 'home', view: 'brands', brandId: undefined };
    rerender(
      <I18nProvider initial="en">
        <BrandsTab />
      </I18nProvider>,
    );

    expect(await screen.findByTestId('new-brand-modal')).toBeTruthy();
    expect(brandIntentState.pending).toBe(false);

    routerState.route = { kind: 'project', projectId: 'p1', conversationId: null, fileName: null };
    rerender(
      <I18nProvider initial="en">
        <BrandsTab />
      </I18nProvider>,
    );
    expect(screen.queryByTestId('new-brand-modal')).toBeNull();

    routerState.route = { kind: 'home', view: 'brands', brandId: undefined };
    rerender(
      <I18nProvider initial="en">
        <BrandsTab />
      </I18nProvider>,
    );
    expect(screen.queryByTestId('new-brand-modal')).toBeNull();
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
    expect(fetchBrandsMock).toHaveBeenCalledTimes(2);

    // Extraction settles to ready — the next poll tick tears the interval down.
    fetchBrandsMock.mockResolvedValue([brandSummary('acme', 'ready')]);
    await vi.advanceTimersByTimeAsync(4000);
    const afterSettle = fetchBrandsMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetchBrandsMock).toHaveBeenCalledTimes(afterSettle);
  });

  it('does not aim the preview at another brand when the routed brand disappears', async () => {
    routerState.route = { kind: 'home', view: 'brands', brandId: 'deleted-brand' };
    fetchBrandsMock.mockResolvedValue([brandSummary('remaining-brand', 'ready')]);

    renderBrandsTab();

    await waitFor(() => expect(fetchBrandsMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(previewCardMock).not.toHaveBeenCalled());
  });
});
