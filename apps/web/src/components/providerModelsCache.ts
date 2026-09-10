import { useSyncExternalStore } from 'react';

import type { ApiProtocol, ProviderModelOption } from '../types';

export type ProviderModelsCache = Record<string, ProviderModelOption[]>;

/**
 * How the last discovery attempt for a cache key ended.
 *
 * `ready` means the provider answered and its rows are authoritative — a
 * successful response with zero rows included, which is a real answer ("this
 * account can call none of these"). `degraded` means discovery failed or never
 * ran, so the curated seed is a fallback rather than the truth. `loading` is
 * the window before either is known; it exists so a caller can tell "not yet"
 * apart from "nothing", which is the difference between leaving a selection
 * alone and clearing it.
 */
export type ProviderModelsDiscoveryState = 'loading' | 'ready' | 'degraded';

const discoveryByKey = new Map<string, ProviderModelsDiscoveryState>();
const seedOptionsByKey = new Map<string, ProviderModelOption[]>();
const discoveryListeners = new Set<() => void>();

/**
 * Record the metadata-preserving fallback a provider returned for a key.
 *
 * Kept beside the discovery state rather than in the option cache, because the
 * two are answers to different questions: the cache holds "what the account can
 * call", the seed holds "what to show when we could not find out". Merging the
 * second into the first is exactly the bug this separation prevents.
 */
export function setProviderModelsSeed(
  key: string,
  options: readonly ProviderModelOption[],
): void {
  if (options.length === 0) {
    if (!seedOptionsByKey.has(key)) return;
    seedOptionsByKey.delete(key);
  } else {
    seedOptionsByKey.set(key, [...options]);
  }
  for (const listener of discoveryListeners) listener();
}

/** The degraded fallback for a key, or an empty list when there is none. */
export function providerModelsSeed(key: string): ProviderModelOption[] {
  return seedOptionsByKey.get(key) ?? EMPTY_SEED;
}

const EMPTY_SEED: ProviderModelOption[] = [];

/** Reactive form of `providerModelsSeed`, for the model pickers. */
export function useProviderModelsSeed(key: string): ProviderModelOption[] {
  // `getSnapshot` must return a referentially stable value for an unchanged
  // store, or useSyncExternalStore re-renders forever. The empty case shares
  // one frozen array rather than allocating a fresh [] on every read.
  return useSyncExternalStore(
    subscribeDiscovery,
    () => providerModelsSeed(key),
    () => providerModelsSeed(key),
  );
}

export function setProviderModelsDiscovery(
  key: string,
  state: ProviderModelsDiscoveryState,
): void {
  if (discoveryByKey.get(key) === state) return;
  discoveryByKey.set(key, state);
  for (const listener of discoveryListeners) listener();
}

/**
 * Discovery state for a key. An unknown key reads as `degraded`, not
 * `loading`: a surface that never fetched must fall back to the seed, not wait
 * forever for a result that is not coming.
 */
export function providerModelsDiscoveryState(
  key: string,
): ProviderModelsDiscoveryState {
  return discoveryByKey.get(key) ?? 'degraded';
}

/** Test seam: forget every recorded outcome. */
export function resetProviderModelsDiscovery(): void {
  if (discoveryByKey.size === 0 && seedOptionsByKey.size === 0) return;
  discoveryByKey.clear();
  seedOptionsByKey.clear();
  for (const listener of discoveryListeners) listener();
}

function subscribeDiscovery(listener: () => void): () => void {
  discoveryListeners.add(listener);
  return () => { discoveryListeners.delete(listener); };
}

/** Reactive form of `providerModelsDiscoveryState`, for the model pickers. */
export function useProviderModelsDiscovery(key: string): ProviderModelsDiscoveryState {
  return useSyncExternalStore(
    subscribeDiscovery,
    () => (key ? providerModelsDiscoveryState(key) : 'ready'),
    () => (key ? providerModelsDiscoveryState(key) : 'ready'),
  );
}

function fingerprintSecret(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length}:${(hash >>> 0).toString(36)}`;
}

export function providerModelsCacheKey(
  protocol: ApiProtocol,
  baseUrl: string,
  apiKey: string,
  apiVersion = '',
): string {
  return [
    protocol,
    baseUrl.trim().replace(/\/+$/, ''),
    fingerprintSecret(apiKey.trim()),
    protocol === 'azure' ? apiVersion.trim() : '',
  ].join('\n');
}

export function mergeProviderModelOptions(
  fetchedModels: readonly ProviderModelOption[],
  suggestedModelIds: readonly string[],
): ProviderModelOption[] {
  const seen = new Set<string>();
  const out: ProviderModelOption[] = [];
  const add = (model: ProviderModelOption) => {
    const id = model.id.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ ...model, id, label: model.label.trim() || id });
  };
  for (const model of fetchedModels) add(model);
  for (const id of suggestedModelIds) add({ id, label: id });
  return out;
}

/**
 * The option list a picker should show, given what discovery actually returned.
 *
 * For OrcaRouter the live answer is authoritative and is used alone: its
 * catalogue is the account's real capability list, so mixing the seed into a
 * successful response is how a model the account cannot call ends up
 * selectable, and a successful EMPTY response means exactly that (the account is
 * restricted), not "fall back to the seed". The seed is that provider's degraded
 * path only.
 *
 * Every other provider keeps the long-standing merge of its live list with its
 * curated suggestions — those suggestions are a UX affordance for "models you
 * probably want", not a claim about the account, and dropping them on the first
 * successful fetch would silently narrow every other provider's picker.
 *
 * The seed ids alone carry no `metadata`, so they are also the wrong fallback
 * once an attachment requires modality evidence; a caller with the
 * metadata-preserving seed passes it through `seedOptions`, and the plain ids
 * are the last resort for surfaces that have none.
 */
export function resolveProviderModelOptions(input: {
  protocol: ApiProtocol;
  discovery: ProviderModelsDiscoveryState;
  fetchedModels: readonly ProviderModelOption[];
  seedOptions?: readonly ProviderModelOption[];
  suggestedModelIds?: readonly string[];
}): ProviderModelOption[] {
  const seed = input.seedOptions?.length ? [...input.seedOptions] : [];
  if (input.protocol !== 'orcarouter') {
    return mergeProviderModelOptions(
      seed.length ? seed : input.fetchedModels,
      seed.length
        ? input.fetchedModels.map((m) => m.id)
        : (input.suggestedModelIds ?? []),
    );
  }
  if (input.discovery === 'ready') return [...input.fetchedModels];
  if (seed.length) return mergeProviderModelOptions(seed, input.fetchedModels.map((m) => m.id));
  return mergeProviderModelOptions(input.fetchedModels, input.suggestedModelIds ?? []);
}

/**
 * The modalities an attachment actually carries. Only these force a narrower
 * picker: any other file (a PDF, a source file) rides the normal text path.
 *
 * The mapping lives in `state/stagedAttachments` (`modalitiesForFiles`) because
 * that module owns what is staged; this is only the vocabulary the filter below
 * speaks, so the two surfaces cannot end up with two copies of the rule.
 */
export type OrcaRouterModality = 'image' | 'audio' | 'video';

/**
 * Narrow a model list to the routes that can actually receive the staged
 * attachments.
 *
 * The rule is fail-closed: a model qualifies only when its catalogue metadata
 * explicitly declares every required modality. The catalogue reports modality
 * evidence only for OrcaRouter (its rows carry `input_modalities` through
 * `toOrcaRouterModelOptions`), so for every other provider the list is
 * returned untouched rather than emptied — an unknown capability must not be
 * read as "unsupported".
 */
export function filterOptionsForModalities(
  options: readonly ProviderModelOption[],
  protocol: ApiProtocol,
  required: readonly OrcaRouterModality[],
): ProviderModelOption[] {
  if (protocol !== 'orcarouter' || required.length === 0) return [...options];
  return options.filter((option) => {
    const declared = option.metadata?.inputModalities;
    if (!Array.isArray(declared)) return false;
    return required.every((modality) => declared.includes(modality));
  });
}
