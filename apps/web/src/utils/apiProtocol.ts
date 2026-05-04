import type { ApiProtocol } from '../types';

const API_PROTOCOL_LABELS: Record<ApiProtocol, string> = {
  anthropic: 'Anthropic API',
  openai: 'OpenAI API',
  azure: 'Azure OpenAI',
  google: 'Google Gemini',
};

const API_PROTOCOL_AGENT_IDS: Record<ApiProtocol, string> = {
  anthropic: 'anthropic-api',
  openai: 'openai-api',
  azure: 'azure-openai-api',
  google: 'google-gemini-api',
};

export function apiProtocolLabel(protocol: ApiProtocol | undefined): string {
  return API_PROTOCOL_LABELS[protocol ?? 'anthropic'];
}

export function apiProtocolAgentId(protocol: ApiProtocol | undefined): string {
  return API_PROTOCOL_AGENT_IDS[protocol ?? 'anthropic'];
}
