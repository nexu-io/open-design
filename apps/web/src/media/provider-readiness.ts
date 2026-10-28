import { isStoredMediaProviderEntryPresent } from '../state/config';
import type { MediaProviderCredentials } from '../types';
import {
  findMediaModel,
  findProvider,
  type MediaModel,
  type MediaProviderId,
} from './models';

/**
 * Put models backed by a configured provider first without dropping the
 * catalogue fallback. Composer callers use the first route as their default,
 * so a configured MiniMax image provider is selected instead of the managed
 * Cloud image fallback while the picker remains free to choose another route.
 */
export function prioritizeConfiguredMediaModels(
  models: readonly MediaModel[],
  mediaProviders?: Record<string, MediaProviderCredentials>,
): MediaModel[] {
  if (mediaProviders === undefined) return [...models];
  return models
    .map((model, index) => ({
      model,
      index,
      configured: isStoredMediaProviderEntryPresent(mediaProviders[model.provider])
        && isMediaProviderPickerReady(model.provider, mediaProviders),
    }))
    .sort((a, b) => Number(b.configured) - Number(a.configured) || a.index - b.index)
    .map(({ model }) => model);
}

export function isMediaProviderPickerReady(
  providerId: MediaProviderId,
  mediaProviders?: Record<string, MediaProviderCredentials>,
): boolean {
  const provider = findProvider(providerId);
  if (!provider?.integrated) return false;
  if (mediaProviders === undefined) return true;
  if (provider.credentialsRequired === false) return true;
  const entry = mediaProviders?.[provider.id];
  if (provider.id === 'openai' && isOpenAIOAuthOnlyEntry(entry)) return false;
  return isStoredMediaProviderEntryPresent(entry);
}

export function isMediaModelPickerReady(
  modelId: string,
  mediaProviders?: Record<string, MediaProviderCredentials>,
): boolean {
  const model = findMediaModel(modelId);
  if (!model) return false;
  return isMediaProviderPickerReady(model.provider, mediaProviders);
}

function isOpenAIOAuthOnlyEntry(entry: MediaProviderCredentials | null | undefined): boolean {
  const source = entry?.source?.trim();
  return (source === 'oauth-codex' || source === 'oauth-hermes')
    && !entry?.apiKey?.trim()
    && !entry?.baseUrl?.trim()
    && !entry?.model?.trim();
}
