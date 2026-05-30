import type { MediaProviderCredentials } from '../types';
import {
  configuredCustomImageModelIds,
  findMediaModel,
  findProvider,
  parseCustomImageModelList,
  type MediaProviderId,
} from './models';

const RUNNABLE_EXTERNAL_MODEL_IDS: Partial<Record<MediaProviderId, Set<string>>> = {
  google: new Set(['imagen-4', 'imagen-3', 'gemini-3-pro-image-preview']),
};

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
    // A custom profile declares this model but is incomplete (e.g. missing
    // baseUrl). Return false rather than falling through to the built-in
    // model check — the user explicitly chose a custom endpoint and we
    // should not silently route them to the real provider instead.
    return false;
  }
  const model = findMediaModel(modelId);
  if (!model) return true;
  if (!isRunnableExternalModel(model.provider, model.id)) return false;
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

function isRunnableExternalModel(providerId: MediaProviderId, modelId: string): boolean {
  const runnable = RUNNABLE_EXTERNAL_MODEL_IDS[providerId];
  return !runnable || runnable.has(modelId);
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
