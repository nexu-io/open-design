import { isOpenAICompatible } from '../providers/openai-compatible';
import type { ApiProtocol, AppConfig } from '../types';

const API_PROTOCOL_LABELS: Record<ApiProtocol, string> = {
  anthropic: 'Anthropic API',
  openai: 'OpenAI API',
  azure: 'Azure OpenAI',
  google: 'Google Gemini',
  ollama: 'Ollama Cloud API',
  senseaudio: 'SenseAudio API',
  aihubmix: 'AIHubMix API',
};

const API_PROTOCOL_AGENT_IDS: Record<ApiProtocol, string> = {
  anthropic: 'anthropic-api',
  openai: 'openai-api',
  azure: 'azure-openai-api',
  google: 'google-gemini-api',
  ollama: 'ollama-cloud-api',
  senseaudio: 'senseaudio-api',
  aihubmix: 'aihubmix-api',
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
  if (cfg.apiProtocol === 'azure') return true;
  if (cfg.apiProtocol === 'openai') {
    return isKnownNativeImageModel(cfg.model);
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
    return isKnownNativeImageModel(cfg.model);
  }
  return true;
}

export function shouldOmitNativeImageAttachmentMetadata(cfg: AppConfig): boolean {
  if (cfg.apiProtocol === 'azure') return false;
  return supportsNativeImageAttachmentSerialization(cfg);
}

function isKnownNativeImageModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    normalized === 'chat-gpt-latest' ||
    normalized.startsWith('gpt-5') ||
    normalized.startsWith('gpt-4o') ||
    normalized.startsWith('gpt-4.1') ||
    normalized.startsWith('gpt-4-turbo') ||
    normalized.startsWith('o3') ||
    normalized.startsWith('o4')
  );
}

export function isAnthropicSupportedImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  return /\.(jpe?g|png|gif|webp)$/.test(lower);
}
