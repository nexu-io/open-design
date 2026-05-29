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
const liveModelOrder = new Map<string, string[]>();

export function rememberLiveModels(agentId: string, models: RuntimeModelOption[]) {
  if (!Array.isArray(models)) return;
  const ids = models
    .map((m) => m && m.id)
    .filter((id) => typeof id === 'string');
  liveModelCache.set(
    agentId,
    new Set(ids),
  );
  liveModelOrder.set(agentId, ids);
}

export function getRememberedLiveModels(agentId: string): RuntimeModelOption[] {
  const ids = liveModelOrder.get(agentId) ?? [];
  return ids.map((id) => ({ id, label: id }));
}

export function preferFreshLiveModels(
  freshModels: RuntimeModelOption[],
  rememberedModels: RuntimeModelOption[],
): RuntimeModelOption[] {
  return freshModels.length > 0 ? freshModels : rememberedModels;
}

export function isKnownModel(def: RuntimeAgentDef, modelId: string | null | undefined) {
  if (!modelId) return false;
  const live = liveModelCache.get(def.id);
  if (live && live.has(modelId)) return true;
  if (Array.isArray(def.fallbackModels)) {
    return def.fallbackModels.some((m) => m.id === modelId);
  }
  return false;
}

// Some adapters reject the synthetic `'default'` model id (e.g. AMR / vela,
// which requires an explicit `session/set_model` before `session/prompt`).
// Those defs declare it by omitting DEFAULT_MODEL_OPTION from
// `fallbackModels` entirely. When the chat run produces a null or 'default'
// model for one of those adapters, prefer the first model from the live list
// last surfaced to the UI, then fall back to the def's first concrete fallback
// id so the spawn layer always has a real model to forward.
// Defs that DO list 'default' (the common case) are left untouched.
export function resolveModelForAgent(
  def: RuntimeAgentDef,
  resolved: string | null,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (resolved && resolved !== 'default') return resolved;
  // Daemon-process env override (e.g. VELA_DEFAULT_MODEL for AMR). Lets an
  // operator pin a different fallback id without a code change when the
  // hardcoded default goes away upstream.
  if (def.defaultModelEnvVar) {
    const raw = env[def.defaultModelEnvVar];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  const fallbacks = Array.isArray(def.fallbackModels) ? def.fallbackModels : [];
  if (fallbacks.some((m) => m.id === 'default')) return resolved;
  const liveModels = liveModelOrder.get(def.id) ?? [];
  const firstLive = liveModels[0];
  if (firstLive) return firstLive;
  if (fallbacks.length === 0) return resolved;
  const firstFallback = fallbacks[0];
  return firstFallback ? firstFallback.id : resolved;
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
