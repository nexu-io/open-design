// @vitest-environment jsdom
//
// Unit tests for the saved-memories hook. Transport is the fake port; the
// runtime coordination (flash pill, config hydrate, editor open/close) is a set
// of spies, so we assert the hook fires the right cross-boundary callbacks
// without pulling in the orchestrator or the DOM.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  MemoryEntry,
  MemoryEntrySummary,
  MemoryListResponse,
  MemoryTreeNode,
} from '@open-design/contracts';

import {
  useMemoryEntries,
  type MemoryEntriesCoordination,
} from '../../../src/features/memory/hooks/useMemoryEntries.hooks';
import type { MemoryEntriesPort } from '../../../src/features/memory/ports';

function summary(id: string, over: Partial<MemoryEntrySummary> = {}): MemoryEntrySummary {
  return {
    id,
    name: `name-${id}`,
    description: `desc-${id}`,
    type: 'user',
    updatedAt: 0,
    ...over,
  };
}

function listResponse(over: Partial<MemoryListResponse> = {}): MemoryListResponse {
  return {
    enabled: true,
    chatExtractionEnabled: true,
    profileEnabled: true,
    rewriteEnabled: true,
    verifyEnabled: true,
    rootDir: '/memories',
    index: '- [name-a](a.md)',
    entries: [summary('a'), summary('b', { type: 'project' })],
    extraction: null,
    ...over,
  };
}

function makePort(over: Partial<MemoryEntriesPort> = {}): MemoryEntriesPort {
  return {
    fetchMemoryList: vi.fn(async () => listResponse()),
    fetchMemoryTree: vi.fn(async () => [] as MemoryTreeNode[]),
    fetchMemoryEntry: vi.fn(async () => null),
    saveMemoryEntry: vi.fn(async () => null),
    deleteMemoryEntry: vi.fn(async () => true),
    saveMemoryIndex: vi.fn(async () => true),
    ...over,
  };
}

function makeCoord(over: Partial<MemoryEntriesCoordination> = {}): MemoryEntriesCoordination {
  return {
    fireFlash: vi.fn(),
    captureConfigHydrationRevision: vi.fn(() => 0),
    hydrateConfig: vi.fn(),
    openEditor: vi.fn(),
    closeEditor: vi.fn(),
    ...over,
  };
}

function savedEntry(over: Partial<MemoryEntry> = {}): MemoryEntry {
  return { ...summary('saved'), body: 'body', ...over };
}

/** A promise plus its own resolve/reject, so a test can control exactly when and how fetchMemoryEntry() settles. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useMemoryEntries — reload + filter', () => {
  it('reload hydrates config from the shared GET and fills list state', async () => {
    const coord = makeCoord();
    const list = listResponse();
    const port = makePort({ fetchMemoryList: vi.fn(async () => list) });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    await act(async () => {
      await result.current.reload();
    });

    expect(coord.hydrateConfig).toHaveBeenCalledWith(list, 0);
    expect(result.current.rootDir).toBe('/memories');
    expect(result.current.index).toBe('- [name-a](a.md)');
    expect(result.current.entries.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('keeps the last confirmed list and surfaces an error when the list fetch rejects', async () => {
    const coord = makeCoord();
    const list = listResponse();
    const port = makePort({
      fetchMemoryList: vi.fn(async () => list),
    });
    const { result } = renderHook(() => useMemoryEntries(port, coord));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.entries.map((e) => e.id)).toEqual(['a', 'b']);

    (port.fetchMemoryList as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await result.current.reload();
    });

    // The prior confirmed entries survive; the failure surfaces as loadError
    // instead of being papered over with an invented empty list.
    expect(result.current.entries.map((e) => e.id)).toEqual(['a', 'b']);
    expect(result.current.loadError).toMatch(/couldn't be loaded/);
  });

  it('filters entries by the active type filter', async () => {
    const { result } = renderHook(() => useMemoryEntries(makePort(), makeCoord()));
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.filtered).toHaveLength(2);
    act(() => result.current.setFilter('project'));
    expect(result.current.filtered.map((e) => e.id)).toEqual(['b']);
  });

  it('ignores a stale reload() that resolves after a newer reload() already committed', async () => {
    const coord = makeCoord();
    const forA = deferred<MemoryListResponse>();
    const forB = deferred<MemoryListResponse>();
    const fetchMemoryList = vi.fn().mockReturnValueOnce(forA.promise).mockReturnValueOnce(forB.promise);
    const port = makePort({ fetchMemoryList, fetchMemoryTree: vi.fn(async () => []) });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    let reloadA!: Promise<void>;
    act(() => {
      reloadA = result.current.reload();
    });
    let reloadB!: Promise<void>;
    act(() => {
      reloadB = result.current.reload();
    });

    // The newer request (B) resolves first and commits.
    await act(async () => {
      forB.resolve(listResponse({ rootDir: '/memories-b', entries: [summary('b-only')] }));
      await reloadB;
    });
    expect(result.current.rootDir).toBe('/memories-b');
    expect(coord.hydrateConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ rootDir: '/memories-b' }),
      0,
    );

    // The abandoned older request (A) resolves late; it must not overwrite the
    // newer snapshot or re-hydrate the config flags off stale data.
    await act(async () => {
      forA.resolve(listResponse({ rootDir: '/memories-a', entries: [summary('a-only')] }));
      await reloadA;
    });
    expect(result.current.rootDir).toBe('/memories-b');
    expect(result.current.entries.map((e) => e.id)).toEqual(['b-only']);
    expect(coord.hydrateConfig).toHaveBeenLastCalledWith(
      expect.objectContaining({ rootDir: '/memories-b' }),
      0,
    );
  });

  it('ignores a stale reload() that REJECTS after a newer reload() already committed successfully', async () => {
    const coord = makeCoord();
    const forA = deferred<MemoryListResponse>();
    const forB = deferred<MemoryListResponse>();
    const fetchMemoryList = vi.fn().mockReturnValueOnce(forA.promise).mockReturnValueOnce(forB.promise);
    const port = makePort({ fetchMemoryList, fetchMemoryTree: vi.fn(async () => []) });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    let reloadA!: Promise<void>;
    act(() => {
      reloadA = result.current.reload();
    });
    let reloadB!: Promise<void>;
    act(() => {
      reloadB = result.current.reload();
    });

    // The newer request (B) resolves first and commits successfully.
    await act(async () => {
      forB.resolve(listResponse({ rootDir: '/memories-b', entries: [summary('b-only')] }));
      await reloadB;
    });
    expect(result.current.loadError).toBeNull();

    // The abandoned older request (A) REJECTS late — its failure is stale
    // and must not clobber the newer, already-confirmed success with a
    // loadError.
    await act(async () => {
      forA.reject(new Error('offline'));
      await reloadA;
    });
    expect(result.current.loadError).toBeNull();
    expect(result.current.rootDir).toBe('/memories-b');
  });
});

describe('useMemoryEntries — create / delete / index', () => {
  it('onSave for a new entry saves, reloads, closes the editor, and flashes "created"', async () => {
    const coord = makeCoord();
    const port = makePort({ saveMemoryEntry: vi.fn(async () => savedEntry()) });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    act(() => result.current.startNew());
    act(() => result.current.setEditing({ name: 'Fresh', description: '', type: 'user', body: 'hi' }));
    await act(async () => {
      await result.current.onSave();
    });

    expect(port.saveMemoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fresh', body: 'hi' }),
    );
    expect(port.fetchMemoryList).toHaveBeenCalled(); // reload
    expect(coord.closeEditor).toHaveBeenCalled();
    expect(coord.fireFlash).toHaveBeenCalledWith('created');
  });

  it('onSave for an EXISTING entry saves, reloads, closes the editor, and flashes "saved"', async () => {
    const coord = makeCoord();
    const port = makePort({ saveMemoryEntry: vi.fn(async () => savedEntry()) });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    act(() =>
      result.current.setEditing({ id: 'existing', name: 'Edited', description: '', type: 'user', body: 'hi' }),
    );
    await act(async () => {
      await result.current.onSave();
    });

    expect(port.saveMemoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'existing', name: 'Edited' }),
    );
    expect(coord.closeEditor).toHaveBeenCalled();
    expect(coord.fireFlash).toHaveBeenCalledWith('saved');
  });

  it('onSave is a no-op when the name is blank', async () => {
    const coord = makeCoord();
    const port = makePort();
    const { result } = renderHook(() => useMemoryEntries(port, coord));
    act(() => result.current.startNew());
    act(() => result.current.setEditing({ name: '   ', description: '', type: 'user', body: '' }));

    await act(async () => {
      await result.current.onSave();
    });

    expect(port.saveMemoryEntry).not.toHaveBeenCalled();
    expect(coord.fireFlash).not.toHaveBeenCalled();
  });

  it('onDelete removes via the port, reloads, and flashes "deleted"', async () => {
    const coord = makeCoord();
    const port = makePort({ deleteMemoryEntry: vi.fn(async () => true) });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    await act(async () => {
      await result.current.onDelete('a');
    });

    expect(port.deleteMemoryEntry).toHaveBeenCalledWith('a');
    expect(coord.fireFlash).toHaveBeenCalledWith('deleted');
  });

  it('onSaveIndex writes the draft and flashes "indexSaved"', async () => {
    const coord = makeCoord();
    const port = makePort({ saveMemoryIndex: vi.fn(async () => true) });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    act(() => result.current.setIndexDraft('- [new](new.md)'));
    await act(async () => {
      await result.current.onSaveIndex();
    });

    expect(port.saveMemoryIndex).toHaveBeenCalledWith('- [new](new.md)');
    expect(result.current.index).toBe('- [new](new.md)');
    expect(coord.fireFlash).toHaveBeenCalledWith('indexSaved');
  });

  it('does not discard a newer unsaved index edit made while an earlier save is still in flight', async () => {
    const coord = makeCoord();
    const firstSave = deferred<boolean>();
    const port = makePort({ saveMemoryIndex: vi.fn().mockReturnValueOnce(firstSave.promise) });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    act(() => result.current.setIndexDraft('draft A'));
    let saveA!: Promise<void>;
    act(() => {
      saveA = result.current.onSaveIndex();
    });

    // The user keeps typing while A's save is still pending.
    act(() => result.current.setIndexDraft('draft B'));

    await act(async () => {
      firstSave.resolve(true);
      await saveA;
    });

    // A's confirmed value lands in `index`, but the newer, still-unsaved
    // draft B must survive — not be silently cleared by A's stale closure.
    expect(result.current.index).toBe('draft A');
    expect(result.current.indexDraft).toBe('draft B');
  });

  it('onSaveIndex is a no-op with no draft, and skips the flash when the write fails', async () => {
    const coord = makeCoord();
    const port = makePort({ saveMemoryIndex: vi.fn(async () => false) });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    // No draft → early return, port untouched.
    await act(async () => {
      await result.current.onSaveIndex();
    });
    expect(port.saveMemoryIndex).not.toHaveBeenCalled();

    // Draft present but the write fails → no index update, no flash.
    act(() => result.current.setIndexDraft('draft'));
    await act(async () => {
      await result.current.onSaveIndex();
    });
    expect(port.saveMemoryIndex).toHaveBeenCalled();
    expect(result.current.indexDraft).toBe('draft');
    expect(coord.fireFlash).not.toHaveBeenCalled();
  });

  it('onSave and onDelete skip their side effects when the port reports failure', async () => {
    const coord = makeCoord();
    const port = makePort({
      saveMemoryEntry: vi.fn(async () => null),
      deleteMemoryEntry: vi.fn(async () => false),
    });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    act(() => result.current.setEditing({ name: 'X', description: '', type: 'user', body: '' }));
    await act(async () => {
      await result.current.onSave();
    });
    expect(coord.closeEditor).not.toHaveBeenCalled();
    expect(coord.fireFlash).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.onDelete('a');
    });
    expect(coord.fireFlash).not.toHaveBeenCalled();
  });

  it('onSave, onDelete, and onSaveIndex surface a load error instead of an unhandled rejection when the port throws', async () => {
    const coord = makeCoord();
    const port = makePort({
      saveMemoryEntry: vi.fn(async () => {
        throw new Error('save network failure');
      }),
      deleteMemoryEntry: vi.fn(async () => {
        throw new Error('delete network failure');
      }),
      saveMemoryIndex: vi.fn(async () => {
        throw new Error('index network failure');
      }),
    });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    act(() => result.current.setEditing({ name: 'X', description: '', type: 'user', body: '' }));
    await expect(act(async () => {
      await result.current.onSave();
    })).resolves.toBeUndefined();
    expect(result.current.loadError).toMatch(/couldn't be loaded/);
    expect(coord.fireFlash).not.toHaveBeenCalled();

    await expect(act(async () => {
      await result.current.onDelete('a');
    })).resolves.toBeUndefined();
    expect(result.current.loadError).toMatch(/couldn't be loaded/);

    act(() => result.current.setIndexDraft('draft'));
    await expect(act(async () => {
      await result.current.onSaveIndex();
    })).resolves.toBeUndefined();
    expect(result.current.loadError).toMatch(/couldn't be loaded/);
  });
});

describe('useMemoryEntries — preview / edit / copy / tree', () => {
  it('opens a preview (fetching the body) then toggles it closed on the same id', async () => {
    const port = makePort({ fetchMemoryEntry: vi.fn(async () => savedEntry({ body: 'the body' })) });
    const { result } = renderHook(() => useMemoryEntries(port, makeCoord()));

    await act(async () => {
      await result.current.openPreview('a');
    });
    expect(result.current.previewId).toBe('a');
    expect(result.current.previewBody).toBe('the body');

    await act(async () => {
      await result.current.openPreview('a');
    });
    expect(result.current.previewId).toBeNull();
    expect(result.current.previewBody).toBeNull();
  });

  it('defaults the preview body to empty string when the entry is missing (a 404 is not a failure)', async () => {
    const port = makePort({ fetchMemoryEntry: vi.fn(async () => null) });
    const { result } = renderHook(() => useMemoryEntries(port, makeCoord()));
    await act(async () => {
      await result.current.openPreview('gone');
    });
    expect(result.current.previewBody).toBe('');
    expect(result.current.loadError).toBeNull();
  });

  it('surfaces a failed preview read as loadError instead of rendering an empty preview', async () => {
    const port = makePort({
      fetchMemoryEntry: vi.fn(async () => {
        throw new Error('Memory entry request failed (500)');
      }),
    });
    const { result } = renderHook(() => useMemoryEntries(port, makeCoord()));
    await act(async () => {
      await result.current.openPreview('a');
    });

    // The preview is reset (not stuck loading, not an invented empty body) and
    // the failure is explicit.
    expect(result.current.previewId).toBeNull();
    expect(result.current.previewBody).toBeNull();
    expect(result.current.loadError).toMatch(/couldn't be loaded/);
  });

  it('surfaces a failed edit read as loadError instead of a silent no-op', async () => {
    const coord = makeCoord();
    const port = makePort({
      fetchMemoryEntry: vi.fn(async () => {
        throw new Error('Memory entry request failed (503)');
      }),
    });
    const { result } = renderHook(() => useMemoryEntries(port, coord));
    await act(async () => {
      await result.current.startEdit('a');
    });

    expect(coord.openEditor).not.toHaveBeenCalled();
    expect(result.current.editing).toBeNull();
    expect(result.current.loadError).toMatch(/couldn't be loaded/);
  });

  it('clears a failed-read banner when a current preview or edit retry succeeds', async () => {
    const coord = makeCoord();
    const port = makePort({
      fetchMemoryEntry: vi.fn()
        .mockRejectedValueOnce(new Error('preview failed'))
        .mockResolvedValueOnce(savedEntry({ id: 'preview', body: 'preview body' }))
        .mockRejectedValueOnce(new Error('edit failed'))
        .mockResolvedValueOnce(savedEntry({ id: 'edit', name: 'Edit me' })),
    });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    await act(async () => {
      await result.current.openPreview('preview');
    });
    expect(result.current.loadError).toMatch(/couldn't be loaded/);

    await act(async () => {
      await result.current.openPreview('preview');
    });
    expect(result.current.previewBody).toBe('preview body');
    expect(result.current.loadError).toBeNull();

    await act(async () => {
      await result.current.startEdit('edit');
    });
    expect(result.current.loadError).toMatch(/couldn't be loaded/);

    await act(async () => {
      await result.current.startEdit('edit');
    });
    expect(result.current.editing?.name).toBe('Edit me');
    expect(result.current.loadError).toBeNull();
  });

  it("ignores a stale openPreview() failure once a newer preview took over", async () => {
    const forA = deferred<MemoryEntry | null>();
    const forB = deferred<MemoryEntry | null>();
    const fetchMemoryEntry = vi.fn((id: string) => (id === 'a' ? forA.promise : forB.promise));
    const port = makePort({ fetchMemoryEntry });
    const { result } = renderHook(() => useMemoryEntries(port, makeCoord()));

    let openA!: Promise<void>;
    let openB!: Promise<void>;
    act(() => {
      openA = result.current.openPreview('a');
    });
    act(() => {
      openB = result.current.openPreview('b');
    });

    await act(async () => {
      forB.resolve(savedEntry({ id: 'b', body: 'body b' }));
      await openB;
    });
    await act(async () => {
      forA.reject(new Error('Memory entry request failed (500)'));
      await openA;
    });

    // The abandoned request's failure must not clobber the newer preview or
    // raise an error the user's current action never hit.
    expect(result.current.previewId).toBe('b');
    expect(result.current.previewBody).toBe('body b');
    expect(result.current.loadError).toBeNull();
  });

  it("ignores a stale startEdit() failure once a newer edit took over", async () => {
    const forA = deferred<MemoryEntry | null>();
    const forB = deferred<MemoryEntry | null>();
    const fetchMemoryEntry = vi.fn((id: string) => (id === 'a' ? forA.promise : forB.promise));
    const port = makePort({ fetchMemoryEntry });
    const { result } = renderHook(() => useMemoryEntries(port, makeCoord()));

    let editA!: Promise<void>;
    let editB!: Promise<void>;
    act(() => {
      editA = result.current.startEdit('a');
    });
    act(() => {
      editB = result.current.startEdit('b');
    });

    await act(async () => {
      forB.resolve(savedEntry({ id: 'b', name: 'Entry B' }));
      await editB;
    });
    await act(async () => {
      forA.reject(new Error('Memory entry request failed (500)'));
      await editA;
    });

    expect(result.current.editing?.id).toBe('b');
    expect(result.current.loadError).toBeNull();
  });

  it('ignores a stale openPreview() resolution when the user already moved on to a newer id', async () => {
    const forA = deferred<MemoryEntry | null>();
    const forB = deferred<MemoryEntry | null>();
    const fetchMemoryEntry = vi.fn((id: string) => (id === 'a' ? forA.promise : forB.promise));
    const port = makePort({ fetchMemoryEntry });
    const { result } = renderHook(() => useMemoryEntries(port, makeCoord()));

    let openA!: Promise<void>;
    let openB!: Promise<void>;
    act(() => {
      openA = result.current.openPreview('a');
    });
    act(() => {
      openB = result.current.openPreview('b');
    });
    expect(result.current.previewId).toBe('b');

    // The abandoned request for 'a' resolves AFTER the newer request for 'b'.
    await act(async () => {
      forB.resolve(savedEntry({ id: 'b', body: 'body b' }));
      await openB;
    });
    expect(result.current.previewBody).toBe('body b');

    await act(async () => {
      forA.resolve(savedEntry({ id: 'a', body: 'body a' }));
      await openA;
    });
    // The stale 'a' response must not overwrite the current 'b' preview.
    expect(result.current.previewId).toBe('b');
    expect(result.current.previewBody).toBe('body b');
  });

  it('ignores a stale startEdit() resolution when the user already moved on to a newer id', async () => {
    const coord = makeCoord();
    const forA = deferred<MemoryEntry | null>();
    const forB = deferred<MemoryEntry | null>();
    const fetchMemoryEntry = vi.fn((id: string) => (id === 'a' ? forA.promise : forB.promise));
    const port = makePort({ fetchMemoryEntry });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    let editA!: Promise<void>;
    let editB!: Promise<void>;
    act(() => {
      editA = result.current.startEdit('a');
    });
    act(() => {
      editB = result.current.startEdit('b');
    });

    await act(async () => {
      forB.resolve(savedEntry({ id: 'b', name: 'Entry B' }));
      await editB;
    });
    expect(result.current.editing?.id).toBe('b');

    await act(async () => {
      forA.resolve(savedEntry({ id: 'a', name: 'Entry A' }));
      await editA;
    });
    // The stale 'a' response must not clobber the newer 'b' draft.
    expect(result.current.editing?.id).toBe('b');
  });

  it('ignores a stale openPreview() resolution when the SAME id is closed then reopened before it settles', async () => {
    const first = deferred<MemoryEntry | null>();
    const second = deferred<MemoryEntry | null>();
    const fetchMemoryEntry = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const port = makePort({ fetchMemoryEntry });
    const { result } = renderHook(() => useMemoryEntries(port, makeCoord()));

    let openFirst!: Promise<void>;
    act(() => {
      openFirst = result.current.openPreview('a');
    });
    // Close before the first request settles (previewId === 'a' toggles it off).
    await act(async () => {
      await result.current.openPreview('a');
    });
    let openSecond!: Promise<void>;
    act(() => {
      openSecond = result.current.openPreview('a');
    });

    // The abandoned first request resolves after the reopen.
    await act(async () => {
      first.resolve(savedEntry({ id: 'a', body: 'stale body' }));
      await openFirst;
    });
    expect(result.current.previewBody).toBeNull(); // still awaiting the second request

    await act(async () => {
      second.resolve(savedEntry({ id: 'a', body: 'fresh body' }));
      await openSecond;
    });
    expect(result.current.previewBody).toBe('fresh body');
  });

  it('ignores a stale startEdit() resolution when the SAME id is cancelled then restarted before it settles', async () => {
    const first = deferred<MemoryEntry | null>();
    const second = deferred<MemoryEntry | null>();
    const fetchMemoryEntry = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const port = makePort({ fetchMemoryEntry });
    const { result } = renderHook(() => useMemoryEntries(port, makeCoord()));

    let editFirst!: Promise<void>;
    act(() => {
      editFirst = result.current.startEdit('a');
    });
    act(() => result.current.cancelEdit());
    let editSecond!: Promise<void>;
    act(() => {
      editSecond = result.current.startEdit('a');
    });

    await act(async () => {
      first.resolve(savedEntry({ id: 'a', name: 'Stale name' }));
      await editFirst;
    });
    expect(result.current.editing).toBeNull(); // still awaiting the second request

    await act(async () => {
      second.resolve(savedEntry({ id: 'a', name: 'Fresh name' }));
      await editSecond;
    });
    expect(result.current.editing?.name).toBe('Fresh name');
  });

  it('startEdit opens the editor for a found entry and no-ops when missing', async () => {
    const coord = makeCoord();
    const port = makePort({ fetchMemoryEntry: vi.fn(async () => null) });
    const { result } = renderHook(() => useMemoryEntries(port, coord));

    await act(async () => {
      await result.current.startEdit('missing');
    });
    expect(coord.openEditor).not.toHaveBeenCalled();
    expect(result.current.editing).toBeNull();
    expect(result.current.loadError).toBeNull(); // a 404 is a no-op, not a failure

    (port.fetchMemoryEntry as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      savedEntry({ id: 'a', name: 'Edit me' }),
    );
    await act(async () => {
      await result.current.startEdit('a');
    });
    expect(coord.openEditor).toHaveBeenCalled();
    expect(result.current.editing?.name).toBe('Edit me');
  });

  it('onSave is a no-op when there is no draft at all', async () => {
    const port = makePort();
    const { result } = renderHook(() => useMemoryEntries(port, makeCoord()));
    // editing is null (no startNew / setEditing) → the guard returns early.
    await act(async () => {
      await result.current.onSave();
    });
    expect(port.saveMemoryEntry).not.toHaveBeenCalled();
  });

  it('cancelEdit clears the draft', () => {
    const { result } = renderHook(() => useMemoryEntries(makePort(), makeCoord()));
    act(() => result.current.startNew());
    expect(result.current.editing).not.toBeNull();
    act(() => result.current.cancelEdit());
    expect(result.current.editing).toBeNull();
  });

  it('onCopyPath copies the root dir and flashes, but no-ops without one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const coord = makeCoord();
    const { result } = renderHook(() => useMemoryEntries(makePort(), coord));

    // Before reload rootDir is '' → early return.
    await act(async () => {
      await result.current.onCopyPath();
    });
    expect(writeText).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.reload();
    });
    await act(async () => {
      await result.current.onCopyPath();
    });
    expect(writeText).toHaveBeenCalledWith('/memories');
    expect(coord.fireFlash).toHaveBeenCalledWith('pathCopied');
  });

  it('groups tree entries under their parent folder, ignoring parentless entries', async () => {
    const tree: MemoryTreeNode[] = [
      { id: 'f1', parentId: null, path: 'f1/', name: 'f1', kind: 'folder', scope: 'global', sourcePacketIds: [], proposalIds: [], createdAt: 't', updatedAt: 't' },
      { id: 'c1', parentId: 'f1', path: 'f1/c1', name: 'c1', kind: 'entry', scope: 'global', sourcePacketIds: [], proposalIds: [], createdAt: 't', updatedAt: 't' },
      { id: 'orphan', parentId: null, path: 'orphan', name: 'orphan', kind: 'entry', scope: 'global', sourcePacketIds: [], proposalIds: [], createdAt: 't', updatedAt: 't' },
    ];
    const port = makePort({ fetchMemoryTree: vi.fn(async () => tree) });
    const { result } = renderHook(() => useMemoryEntries(port, makeCoord()));
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.treeFolders.map((f) => f.id)).toEqual(['f1']);
    expect(result.current.treeChildren.get('f1')?.map((c) => c.id)).toEqual(['c1']);
  });
});
