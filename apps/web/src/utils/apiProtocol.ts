import { isOpenAICompatible } from '../providers/openai-compatible';
import { KNOWN_PROVIDERS } from '../state/config';
import type { ApiProtocol, AppConfig } from '../types';

const API_PROTOCOL_LABELS: Record<ApiProtocol, string> = {
  anthropic: 'Anthropic API',
  openai: 'OpenAI API',
  azure: 'Azure OpenAI',
  google: 'Google Gemini',
  ollama: 'Ollama Cloud API',
  senseaudio: 'SenseAudio API',
  aihubmix: 'AIHubMix API',
  bedrock: 'AWS Bedrock',
};

const API_PROTOCOL_AGENT_IDS: Record<ApiProtocol, string> = {
  anthropic: 'anthropic-api',
  openai: 'openai-api',
  azure: 'azure-openai-api',
  google: 'google-gemini-api',
  ollama: 'ollama-cloud-api',
  senseaudio: 'senseaudio-api',
  aihubmix: 'aihubmix-api',
  bedrock: 'bedrock-api',
};

export function apiProtocolLabel(protocol: ApiProtocol | undefined): string {
  return API_PROTOCOL_LABELS[protocol ?? 'anthropic'];
}

export function apiProtocolModelLabel(
  protocol: ApiProtocol | undefined,
  model: string,
): string {
  const label = apiProtocolLabel(protocol);
  const trimmed = model.trim();
  return trimmed ? `${label} · ${trimmed}` : label;
}

export function apiProtocolAgentId(protocol: ApiProtocol | undefined): string {
  return API_PROTOCOL_AGENT_IDS[protocol ?? 'anthropic'];
}

export function usesAnthropicProxy(cfg: AppConfig): boolean {
  if (
    cfg.apiProtocol === 'azure' ||
    cfg.apiProtocol === 'ollama' ||
    cfg.apiProtocol === 'google' ||
    cfg.apiProtocol === 'senseaudio' ||
    cfg.apiProtocol === 'aihubmix' ||
    cfg.apiProtocol === 'bedrock' ||
    cfg.apiProtocol === 'openai'
  ) {
    return false;
  }
  if (!cfg.apiProtocol && isOpenAICompatible(cfg.model, cfg.baseUrl)) {
    return false;
  }
  return Boolean(cfg.baseUrl && cfg.baseUrl !== 'https://api.anthropic.com');
}

export function supportsNativeImageAttachmentSerialization(cfg: AppConfig): boolean {
  if (cfg.apiProtocol === 'azure') return cfg.nativeImageInputEnabled === true;
  if (cfg.apiProtocol === 'openai') {
    return isKnownImageCapableProviderModel(cfg, 'openai');
  }
  if (
    cfg.apiProtocol === 'google' ||
    cfg.apiProtocol === 'ollama' ||
    cfg.apiProtocol === 'senseaudio' ||
    cfg.apiProtocol === 'aihubmix'
  ) {
    return false;
  }
  if (cfg.apiProtocol === 'anthropic') return true;
  if (isOpenAICompatible(cfg.model, cfg.baseUrl)) {
    return isKnownImageCapableProviderModel(cfg, 'openai');
  }
  return true;
}

export function shouldOmitNativeImageAttachmentMetadata(cfg: AppConfig): boolean {
  if (cfg.apiProtocol === 'azure') return false;
  return supportsNativeImageAttachmentSerialization(cfg);
}

function isKnownImageCapableProviderModel(
  cfg: AppConfig,
  protocol: ApiProtocol,
): boolean {
  const provider = KNOWN_PROVIDERS.find(
    (candidate) =>
      candidate.protocol === protocol &&
      normalizeProviderBaseUrl(candidate.baseUrl) === providerBaseUrlForConfig(cfg),
  );
  const normalizedModel = normalizeProviderModel(cfg.model);
  return Boolean(
    provider?.imageCapableModels?.some(
      (model) => imageCapableModelMatches(model, normalizedModel),
    ),
  );
}

function imageCapableModelMatches(capableModel: string, actualModel: string): boolean {
  const normalizedCapableModel = normalizeProviderModel(capableModel);
  return [actualModel, withoutRoutingProviderPrefix(actualModel)].some(
    (candidate) =>
      candidate === normalizedCapableModel ||
      candidate.startsWith(`${normalizedCapableModel}-`),
  );
}

function withoutRoutingProviderPrefix(model: string): string {
  const parts = model.split('/');
  if (parts[0] === 'openrouter' && parts.length > 2) {
    return parts.slice(1).join('/');
  }
  return model;
}

function providerBaseUrlForConfig(cfg: AppConfig): string {
  return normalizeProviderBaseUrl(cfg.apiProviderBaseUrl ?? cfg.baseUrl);
}

function normalizeProviderBaseUrl(baseUrl: string | null | undefined): string {
  return (baseUrl ?? '').trim().replace(/\/+$/, '').toLowerCase();
}

function normalizeProviderModel(model: string): string {
  return model.trim().toLowerCase();
}

export function isAnthropicSupportedImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  return /\.(jpe?g|png|gif|webp)$/.test(lower);
}
