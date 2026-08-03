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
const liveModelOrder = new Map<string, RuntimeModelOption[]>();
const liveModelCache = new Map<string, Map<string, RuntimeModelOption>>();

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
  const key = liveModelCacheKey(agentId, scope);
  liveModelCache.set(
    key,
    new Map(remembered.map((model) => [model.id, model])),
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

function findFallbackModel(
  def: RuntimeAgentDef,
  modelId: string,
): RuntimeModelOption | null {
  if (!Array.isArray(def.fallbackModels)) return null;
  return def.fallbackModels.find((m) => m.id === modelId) ?? null;
}

function cloneModelOptions(options: RuntimeModelOption[]): RuntimeModelOption[] {
  return options.map((option) => ({ ...option }));
}

function cloneStringOptions(options: string[]): string[] {
  return [...options];
}

function mergeMissingFallbackModelMetadata(
  model: RuntimeModelOption,
  fallback: RuntimeModelOption | null,
): RuntimeModelOption {
  if (!fallback) return model;
  const fallbackSpeedTiers = fallback.additionalSpeedTiers;
  const fallbackServiceTiers = fallback.serviceTierOptions;
  const needsSpeedTiers =
    (!model.additionalSpeedTiers || model.additionalSpeedTiers.length === 0) &&
    Array.isArray(fallbackSpeedTiers) &&
    fallbackSpeedTiers.length > 0;
  const needsServiceTiers =
    (!model.serviceTierOptions || model.serviceTierOptions.length === 0) &&
    Array.isArray(fallbackServiceTiers) &&
    fallbackServiceTiers.length > 0;
  if (!needsSpeedTiers && !needsServiceTiers) return model;
  return {
    ...model,
    ...(needsSpeedTiers
      ? { additionalSpeedTiers: cloneStringOptions(fallbackSpeedTiers) }
      : {}),
    ...(needsServiceTiers
      ? { serviceTierOptions: cloneModelOptions(fallbackServiceTiers) }
      : {}),
  };
}

export function mergeFallbackModelMetadata(
  def: RuntimeAgentDef,
  models: RuntimeModelOption[],
): RuntimeModelOption[] {
  if (!Array.isArray(def.fallbackModels) || def.fallbackModels.length === 0) {
    return models;
  }
  return models.map((model) =>
    mergeMissingFallbackModelMetadata(model, findFallbackModel(def, model.id)),
  );
}

export function findKnownModel(
  def: RuntimeAgentDef,
  modelId: string | null | undefined,
  scope?: string | null,
): RuntimeModelOption | null {
  if (!modelId) return null;
  const live = liveModelCache.get(liveModelCacheKey(def.id, scope));
  const liveModel = live?.get(modelId);
  const fallbackModel = findFallbackModel(def, modelId);
  if (liveModel) {
    return mergeMissingFallbackModelMetadata(liveModel, fallbackModel);
  }
  return fallbackModel;
}

export function isKnownModel(
  def: RuntimeAgentDef,
  modelId: string | null | undefined,
  scope?: string | null,
) {
  return Boolean(findKnownModel(def, modelId, scope));
}

export function isKnownServiceTier(
  def: RuntimeAgentDef,
  modelId: string | null | undefined,
  serviceTier: string | null | undefined,
  scope?: string | null,
) {
  if (!serviceTier || serviceTier === 'default') return false;
  const model = findKnownModel(def, modelId, scope);
  return Boolean(
    model?.serviceTierOptions?.some((tier) => tier.id === serviceTier),
  );
}

export function resolveModelForServiceTier(
  def: RuntimeAgentDef,
  modelId: string | null | undefined,
  serviceTier: string | null | undefined,
  scope?: string | null,
): string | null {
  if (!serviceTier || serviceTier === 'default') return modelId ?? null;
  if (isKnownServiceTier(def, modelId, serviceTier, scope)) return modelId ?? null;
  if (modelId && modelId !== 'default') return modelId;
  const candidates = [
    ...getRememberedLiveModels(def.id, scope),
    ...(Array.isArray(def.fallbackModels) ? def.fallbackModels : []),
  ];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate?.id || candidate.id === 'default' || seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    if (isKnownServiceTier(def, candidate.id, serviceTier, scope)) return candidate.id;
  }
  return modelId ?? null;
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
