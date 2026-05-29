import type { MediaProviderCredentials } from '../types';
import {
  configuredCustomImageModelIds,
  findMediaModel,
  findProvider,
  parseCustomImageModelList,
  type MediaProviderId,
} from './models';

export function isMediaProviderPickerReady(
  providerId: MediaProviderId,
  mediaProviders?: Record<string, MediaProviderCredentials>,
): boolean {
  const provider = findProvider(providerId);
  if (!provider?.integrated) return false;
  if (mediaProviders === undefined) return true;
  const entry = mediaProviders?.[provider.id];
  if (provider.configKind === 'external') return entry?.enabled === true;
  if (provider.credentialsRequired === false) return true;
  if (provider.id === 'openai' && isOpenAIOAuthOnlyEntry(entry)) return false;
  if (provider.id === 'custom-image') return hasConfiguredCustomImageEntry(entry);
  return hasConfiguredApiKeyEntry(entry);
}

export function isMediaModelPickerReady(
  modelId: string,
  mediaProviders?: Record<string, MediaProviderCredentials>,
): boolean {
  const customImageEntry = mediaProviders?.['custom-image'];
  if (customImageModelConfigured(modelId, customImageEntry)) {
    if (hasConfiguredCustomImageModelEntry(customImageEntry, modelId)) return true;
    const fallbackModel = findMediaModel(modelId);
    return fallbackModel
      ? isMediaProviderPickerReady(fallbackModel.provider, mediaProviders)
      : false;
  }
  const model = findMediaModel(modelId);
  if (!model) return true;
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

function hasConfiguredApiKeyEntry(entry: MediaProviderCredentials | null | undefined): boolean {
  return Boolean(
    entry?.apiKey?.trim()
    || entry?.apiKeyConfigured
    || entry?.apiKeyTail?.trim()
    || entry?.profiles?.some((profile) => (
      profile.apiKey?.trim()
      || profile.apiKeyConfigured
      || profile.apiKeyTail?.trim()
    )),
  );
}

function hasConfiguredCustomImageEntry(entry: MediaProviderCredentials | null | undefined): boolean {
  return Boolean(
    (entry?.baseUrl?.trim() && entry?.model?.trim())
    || entry?.profiles?.some((profile) => profile.baseUrl?.trim() && profile.model?.trim()),
  );
}

function customImageModelConfigured(
  modelId: string,
  entry: MediaProviderCredentials | null | undefined,
): boolean {
  return configuredCustomImageModelIds(entry?.model, entry?.profiles).includes(modelId);
}

function hasConfiguredCustomImageModelEntry(
  entry: MediaProviderCredentials | null | undefined,
  modelId: string,
): boolean {
  if (!modelId.trim()) return false;
  if (entry?.baseUrl?.trim() && parseCustomImageModelList(entry.model).includes(modelId)) {
    return true;
  }
  return Boolean(entry?.profiles?.some((profile) => (
    profile.baseUrl?.trim() && parseCustomImageModelList(profile.model).includes(modelId)
  )));
}
