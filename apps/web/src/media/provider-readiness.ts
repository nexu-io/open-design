import { isStoredMediaProviderEntryPresent } from '../state/config';
import type { MediaProviderCredentials } from '../types';
import {
  findMediaModel,
  findProvider,
  type MediaModel,
  type MediaProviderId,
} from './models';

export function preferredConfiguredMediaModel(
  models: MediaModel[],
  mediaProviders: Record<string, MediaProviderCredentials> | undefined,
  fallback: string,
): string {
  if (!mediaProviders) return fallback;
  for (const model of models) {
    const provider = findProvider(model.provider);
    if (!provider?.integrated || provider.credentialsRequired === false) continue;
    if (!isMediaProviderPickerReady(provider.id, mediaProviders)) continue;
    return model.id;
  }
  return fallback;
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
    && !entry?.model?.trim()
    && !entry?.apiKeyTail?.trim();
}
