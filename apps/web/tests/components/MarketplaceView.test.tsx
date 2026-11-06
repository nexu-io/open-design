// @vitest-environment jsdom

// Plan G4 — MarketplaceView jsdom smoke.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MarketplaceView } from '../../src/components/MarketplaceView';

const PLUGIN_ROW = {
  id: 'sample-plugin',
  title: 'Sample Plugin',
  version: '1.0.0',
  trust: 'restricted' as const,
  sourceKind: 'local' as const,
  source: '/tmp/sample',
  manifest: { description: 'A fixture' },
};

const MARKETPLACE_ROW = {
  id: 'mp-1',
  url: 'https://example.com/marketplace.json',
  trust: 'restricted',
  manifest: {
    name: 'Example marketplace',
    plugins: [{ name: 'sample-plugin', source: 'github:open-design/sample-plugin' }],
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (url) => {
    if (url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [PLUGIN_ROW] }), { status: 200 });
    }
    if (url === '/api/marketplaces') {
      return new Response(JSON.stringify({ marketplaces: [MARKETPLACE_ROW] }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('MarketplaceView', () => {
  it('renders the installed plugins as cards and the configured catalogs', async () => {
    render(<MarketplaceView />);
    await waitFor(() => screen.getByTestId('marketplace-grid'));
    expect(screen.getByText('Sample Plugin')).toBeTruthy();
    expect(screen.getByText('A fixture')).toBeTruthy();
    expect(screen.getByText('Example marketplace')).toBeTruthy();
    expect(screen.getByText(/1 plugin\(s\)/)).toBeTruthy();
  });

  it('filters by trust tier when the user clicks Trusted', async () => {
    render(<MarketplaceView />);
    await waitFor(() => screen.getByText('Sample Plugin'));
    const trustedFilter = screen.getByText('Trusted', { selector: 'button' });
    trustedFilter.click();
    await waitFor(() => expect(screen.queryByText('Sample Plugin')).toBeNull());
    expect(
      screen.getByText(/No plugins installed yet|No plugins/, { exact: false }),
    ).toBeTruthy();
  });
});
