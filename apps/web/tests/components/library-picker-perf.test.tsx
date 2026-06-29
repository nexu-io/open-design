// @vitest-environment jsdom

// Performance-hardening coverage for the "Import from library" picker
// (LibraryPicker), used across the chat composer / home hero / design-system
// flow. Two behaviours:
//   - search is debounced, so the (potentially large) client filter runs once
//     per typing pause rather than per keystroke;
//   - image/video thumbnails lazy-mount, so opening the picker does not fire one
//     full-bytes request per asset — a kind glyph holds the box until in view.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryAsset } from '@open-design/contracts';

let lazyInView = true;
vi.mock('../../src/components/plugins-home/useInView', () => ({
  useInView: () => ({ ref: { current: null }, inView: lazyInView }),
}));

const fetchLibraryAssets = vi.fn(async (): Promise<LibraryAsset[]> => []);
vi.mock('../../src/providers/registry', () => ({
  fetchLibraryAssets: (...args: unknown[]) => fetchLibraryAssets(...(args as [])),
  libraryAssetRawUrl: (id: string) => `/raw/${id}`,
}));

import { LibraryPicker } from '../../src/components/LibraryPicker';

let now = 1_700_000_000_000;
function makeAsset(over: Partial<LibraryAsset> = {}): LibraryAsset {
  now += 1000;
  return {
    id: over.id ?? `asset-${now}`,
    kind: 'image',
    storage: 'owned',
    capturedAt: now,
    archivedDate: '2024-01-01',
    contentHash: `hash-${over.id ?? now}`,
    tags: [],
    sources: [],
    createdAt: now,
    updatedAt: now,
    ...over,
  };
}

afterEach(() => {
  cleanup();
});

describe('LibraryPicker debounced search', () => {
  beforeEach(() => {
    lazyInView = true;
    fetchLibraryAssets.mockReset().mockResolvedValue([
      makeAsset({ id: 'alpha', sourceTitle: 'Alpha' }),
      makeAsset({ id: 'beta', sourceTitle: 'Beta' }),
      makeAsset({ id: 'brand-system', kind: 'design-system', sourceTitle: 'Acme Brand System' }),
    ]);
  });

  it('keeps every result on the first keystroke, then narrows after the debounce', async () => {
    render(<LibraryPicker onClose={() => {}} onConfirm={() => {}} />);
    await screen.findByText('Alpha');
    expect(screen.getByText('Beta')).toBeTruthy();

    fireEvent.change(screen.getByTestId('library-picker-search'), { target: { value: 'alp' } });
    // Debounce not yet elapsed — the filter has not applied, both still show.
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Beta')).toBeTruthy();

    // After the debounce window the filter applies once and drops the non-match.
    await waitFor(() => expect(screen.queryByText('Beta')).toBeNull());
    expect(screen.getByText('Alpha')).toBeTruthy();
    // The picker fetches the catalog exactly once — search is client-side.
    expect(fetchLibraryAssets).toHaveBeenCalledTimes(1);
  });

  it('exposes design-system assets as their own picker kind', async () => {
    render(<LibraryPicker onClose={() => {}} onConfirm={() => {}} />);
    await screen.findByText('Acme Brand System');

    fireEvent.click(screen.getByRole('tab', { name: 'Design system' }));

    expect(screen.getByText('Acme Brand System')).toBeTruthy();
    expect(screen.queryByText('Alpha')).toBeNull();
    expect(screen.queryByText('Beta')).toBeNull();
  });
});

describe('LibraryPicker lazy thumbnails', () => {
  beforeEach(() => {
    fetchLibraryAssets.mockReset().mockResolvedValue([
      makeAsset({ id: 'solo', sourceTitle: 'Solo' }),
    ]);
  });

  it('defers the <img> until the card is in view', async () => {
    lazyInView = false;
    render(<LibraryPicker onClose={() => {}} onConfirm={() => {}} />);
    await screen.findByText('Solo');
    expect(document.querySelector('img')).toBeNull();
  });

  it('mounts an async-decoding <img> once the card is in view', async () => {
    lazyInView = true;
    render(<LibraryPicker onClose={() => {}} onConfirm={() => {}} />);
    await screen.findByText('Solo');
    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('/raw/solo');
      expect(img?.getAttribute('decoding')).toBe('async');
    });
  });

  it('shimmers until the in-view <img> finishes loading', async () => {
    lazyInView = true;
    render(<LibraryPicker onClose={() => {}} onConfirm={() => {}} />);
    await screen.findByText('Solo');
    // Same shimmer-until-loaded contract as the Library grid and the clipper
    // image picker: the <img> mounts hidden (`data-loaded="false"`) behind a
    // skeleton until its bytes decode. jsdom never fires `load`, so it stays
    // loading here.
    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('data-loaded')).toBe('false');
    });
  });
});
