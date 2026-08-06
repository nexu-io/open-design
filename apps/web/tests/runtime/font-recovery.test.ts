import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFontRecovery } from '../../src/runtime/font-recovery';

interface FakeFontFace {
  family: string;
  status: string;
}

type FontListener = (event?: Event) => void;

function fakeDocument(faces: FakeFontFace[]): {
  doc: Document;
  added: FakeFontFace[];
  faces: FakeFontFace[];
  dispatchLoadingError: () => void;
} {
  const added: FakeFontFace[] = [];
  const liveFaces = [...faces];
  const listeners = new Map<string, Set<FontListener>>();

  const fonts = {
    forEach: (cb: (face: FakeFontFace) => void) => {
      for (const face of [...liveFaces, ...added]) cb(face);
    },
    add: (face: FakeFontFace) => {
      added.push(face);
    },
    addEventListener: (type: string, listener: FontListener) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: FontListener) => {
      listeners.get(type)?.delete(listener);
    },
  };

  const doc = { fonts } as unknown as Document;

  return {
    doc,
    added,
    faces: liveFaces,
    dispatchLoadingError: () => {
      for (const listener of listeners.get('loadingerror') ?? []) {
        listener();
      }
    },
  };
}

describe('installFontRecovery', () => {
  const loadMock = vi.fn();
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    loadMock.mockReset().mockResolvedValue(undefined);
    fetchMock.mockReset().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'FontFace',
      class {
        family: string;
        status = 'loaded';
        constructor(family: string) {
          this.family = family;
        }
        load = loadMock;
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('re-registers an errored recoverable family from fetched bytes', async () => {
    const { doc, added } = fakeDocument([{ family: 'remixicon', status: 'error' }]);
    const cancel = installFontRecovery(doc);

    await vi.advanceTimersByTimeAsync(0);
    expect(added.map((f) => f.family)).toEqual(['remixicon']);
    expect(fetchMock).toHaveBeenCalledWith('/remixicon.ttf');

    // Later sweeps must not stack duplicate registrations.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(added.filter((f) => f.family === 'remixicon')).toHaveLength(1);
    cancel();
  });

  it('leaves healthy fonts alone', async () => {
    const { doc, added } = fakeDocument([{ family: 'remixicon', status: 'loaded' }]);
    const cancel = installFontRecovery(doc);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(added).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    cancel();
  });

  it('retries on a later sweep after a failed fetch', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('still congested'))
      .mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    const { doc, added } = fakeDocument([{ family: 'remixicon', status: 'error' }]);
    const cancel = installFontRecovery(doc);

    await vi.advanceTimersByTimeAsync(0);
    expect(added).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(4_000);
    expect(added.map((f) => f.family)).toEqual(['remixicon']);
    cancel();
  });

  it('recovers both Albert Sans variants when errored', async () => {
    const { doc, added } = fakeDocument([{ family: 'Albert Sans', status: 'error' }]);
    const cancel = installFontRecovery(doc);

    await vi.advanceTimersByTimeAsync(0);
    expect(added.filter((f) => f.family === 'Albert Sans')).toHaveLength(2);
    cancel();
  });

  it('recovers the four Noto Sans Cyrillic subsets when errored (#6478)', async () => {
    const { doc, added } = fakeDocument([{ family: 'Noto Sans', status: 'error' }]);
    const cancel = installFontRecovery(doc);

    await vi.advanceTimersByTimeAsync(0);
    expect(added.filter((f) => f.family === 'Noto Sans')).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledWith('/fonts/noto-sans-cyrillic-wght-normal.woff2');
    expect(fetchMock).toHaveBeenCalledWith('/fonts/noto-sans-cyrillic-ext-wght-normal.woff2');
    expect(fetchMock).toHaveBeenCalledWith('/fonts/noto-sans-cyrillic-wght-italic.woff2');
    expect(fetchMock).toHaveBeenCalledWith('/fonts/noto-sans-cyrillic-ext-wght-italic.woff2');
    cancel();
  });

  // Regression for #6498 review: Cyrillic-range Noto faces stay unloaded
  // until the first ru glyph request, which may error *after* the timed
  // startup sweeps. loadingerror must still recover them.
  it('recovers Noto faces on a late loadingerror after startup sweeps finished', async () => {
    const { doc, added, faces, dispatchLoadingError } = fakeDocument([
      // Unloaded range-limited face — not yet errored at English startup.
      { family: 'Noto Sans', status: 'unloaded' },
    ]);
    const cancel = installFontRecovery(doc);

    // Drain every scheduled sweep; Noto is still unloaded, so nothing recovers.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(added).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();

    // Locale switch / first Cyrillic paint: Chromium loads then errors the face.
    faces[0]!.status = 'error';
    dispatchLoadingError();
    // loadingerror handler kicks off an async sweep (fetch → load → add).
    await flushMicrotasks();

    expect(added.filter((f) => f.family === 'Noto Sans')).toHaveLength(4);
    expect(fetchMock).toHaveBeenCalledWith('/fonts/noto-sans-cyrillic-wght-normal.woff2');
    cancel();
  });

  it('cancel stops pending sweeps and removes the loadingerror listener', async () => {
    const { doc, added, faces, dispatchLoadingError } = fakeDocument([
      { family: 'Noto Sans', status: 'unloaded' },
    ]);
    const cancel = installFontRecovery(doc);
    cancel();

    await vi.advanceTimersByTimeAsync(60_000);
    faces[0]!.status = 'error';
    dispatchLoadingError();
    await flushMicrotasks();

    expect(added).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/** Drain enough microtasks for recoverFont's await chain to settle. */
async function flushMicrotasks(ticks = 20): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    await Promise.resolve();
  }
}
