// @vitest-environment jsdom

// Red spec for issue #5517: installed registry-backed plugin cards belong to
// the full-page installed-extension detail route. Uninstalled Community cards
// still use the existing install modal because they do not have an installed
// record for PluginDetailView to load.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { InstalledPluginRecordSchema } from '@open-design/contracts';

import { ExtensionsMarketplace } from '../../src/components/PluginsView';
import { MarketplaceView } from '../../src/components/MarketplaceView';
import { PluginDetailView } from '../../src/components/PluginDetailView';
import { I18nProvider } from '../../src/i18n';
import { useRoute } from '../../src/router';

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return { ...actual, useAnalytics: () => ({ track: vi.fn() }) };
});

// Spread the real module — see the note in ExtensionsMarketplace.team-scope.test.tsx.
vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>()),
  useWorkspaceContext: () => ({ context: null, loading: false, refresh: vi.fn() }),
  useWorkspaceBilling: () => null,
}));

vi.mock('../../src/state/projects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/state/projects')>();
  return { ...actual, applyPlugin: vi.fn() };
});

const INSTALLED_OFFICIAL = InstalledPluginRecordSchema.parse({
  id: 'build-test',
  title: 'Build test',
  version: '0.1.0',
  sourceKind: 'bundled',
  source: '/plugins/_official/build-test',
  sourceMarketplaceId: 'official',
  sourceMarketplaceEntryName: 'open-design/build-test',
  trust: 'bundled',
  capabilitiesGranted: [],
  manifest: {
    name: 'build-test',
    title: 'Build test',
    version: '0.1.0',
    description: 'A real installed Official plugin.',
    od: { kind: 'bundle' },
  },
  fsPath: '/plugins/_official/build-test',
  installedAt: 0,
  updatedAt: 0,
});

const MARKETPLACES = [
  {
    id: 'official',
    url: 'https://open-design.ai/marketplace/open-design-marketplace.json',
    trust: 'official',
    manifest: {
      name: 'Open Design Official',
      version: '1.0.0',
      plugins: [
        {
          name: 'open-design/build-test',
          title: 'Build test',
          source: 'github:nexu-io/open-design@main/plugins/_official/build-test',
          version: '0.1.0',
          description: 'A real installed Official plugin.',
        },
      ],
    },
  },
  {
    id: 'community',
    url: 'https://open-design.ai/marketplace/community.json',
    trust: 'restricted',
    manifest: {
      name: 'Community',
      version: '1.0.0',
      plugins: [
        {
          name: 'community/plugin-kit',
          title: 'Community Plugin Kit',
          source: 'github:community/plugin-kit',
          version: '1.0.0',
          description: 'An uninstalled Community plugin.',
        },
      ],
    },
  },
];

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function MarketplaceRouteHarness() {
  const route = useRoute();
  if (route.kind === 'marketplace-detail') {
    return <PluginDetailView pluginId={route.pluginId} />;
  }
  if (route.kind === 'marketplace') return <MarketplaceView />;
  return <ExtensionsMarketplace onCreatePlugin={vi.fn()} onUsePlugin={vi.fn()} />;
}

function renderHarness() {
  return render(
    <I18nProvider initial="en">
      <MarketplaceRouteHarness />
    </I18nProvider>,
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/plugins');
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === `/api/plugins/${INSTALLED_OFFICIAL.id}`) {
      return jsonResponse(INSTALLED_OFFICIAL);
    }
    if (url.startsWith('/api/plugins')) {
      return jsonResponse({ plugins: [INSTALLED_OFFICIAL] });
    }
    if (url.startsWith('/api/marketplaces')) {
      return jsonResponse({ marketplaces: MARKETPLACES });
    }
    if (url === '/api/skills') return jsonResponse({ skills: [] });
    if (url.includes('/api/workspace/')) {
      return jsonResponse({ ids: [], resources: [] });
    }
    return jsonResponse({});
  }) as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ExtensionsMarketplace installed plugin detail entry', () => {
  it('opens a real installed Official card in the full-page PluginDetailView', async () => {
    const { container } = renderHarness();

    fireEvent.click(
      await screen.findByTestId(
        'plugins-card-official:open-design/build-test:0.1.0',
      ),
    );

    expect(await screen.findByTestId('plugin-detail')).toBeTruthy();
    expect(window.location.pathname).toBe('/marketplace/build-test');
    expect(screen.getByRole('heading', { name: 'Build test' })).toBeTruthy();
    expect(container.querySelector('.plugin-details-modal')).toBeNull();
    expect(container.querySelectorAll('.plugin-suite-detail__empty-row')).toHaveLength(3);
    expect(screen.getByTestId('plugin-meta-advanced')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /back to list/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/plugins');
      expect(screen.getByTestId(
        'plugins-card-official:open-design/build-test:0.1.0',
      )).toBeTruthy();
    });
    expect(screen.queryByTestId('plugin-detail')).toBeNull();
  });

  it('keeps an uninstalled Community card in the existing install modal', async () => {
    renderHarness();

    fireEvent.click(
      await screen.findByTestId(
        'plugins-card-community:community/plugin-kit:1.0.0',
      ),
    );

    const modal = await screen.findByTestId('plugins-available-details-modal');
    expect(window.location.pathname).toBe('/plugins');
    expect(screen.queryByTestId('plugin-detail')).toBeNull();
    expect(within(modal).getByText('Community Plugin Kit')).toBeTruthy();
    expect(
      within(modal).getByTestId(
        'plugins-available-details-install-community/plugin-kit',
      ),
    ).toBeTruthy();
  });

  it('returns to the legacy marketplace when that was the detail source', async () => {
    window.history.replaceState(null, '', '/marketplace');
    const { container } = renderHarness();

    fireEvent.click(
      await waitFor(() => {
        const card = container.querySelector<HTMLElement>(
          '[data-plugin-id="build-test"]',
        );
        expect(card).toBeTruthy();
        return card!;
      }),
    );
    expect(await screen.findByTestId('plugin-detail')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /back to list/i }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/marketplace');
      expect(container.querySelector('[data-testid="marketplace-view"]')).toBeTruthy();
    });
  });
});
