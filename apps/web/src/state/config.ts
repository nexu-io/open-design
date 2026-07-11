import type { AppConfigPrefs } from '@open-design/contracts';
import { MEDIA_PROVIDERS } from '../media/models';
import { isOpenAICompatible } from '../providers/openai-compatible';
import type {
  ApiProtocol,
  AppConfig,
  MediaProviderCredentials,
  NotificationsConfig,
  OrbitConfig,
  PetConfig,
} from '../types';
import { resolveFixedOriginBaseUrl } from './apiProtocols';
import {
  DEFAULT_ACCENT_COLOR,
  normalizeAccentColor,
} from './appearance';
import {
  DEFAULT_FAILURE_SOUND_ID,
  DEFAULT_SUCCESS_SOUND_ID,
} from '../utils/notifications';
import { randomUUID } from '../utils/uuid';

const STORAGE_KEY = 'open-design:config';
const CONFIG_MIGRATION_VERSION = 1;

// Hatched out of the box, but tucked away — the user has to go through
// either the entry-view "adopt a pet" callout or Settings → Pets to
// summon them. Keeps the workspace quiet for first-run users.
// Both switches default off so first-run users are not greeted by a
// surprise sound or a permission prompt; they can opt in from Settings →
// Notifications when they want it.
export const DEFAULT_NOTIFICATIONS: NotificationsConfig = {
  soundEnabled: false,
  successSoundId: DEFAULT_SUCCESS_SOUND_ID,
  failureSoundId: DEFAULT_FAILURE_SOUND_ID,
  desktopEnabled: false,
};

export const DEFAULT_PET: PetConfig = {
  adopted: false,
  enabled: false,
  petId: 'mochi',
  custom: {
    name: 'Buddy',
    glyph: '🦄',
    accent: '#c96442',
    greeting: 'Hi! I am here whenever you need me.',
  },
};

export const DEFAULT_ORBIT: OrbitConfig = {
  enabled: false,
  time: '08:00',
  // Ship with the general-purpose Orbit briefing skill pre-selected so a
  // fresh install runs against a real adaptive template instead of the
  // bare built-in prompt. Users can clear it from Settings → Orbit to fall
  // back to the built-in prompt or pick another scenario === 'orbit' skill.
  templateSkillId: 'orbit-general',
};

export const DEFAULT_CONFIG: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  // New configs should be explicit. loadConfig() still detects parsed legacy
  // saved configs that did not have this field and migrates those from their
  // saved baseUrl/model before applying the current migration version.
  apiProtocol: 'anthropic',
  apiVersion: '',
  apiProtocolConfigs: {},
  configMigrationVersion: CONFIG_MIGRATION_VERSION,
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: false,
  theme: 'system',
  accentColor: DEFAULT_ACCENT_COLOR,
  mediaProviders: {},
  composio: {},
  agentModels: {},
  agentCliEnv: {},
  agentCliEnvIntent: {},
  pet: DEFAULT_PET,
  notifications: DEFAULT_NOTIFICATIONS,
  orbit: DEFAULT_ORBIT,
  projectLocations: [],
  defaultProjectLocationId: 'default',
  // Telemetry defaults to ON so fresh-install users emit onboarding /
  // ui_click events from the first frame. The disclosure modal still
  // appears after `onboardingCompleted` flips, and Settings → Privacy
  // remains the one-click opt-out. Without these defaults the gate at
  // `daemon/src/analytics.ts` (`if (telemetry?.metrics !== true) return`)
  // dropped every event fired during onboarding because no consent
  // existed yet — observed live on the prerelease.10 QA run, which left
  // zero `page_view pn=onboarding` rows on PostHog despite the user
  // completing the flow.
  telemetry: { metrics: true, content: true },
};

/** Well-known providers with pre-filled base URLs. */
export interface KnownProvider {
  label: string;
  protocol: ApiProtocol;
  baseUrl: string;
  /** Default model to apply when the provider is selected. */
  model: string;
  /** Optional provider-specific model choices shown in Settings. */
  models?: string[];
  /** Some local/self-hosted endpoints do not require bearer credentials. */
  requiresApiKey?: boolean;
}

// Some providers appear more than once because they expose both
// Anthropic-compatible (/v1/messages) and OpenAI-compatible
// (/v1/chat/completions) gateways. Keep those entries separate so the Settings
// UI can scope quick-fill presets and model suggestions to the selected
// protocol.
//
// Model lists are hand-curated from provider docs/current public presets rather
// than fetched dynamically. To add a provider, include a user-facing label, the
// protocol that determines request routing, the base URL, a default model, and
// optional provider-specific model choices.
export const KNOWN_PROVIDERS: KnownProvider[] = [
  {
    label: 'Anthropic (Claude)',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5'],
  },
  {
    label: 'DeepSeek — Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.deepseek.com/anthropic',
    model: 'deepseek-chat',
    models: [
      'deepseek-chat',
      'deepseek-reasoner',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ],
  },
  {
    label: 'MiniMax — Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.minimax.io/anthropic',
    model: 'MiniMax-M2.7-highspeed',
    models: [
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.7',
      'MiniMax-M2.5-highspeed',
      'MiniMax-M2.5',
      'MiniMax-M2.1-highspeed',
      'MiniMax-M2.1',
      'MiniMax-M2',
    ],
  },
  {
    label: 'OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3', 'o4-mini'],
  },
  {
    label: 'OpenRouter',
    protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3.7-sonnet',
    models: [
      'anthropic/claude-3.7-sonnet',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.5-flash',
      'google/gemini-2.5-pro',
      'openai/gpt-4o',
      'openai/o3-mini',
      'deepseek/deepseek-chat',
      'deepseek/deepseek-r1',
    ],
  },
  {
    label: 'Azure OpenAI',
    protocol: 'azure',
    baseUrl: '',
    model: '',
    models: [],
  },
  {
    label: 'Google Gemini',
    protocol: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-3.5-flash',
    models: [
      'gemini-3.5-flash',
      'gemini-3.1-pro-preview',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ],
  },
  {
    label: 'SiliconFlow',
    protocol: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3.1',
    models: [
      'deepseek-ai/DeepSeek-V3.1',
      'deepseek-ai/DeepSeek-R1',
      'Qwen/Qwen3-Coder-480B-A35B-Instruct',
    ],
  },
  {
    label: 'PPIO',
    protocol: 'openai',
    baseUrl: 'https://api.ppinfra.com/v3/openai',
    model: 'deepseek/deepseek-v3.1',
    models: ['deepseek/deepseek-v3.1', 'deepseek/deepseek-r1'],
  },
  {
    label: 'NVIDIA',
    protocol: 'openai',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'openai/gpt-oss-120b',
    models: [
      'openai/gpt-oss-120b',
      'meta/llama-3.1-405b-instruct',
      'nvidia/llama-3.1-nemotron-70b-instruct',
    ],
  },
  {
    label: 'StepFun',
    protocol: 'openai',
    baseUrl: 'https://api.stepfun.ai/v1',
    model: 'step-2-mini',
    models: ['step-2-mini', 'step-1-8k', 'step-1-32k'],
  },
  {
    label: 'DeepSeek — OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    models: [
      'deepseek-chat',
      'deepseek-reasoner',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ],
  },
  {
    label: 'Mistral AI',
    protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    models: ['mistral-large-latest', 'ministral-8b-latest', 'ministral-3b-latest'],
  },
  {
    label: 'xAI',
    protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    model: 'grok-4',
    models: ['grok-4', 'grok-3', 'grok-3-mini'],
  },
  {
    label: 'Together AI',
    protocol: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    models: [
      'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      'Qwen/Qwen2.5-Coder-32B-Instruct',
    ],
  },
  {
    label: 'Hugging Face',
    protocol: 'openai',
    baseUrl: 'https://router.huggingface.co/v1',
    model: 'openai/gpt-oss-120b',
    models: [
      'openai/gpt-oss-120b',
      'Qwen/Qwen3-Coder-480B-A35B-Instruct',
      'meta-llama/Llama-3.1-8B-Instruct',
    ],
  },
  {
    label: 'Qwen',
    protocol: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max', 'qwen3-coder-plus'],
  },
  {
    label: 'Volcengine Ark',
    protocol: 'openai',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-1-6',
    models: ['doubao-seed-1-6', 'doubao-seed-1-6-thinking', 'deepseek-v3'],
  },
  {
    label: 'Baidu Qianfan',
    protocol: 'openai',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    model: 'ernie-4.5-turbo-128k',
    models: ['ernie-4.5-turbo-128k', 'ernie-4.5-8k-preview'],
  },
  {
    label: 'vLLM',
    protocol: 'openai',
    baseUrl: 'http://127.0.0.1:8000/v1',
    model: 'model',
    models: ['model', 'llama3', 'qwen3'],
    requiresApiKey: false,
  },
  {
    label: 'MiniMax — OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.minimax.io/v1',
    model: 'MiniMax-M2.7-highspeed',
    models: [
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.7',
      'MiniMax-M2.5-highspeed',
      'MiniMax-M2.5',
      'MiniMax-M2.1-highspeed',
      'MiniMax-M2.1',
      'MiniMax-M2',
    ],
  },
  {
    label: 'MiMo (Xiaomi) — OpenAI',
    protocol: 'openai',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    model: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro'],
  },
  {
    label: 'Moonshot',
    protocol: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'kimi-k2-0711-preview',
    models: ['kimi-k2-0711-preview', 'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
  },
  {
    label: 'Zhipu',
    protocol: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4.6',
    models: ['glm-4.6', 'glm-4-plus', 'glm-4-air'],
  },
  {
    label: 'Ollama Cloud (managed)',
    protocol: 'ollama',
    baseUrl: 'https://ollama.com',
    model: 'gpt-oss:120b',
    models: [
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
      'glm-5.2',
      'gpt-oss:20b',
      'gpt-oss:120b',
      'kimi-k2:1t',
      'kimi-k2-thinking',
      'kimi-k2.5',
      'kimi-k2.6',
      'kimi-k2.7-code',
      'minimax-m2',
      'minimax-m2.1',
      'minimax-m2.5',
      'minimax-m2.7',
      'minimax-m3',
      'ministral-3:3b',
      'ministral-3:8b',
      'ministral-3:14b',
      'mistral-large-3:675b',
      'nemotron-3-nano:30b',
      'nemotron-3-super',
      'nemotron-3-ultra',
      'qwen3-coder:480b',
      'qwen3-coder-next',
      'qwen3-next:80b',
      'qwen3-vl:235b',
      'qwen3-vl:235b-instruct',
      'qwen3.5:397b',
      'rnj-1:8b',
    ],
  },
  {
    label: 'Ollama Self-hosted (local)',
    protocol: 'ollama',
    baseUrl: 'http://localhost:11434',
    model: 'gemma3:4b',
    models: ['gemma3:4b', 'gemma3:12b', 'gemma3:27b', 'gpt-oss:20b'],
    requiresApiKey: false,
  },
  {
    label: 'MiMo (Xiaomi) — Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    model: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro'],
  },
  {
    label: 'SenseAudio',
    protocol: 'senseaudio',
    baseUrl: 'https://api.senseaudio.cn',
    model: 'senseaudio-s2',
    models: [
      'senseaudio-s2',
      'senseaudio-s2-flash',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'glm-5.1',
      'kimi-k2.6',
      'MiniMax-M2.7-highspeed',
      'MiniMax-M2.7',
    ],
  },
  {
    label: 'AIHubMix',
    protocol: 'aihubmix',
    baseUrl: 'https://aihubmix.com/v1',
    model: 'gpt-5.5',
    models: [
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
  },
];

function normalizePet(input: Partial<PetConfig> | undefined): PetConfig {
  if (!input) return { ...DEFAULT_PET, custom: { ...DEFAULT_PET.custom } };
  // Merge stored values onto defaults so newly-added fields land safely
  // when an older config is rehydrated.
  return {
    ...DEFAULT_PET,
    ...input,
    custom: { ...DEFAULT_PET.custom, ...(input.custom ?? {}) },
  };
}

function normalizeNotifications(
  input: Partial<NotificationsConfig> | undefined,
): NotificationsConfig {
  return { ...DEFAULT_NOTIFICATIONS, ...(input ?? {}) };
}

function normalizeOrbit(input: Partial<OrbitConfig> | undefined): OrbitConfig {
  const time = typeof input?.time === 'string' && isValidOrbitTime(input.time)
    ? input.time
    : DEFAULT_ORBIT.time;
  return { ...DEFAULT_ORBIT, ...(input ?? {}), time };
}

function isValidOrbitTime(time: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function isBedrockRuntimeBaseUrl(baseUrl: string): boolean {
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return (
      /^bedrock-runtime(?:-fips)?[.-].*\.amazonaws\.com(?:\.cn)?$/.test(hostname)
      || /^bedrock-runtime(?:-fips)?[.-].*\.api\.aws$/.test(hostname)
    );
  } catch {
    return false;
  }
}

function downgradeUnsupportedChatProtocol(config: AppConfig): boolean {
  if (
    config.apiProtocol !== 'bedrock'
    && !isBedrockRuntimeBaseUrl(config.baseUrl)
  ) {
    return false;
  }

  config.apiProtocol = DEFAULT_CONFIG.apiProtocol;
  config.apiKey = DEFAULT_CONFIG.apiKey;
  config.apiVersion = DEFAULT_CONFIG.apiVersion;
  config.baseUrl = DEFAULT_CONFIG.baseUrl;
  config.model = DEFAULT_CONFIG.model;
  config.apiProviderBaseUrl = DEFAULT_CONFIG.apiProviderBaseUrl;
  delete config.apiProtocolConfigs?.bedrock;
  return true;
}

function inferApiProtocol(model: string, baseUrl: string): ApiProtocol {
  try {
    const normalized = (baseUrl || '').toLowerCase();
    // Any config pointing at ollama.com should resolve to the new ollama
    // protocol so both chat and the connection test hit the native Ollama
    // proxy instead of the Anthropic or OpenAI paths.
    if (normalized.includes('ollama.com')) return 'ollama';
    // SenseAudio host gets routed to its own proxy so the daemon log line
    // and the BYOK tab UI stay consistent with the protocol the user
    // picked — even though the on-wire shape is OpenAI-compatible.
    if (normalized.includes('senseaudio.cn')) return 'senseaudio';
    // AIHubMix host routes to its own proxy so the daemon injects the
    // APP-Code attribution header even though the wire shape is
    // OpenAI-compatible.
    if (normalized.includes('aihubmix.com')) return 'aihubmix';
    return isOpenAICompatible(model, baseUrl) ? 'openai' : 'anthropic';
  } catch {
    // Preserve the rest of the user's settings even if an old saved base URL is
    // malformed enough for URL parsing to throw. Anthropic is the safest default
    // because it matches the original built-in provider.
    return 'anthropic';
  }
}

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_CONFIG,
        pet: normalizePet(DEFAULT_PET),
        notifications: normalizeNotifications(DEFAULT_NOTIFICATIONS),
        orbit: normalizeOrbit(DEFAULT_ORBIT),
      };
    }
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    // Strip daemon-owned privacy fields if a stale localStorage payload
    // still carries them. Older builds wrote these to localStorage; we
    // now treat the daemon as authoritative so the user can rotate /
    // revoke without leaving residue in browser storage.
    for (const key of DAEMON_OWNED_KEYS) {
      delete (parsed as Record<string, unknown>)[key];
    }
    const parsedHasApiProtocol = Object.prototype.hasOwnProperty.call(
      parsed,
      'apiProtocol',
    );
    const merged: AppConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      apiProtocolConfigs: { ...(parsed.apiProtocolConfigs ?? {}) },
      mediaProviders: { ...(parsed.mediaProviders ?? {}) },
      composio: { ...(parsed.composio ?? {}) },
      agentModels: { ...(parsed.agentModels ?? {}) },
      agentCliEnv: { ...(parsed.agentCliEnv ?? {}) },
      agentCliEnvIntent: { ...(parsed.agentCliEnvIntent ?? {}) },
      accentColor: normalizeAccentColor(parsed.accentColor) ?? DEFAULT_CONFIG.accentColor,
      pet: normalizePet(parsed.pet),
      notifications: normalizeNotifications(parsed.notifications),
      orbit: normalizeOrbit(parsed.orbit),
    };

    if (parsed.configMigrationVersion !== CONFIG_MIGRATION_VERSION) {
      // Migration v1: configs saved before apiProtocol existed need an explicit
      // protocol so old OpenAI-compatible endpoints keep routing correctly.
      // This is version-gated instead of only field-gated so a later imported
      // legacy config can be migrated when it is loaded.
      if (!parsedHasApiProtocol) {
        merged.apiProtocol = inferApiProtocol(merged.model, merged.baseUrl);
        // Ollama Cloud legacy configs may carry a base URL that includes
        // /api or /api/ — normalize to the host root so the daemon's own
        // /api/chat appending doesn't double up.
        if (merged.apiProtocol === 'ollama') {
          merged.baseUrl = merged.baseUrl
            .replace(/\/api\/?$/, '')
            .replace(/\/+$/, '');
        }
        // Also set apiProviderBaseUrl so setApiProtocol() can correctly identify
        // whether the user is on a known provider and switch defaults appropriately.
        // null means "custom/unknown provider" so the protocol switch won't override
        // their custom base URL.
        const knownProvider = KNOWN_PROVIDERS.find(
          (p) => p.baseUrl === merged.baseUrl,
        );
        merged.apiProviderBaseUrl = knownProvider?.baseUrl ?? null;
      }
      merged.configMigrationVersion = CONFIG_MIGRATION_VERSION;
    }

    const downgradedUnsupportedChatProtocol =
      downgradeUnsupportedChatProtocol(merged);

    // Fixed-origin gateways (e.g. AIHubMix) hide the Base URL field, so a config
    // persisted before the origin was auto-resolved can carry an empty baseUrl.
    // Backfill it here so every consumer (Settings form, top-bar switcher, chat)
    // sees the canonical origin — an empty value otherwise blocks the live
    // model-list fetch and leaves only the static suggestion list.
    if (merged.apiProtocol) {
      merged.baseUrl = resolveFixedOriginBaseUrl(merged.apiProtocol, merged.baseUrl);
    }

    if (downgradedUnsupportedChatProtocol) {
      saveConfig(merged);
    }

    return merged;
  } catch {
    return {
      ...DEFAULT_CONFIG,
      pet: normalizePet(DEFAULT_PET),
      notifications: normalizeNotifications(DEFAULT_NOTIFICATIONS),
      orbit: normalizeOrbit(DEFAULT_ORBIT),
    };
  }
}

interface PublicComposioConfigResponse {
  configured?: boolean;
  apiKeyTail?: string;
}

interface PublicMediaProviderConfigEntry {
  configured?: boolean;
  source?: string;
  apiKeyTail?: string;
  baseUrl?: string;
  model?: string;
}

interface PublicMediaProviderConfigResponse {
  providers?: Record<string, PublicMediaProviderConfigEntry>;
}

export type DaemonMediaProvidersFetchResult =
  | {
    status: 'ok';
    providers: AppConfig['mediaProviders'];
  }
  | {
    status: 'error';
  };

interface MediaProviderDaemonWriteEntry {
  apiKey?: string;
  preserveApiKey?: boolean;
  baseUrl?: string;
  model?: string;
}

interface MediaProviderDaemonWriteRequest {
  providers: Record<string, MediaProviderDaemonWriteEntry>;
  force: boolean;
}

function hasAnyDaemonManagedMediaProvider(
  providers: Record<string, MediaProviderCredentials> | null | undefined,
): boolean {
  if (!providers) return false;
  return Object.values(providers).some((entry) => isStoredMediaProviderEntryPresent(entry));
}

function hasRecoverableLocalMediaProviderFields(
  entry: MediaProviderCredentials | null | undefined,
): boolean {
  return Boolean(
    entry?.apiKey?.trim()
    || entry?.baseUrl?.trim()
    || entry?.model?.trim(),
  );
}

function isMarkerOnlyMediaProviderEntry(
  entry: MediaProviderCredentials | null | undefined,
): boolean {
  return isStoredMediaProviderEntryPresent(entry)
    && !hasRecoverableLocalMediaProviderFields(entry);
}

export function isStoredMediaProviderEntryPresent(
  entry: MediaProviderCredentials | null | undefined,
): boolean {
  return Boolean(
    entry?.apiKey?.trim()
    || entry?.baseUrl?.trim()
    || entry?.model?.trim()
    || entry?.apiKeyConfigured
    || entry?.apiKeyTail?.trim(),
  );
}

export function isStoredMediaProviderEntryEmpty(
  entry: MediaProviderCredentials | null | undefined,
): boolean {
  return !isStoredMediaProviderEntryPresent(entry);
}

function defaultBaseUrlForProvider(providerId: string): string {
  return MEDIA_PROVIDERS.find((provider) => provider.id === providerId)?.defaultBaseUrl ?? '';
}

export function buildMediaProvidersForDaemonSave(
  currentProviders: Record<string, MediaProviderCredentials> | undefined,
  daemonProviders: Record<string, MediaProviderCredentials> | null | undefined,
  options?: { force?: boolean },
): MediaProviderDaemonWriteRequest {
  const providers: Record<string, MediaProviderDaemonWriteEntry> = {};
  for (const [providerId, currentEntry] of Object.entries(currentProviders ?? {})) {
    const daemonEntry = daemonProviders?.[providerId];
    const apiKey = currentEntry?.apiKey?.trim() ?? '';
    const hasStoredKeyMarker = Boolean(
      currentEntry?.apiKeyTail?.trim()
      || daemonEntry?.apiKeyTail?.trim(),
    );
    const preserveApiKey = !apiKey && Boolean(
      currentEntry?.apiKeyConfigured
      && hasStoredKeyMarker,
    );
    const explicitBaseUrl =
      currentEntry?.baseUrl?.trim()
      || daemonEntry?.baseUrl?.trim()
      || '';
    const model = currentEntry?.model?.trim() || daemonEntry?.model?.trim() || '';
    if (!apiKey && !preserveApiKey && !explicitBaseUrl && !model) continue;
    const baseUrl = explicitBaseUrl || defaultBaseUrlForProvider(providerId);
    providers[providerId] = {
      ...(apiKey ? { apiKey } : {}),
      ...(preserveApiKey ? { preserveApiKey: true } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(model ? { model } : {}),
    };
  }
  return {
    providers,
    force: Boolean(options?.force),
  };
}

export async function fetchComposioConfigFromDaemon(): Promise<AppConfig['composio'] | null> {
  try {
    const response = await fetch('/api/connectors/composio/config');
    if (!response.ok) return null;
    const payload = await response.json() as PublicComposioConfigResponse;
    return {
      apiKey: '',
      apiKeyConfigured: Boolean(payload.configured),
      apiKeyTail: payload.apiKeyTail ?? '',
    };
  } catch {
    return null;
  }
}

export async function fetchMediaProvidersFromDaemon(): Promise<DaemonMediaProvidersFetchResult> {
  try {
    const response = await fetch('/api/media/config');
    if (!response.ok) return { status: 'error' };
    const payload = await response.json() as PublicMediaProviderConfigResponse;
    const rawProviders = payload.providers ?? {};
    const providers: AppConfig['mediaProviders'] = {};
    for (const [providerId, entry] of Object.entries(rawProviders)) {
      providers[providerId] = {
        apiKey: '',
        apiKeyConfigured: Boolean(entry?.configured),
        apiKeyTail: entry?.apiKeyTail ?? '',
        baseUrl: entry?.baseUrl ?? '',
        ...(typeof entry?.source === 'string' && entry.source.trim()
          ? { source: entry.source.trim() }
          : {}),
        ...(typeof entry?.model === 'string' && entry.model.trim()
          ? { model: entry.model.trim() }
          : {}),
      };
    }
    return {
      status: 'ok',
      providers,
    };
  } catch {
    return { status: 'error' };
  }
}

export async function syncComposioConfigToDaemon(
  config: AppConfig['composio'] | undefined,
): Promise<boolean> {
  const apiKey = config?.apiKey ?? '';
  const payload = {
    ...(apiKey.trim() || !config?.apiKeyConfigured ? { apiKey } : {}),
  };
  try {
    const response = await fetch('/api/connectors/composio/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Privacy-sensitive fields the user can revoke. We deliberately keep
// these out of localStorage so the daemon remains the single source of
// truth: clearing app-config.json (or rotating via "Delete my data")
// fully resets the install identity, with no residual cohort key
// silently sitting in browser storage where the user can't see it.
const DAEMON_OWNED_KEYS = new Set<keyof AppConfig>([
  'installationId',
  'telemetry',
  'privacyDecisionAt',
  'allowSilentUpdates',
]);

const AGENT_CLI_SECRET_ENV_KEYS = new Set([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CODEX_API_KEY',
  'OPENAI_API_KEY',
]);

function sanitizeAgentCliEnv(agentCliEnv: AppConfig['agentCliEnv']): AppConfig['agentCliEnv'] {
  if (!agentCliEnv) return agentCliEnv;
  const sanitized: NonNullable<AppConfig['agentCliEnv']> = {};
  for (const [agentId, env] of Object.entries(agentCliEnv)) {
    const safeEnv = Object.fromEntries(
      Object.entries(env ?? {}).filter(([key]) => !AGENT_CLI_SECRET_ENV_KEYS.has(key)),
    );
    sanitized[agentId] = safeEnv;
  }
  return sanitized;
}

export function saveConfig(config: AppConfig): void {
  const sanitized: AppConfig = { ...config, agentCliEnv: sanitizeAgentCliEnv(config.agentCliEnv) };
  for (const key of DAEMON_OWNED_KEYS) {
    delete (sanitized as unknown as Record<string, unknown>)[key];
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
}

export function mergeDaemonConfig(
  localConfig: AppConfig,
  daemonConfig: AppConfigPrefs | null,
): AppConfig {
  const next = { ...localConfig };
  if (!daemonConfig) return next;

  if (daemonConfig.onboardingCompleted != null) {
    next.onboardingCompleted = daemonConfig.onboardingCompleted;
  }
  if (daemonConfig.agentId !== undefined) {
    next.agentId = daemonConfig.agentId;
  }
  if (daemonConfig.skillId !== undefined) {
    next.skillId = daemonConfig.skillId;
  }
  if (daemonConfig.designSystemId !== undefined) {
    next.designSystemId = daemonConfig.designSystemId;
  }
  if (daemonConfig.agentModels) {
    next.agentModels = {
      ...(next.agentModels ?? {}),
      ...daemonConfig.agentModels,
    };
  }
  next.agentCliEnv = daemonConfig.agentCliEnv ?? {};
  next.agentCliEnvIntent = daemonConfig.agentCliEnvIntent ?? {};
  if (daemonConfig.disabledSkills !== undefined) {
    next.disabledSkills = daemonConfig.disabledSkills;
  }
  if (daemonConfig.disabledDesignSystems !== undefined) {
    next.disabledDesignSystems = daemonConfig.disabledDesignSystems;
  }
  if (daemonConfig.orbit !== undefined) {
    next.orbit = normalizeOrbit(daemonConfig.orbit);
  }
  if (daemonConfig.installationId !== undefined) {
    next.installationId = daemonConfig.installationId;
  }
  if (daemonConfig.telemetry !== undefined) {
    next.telemetry = { ...daemonConfig.telemetry };
  }
  if (daemonConfig.privacyDecisionAt !== undefined) {
    next.privacyDecisionAt = daemonConfig.privacyDecisionAt;
  } else if (
    daemonConfig.installationId !== undefined ||
    daemonConfig.telemetry !== undefined
  ) {
    // One-shot migration for configs created before privacyDecisionAt
    // existed. If the daemon already has an id or telemetry prefs, the user
    // has resolved the first-run prompt and should not see it again.
    next.privacyDecisionAt = Date.now();
  }
  // Default-on reporting. Unless the user has explicitly opted out
  // (Settings → "Don't share", which persists telemetry.metrics === false
  // together with installationId: null), an install reports with the
  // product's default telemetry channels on and carries a stable
  // installationId. This is the single source of the "Opted out" state:
  // previously an upgraded or never-prompted install could sit with
  // telemetry on but no id (the daemon ships a metrics+content default but
  // never mints an id), which the Settings → Privacy field rendered as
  // "Opted out" even though the user never declined. We mint the id and
  // keep the default channels on so the displayed state matches the product
  // default — the same metrics+content surface the first-run banner's
  // "Share" choice enables (artifactManifest stays off, as it
  // does there).
  // This does NOT override an explicit opt-out: metrics === false short-
  // circuits the whole block, and any channel the user already turned off
  // is preserved via the nullish-coalesce.
  const explicitlyOptedOut = next.telemetry?.metrics === false;
  if (!explicitlyOptedOut && !next.installationId) {
    next.installationId = randomUUID();
    next.telemetry = {
      metrics: true,
      content: next.telemetry?.content ?? true,
      artifactManifest: next.telemetry?.artifactManifest ?? false,
    };
  }
  if (daemonConfig.allowSilentUpdates !== undefined) {
    next.allowSilentUpdates = daemonConfig.allowSilentUpdates;
  } else {
    delete next.allowSilentUpdates;
  }
  if (daemonConfig.customInstructions !== undefined) {
    next.customInstructions = daemonConfig.customInstructions ?? undefined;
  }
  if (daemonConfig.projectLocations !== undefined) {
    next.projectLocations = daemonConfig.projectLocations;
  }
  if (daemonConfig.defaultProjectLocationId !== undefined) {
    next.defaultProjectLocationId = daemonConfig.defaultProjectLocationId ?? 'default';
  }
  return next;
}

export function mergeDaemonMediaProviders(
  localConfig: AppConfig,
  daemonProviders: AppConfig['mediaProviders'] | null,
  options?: {
    preserveLocalProviderIds?: ReadonlySet<string>;
  },
): AppConfig {
  if (daemonProviders == null) {
    return { ...localConfig };
  }

  if (!hasAnyDaemonManagedMediaProvider(daemonProviders)) {
    return {
      ...localConfig,
      mediaProviders: Object.fromEntries(
        Object.entries(localConfig.mediaProviders ?? {}).filter(([, entry]) => !isMarkerOnlyMediaProviderEntry(entry)),
      ),
    };
  }

  const mediaProviders = { ...(localConfig.mediaProviders ?? {}) };
  for (const [providerId, daemonEntry] of Object.entries(daemonProviders ?? {})) {
    if (!isStoredMediaProviderEntryPresent(daemonEntry)) continue;
    const localEntry = mediaProviders[providerId];
    const preserveLocalPendingEdit = Boolean(
      options?.preserveLocalProviderIds?.has(providerId)
      && hasRecoverableLocalMediaProviderFields(localEntry),
    );
    mediaProviders[providerId] = preserveLocalPendingEdit
      ? { ...daemonEntry, ...localEntry }
      : { ...daemonEntry };
  }

  return {
    ...localConfig,
    mediaProviders,
  };
}

export function hasAnyConfiguredProvider(
  providers: Record<string, MediaProviderCredentials> | undefined,
): boolean {
  if (!providers) return false;
  return Object.values(providers).some((entry) => isStoredMediaProviderEntryPresent(entry));
}

export function shouldSyncLocalMediaProvidersToDaemon(
  localProviders: Record<string, MediaProviderCredentials> | undefined,
  daemonProviders: Record<string, MediaProviderCredentials> | null | undefined,
): boolean {
  return daemonProviders != null
    && Object.values(localProviders ?? {}).some((entry) => hasRecoverableLocalMediaProviderFields(entry))
    && !hasAnyDaemonManagedMediaProvider(daemonProviders);
}

export async function syncMediaProvidersToDaemon(
  providers: Record<string, MediaProviderCredentials> | undefined,
  options?: {
    force?: boolean;
    daemonProviders?: Record<string, MediaProviderCredentials> | null;
    throwOnError?: boolean;
  },
): Promise<void> {
  if (!providers) return;
  try {
    const payload = buildMediaProvidersForDaemonSave(
      providers,
      options?.daemonProviders,
      { force: options?.force },
    );
    const response = await fetch('/api/media/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Failed to sync media config (${response.status})`);
  } catch {
    if (options?.throwOnError) throw new Error('Media config save failed');
    // Daemon offline; localStorage keeps the user's copy for the next save.
  }
}

export async function fetchDaemonConfig(): Promise<AppConfigPrefs | null> {
  try {
    const res = await fetch('/api/app-config');
    if (!res.ok) return null;
    const data = await res.json();
    return data?.config ?? null;
  } catch {
    return null;
  }
}

export async function syncConfigToDaemon(
  config: AppConfig,
  options?: { throwOnError?: boolean },
): Promise<void> {
  const prefs: AppConfigPrefs = {
    onboardingCompleted: config.onboardingCompleted,
    agentId: config.agentId,
    agentModels: config.agentModels,
    agentCliEnv: config.agentCliEnv,
    agentCliEnvIntent: config.agentCliEnvIntent,
    skillId: config.skillId,
    designSystemId: config.designSystemId,
    disabledSkills: config.disabledSkills,
    disabledDesignSystems: config.disabledDesignSystems,
    orbit: normalizeOrbit(config.orbit),
    installationId: config.installationId,
    telemetry: config.telemetry,
    privacyDecisionAt: config.privacyDecisionAt,
    allowSilentUpdates: config.allowSilentUpdates,
    customInstructions: config.customInstructions ?? null,
    projectLocations: config.projectLocations ?? [],
    defaultProjectLocationId: config.defaultProjectLocationId ?? 'default',
  };
  try {
    const response = await fetch('/api/app-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    if (!response.ok) throw new Error(`Failed to sync app config (${response.status})`);
  } catch (error) {
    if (options?.throwOnError) throw error;
    // Daemon offline; localStorage keeps the user's copy for the next save.
  }
}
