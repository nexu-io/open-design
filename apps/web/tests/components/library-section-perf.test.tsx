// @vitest-environment jsdom

// Performance-hardening coverage for the OD Library grid (LibrarySection):
//   - the incremental SSE merge that replaced the per-event full refetch,
//   - the box-select hit-test that now runs against a rect snapshot instead of
//     a querySelectorAll + getBoundingClientRect reflow per mousemove,
//   - the SSE payload parser,
//   - the lazy-mount contract: off-screen cards render a cheap placeholder that
//     still carries the box-select targets (data-asset-card/-id), and only the
//     real <img>/<iframe> thumbnail mounts once a card is in view.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryAsset } from '@open-design/contracts';

// Control lazy-mount visibility per test.
let lazyInView = false;
vi.mock('../../src/components/plugins-home/useInView', () => ({
  useInView: () => ({ ref: { current: null }, inView: lazyInView }),
}));

const fetchLibraryAssets = vi.fn(async (): Promise<LibraryAsset[]> => []);
const fetchLibraryAsset = vi.fn(async (): Promise<LibraryAsset | null> => null);
vi.mock('../../src/providers/registry', () => ({
  fetchLibraryAssets: (...args: unknown[]) => fetchLibraryAssets(...(args as [])),
  fetchLibraryAsset: (...args: unknown[]) => fetchLibraryAsset(...(args as [])),
  libraryAssetRawUrl: (id: string) => `/raw/${id}`,
  applyLibraryAsset: vi.fn(),
  deleteLibraryAsset: vi.fn(),
  editLibraryAssetAsPage: vi.fn(),
  fetchDesignSystem: vi.fn(),
  fetchDesignSystems: vi.fn(async () => []),
  fetchLibraryAssetAsFile: vi.fn(),
}));

import {
  LibrarySection,
  mergeIngestedAssets,
  parseEventAssetId,
  cardIdsInBand,
  snapshotCardRects,
  type CardRect,
} from '../../src/components/LibrarySection';

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

describe('mergeIngestedAssets', () => {
  const a1 = makeAsset({ id: 'a1', sourceTitle: 'One' });
  const a2 = makeAsset({ id: 'a2', sourceTitle: 'Two' });
  const a3 = makeAsset({ id: 'a3', sourceTitle: 'Three' });
  const prev = [a3, a2, a1]; // server order: created_at DESC

  it('refreshes an existing asset in place without reordering (dedup re-ingest)', () => {
    const a2updated = makeAsset({ id: 'a2', sourceTitle: 'Two (enriched)' });
    const next = mergeIngestedAssets(prev, [a2updated]);
    expect(next.map((a) => a.id)).toEqual(['a3', 'a2', 'a1']);
    expect(next[1]).toBe(a2updated);
  });

  it('prepends a genuinely new asset (newest first)', () => {
    const a4 = makeAsset({ id: 'a4', sourceTitle: 'Four' });
    const next = mergeIngestedAssets(prev, [a4]);
    expect(next.map((a) => a.id)).toEqual(['a4', 'a3', 'a2', 'a1']);
  });

  it('prepends multiple new assets latest-first', () => {
    const a4 = makeAsset({ id: 'a4' });
    const a5 = makeAsset({ id: 'a5' });
    // byId insertion order is [a4, a5]; the last event in the burst leads.
    const next = mergeIngestedAssets(prev, [a4, a5]);
    expect(next.map((a) => a.id)).toEqual(['a5', 'a4', 'a3', 'a2', 'a1']);
  });

  it('returns the same array reference when nothing was fetched', () => {
    expect(mergeIngestedAssets(prev, [])).toBe(prev);
  });
});

describe('parseEventAssetId', () => {
  it('extracts assetId from an ingest payload (with or without deduped)', () => {
    expect(parseEventAssetId(JSON.stringify({ assetId: 'x' }))).toBe('x');
    expect(parseEventAssetId(JSON.stringify({ assetId: 'y', deduped: true }))).toBe('y');
  });
  it('returns null for malformed, empty, or non-string payloads', () => {
    expect(parseEventAssetId('not json')).toBeNull();
    expect(parseEventAssetId(JSON.stringify({}))).toBeNull();
    expect(parseEventAssetId(JSON.stringify({ assetId: 42 }))).toBeNull();
    expect(parseEventAssetId(undefined)).toBeNull();
  });
});

describe('cardIdsInBand', () => {
  const rects: CardRect[] = [
    { id: 'a', left: 0, top: 0, right: 100, bottom: 100 },
    { id: 'b', left: 120, top: 0, right: 220, bottom: 100 },
    { id: 'c', left: 0, top: 120, right: 100, bottom: 220 },
  ];

  it('selects only cards whose rect intersects the band', () => {
    // A band over the top-left card only.
    expect(cardIdsInBand(rects, { x: 10, y: 10, w: 30, h: 30 })).toEqual(['a']);
    // A band spanning both top cards.
    expect(cardIdsInBand(rects, { x: 10, y: 10, w: 200, h: 30 })).toEqual(['a', 'b']);
  });

  it('returns nothing for a band in empty space', () => {
    expect(cardIdsInBand(rects, { x: 400, y: 400, w: 50, h: 50 })).toEqual([]);
  });
});

describe('snapshotCardRects', () => {
  it('captures id + viewport bounds for every data-asset-card under the grid', () => {
    const grid = document.createElement('div');
    for (const [id, top] of [
      ['one', 0],
      ['two', 200],
    ] as const) {
      const fig = document.createElement('figure');
      fig.setAttribute('data-asset-card', '');
      fig.dataset.assetId = id;
      fig.getBoundingClientRect = () =>
        ({ left: 0, top, right: 180, bottom: top + 180 }) as DOMRect;
      grid.appendChild(fig);
    }
    const rects = snapshotCardRects(grid);
    expect(rects).toEqual([
      { id: 'one', left: 0, top: 0, right: 180, bottom: 180 },
      { id: 'two', left: 0, top: 200, right: 180, bottom: 380 },
    ]);
  });

  it('returns an empty array for a null grid', () => {
    expect(snapshotCardRects(null)).toEqual([]);
  });
});

describe('LibrarySection lazy-mount contract', () => {
  beforeEach(() => {
    lazyInView = false;
    fetchLibraryAssets.mockReset().mockResolvedValue([
      makeAsset({ id: 'img-1', kind: 'image', sourceTitle: 'A photo' }),
      makeAsset({ id: 'html-1', kind: 'html', sourceTitle: 'A page' }),
      makeAsset({ id: 'ds-1', kind: 'design-system', sourceTitle: 'A design system' }),
    ]);
    fetchLibraryAsset.mockReset().mockResolvedValue(null);
    // The SSE effect's `new EventSource` is wrapped in try/catch; a no-op stub
    // keeps it quiet without driving live events here.
    (globalThis as { EventSource?: unknown }).EventSource = class {
      addEventListener() {}
      close() {}
    };
  });
  afterEach(() => {
    cleanup();
  });

  it('renders placeholder cards (no img/iframe) that keep box-select targets while off-screen', async () => {
    render(<LibrarySection active onOpenProject={() => {}} />);
    await screen.findByText('A photo');
    // Both cards are present as box-select targets even though nothing is in view.
    expect(document.querySelectorAll('[data-asset-card]')).toHaveLength(3);
    document.querySelectorAll('[data-asset-card]').forEach((el) => {
      expect((el as HTMLElement).dataset.assetId).toBeTruthy();
    });
    // The heavy thumbnails are deferred.
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('mounts the real <img> thumbnail once the card is in view', async () => {
    lazyInView = true;
    render(<LibrarySection active onOpenProject={() => {}} />);
    await screen.findByText('A photo');
    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('/raw/img-1');
    });
  });

  it('mounts html and design-system iframe thumbnails once cards are in view', async () => {
    lazyInView = true;
    render(<LibrarySection active onOpenProject={() => {}} />);
    await screen.findByText('A design system');
    await waitFor(() => {
      const srcs = [...document.querySelectorAll('iframe')].map((frame) => frame.getAttribute('src'));
      expect(srcs).toContain('/raw/html-1');
      expect(srcs).toContain('/raw/ds-1');
    });
  });

  it('holds the in-view thumbnail behind a loading skeleton until its bytes land', async () => {
    lazyInView = true;
    render(<LibrarySection active onOpenProject={() => {}} />);
    await screen.findByText('A photo');
    // The shimmer-until-loaded contract (mirrors the clipper image picker): the
    // <img> mounts hidden (`data-loaded="false"`) so the skeleton — not a
    // half-painted image — is what shows while the bytes are in flight. jsdom
    // never fires `load`, so the thumbnail stays in the loading state here.
    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('data-loaded')).toBe('false');
    });
  });
});
