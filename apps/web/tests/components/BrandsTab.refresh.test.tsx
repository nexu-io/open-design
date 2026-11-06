// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BrandSummary, WorkspaceCollabContext } from '@open-design/contracts';
import { workspaceContextFixture } from '../helpers/workspace-context';

// EntryShell keeps the Brands sub-view mounted and only toggles visibility, so
// the route is the signal for "Brands is the active view". A mutable hoisted
// route lets each test drive activation transitions across rerenders.
const routerState = vi.hoisted(() => ({
  route: { kind: 'home', view: 'brands', brandId: undefined } as Record<string, unknown>,
}));
const fetchBrandsMock = vi.hoisted(() => vi.fn(async (): Promise<BrandSummary[]> => []));
const runExtractMock = vi.hoisted(() => vi.fn(async () => null));
const workspaceContextState = vi.hoisted(() => ({
  context: null as WorkspaceCollabContext | null,
  resourceReadIdentity: null as { context: WorkspaceCollabContext; generation: string } | null,
  loading: false,
}));

vi.mock('../../src/router', () => ({
  useRoute: () => routerState.route,
  navigate: vi.fn(),
}));
vi.mock('../../src/runtime/brands', () => ({
  fetchBrands: fetchBrandsMock,
}));
vi.mock('../../src/runtime/useBrandExtract', () => ({
  useBrandExtract: () => ({ state: { phase: 'idle' }, run: runExtractMock }),
}));
vi.mock('../../src/collab/useWorkspaceContext', () => ({
  useWorkspaceContext: () => workspaceContextState,
  workspaceResourceReadContext: (state: typeof workspaceContextState) =>
    state.resourceReadIdentity?.context ?? state.context,
}));
vi.mock('../../src/runtime/brand-intent', () => ({
  NEW_BRAND_KIT_INTENT_EVENT: 'od:new-brand-kit-intent',
  consumePendingNewBrandKit: () => false,
}));
// Keep the list row's real BrandLogo so Workspace read-identity regressions
// exercise the actual BrandsTab caller. Only the heavy detail card is stubbed.
vi.mock('../../src/components/BrandPreviewCard', async () => {
  const actual = await vi.importActual<typeof import('../../src/components/BrandPreviewCard')>(
    '../../src/components/BrandPreviewCard',
  );
  return {
    ...actual,
    BrandPreviewCard: () => null,
  };
});
vi.mock('../../src/components/BrandReferencePicker', () => ({
  BrandReferencePicker: ({ onPick }: { onPick: (brand: unknown) => void }) => (
    <button
      type="button"
      data-testid="mock-brand-reference"
      onClick={() => onPick({ name: 'Acme', domain: 'acme.example', category: 'Tools' })}
    >
      pick
    </button>
  ),
}));
vi.mock('../../src/components/NewBrandModal', () => ({
  NewBrandModal: ({
    open,
    onCreated,
  }: {
    open: boolean;
    onCreated: (brandId: string, projectId: string, conversationId: string) => void;
  }) => open ? (
    <button
      type="button"
      data-testid="mock-new-brand-created"
      onClick={() => onCreated('brand-acme', 'project-acme', 'conversation-acme')}
    >
      created
    </button>
  ) : null,
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
    runExtractMock.mockReset();
    runExtractMock.mockResolvedValue(null);
    workspaceContextState.context = null;
    workspaceContextState.resourceReadIdentity = null;
    workspaceContextState.loading = false;
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

  it('retries the scoped list logo when only the exact read generation advances', async () => {
    const context = workspaceContextFixture({
      workspaceId: 'workspace-logo',
      workspaceType: 'personal',
      workspaceMemberId: 'member-logo',
    });
    fetchBrandsMock.mockResolvedValue([brandSummary('acme', 'ready')]);
    workspaceContextState.context = context;
    workspaceContextState.resourceReadIdentity = { context, generation: 'generation-a' };

    const view = renderBrandsTab();
    const logo = await waitFor(() => {
      const image = screen.getByTestId('brand-item-acme').querySelector('img');
      expect(image?.getAttribute('src')).toContain('/api/brands/acme/logo');
      return image as HTMLImageElement;
    });
    fireEvent.error(logo);
    expect(screen.getByTestId('brand-item-acme').querySelector('img')?.getAttribute('src'))
      .toContain('google.com/s2/favicons');

    workspaceContextState.resourceReadIdentity = { context, generation: 'generation-b' };
    view.rerender(
      <I18nProvider initial="en">
        <BrandsTab />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('brand-item-acme').querySelector('img')?.getAttribute('src'))
        .toContain('/api/brands/acme/logo');
    });
  });

  it('polls while a brand is extracting and stops once it settles', async () => {
    vi.useFakeTimers();
    fetchBrandsMock.mockResolvedValue([brandSummary('acme', 'extracting')]);
    renderBrandsTab();

    // Initial activation fetch resolves; the extracting brand arms the poll.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchBrandsMock).toHaveBeenCalledTimes(1);

    // The poll fires while extraction is in flight.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(fetchBrandsMock).toHaveBeenCalledTimes(2);

    // Extraction settles to ready — the next poll tick tears the interval down.
    fetchBrandsMock.mockResolvedValue([brandSummary('acme', 'ready')]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    const afterSettle = fetchBrandsMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(fetchBrandsMock).toHaveBeenCalledTimes(afterSettle);
  });

  it('refreshes design systems when a brand extraction project is created', async () => {
    const onDesignSystemsRefresh = vi.fn();
    render(
      <I18nProvider initial="en">
        <BrandsTab onDesignSystemsRefresh={onDesignSystemsRefresh} />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId('brands-new'));
    fireEvent.click(screen.getByTestId('mock-new-brand-created'));

    expect(onDesignSystemsRefresh).toHaveBeenCalledTimes(1);
  });

  it('never uses a provisional read identity for brand extraction mutations', async () => {
    const provisional = {
      workspaceId: 'workspace-provisional',
      workspaceType: 'team',
      workspaceMemberId: 'member-provisional',
      role: 'member',
      memberStatus: 'active',
      lifecycleState: 'active',
      billingState: 'active',
      planId: null,
      providerMode: 'platform_credits',
      seatSummary: { seatLimit: 3, usedSeats: 2, availableSeats: 1, isSeatFull: false },
      permissions: {
        canManageMembers: false,
        canManageBilling: false,
        canInviteMembers: false,
        canManageAutoRecharge: false,
        canShareProjects: true,
        canWriteSyncedFiles: false,
        canViewWorkspaceSettings: false,
        canManageSharedResources: false,
      },
    } satisfies WorkspaceCollabContext;
    workspaceContextState.resourceReadIdentity = {
      context: provisional,
      generation: 'directory-only',
    };

    renderBrandsTab();
    fireEvent.click(await screen.findByTestId('mock-brand-reference'));

    await waitFor(() => {
      expect(runExtractMock).toHaveBeenCalledWith('acme.example', {
        workspaceContext: null,
      });
    });
  });
});
