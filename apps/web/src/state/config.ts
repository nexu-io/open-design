import type { AppConfig, MediaProviderCredentials } from '../types';

const STORAGE_KEY = 'open-design:config';

// Daemon-hosted builds (Lumina gateway-override) route LLM calls through
// `/api/proxy/stream` regardless of these values — the daemon overrides the
// user's BYOK creds with LUMINA_GATEWAY_TOKEN server-side. Default to
// `api` mode + `openclaw` model + `onboardingCompleted: true` so the
// Welcome modal never blocks the chat composer for fresh users.
// `daemon` mode (CLI subprocess) is unavailable inside the container —
// no CLI binaries shipped — so leaving that as default surfaces a silent
// no-op when the user hits Send.
export const DEFAULT_CONFIG: AppConfig = {
  mode: 'api',
  apiKey: 'lumina-managed',
  baseUrl: 'https://lumina-gateway-managed',
  model: 'openclaw',
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
};

/** Well-known providers with pre-filled base URLs. */
export const KNOWN_PROVIDERS: Array<{ label: string; baseUrl: string; model: string }> = [
  { label: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5' },
  { label: 'MiMo (Xiaomi) — OpenAI', baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1', model: 'mimo-v2.5-pro' },
  { label: 'MiMo (Xiaomi) — Anthropic', baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic', model: 'mimo-v2.5-pro' },
];

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      mediaProviders: { ...(parsed.mediaProviders ?? {}) },
      agentModels: { ...(parsed.agentModels ?? {}) },
    };
  } catch {
    return { ...DEFAULT_CONFIG };
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
