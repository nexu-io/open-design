import type { ApiProtocol, ProviderModelOption } from '../types';

export type ProviderModelsCache = Record<string, ProviderModelOption[]>;

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
 * The modalities an attachment actually carries. Only these force a narrower
 * picker: any other file (a PDF, a source file) rides the normal text path.
 */
export type OrcaRouterModality = 'image' | 'audio' | 'video';

export function attachmentModalities(
  fileTypes: readonly (string | undefined | null)[],
): OrcaRouterModality[] {
  const out = new Set<OrcaRouterModality>();
  for (const type of fileTypes) {
    const normalized = (type ?? '').toLowerCase();
    if (normalized.startsWith('image/')) out.add('image');
    else if (normalized.startsWith('audio/')) out.add('audio');
    else if (normalized.startsWith('video/')) out.add('video');
  }
  return [...out];
}

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
