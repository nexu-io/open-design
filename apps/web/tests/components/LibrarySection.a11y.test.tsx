// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryAsset } from '@open-design/contracts';

vi.mock('../../src/components/plugins-home/useInView', () => ({
  useInView: () => ({ ref: { current: null }, inView: false }),
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

describe('LibrarySection accessibility', () => {
  beforeEach(() => {
    fetchLibraryAssets.mockReset().mockResolvedValue([makeAsset()]);
    fetchLibraryAsset.mockReset().mockResolvedValue(null);
    (globalThis as { EventSource?: unknown }).EventSource = class {
      addEventListener() {}
      close() {}
    };
  });

  afterEach(() => {
    cleanup();
  });

  it('gives the library filter selects accessible names', async () => {
    render(<LibrarySection active onOpenProject={() => {}} />);

    await screen.findByText('A photo');

    expect(screen.getByRole('combobox', { name: 'Filter by kind' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Filter by source' })).toBeTruthy();
  });
});
