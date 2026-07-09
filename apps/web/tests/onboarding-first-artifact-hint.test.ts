import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  hasSeenFirstArtifactHint,
  markFirstArtifactHintSeen,
} from '../src/onboarding/first-artifact-hint';

// Minimal in-memory localStorage stub. Vitest runs in a node env, so we
// provide just enough of the Storage interface for the helper's code paths.
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

describe('first-artifact-hint seen flag', () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: createStorageStub(),
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('starts unseen and becomes seen once marked', () => {
    expect(hasSeenFirstArtifactHint()).toBe(false);
    markFirstArtifactHintSeen();
    expect(hasSeenFirstArtifactHint()).toBe(true);
  });

  it('is idempotent — marking twice stays seen', () => {
    markFirstArtifactHintSeen();
    markFirstArtifactHintSeen();
    expect(hasSeenFirstArtifactHint()).toBe(true);
  });

  it('treats a storage-denied context as not seen and does not throw', () => {
    (globalThis as unknown as { window: unknown }).window = {
      get localStorage(): Storage {
        throw new Error('storage denied');
      },
    };
    expect(hasSeenFirstArtifactHint()).toBe(false);
    expect(() => markFirstArtifactHintSeen()).not.toThrow();
  });
});
