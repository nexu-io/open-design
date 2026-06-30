// Shared metadata for the four API protocols the BYOK pickers offer.
//
// Originally these tables lived inline in `SettingsDialog.tsx`. The
// memory-extraction picker needs the exact same lists (so it can mirror
// the chat picker's protocol tabs / suggested-model dropdown / API key
// placeholders) — extracting them here keeps the two pickers from
// drifting apart whenever someone adds a new fast-pass model or a new
// quick-fill provider.
//
// The lists are intentionally hand-curated rather than auto-discovered:
// every option exposes `provider/model` strings the daemon already
// understands, so a new entry here implies a deliberate decision about
// support on the request side too.

import type { ApiProtocol } from '../types';

// Suggested fast-pass / common models per protocol — what the BYOK
// model dropdown lists by default. The first OpenAI-compatible block is
// duplicated under both `openai` and `azure` because azure's chat-
// completions endpoint speaks the same JSON shape; the deployment name
// the user types in the model field is what's variable, not the API.
export const SUGGESTED_MODELS_BY_PROTOCOL: Record<ApiProtocol, readonly string[]> = {
  anthropic: [
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'deepseek-chat',
    'deepseek-reasoner',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'MiniMax-M2.7-highspeed',
    'MiniMax-M2.7',
    'MiniMax-M2.5-highspeed',
    'MiniMax-M2.5',
    'MiniMax-M2.1-highspeed',
    'MiniMax-M2.1',
    'MiniMax-M2',
    'mimo-v2.5-pro',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'o3',
    'o4-mini',
    'deepseek-chat',
    'deepseek-reasoner',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'MiniMax-M2.7-highspeed',
    'MiniMax-M2.7',
    'MiniMax-M2.5-highspeed',
    'MiniMax-M2.5',
    'MiniMax-M2.1-highspeed',
    'MiniMax-M2.1',
    'MiniMax-M2',
    'mimo-v2.5-pro',
  ],
  azure: [
    'gpt-4o',
    'gpt-4o-mini',
  ],
  google: [
    'gemini-3.5-flash',
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ],
  senseaudio: [
    // SenseAudio is an OpenAI-compatible gateway that fronts both its own
    // models (senseaudio-s2 family) and aggregator routes to deepseek /
    // glm / kimi / minimax. Listing the headline house models first keeps
    // the picker's default selection on a SenseAudio-native checkpoint;
    // the aggregator IDs trail so users who arrived for a specific
    // upstream still find it in this tab without retyping it.
    'senseaudio-s2',
    'senseaudio-s2-flash',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'glm-5.1',
    'kimi-k2.6',
    'MiniMax-M2.7-highspeed',
    'MiniMax-M2.7',
  ],
  aihubmix: [
    // AIHubMix is an OpenAI-compatible aggregator that routes to OpenAI /
    // Anthropic / Gemini / DeepSeek by model name on its side. Listing the
    // headline cross-vendor checkpoints keeps the picker useful without
    // pretending to enumerate the full catalogue — users can type any id
    // AIHubMix exposes (or fetch the full live list). gpt-5.5 leads as the
    // default chat model (an OpenAI-family model keeps in-chat generate_image
    // working through the OpenAI tool loop after protocol routing lands).
    'gpt-5.5',
    'gpt-4o',
    'gpt-4o-mini',
    'claude-opus-4-8',
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
    'gemini-2.0-flash',
    'deepseek-chat',
    'deepseek-reasoner',
  ],
  bedrock: [
    'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'anthropic.claude-3-5-haiku-20241022-v1:0',
    'anthropic.claude-3-haiku-20240307-v1:0',
    'amazon.nova-pro-v1:0',
    'amazon.nova-lite-v1:0',
    'amazon.nova-micro-v1:0',
  ],
  ollama: [
    'cogito-2.1:671b',
    'deepseek-v3.1:671b',
    'deepseek-v3.2',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'devstral-2:123b',
    'devstral-small-2:24b',
    'gemini-3-flash-preview',
    'gemma3:4b',
    'gemma3:12b',
    'gemma3:27b',
    'gemma4:31b',
    'glm-4.6',
    'glm-4.7',
    'glm-5',
    'glm-5.1',
    'gpt-oss:20b',
    'gpt-oss:120b',
    'kimi-k2:1t',
    'kimi-k2-thinking',
    'kimi-k2.5',
    'kimi-k2.6',
    'minimax-m2',
    'minimax-m2.1',
    'minimax-m2.5',
    'minimax-m2.7',
    'ministral-3:3b',
    'ministral-3:8b',
    'ministral-3:14b',
    'mistral-large-3:675b',
    'nemotron-3-nano:30b',
    'nemotron-3-super',
    'qwen3-coder:480b',
    'qwen3-coder-next',
    'qwen3-next:80b',
    'qwen3-vl:235b',
    'qwen3-vl:235b-instruct',
    'qwen3.5:397b',
    'rnj-1:8b',
  ],
};

// "Fast / cheap" model recommendation for each protocol. Used by the
// memory extractor's auto-mode pill ("we'll quietly run gpt-4o-mini on
// your OpenAI key") and by anyone else who needs a one-pick default
// that prioritises latency + cost over reasoning depth.
export const FAST_MODEL_BY_PROTOCOL: Record<ApiProtocol, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
  azure: 'gpt-4o-mini',
  google: 'gemini-3.5-flash',
  // Ollama Cloud doesn't have a clean "fast small model" default that
  // works for the LLM memory extractor — the catalog skews to large
  // open-weight checkpoints. Fall back to a small Gemma so the auto-
  // pick produces a deterministic answer; users who care can override
  // through the Memory model picker.
  ollama: 'gemma3:4b',
  senseaudio: 'senseaudio-s2-flash',
  aihubmix: 'gpt-4o-mini',
  bedrock: 'amazon.nova-lite-v1:0',
};

export const API_PROTOCOL_TABS: ReadonlyArray<{
  id: ApiProtocol;
  title: string;
}> = [
  { id: 'anthropic', title: 'Anthropic' },
  { id: 'openai', title: 'OpenAI' },
  { id: 'azure', title: 'Azure OpenAI' },
  { id: 'google', title: 'Google Gemini' },
  { id: 'ollama', title: 'Ollama Cloud' },
  { id: 'senseaudio', title: 'SenseAudio' },
  { id: 'aihubmix', title: 'AIHubMix' },
];

export const API_PROTOCOL_LABELS: Record<ApiProtocol, string> = {
  anthropic: 'Anthropic API',
  openai: 'OpenAI API',
  azure: 'Azure OpenAI',
  google: 'Google Gemini',
  ollama: 'Ollama Cloud API',
  senseaudio: 'SenseAudio API',
  aihubmix: 'AIHubMix API',
  bedrock: 'AWS Bedrock',
};

export const API_KEY_PLACEHOLDERS: Record<ApiProtocol, string> = {
  anthropic: 'sk-ant-...',
  openai: 'sk-...',
  azure: 'azure key',
  google: 'AIza... or AQ....',
  ollama: 'Ollama API key',
  senseaudio: 'SenseAudio API key',
  aihubmix: 'sk-...',
  bedrock: 'AWS credentials',
};

// Default base URL the daemon assumes when the user leaves the field
// blank. Kept here so the BYOK form can render it as a placeholder
// hint and keep the two surfaces (form vs. daemon) in sync.
export const DEFAULT_BASE_URL_BY_PROTOCOL: Record<ApiProtocol, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  azure: '',
  google: 'https://generativelanguage.googleapis.com',
  ollama: 'https://ollama.com',
  senseaudio: 'https://api.senseaudio.cn',
  aihubmix: 'https://aihubmix.com/v1',
  bedrock: 'https://bedrock-runtime.us-east-1.amazonaws.com',
};

// Fixed-origin gateways: managed single-endpoint providers where the user only
// supplies an API key — the Base URL is implied, so the Settings form hides the
// field. Centralised here (not in a component) so config loading, the Settings
// form, and the top-bar switcher all resolve the same origin. Add a protocol
// here when it's such a gateway.
export const FIXED_ORIGIN_GATEWAYS: ReadonlySet<ApiProtocol> = new Set<ApiProtocol>([
  'aihubmix',
]);

export function isFixedOriginGateway(protocol: ApiProtocol): boolean {
  return FIXED_ORIGIN_GATEWAYS.has(protocol);
}

// Resolve the effective base URL. Fixed-origin gateways always use their
// canonical origin: the field is hidden, so an empty stored value must not leak
// through and break URL-gated logic such as the live model-list fetch (which
// requires a valid base URL and otherwise silently shows only the static list).
// Idempotent for non-gateway protocols — returns their value unchanged.
export function resolveFixedOriginBaseUrl(
  protocol: ApiProtocol,
  baseUrl: string,
): string {
  return isFixedOriginGateway(protocol) ? DEFAULT_BASE_URL_BY_PROTOCOL[protocol] : baseUrl;
}
