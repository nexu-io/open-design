import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installFontRecovery } from '../../src/runtime/font-recovery';

interface FakeFontFace {
  family: string;
  status: string;
}

function fakeDocument(faces: FakeFontFace[]): { doc: Document; added: FakeFontFace[] } {
  const added: FakeFontFace[] = [];
  const doc = {
    fonts: {
      forEach: (cb: (face: FakeFontFace) => void) => {
        for (const face of [...faces, ...added]) cb(face);
      },
      add: (face: FakeFontFace) => {
        added.push(face);
      },
    },
  } as unknown as Document;
  return { doc, added };
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

  it('cancel stops pending sweeps', async () => {
    const { doc, added } = fakeDocument([{ family: 'remixicon', status: 'error' }]);
    const cancel = installFontRecovery(doc);
    cancel();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(added).toHaveLength(0);
  });
});
