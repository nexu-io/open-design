// The survey's whole value is that it is asked once, after real work. Both
// halves are enforced here rather than in the component: the component can
// only render what the trigger arms, so a leak past `retired` or a count that
// silently stops advancing is invisible until the card either follows a user
// around forever or never shows up at all.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SURVEY_MIN_DELIVERIES,
  deliveredCount,
  isSurveyRetired,
  notifyArtifactDelivered,
  onArtifactDelivered,
  retireSurvey,
} from '../src/components/experience-survey-trigger';

// Minimal in-memory localStorage stub. Vitest runs in a node env, so we
// provide just enough of the Storage interface for the module's code paths.
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

function useStorage(storage: unknown) {
  (globalThis as unknown as { window: unknown }).window = { localStorage: storage };
}

/** Subscribes a spy for the duration of one test. */
function listen() {
  const listener = vi.fn();
  const unsubscribe = onArtifactDelivered(listener);
  unsubscribers.push(unsubscribe);
  return listener;
}

let unsubscribers: Array<() => void> = [];

beforeEach(() => {
  useStorage(createStorageStub());
});

afterEach(() => {
  for (const unsubscribe of unsubscribers) unsubscribe();
  unsubscribers = [];
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe('experience survey delivery trigger', () => {
  it('arms on the very first delivery', () => {
    const listener = listen();

    notifyArtifactDelivered();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(deliveredCount()).toBe(SURVEY_MIN_DELIVERIES);
  });

  it('keeps arming on later deliveries so a lost arm is not the last chance', () => {
    const listener = listen();

    notifyArtifactDelivered();
    notifyArtifactDelivered();
    notifyArtifactDelivered();

    // Arming is not showing: an arm can be lost to a navigation mid-delay, so
    // every delivery has to offer the component another one.
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('counts deliveries across reloads', () => {
    const storage = createStorageStub();
    useStorage(storage);
    notifyArtifactDelivered();

    // Same store, new page load. The count is what makes an unwritable store
    // read as "not yet qualified", so it has to survive the reload even though
    // today's threshold is met on the first delivery.
    useStorage(storage);
    notifyArtifactDelivered();

    expect(deliveredCount()).toBe(2);
  });

  it('never arms again once retired, and stops counting', () => {
    const listener = listen();
    retireSurvey();

    notifyArtifactDelivered();
    notifyArtifactDelivered();
    notifyArtifactDelivered();

    expect(listener).not.toHaveBeenCalled();
    expect(isSurveyRetired()).toBe(true);
    expect(deliveredCount()).toBe(0);
  });

  it('never arms when the store is unwritable', () => {
    // Fail-closed, and the reason the count still exists: a store that cannot
    // write cannot record a dismissal either, so a card shown here would come
    // back after every run with no way for the user to stop it.
    useStorage({
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    });
    const listener = listen();

    for (let i = 0; i < 5; i += 1) notifyArtifactDelivered();

    expect(listener).not.toHaveBeenCalled();
  });

  it('restarts the count from zero when the stored value is corrupted', () => {
    const storage = createStorageStub();
    storage.setItem('open-design:experience-survey:v1:deliveries', 'not-a-number');
    useStorage(storage);
    const listener = listen();

    notifyArtifactDelivered();

    // Garbage in the store must not poison the count into NaN, which would
    // compare false against the threshold forever.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(deliveredCount()).toBe(1);
  });
});
