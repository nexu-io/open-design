import type { RuntimeAgentDef, RuntimeModelOption } from './types.js';

export const DEFAULT_MODEL_OPTION: RuntimeModelOption = {
  id: 'default',
  label: 'Default (CLI config)',
};

// Daemon's /api/chat needs to validate the user's model pick against the
// list we last surfaced to the UI. We keep a per-agent cache of the most
// recent live list (refreshed every detectAgents() call) and additionally
// trust any value present in the static fallback. A model that's neither
// gets rejected so a stale or hostile value can't smuggle arbitrary flags.
const liveModelCache = new Map<string, Set<string>>();
const liveModelOrder = new Map<string, RuntimeModelOption[]>();

function liveModelCacheKey(agentId: string, scope?: string | null): string {
  const trimmedScope = typeof scope === 'string' ? scope.trim() : '';
  return trimmedScope ? `${agentId}\0${trimmedScope}` : agentId;
}

export function rememberLiveModels(agentId: string, models: RuntimeModelOption[], scope?: string | null) {
  if (!Array.isArray(models)) return;
  const remembered = models.filter(
    (model): model is RuntimeModelOption =>
      model != null && typeof model.id === 'string',
  );
  const ids = remembered.map((model) => model.id);
  const key = liveModelCacheKey(agentId, scope);
  liveModelCache.set(
    key,
    new Set(ids),
  );
  liveModelOrder.set(key, remembered);
}

export function resolveDefaultModelFromOptions(
  models: RuntimeModelOption[],
): string | null {
  const candidates = models.filter((model) => model?.id && model.enabled !== false);
  const defaultModel = candidates.find((model) => model.default === true);
  return defaultModel?.id ?? candidates[0]?.id ?? null;
}

export function getRememberedLiveModels(agentId: string, scope?: string | null): RuntimeModelOption[] {
  return liveModelOrder.get(liveModelCacheKey(agentId, scope)) ?? [];
}

export function preferFreshLiveModels(
  freshModels: RuntimeModelOption[],
  rememberedModels: RuntimeModelOption[],
): RuntimeModelOption[] {
  return freshModels.length > 0 ? freshModels : rememberedModels;
}

export function isKnownModel(
  def: RuntimeAgentDef,
  modelId: string | null | undefined,
  scope?: string | null,
) {
  if (!modelId) return false;
  const live = liveModelCache.get(liveModelCacheKey(def.id, scope));
  if (live && live.has(modelId)) return true;
  if (Array.isArray(def.fallbackModels)) {
    return def.fallbackModels.some((m) => m.id === modelId);
  }
  return false;
}

// Some adapters omit the synthetic `'default'` option from `fallbackModels`
// because they only accept concrete ids for explicit model selection. When a
// chat run has no model at all, prefer the first model from the live list last
// surfaced to the UI, then fall back to the def's first concrete fallback id.
// An explicit `'default'` choice is preserved so ACP runtimes can leave model
// selection to the upstream session's own configured default.
export function resolveModelForAgent(
  def: RuntimeAgentDef,
  resolved: string | null,
  env: Record<string, string | undefined> = process.env,
  liveModelScope?: string | null,
): string | null {
  if (resolved && resolved !== 'default') return resolved;
  if (resolved === 'default') return resolved;
  // Daemon-process env override (e.g. VELA_DEFAULT_MODEL for AMR). Lets an
  // operator pin a different fallback id without a code change when the
  // hardcoded default goes away upstream.
  if (def.defaultModelEnvVar) {
    const raw = env[def.defaultModelEnvVar];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  const fallbacks = Array.isArray(def.fallbackModels) ? def.fallbackModels : [];
  if (fallbacks.some((m) => m.id === 'default')) return resolved;
  const liveModels = getRememberedLiveModels(def.id, liveModelScope);
  const defaultLive = resolveDefaultModelFromOptions(liveModels);
  if (defaultLive) return defaultLive;
  if (fallbacks.length === 0) return resolved;
  return resolveDefaultModelFromOptions(fallbacks) ?? resolved;
}

// Permit user-typed model ids that didn't appear in either the live
// listing or the static fallback (e.g. the user is on a brand-new model
// the CLI's `models` command hasn't surfaced yet). The CLI gets the value
// as a child-process arg — not a shell string — so injection isn't a
// concern, but we still reject anything that could be misread as a flag
// by a downstream CLI or that contains whitespace / control chars.
export function sanitizeCustomModel(id: string | null | undefined) {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/.test(trimmed)) return null;
  return trimmed;
}
