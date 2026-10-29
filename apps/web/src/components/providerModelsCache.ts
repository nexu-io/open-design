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

// Filter ordinary picker choices only. Saved/custom model IDs remain valid and
// must not be migrated or filtered when constructing requests.
export function isSuggestedTextModel(id: string): boolean {
  const model = id.trim().split('/').pop() ?? '';
  if (!/^minimax-(?:m\d|text)/i.test(model)) return true;
  return /^minimax-m3(?:\.1-flash)?(?::free|-cloud)?$/i.test(model);
}

export function mergeProviderModelOptions(
  fetchedModels: readonly ProviderModelOption[],
  suggestedModelIds: readonly string[],
): ProviderModelOption[] {
  const seen = new Set<string>();
  const out: ProviderModelOption[] = [];
  const add = (model: ProviderModelOption) => {
    const id = model.id.trim();
    if (!id || seen.has(id) || !isSuggestedTextModel(id)) return;
    seen.add(id);
    out.push({ ...model, id, label: model.label.trim() || id });
  };
  for (const model of fetchedModels) add(model);
  for (const id of suggestedModelIds) add({ id, label: id });
  // Keep other providers in their original order, but put Flash before M3
  // even when discovery returns M3 first. Preserve fetched labels/metadata.
  const isMiniMax = (model: ProviderModelOption) => /(?:^|\/)minimax-m3/i.test(model.id);
  const minimax = out.filter(isMiniMax).sort((a, b) =>
    Number(/m3\.1-flash/i.test(b.id)) - Number(/m3\.1-flash/i.test(a.id)),
  );
  let index = 0;
  return out.map((model) => isMiniMax(model) ? minimax[index++]! : model);
}
