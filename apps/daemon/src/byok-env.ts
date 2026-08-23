import type {
  ByokChatProtocol,
  ByokChatProviderConfig,
  ByokHostDefaultsView,
} from '@open-design/contracts';

/**
 * Host-managed default BYOK provider for server deployments.
 *
 * Today every BYOK chat/provider field travels from the browser (kept in the
 * browser's localStorage). On a server deployment (Docker on a cloud host,
 * Railway, an internal platform) the host already holds an inference key and
 * re-entering it per browser makes no sense — and leaks it into browser
 * storage it never needed to touch.
 *
 * With OD_BYOK_BASE_URL + OD_BYOK_MODEL set (and OD_BYOK_API_KEY when the
 * endpoint needs one), the daemon fills the provider when a request carries
 * none. The key never leaves the daemon: run execution and the chat proxy
 * use it server-side, and no endpoint exposes it.
 *
 * Browser-sent config always wins when present — this is a default, not an
 * override.
 */

const VALID_PROTOCOLS: readonly ByokChatProtocol[] = [
  'anthropic',
  'openai',
  'azure',
  'google',
  'ollama',
  'senseaudio',
  'aihubmix',
];

export interface EnvByokDefault {
  provider: ByokChatProviderConfig;
  model: string;
}

/**
 * Read the host-managed provider from the environment, or null when not
 * configured (OD_BYOK_BASE_URL and OD_BYOK_MODEL are the activation pair) or
 * when OD_BYOK_PROTOCOL names an unknown protocol (fail-closed: a typo must
 * not silently wire a wrong-shaped endpoint).
 */
export function readEnvByokDefault(
  env: NodeJS.ProcessEnv = process.env,
): EnvByokDefault | null {
  const baseUrl = env.OD_BYOK_BASE_URL?.trim();
  const model = env.OD_BYOK_MODEL?.trim();
  if (!baseUrl || !model) return null;
  const rawProtocol = env.OD_BYOK_PROTOCOL?.trim() || 'anthropic';
  if (!VALID_PROTOCOLS.includes(rawProtocol as ByokChatProtocol)) return null;
  const apiKey = env.OD_BYOK_API_KEY?.trim() ?? '';
  return {
    provider: {
      protocol: rawProtocol as ByokChatProtocol,
      apiKey,
      baseUrl,
      // Preserves the per-request contract shape; keyless endpoints (a local
      // Ollama) set no key and don't require one.
      requiresApiKey: apiKey.length > 0,
    },
    model,
  };
}

/**
 * What the web and CLI may learn about the host-managed provider — enough to
 * badge "managed by host environment", pre-fill the model, and relax the
 * browser-side local-config preflight. NEVER the key: only a tail for
 * identification.
 */
export function envByokDefaultsView(
  env: NodeJS.ProcessEnv = process.env,
): ByokHostDefaultsView {
  const d = readEnvByokDefault(env);
  if (!d) return { configured: false };
  return {
    configured: true,
    protocol: d.provider.protocol,
    ...(d.provider.baseUrl ? { baseUrl: d.provider.baseUrl } : {}),
    model: d.model,
    ...(d.provider.apiKey ? { apiKeyTail: d.provider.apiKey.slice(-4) } : {}),
  };
}

/** The env default when it matches the given protocol, else null. */
export function envByokDefaultForProtocol(
  protocol: ByokChatProtocol,
  env: NodeJS.ProcessEnv = process.env,
): EnvByokDefault | null {
  const d = readEnvByokDefault(env);
  return d && d.provider.protocol === protocol ? d : null;
}

/**
 * Scope the env default to the BYOK runtime. The fallback exists so a
 * server deployment can pre-wire BYOK OpenCode runs; it must NEVER touch
 * an ordinary agent's wiring — a Claude/Codex/opencode run that omits
 * `model` keeps its own configured/default model, and its memory
 * extraction keeps describing the chat's real provider. Reads the env
 * only when the run is byok-opencode AND the browser sent no provider.
 */
export function scopeEnvByokForAgent(params: {
  agentId: string | null | undefined;
  byokProvider: ByokChatProviderConfig | null | undefined;
  model: unknown;
  env?: NodeJS.ProcessEnv;
}): {
  provider: ByokChatProviderConfig | undefined;
  model: unknown;
} {
  const envByok =
    params.byokProvider || params.agentId !== 'byok-opencode'
      ? null
      : readEnvByokDefault(params.env);
  return {
    provider: params.byokProvider ?? envByok?.provider ?? undefined,
    model:
      params.byokProvider || !envByok
        ? params.model
        : typeof params.model === 'string' && params.model.trim()
          ? params.model
          : envByok.model,
  };
}

/**
 * Resolve the proxy provider fields ATOMICALLY: the request's own tuple
 * wins when complete; the host-managed env tuple applies only when the
 * request carries NO provider fields at all; a partial request (e.g. a
 * caller-supplied baseUrl with no apiKey) resolves to null so the route
 * rejects it. Per-field mixing would forward the host key to a
 * request-controlled upstream — credential exfiltration.
 */
export function resolveProxyProviderFields(
  body: {
    baseUrl?: unknown;
    apiKey?: unknown;
    model?: unknown;
    [key: string]: unknown;
  },
  envDefault: EnvByokDefault | null,
): { baseUrl: string; apiKey: string; model: string } | null {
  const pick = (v: unknown): string =>
    typeof v === 'string' && v.trim() ? v.trim() : '';
  const bUrl = pick(body.baseUrl);
  const bKey = pick(body.apiKey);
  const bModel = pick(body.model);
  const anyProvided = Boolean(bUrl || bKey || bModel);
  if (anyProvided) {
    return bUrl && bKey && bModel
      ? { baseUrl: bUrl, apiKey: bKey, model: bModel }
      : null;
  }
  if (!envDefault) return null;
  const envBaseUrl = envDefault.provider.baseUrl;
  if (!envBaseUrl) return null;
  return {
    baseUrl: envBaseUrl,
    apiKey: envDefault.provider.apiKey,
    model: envDefault.model,
  };
}
