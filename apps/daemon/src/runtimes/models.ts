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
const liveModelCache = new Map<string, Map<string, RuntimeModelOption>>();

export function rememberLiveModels(agentId: string, models: RuntimeModelOption[]) {
  if (!Array.isArray(models)) return;
  liveModelCache.set(
    agentId,
    new Map(
      models
        .filter((m) => m && typeof m.id === 'string')
        .map((m) => [m.id, m]),
    ),
  );
}

export function findKnownModel(
  def: RuntimeAgentDef,
  modelId: string | null | undefined,
): RuntimeModelOption | null {
  if (!modelId) return null;
  const live = liveModelCache.get(def.id);
  const liveModel = live?.get(modelId);
  if (liveModel) return liveModel;
  if (Array.isArray(def.fallbackModels)) {
    return def.fallbackModels.find((m) => m.id === modelId) ?? null;
  }
  return null;
}

export function isKnownModel(def: RuntimeAgentDef, modelId: string | null | undefined) {
  return Boolean(findKnownModel(def, modelId));
}

export function isKnownServiceTier(
  def: RuntimeAgentDef,
  modelId: string | null | undefined,
  serviceTier: string | null | undefined,
) {
  if (!serviceTier || serviceTier === 'default') return false;
  const model = findKnownModel(def, modelId);
  return Boolean(
    model?.serviceTierOptions?.some((tier) => tier.id === serviceTier),
  );
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
