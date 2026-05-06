import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  pushRecent,
  readRecents,
  RECENTS_LIMIT,
} from '../src/quickSwitcherRecents';

// Tiny in-memory localStorage stub. Vitest runs in a node env (per
// vitest.config.ts), so we provide just enough of the Storage interface
// for the recents module to exercise its code paths.
function createStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  } satisfies Storage;
}

describe('quickSwitcherRecents', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createStorageStub();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('readRecents', () => {
    it('returns an empty array when no entry exists for the project', () => {
      expect(readRecents('p1')).toEqual([]);
    });

    it('returns the stored list as-is when valid', () => {
      storage.setItem('od:qs-recents:p1', JSON.stringify(['a.html', 'b.html']));
      expect(readRecents('p1')).toEqual(['a.html', 'b.html']);
    });

    it('returns an empty array for corrupt JSON instead of throwing', () => {
      storage.setItem('od:qs-recents:p1', '{not json');
      expect(readRecents('p1')).toEqual([]);
    });

    it('filters out non-string entries (defends against schema drift)', () => {
      storage.setItem('od:qs-recents:p1', JSON.stringify(['a.html', 42, null, 'b.html']));
      expect(readRecents('p1')).toEqual(['a.html', 'b.html']);
    });

    it('returns an empty array when the stored value is not an array', () => {
      storage.setItem('od:qs-recents:p1', JSON.stringify({ a: 1 }));
      expect(readRecents('p1')).toEqual([]);
    });

    it('scopes recents per project (different keys, no cross-bleed)', () => {
      pushRecent('p1', 'a.html');
      pushRecent('p2', 'b.html');
      expect(readRecents('p1')).toEqual(['a.html']);
      expect(readRecents('p2')).toEqual(['b.html']);
    });
  });

  describe('pushRecent', () => {
    it('puts the most recent file at the head of the list', () => {
      pushRecent('p1', 'a.html');
      pushRecent('p1', 'b.html');
      expect(readRecents('p1')).toEqual(['b.html', 'a.html']);
    });

    it('deduplicates: re-pushing an existing entry moves it to the head', () => {
      pushRecent('p1', 'a.html');
      pushRecent('p1', 'b.html');
      pushRecent('p1', 'a.html');
      expect(readRecents('p1')).toEqual(['a.html', 'b.html']);
    });

    it(`caps the list at ${RECENTS_LIMIT} entries`, () => {
      for (let i = 0; i < RECENTS_LIMIT + 4; i++) {
        pushRecent('p1', `file-${i}.html`);
      }
      const recents = readRecents('p1');
      expect(recents).toHaveLength(RECENTS_LIMIT);
      // Most recent first; older entries fall off the tail.
      expect(recents[0]).toBe(`file-${RECENTS_LIMIT + 3}.html`);
    });

    it('is a no-op when localStorage throws (quota exceeded / private mode)', () => {
      const setItem = vi.spyOn(storage, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceeded');
      });
      // Should not throw even though setItem does.
      expect(() => pushRecent('p1', 'a.html')).not.toThrow();
      setItem.mockRestore();
      // After restoring, the previous push left no record because the
      // throw aborted the write — recents stays empty.
      expect(readRecents('p1')).toEqual([]);
    });
  });
});
