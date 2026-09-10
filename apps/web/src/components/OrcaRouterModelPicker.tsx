// A real model selector wired the way the app wires it, for tests.
//
// `OrcaRouterModelPicker` is the extraction the app's two BYOK pickers (the
// composer switcher and the Settings model field) both need: merge the live
// catalogue with the curated seed, narrow by the staged attachment modalities,
// and clear a selection the narrowing invalidated. Keeping it here — rather
// than duplicating the rule inline in each picker — is what makes the rule
// testable against the options a selector actually receives.

import { useEffect } from 'react';

import { mergeProviderModelOptions } from './providerModelsCache';
import { filterOptionsForModalities } from './providerModelsCache';
import { useStagedModalities } from '../state/stagedAttachments';
import type { ApiProtocol, ProviderModelOption } from '../types';
import { SearchableModelSelect } from './modelOptions';

export interface OrcaRouterModelPickerProps {
  protocol: ApiProtocol;
  /** The live catalogue rows, as discovery returned them. */
  fetchedModels?: readonly ProviderModelOption[];
  /** The curated cold-start seed ids. */
  suggestedModelIds?: readonly string[];
  selected?: string;
  onModelChange?: (model: string) => void;
}

/**
 * Merge → narrow → expose. Returns the options a selector should render, plus
 * the effective selection after narrowing.
 */
export function useNarrowedModelOptions({
  protocol,
  fetchedModels = [],
  suggestedModelIds = [],
}: Omit<OrcaRouterModelPickerProps, 'selected' | 'onModelChange'>): ProviderModelOption[] {
  const stagedModalities = useStagedModalities();
  const merged = mergeProviderModelOptions(fetchedModels, suggestedModelIds);
  return filterOptionsForModalities(merged, protocol, stagedModalities);
}

/**
 * Clear a selection the narrowing invalidated. A model the user typed that the
 * account simply does not list is left alone — only the attachment filter is
 * allowed to override an explicit choice.
 */
export function useClearedInvalidSelection(input: {
  options: readonly ProviderModelOption[];
  selected?: string;
  onModelChange?: (model: string) => void;
}): void {
  const stagedModalities = useStagedModalities();
  const { options, selected, onModelChange } = input;
  useEffect(() => {
    if (!onModelChange || stagedModalities.length === 0) return;
    const current = (selected ?? '').trim();
    if (!current) return;
    if (!options.length || options.some((option) => option.id === current)) return;
    onModelChange('');
  }, [onModelChange, options, selected, stagedModalities.length]);
}

/**
 * Renders a real `SearchableModelSelect` over the narrowed options and exposes
 * the option ids it was handed, so a test can assert on the list itself rather
 * than on a helper's return value.
 */
export function SelectorProbe({
  protocol,
  fetchedModels = [],
  suggestedModelIds = [],
  selected = '',
  onModelChange,
}: OrcaRouterModelPickerProps) {
  const options = useNarrowedModelOptions({ protocol, fetchedModels, suggestedModelIds });
  useClearedInvalidSelection({ options, selected, onModelChange });

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
