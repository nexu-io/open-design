import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { beginFirstLoop, recordFirstLoopStep } from '../src/onboarding/first-loop';

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

const ENTRY = {
  source: 'home_recommendation' as const,
  productType: 'marketing' as const,
  recommendationId: 'marketing_landing',
};
const PROJECT = 'proj-a';

describe('first-loop ledger (project-scoped)', () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = {
      sessionStorage: createStorageStub(),
    };
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('fires onboarding_completed once, on delivery, with the steps in order', () => {
    const track = vi.fn();
    beginFirstLoop(PROJECT, ENTRY);
    recordFirstLoopStep(track, 'prompt_sent', PROJECT);
    recordFirstLoopStep(track, 'generated', PROJECT);
    recordFirstLoopStep(track, 'artifact_viewed', PROJECT);
    expect(track).not.toHaveBeenCalled();
    recordFirstLoopStep(track, 'delivered', PROJECT);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('onboarding_completed', {
      entry_source: 'home_recommendation',
      product_type: 'marketing',
      recommendation_id: 'marketing_landing',
      completed_steps: ['prompt_sent', 'generated', 'artifact_viewed', 'delivered'],
    });
    // A second delivery in the same project does not re-fire.
    recordFirstLoopStep(track, 'delivered', PROJECT);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('dedupes repeated steps but keeps first-reached order', () => {
    const track = vi.fn();
    beginFirstLoop(PROJECT, ENTRY);
    recordFirstLoopStep(track, 'generated', PROJECT);
    recordFirstLoopStep(track, 'prompt_sent', PROJECT);
    recordFirstLoopStep(track, 'generated', PROJECT);
    recordFirstLoopStep(track, 'delivered', PROJECT);
    expect(track.mock.calls[0]?.[1]).toMatchObject({
      completed_steps: ['generated', 'prompt_sent', 'delivered'],
    });
  });

  it('fires with delivered-only when the loop closes without earlier steps', () => {
    const track = vi.fn();
    beginFirstLoop(PROJECT, ENTRY);
    recordFirstLoopStep(track, 'delivered', PROJECT);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0]?.[1]).toMatchObject({
      completed_steps: ['delivered'],
    });
  });

  it('is a no-op when the project has no active first loop (ordinary projects)', () => {
    const track = vi.fn();
    recordFirstLoopStep(track, 'delivered', PROJECT);
    expect(track).not.toHaveBeenCalled();
  });

  it('does not let another project\'s delivery close this loop', () => {
    const track = vi.fn();
    beginFirstLoop(PROJECT, ENTRY);
    recordFirstLoopStep(track, 'prompt_sent', PROJECT);
    // A delivery in an unrelated project (no ledger) is a silent no-op and
    // must not fire completion for PROJECT.
    recordFirstLoopStep(track, 'delivered', 'proj-b');
    expect(track).not.toHaveBeenCalled();
    // PROJECT's own delivery still closes its own loop.
    recordFirstLoopStep(track, 'delivered', PROJECT);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0]?.[1]).toMatchObject({
      recommendation_id: 'marketing_landing',
      completed_steps: ['prompt_sent', 'delivered'],
    });
  });

  it('beginFirstLoop pins the first entry for a project and ignores later ones', () => {
    const track = vi.fn();
    beginFirstLoop(PROJECT, ENTRY);
    beginFirstLoop(PROJECT, { ...ENTRY, recommendationId: 'other_starter' });
    recordFirstLoopStep(track, 'delivered', PROJECT);
    expect(track.mock.calls[0]?.[1]).toMatchObject({
      recommendation_id: 'marketing_landing',
    });
  });

  it('never throws when storage is denied', () => {
    (globalThis as unknown as { window: unknown }).window = {
      get sessionStorage(): Storage {
        throw new Error('denied');
      },
    };
    const track = vi.fn();
    expect(() => beginFirstLoop(PROJECT, ENTRY)).not.toThrow();
    expect(() => recordFirstLoopStep(track, 'delivered', PROJECT)).not.toThrow();
    expect(track).not.toHaveBeenCalled();
  });
});
