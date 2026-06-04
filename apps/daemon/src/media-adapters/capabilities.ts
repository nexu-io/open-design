// Injection-style capability registry (layer ①).
//
// The registry holds NO data of its own — callers seed it (now from a const
// ported from aihubmix-video; later from AIHubMix's /api/v1/models fetched at
// startup with the const as a fallback). Consumers depend ONLY on `get()` /
// `all()`, never on the raw seed, so swapping the data source touches nothing
// downstream.

import type { ModelCapability } from './types.js';

export interface CapabilityRegistry {
  /** Look up a model by catalogue id (the `aihubmix-` prefix is stripped first). */
  get(id: string): ModelCapability | undefined;
  /** Add/override capabilities (later calls win on duplicate id). */
  register(caps: ModelCapability[]): void;
  /** All registered capabilities. */
  all(): ModelCapability[];
}

/** Normalize a catalogue id: strip the `aihubmix-` prefix and trim. */
export function normalizeModelId(id: string): string {
  return (id || '').trim().replace(/^aihubmix-/, '');
}

export function createCapabilityRegistry(seed: ModelCapability[] = []): CapabilityRegistry {
  const map = new Map<string, ModelCapability>();
  const register = (caps: ModelCapability[]): void => {
    for (const cap of caps) {
      if (cap && typeof cap.id === 'string' && cap.id) {
        map.set(normalizeModelId(cap.id), cap);
      }
    }
  };
  register(seed);
  return {
    get: (id) => map.get(normalizeModelId(id)),
    register,
    all: () => [...map.values()],
  };
}
