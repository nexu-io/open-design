import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;

export const DEFAULT_ZCODE_PROVIDER_ID = 'builtin:bigmodel';

export type ZcodeSavedProviderSelection = {
  model: {
    modelId: string;
    providerId: string;
  };
  provider: {
    apiKey: {
      source: 'inline';
      value: string;
    };
    baseURL?: string;
    kind: string;
    models: Array<{ modelId: string }>;
    providerId: string;
    source: string;
  };
};

export type ZcodeSavedModelOption = {
  id: string;
  label: string;
};

export type ResolveZcodeSavedProviderOptions = {
  modelCachePath?: string;
  configPath?: string;
  homeDir?: string;
  modelId?: string | null;
  providerId?: string | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function zcodeConfigPath(options: ResolveZcodeSavedProviderOptions): string {
  return options.configPath
    ?? path.join(options.homeDir ?? homedir(), '.zcode', 'v2', 'config.json');
}

function zcodeModelCachePath(options: ResolveZcodeSavedProviderOptions): string {
  return options.modelCachePath
    ?? path.join(options.homeDir ?? homedir(), '.zcode', 'v2', 'bots-model-cache.v2.json');
}

function modelIdsFromProvider(provider: JsonRecord): string[] {
  const models = provider.models;
  if (Array.isArray(models)) {
    return models
      .map((model) => isRecord(model) ? stringValue(model.modelId) : stringValue(model))
      .filter((modelId): modelId is string => Boolean(modelId));
  }
  if (isRecord(models)) {
    return Object.keys(models).filter((modelId) => modelId.trim().length > 0);
  }
  return [];
}

function cachedModelNameById(
  options: ResolveZcodeSavedProviderOptions,
  providerId: string,
): Map<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(zcodeModelCachePath(options), 'utf8'));
  } catch {
    return new Map();
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.providers)) return new Map();
  const provider = parsed.providers.find((candidate) =>
    isRecord(candidate) && candidate.id === providerId
  );
  if (!isRecord(provider) || !Array.isArray(provider.models)) return new Map();
  const out = new Map<string, string>();
  for (const model of provider.models) {
    if (!isRecord(model)) continue;
    const id = stringValue(model.id);
    const name = stringValue(model.name);
    if (id && name) out.set(id, name);
  }
  return out;
}

function zcodeWireModelId(modelId: string, wireNameById: Map<string, string>): string {
  const cachedName = wireNameById.get(modelId);
  if (cachedName) return cachedName;
  // ZCode displays GLM model ids in title case, while the public API endpoints
  // expect the lowercase wire id (for example GLM-5.2 -> glm-5.2).
  if (/^GLM-/u.test(modelId)) return modelId.toLowerCase();
  return modelId;
}

function providerModelIdsFor(
  wireModelId: string,
  requestedModelId: string,
  savedModelIds: string[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const modelId of [wireModelId, requestedModelId, ...savedModelIds]) {
    if (seen.has(modelId)) continue;
    seen.add(modelId);
    out.push(modelId);
  }
  return out;
}

function selectProviderId(providers: JsonRecord, requestedProviderId: string | null): string {
  if (requestedProviderId) {
    if (!isRecord(providers[requestedProviderId])) {
      throw new Error(`ZCode provider "${requestedProviderId}" was not found in saved config`);
    }
    return requestedProviderId;
  }
  if (isRecord(providers[DEFAULT_ZCODE_PROVIDER_ID])) return DEFAULT_ZCODE_PROVIDER_ID;
  const firstProviderId = Object.keys(providers).find((providerId) =>
    isRecord(providers[providerId])
  );
  if (!firstProviderId) {
    throw new Error('ZCode saved config does not contain any model providers');
  }
  return firstProviderId;
}

export function resolveZcodeSavedProvider(
  options: ResolveZcodeSavedProviderOptions = {},
): ZcodeSavedProviderSelection {
  const configPath = zcodeConfigPath(options);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ZCode saved config at ${configPath}: ${message}`);
  }

  if (!isRecord(parsed) || !isRecord(parsed.provider)) {
    throw new Error(`ZCode saved config at ${configPath} does not contain a provider map`);
  }

  const providerId = selectProviderId(parsed.provider, stringValue(options.providerId));
  const savedProvider = parsed.provider[providerId];
  if (!isRecord(savedProvider)) {
    throw new Error(`ZCode provider "${providerId}" was not found in saved config`);
  }

  const optionsRecord = isRecord(savedProvider.options) ? savedProvider.options : {};
  const apiKey = stringValue(optionsRecord.apiKey);
  if (!apiKey) {
    throw new Error(`ZCode provider "${providerId}" does not have a saved API key`);
  }

  const savedModelIds = modelIdsFromProvider(savedProvider);
  const wireNameById = cachedModelNameById(options, providerId);
  const requestedModelId = stringValue(options.modelId) ?? savedModelIds[0];
  if (!requestedModelId) {
    throw new Error(`ZCode provider "${providerId}" does not define any models`);
  }
  const modelId = zcodeWireModelId(requestedModelId, wireNameById);
  const providerModelIds = providerModelIdsFor(modelId, requestedModelId, savedModelIds);

  const kind = stringValue(savedProvider.kind) ?? 'anthropic';
  const source = stringValue(savedProvider.source) ?? 'custom';
  const baseURL = stringValue(optionsRecord.baseURL);

  return {
    model: { providerId, modelId },
    provider: {
      providerId,
      kind,
      source,
      ...(baseURL ? { baseURL } : {}),
      apiKey: { source: 'inline', value: apiKey },
      models: providerModelIds.map((id) => ({ modelId: id })),
    },
  };
}

export function listZcodeSavedModels(
  options: ResolveZcodeSavedProviderOptions = {},
): ZcodeSavedModelOption[] {
  const selection = resolveZcodeSavedProvider(options);
  const configPath = zcodeConfigPath(options);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ZCode saved config at ${configPath}: ${message}`);
  }

  if (!isRecord(parsed) || !isRecord(parsed.provider)) {
    throw new Error(`ZCode saved config at ${configPath} does not contain a provider map`);
  }
  const providerId = selection.provider.providerId;
  const savedProvider = parsed.provider[providerId];
  if (!isRecord(savedProvider)) {
    throw new Error(`ZCode provider "${providerId}" was not found in saved config`);
  }

  const wireNameById = cachedModelNameById(options, providerId);
  const seen = new Set<string>();
  return modelIdsFromProvider(savedProvider)
    .map((modelId) => ({
      id: zcodeWireModelId(modelId, wireNameById),
      label: modelId,
    }))
    .filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    });
}
