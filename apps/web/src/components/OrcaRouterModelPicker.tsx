// The shared model-picker rule: merge → narrow → clear.
//
// The composer switcher and the Settings model field both need the same three
// steps, and keeping them here rather than duplicating the rule inline in each
// picker is what makes the rule testable against the options a selector
// actually receives.

import { useEffect } from 'react';

import {
  filterOptionsForModalities,
  resolveProviderModelOptions,
  useProviderModelsDiscovery,
  useProviderModelsSeed,
  type ProviderModelsDiscoveryState,
} from './providerModelsCache';
import { useStagedModalities } from '../state/stagedAttachments';
import type { ApiProtocol, ProviderModelOption } from '../types';
import { SearchableModelSelect } from './modelOptions';

export interface OrcaRouterModelPickerProps {
  protocol: ApiProtocol;
  /** The live catalogue rows, as discovery returned them. */
  fetchedModels?: readonly ProviderModelOption[];
  /**
   * Cache key whose discovery outcome governs whether `fetchedModels` is
   * authoritative. Omit it for a surface that always supplies a trustworthy
   * list (a test, or a caller that never falls back to a seed); an absent key
   * reads as `ready`.
   */
  discoveryKey?: string;
  /** The metadata-preserving degraded seed, used only when discovery failed. */
  seedOptions?: readonly ProviderModelOption[];
  /** The curated cold-start seed ids, for surfaces with no metadata-rich seed. */
  suggestedModelIds?: readonly string[];
  selected?: string;
  onModelChange?: (model: string) => void;
}

/**
 * Merge → narrow → expose. Returns the options a selector should render.
 *
 * The merge is discovery-aware: a successful live catalogue is authoritative on
 * its own (an account restricted to one model must offer that one model, not
 * that model plus five seeds it cannot call), and the seed appears only on the
 * degraded path.
 */
export function useNarrowedModelOptions({
  protocol,
  fetchedModels = [],
  discoveryKey = '',
  seedOptions,
  suggestedModelIds = [],
}: Omit<OrcaRouterModelPickerProps, 'selected' | 'onModelChange'>): ProviderModelOption[] {
  const stagedModalities = useStagedModalities();
  const discovery = useProviderModelsDiscovery(discoveryKey);
  // The daemon's metadata-preserving fallback, recorded beside the discovery
  // outcome by whichever surface ran the fetch. Reading it from the store keeps
  // this hook's callers from having to thread it through.
  const storedSeed = useProviderModelsSeed(discoveryKey);
  const seed = seedOptions ?? (storedSeed.length ? storedSeed : undefined);
  const merged = resolveProviderModelOptions({
    protocol,
    discovery,
    fetchedModels,
    ...(seed ? { seedOptions: seed } : {}),
    suggestedModelIds,
  });
  return filterOptionsForModalities(merged, protocol, stagedModalities);
}

/**
 * Clear a selection the attachment narrowing invalidated.
 *
 * Three conditions have to hold, and each one was a separate defect when it did
 * not:
 *
 *   * the protocol must be OrcaRouter — only its catalogue publishes the
 *     modality evidence this filter consumes, so applying the rule to another
 *     provider would discard a custom model the user chose deliberately;
 *   * the user must have staged an attachment, otherwise nothing narrowed;
 *   * discovery must have SETTLED. While it is still loading the filtered list
 *     is empty for a reason that has nothing to do with the user's model, and
 *     clearing then would wipe the selection on every mount. A completed,
 *     genuinely empty filtered list is the case that must clear.
 *
 * A model the user typed that the account simply does not list is left alone:
 * only the attachment filter may override an explicit choice.
 */
export function useClearedInvalidSelection(input: {
  protocol: ApiProtocol;
  /** Discovery cache key; absent means the caller's list is already settled. */
  discoveryKey?: string;
  options: readonly ProviderModelOption[];
  selected?: string;
  onModelChange?: (model: string) => void;
}): void {
  const stagedModalities = useStagedModalities();
  const { protocol, discoveryKey = '', options, selected, onModelChange } = input;
  const discovery: ProviderModelsDiscoveryState = useProviderModelsDiscovery(discoveryKey);
  useEffect(() => {
    if (!onModelChange) return;
    if (protocol !== 'orcarouter') return;
    if (stagedModalities.length === 0) return;
    if (discovery === 'loading') return;
    const current = (selected ?? '').trim();
    if (!current) return;
    if (options.some((option) => option.id === current)) return;
    onModelChange('');
  }, [onModelChange, protocol, discovery, options, selected, stagedModalities.length]);
}

/**
 * Renders a real `SearchableModelSelect` over the narrowed options and exposes
 * the option ids it was handed, so a test can assert on the list itself rather
 * than on a helper's return value.
 */
export function SelectorProbe({
  protocol,
  fetchedModels = [],
  discoveryKey,
  seedOptions,
  suggestedModelIds = [],
  selected = '',
  onModelChange,
}: OrcaRouterModelPickerProps) {
  const options = useNarrowedModelOptions({
    protocol,
    fetchedModels,
    ...(discoveryKey ? { discoveryKey } : {}),
    ...(seedOptions ? { seedOptions } : {}),
    suggestedModelIds,
  });
  useClearedInvalidSelection({
    protocol,
    ...(discoveryKey ? { discoveryKey } : {}),
    options,
    selected,
    ...(onModelChange ? { onModelChange } : {}),
  });

  return (
    <>
      <span data-testid="option-ids">{options.map((option) => option.id).join(',')}</span>
      <SearchableModelSelect
        className="inline-switcher__select"
        aria-label="Model"
        searchPlaceholder="Search"
        popoverTestId="selector-probe-popover"
        models={options}
        value={selected}
        onChange={(next) => onModelChange?.(next)}
      />
    </>
  );
}
