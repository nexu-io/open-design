// @vitest-environment jsdom
import type { LibraryAsset } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ChatComposer } from '../../../src/components/ChatComposer';
import { applyLibraryAsset, fetchLibraryAssets } from '../../../src/providers/registry';
import { flushMounts, pressEnter } from '../../helpers/lexical-composer';

vi.mock('../../../src/features/libraryUi', () => ({ LIBRARY_UI_VISIBLE: true }));
vi.mock('../../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../../src/providers/registry')>(
    '../../../src/providers/registry',
  );
  return {
    ...actual,
    applyLibraryAsset: vi.fn(),
    fetchLibraryAssets: vi.fn(),
  };
});

const applyAsset = vi.mocked(applyLibraryAsset);
const fetchAssets = vi.mocked(fetchLibraryAssets);

const asset = {
  id: 'asset-1',
  kind: 'image',
  storage: 'owned',
  sourceTitle: 'Library image',
  capturedAt: 1,
  archivedDate: '2026-09-08',
  contentHash: 'hash-1',
  tags: [],
  sources: [],
  createdAt: 1,
  updatedAt: 1,
} satisfies LibraryAsset;

function gate() {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((open) => {
    resolve = open;
  });
  return { promise, open: () => resolve?.() };
}

beforeEach(() => {
  fetchAssets.mockResolvedValue([asset]);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('library attachment preparation ownership', () => {
  it('blocks Enter while a non-card library operation is active and recovers when it settles', async () => {
    const pending = gate();
    applyAsset.mockImplementation(async () => {
      await pending.promise;
      return { relPath: 'library/library-image.png' };
    });
    const onSend = vi.fn();
    render(
      <ChatComposer
        projectId="p1"
        projectFiles={[]}
        streaming={false}
        initialDraft="Use the library image"
        onEnsureProject={async () => 'p1'}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );
    await flushMounts();

    fireEvent.click(screen.getByTestId('chat-plus-trigger'));
    fireEvent.click(await screen.findByTestId('composer-plus-library'));
    fireEvent.click(await screen.findByTitle('Library image'));
    fireEvent.click(screen.getByTestId('library-picker-confirm'));
    await waitFor(() => expect(applyAsset).toHaveBeenCalledTimes(1));

    expect((screen.getByTestId('chat-send') as HTMLButtonElement).disabled).toBe(true);
    pressEnter();
    expect(onSend).not.toHaveBeenCalled();

    await act(async () => {
      pending.open();
      await pending.promise;
    });
    await waitFor(() => expect(screen.queryByTestId('library-picker')).toBeNull());
    await waitFor(() => expect((screen.getByTestId('chat-send') as HTMLButtonElement).disabled).toBe(false));
    pressEnter();

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0]?.[1]).toEqual([
      expect.objectContaining({ path: 'library/library-image.png', name: 'Library image' }),
    ]);
  });
});
