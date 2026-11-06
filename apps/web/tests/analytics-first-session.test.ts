import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getSessionId,
  isFirstSession,
  pinFirstSessionForCapture,
} from '../src/analytics/identity';

function createStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

describe('isFirstSession', () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: createStorageStub(),
      sessionStorage: createStorageStub(),
    };
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('is true for the whole first session (idempotent within it)', () => {
    expect(isFirstSession()).toBe(true);
    // Repeat calls in the same tab session keep reporting true — a pure read
    // that never pins on its own, so it is not a one-shot.
    expect(isFirstSession()).toBe(true);
  });

  it('reading before consent does NOT pin, so a later session is still first', () => {
    // A session that boots with analytics off only ever reads the flag.
    expect(isFirstSession()).toBe(true);
    const firstSessionId = getSessionId();
    // Tab session ends before the user ever opts in: sessionStorage resets,
    // localStorage survives — but nothing was pinned.
    (window as unknown as { sessionStorage: Storage }).sessionStorage =
      createStorageStub() as unknown as Storage;
    expect(getSessionId()).not.toBe(firstSessionId);
    // The later session is still the install's first *analytics* session.
    expect(isFirstSession()).toBe(true);
  });

  it('is false for a later session once capture pinned the first one', () => {
    expect(isFirstSession()).toBe(true);
    const firstSessionId = getSessionId();
    // Consent-gated capture pins the current (first) session.
    pinFirstSessionForCapture();
    // Simulate the tab session ending: sessionStorage resets, the localStorage
    // pin survives.
    (window as unknown as { sessionStorage: Storage }).sessionStorage =
      createStorageStub() as unknown as Storage;
    expect(getSessionId()).not.toBe(firstSessionId);
    expect(isFirstSession()).toBe(false);
  });

  it('pinFirstSessionForCapture is a no-op once a session is already pinned', () => {
    pinFirstSessionForCapture();
    const pinnedSessionId = getSessionId();
    // A second call in a fresh session must not overwrite the original pin.
    (window as unknown as { sessionStorage: Storage }).sessionStorage =
      createStorageStub() as unknown as Storage;
    expect(getSessionId()).not.toBe(pinnedSessionId);
    pinFirstSessionForCapture();
    // The pin still points at the ORIGINAL session, not this fresh one — had
    // the second call overwritten it, this new session would read as first.
    expect(isFirstSession()).toBe(false);
  });

  it('reports false without throwing when storage is denied', () => {
    (globalThis as unknown as { window: unknown }).window = {
      get localStorage(): Storage {
        throw new Error('storage denied');
      },
      get sessionStorage(): Storage {
        throw new Error('storage denied');
      },
    };
    expect(isFirstSession()).toBe(false);
    expect(() => pinFirstSessionForCapture()).not.toThrow();
  });
});
