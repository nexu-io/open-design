import type { AppConfigPrefs } from '@open-design/contracts';
import { isOpenAICompatible } from '../providers/openai-compatible';
import type {
  ApiProtocol,
  AppConfig,
  MediaProviderCredentials,
  NotificationsConfig,
  PetConfig,
} from '../types';
import {
  DEFAULT_FAILURE_SOUND_ID,
  DEFAULT_SUCCESS_SOUND_ID,
} from '../utils/notifications';

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

export const DEFAULT_CONFIG: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  // New configs should be explicit. loadConfig() still detects parsed legacy
  // saved configs that did not have this field and migrates those from their
  // saved baseUrl/model before applying the current migration version.
  apiProtocol: 'anthropic',
  configMigrationVersion: CONFIG_MIGRATION_VERSION,
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: false,
  theme: 'system',
  mediaProviders: {},
  agentModels: {},
  pet: DEFAULT_PET,
  notifications: DEFAULT_NOTIFICATIONS,
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
    baseUrl: 'https://api.minimaxi.com/anthropic',
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
    label: 'MiniMax — OpenAI',
    protocol: 'openai',
    baseUrl: 'https://api.minimaxi.com/v1',
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
    label: 'MiMo (Xiaomi) — Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
    model: 'mimo-v2.5-pro',
    models: ['mimo-v2.5-pro'],
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

function inferApiProtocol(model: string, baseUrl: string): ApiProtocol {
  try {
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
      };
    }
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    const parsedHasApiProtocol = Object.prototype.hasOwnProperty.call(
      parsed,
      'apiProtocol',
    );
    const merged: AppConfig = {
      ...DEFAULT_CONFIG,
      ...parsed,
      mediaProviders: { ...(parsed.mediaProviders ?? {}) },
      agentModels: { ...(parsed.agentModels ?? {}) },
      pet: normalizePet(parsed.pet),
      notifications: normalizeNotifications(parsed.notifications),
    };

    if (parsed.configMigrationVersion !== CONFIG_MIGRATION_VERSION) {
      // Migration v1: configs saved before apiProtocol existed need an explicit
      // protocol so old OpenAI-compatible endpoints keep routing correctly.
      // This is version-gated instead of only field-gated so a later imported
      // legacy config can be migrated when it is loaded.
      if (!parsedHasApiProtocol && merged.mode === 'api') {
        merged.apiProtocol = inferApiProtocol(merged.model, merged.baseUrl);
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

    return merged;
  } catch {
    return {
      ...DEFAULT_CONFIG,
      pet: normalizePet(DEFAULT_PET),
      notifications: normalizeNotifications(DEFAULT_NOTIFICATIONS),
    };
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function hasAnyConfiguredProvider(
  providers: Record<string, MediaProviderCredentials> | undefined,
): boolean {
  if (!providers) return false;
  return Object.values(providers).some((entry) =>
    Boolean(entry?.apiKey?.trim() || entry?.baseUrl?.trim()),
  );
}

export async function syncMediaProvidersToDaemon(
  providers: Record<string, MediaProviderCredentials> | undefined,
  options?: { force?: boolean },
): Promise<void> {
  if (!providers) return;
  try {
    await fetch('/api/media/config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ providers, force: Boolean(options?.force) }),
    });
  } catch {
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

export async function syncConfigToDaemon(config: AppConfig): Promise<void> {
  const prefs: AppConfigPrefs = {
    onboardingCompleted: config.onboardingCompleted,
    agentId: config.agentId,
    agentModels: config.agentModels,
    skillId: config.skillId,
    designSystemId: config.designSystemId,
  };
  try {
    await fetch('/api/app-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(prefs),
    });
  } catch {
    // Daemon offline; localStorage keeps the user's copy for the next save.
  }
}
