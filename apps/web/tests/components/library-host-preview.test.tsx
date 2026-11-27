// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryAsset } from '@open-design/contracts';

const visibility = vi.hoisted(() => ({ inView: false }));
vi.mock('../../src/components/plugins-home/useInView', () => ({
  useInView: () => ({ ref: { current: null }, inView: visibility.inView }),
}));

const fetchLibraryAssets = vi.fn(async (): Promise<LibraryAsset[]> => []);
const fetchLibraryAsset = vi.fn(async (): Promise<LibraryAsset | null> => null);
vi.mock('../../src/providers/registry', () => ({
  fetchLibraryAssets: (...args: unknown[]) => fetchLibraryAssets(...(args as [])),
  fetchLibraryAsset: (...args: unknown[]) => fetchLibraryAsset(...(args as [])),
  libraryAssetRawUrl: (id: string) => `/api/library/assets/${id}/raw`,
  libraryAssetFigmaUrl: (id: string) => `/api/library/assets/${id}/figma`,
  libraryAssetElementUrl: (id: string) => `/api/library/assets/${id}/element`,
  applyLibraryAsset: vi.fn(),
  deleteLibraryAsset: vi.fn(),
  editLibraryAssetAsPage: vi.fn(),
  fetchDesignSystem: vi.fn(),
  fetchDesignSystems: vi.fn(async () => []),
  fetchLibraryAssetAsFile: vi.fn(),
}));

import { LibrarySection } from '../../src/components/LibrarySection';

function makeAsset(over: Partial<LibraryAsset> = {}): LibraryAsset {
  const now = 1_700_000_000_000;
  return {
    id: over.id ?? 'asset-1',
    kind: 'image',
    storage: 'owned',
    capturedAt: now,
    archivedDate: '2024-01-01',
    contentHash: `hash-${over.id ?? 'asset-1'}`,
    tags: [],
    sources: [],
    createdAt: now,
    updatedAt: now,
    sourceTitle: 'A photo',
    ...over,
  };
}


import { LibraryPreviewModal } from '../../src/components/LibraryPreviewModal';
import { isSandboxedPreviewRead } from '@open-design/contracts';

beforeEach(() => {
  visibility.inView = false;
  fetchLibraryAssets.mockReset();
  fetchLibraryAsset.mockReset().mockResolvedValue(null);
  vi.stubGlobal('EventSource', class { addEventListener() {} close() {} });
  vi.stubGlobal('fetch', vi.fn(async () => {
    const response = new Response('<html><head></head><body>Library HTML bytes</body></html>', { headers: { 'content-type': 'text/html' } });
    Object.defineProperty(response, 'url', { value: 'od://app/api/library/assets/asset-1/raw' });
    return response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('keeps library raw bytes outside the opaque API allowlist', () => {
  expect(isSandboxedPreviewRead('GET', '/library/assets/asset-1/raw')).toBe(false);
});

it.each(['html', 'design-system'] as const)('host-loads %s thumbnails only after visibility without enabling scripts', async kind => {
  fetchLibraryAssets.mockResolvedValue([makeAsset({kind})]);
  const view = render(<LibrarySection active onOpenProject={() => {}} />);
  await screen.findByText('A photo');
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).startsWith('/api/library/assets/'))).toBe(false);
  expect(document.querySelector('iframe')).toBeNull();
  visibility.inView = true;
  view.rerender(<LibrarySection active onOpenProject={() => {}} />);
  await waitFor(() => expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain('Library HTML bytes'));
  const frame = document.querySelector('iframe')!;
  expect(frame.hasAttribute('src')).toBe(false);
  expect(frame.getAttribute('sandbox')).toBe('');
  expect(frame.getAttribute('loading')).toBe('lazy');
});

it.each(['html', 'design-system', 'image', 'video'] as const)('host-loads only HTML modal kinds: %s', async kind => {
  render(<LibraryPreviewModal asset={makeAsset({kind})} hasPrev={false} hasNext={false} onPrev={() => {}} onNext={() => {}} onClose={() => {}} onDelete={() => {}} />);
  if (kind === 'html' || kind === 'design-system') {
    await waitFor(() => expect(document.querySelector('iframe')?.getAttribute('srcdoc')).toContain('Library HTML bytes'));
    const frame = document.querySelector('iframe')!;
    expect(frame.hasAttribute('src')).toBe(false);
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
  } else {
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).startsWith('/api/library/assets/'))).toBe(false);
    expect(document.querySelector(kind === 'image' ? 'img' : 'video')?.getAttribute('src')).toBe('/api/library/assets/asset-1/raw');
  }
});
