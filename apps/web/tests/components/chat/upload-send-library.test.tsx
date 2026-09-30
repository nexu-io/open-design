// @vitest-environment jsdom
import type { LibraryAsset } from '@open-design/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ChatComposer } from '../../../src/components/ChatComposer';
import { ANNOTATION_EVENT } from '../../../src/components/PreviewDrawOverlay';
import {
  applyLibraryAsset,
  fetchLibraryAssets,
  uploadProjectFiles,
} from '../../../src/providers/registry';
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
    uploadProjectFiles: vi.fn(),
  };
});

const applyAsset = vi.mocked(applyLibraryAsset);
const fetchAssets = vi.mocked(fetchLibraryAssets);
const upload = vi.mocked(uploadProjectFiles);

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

  it('keeps a selected library asset available while a terminal annotation prepares', async () => {
    const annotationPending = gate();
    upload.mockImplementation(async (_id, files) => {
      await annotationPending.promise;
      const name = files[0]?.name ?? 'annotation.png';
      return {
        uploaded: [{ path: `uploads/${name}`, name, kind: 'image' as const, size: 1 }],
        failed: [],
      };
    });
    applyAsset.mockResolvedValue({ relPath: 'library/library-image.png' });
    const annotationAck = vi.fn();
    render(
      <ChatComposer
        projectId="p1"
        projectFiles={[]}
        streaming={false}
        initialDraft="Keep the library selection"
        onEnsureProject={async () => 'p1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    await flushMounts();

    fireEvent.click(screen.getByTestId('chat-plus-trigger'));
    fireEvent.click(await screen.findByTestId('composer-plus-library'));
    fireEvent.click(await screen.findByTitle('Library image'));

    await act(async () => {
      window.dispatchEvent(new CustomEvent(ANNOTATION_EVENT, {
        detail: {
          file: new File(['x'], 'annotation.png', { type: 'image/png' }),
          action: 'queue',
          note: 'Queued annotation',
          filePath: 'index.html',
          ack: annotationAck,
        },
      }));
      await Promise.resolve();
    });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));

    const confirm = screen.getByTestId('library-picker-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(applyAsset).not.toHaveBeenCalled();
    expect(screen.getByTestId('library-picker')).toBeTruthy();

    await act(async () => {
      annotationPending.open();
      await annotationPending.promise;
    });
    await waitFor(() => expect(annotationAck).toHaveBeenCalledWith({ ok: true }));
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);

    await waitFor(() => expect(applyAsset).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('library-picker')).toBeNull());
  });
});
