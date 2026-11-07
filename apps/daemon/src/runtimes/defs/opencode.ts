import { DEFAULT_MODEL_OPTION } from './shared.js';
import { acquireSharedSdkHost, releaseSharedSdkHost } from '../opencode-sdk-host.js';
import type { RuntimeAgentDef, RuntimeEnv, RuntimeModelOption } from '../types.js';

// Bound for the SDK catalog read. The old CLI probe (`opencode models`)
// needed 15s for the provider-registry round trip; the in-process host
// answers from the same catalog without a spawn, so the budget is kept as
// a hang guard rather than an expected cost.
const OPENCODE_LIST_MODELS_TIMEOUT_MS = 15_000;

const OPENCODE_VARIANT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const OPENCODE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._/:@-]*$/u;

function reasoningOptions(ids: readonly string[]): RuntimeModelOption[] {
  return [
    { id: 'default', label: 'Default' },
    ...ids.map((id) => ({ id, label: id })),
  ];
}

// Minimal structural view of the SDK `model.list()` entry
// (`ModelInfo` in `@opencode/client`). Only the fields the daemon maps
// are declared; everything else rides along untouched.
interface OpenCodeSdkModelEntry {
  id?: unknown;
  providerID?: unknown;
  modelID?: unknown;
  variants?: unknown;
}

interface OpenCodeSdkModelListHost {
  model: {
    list: (input?: unknown) => Promise<{ data?: unknown }>;
  };
}

function sdkVariantIds(entry: OpenCodeSdkModelEntry): string[] {
  const variants = entry.variants;
  if (!Array.isArray(variants)) return [];
  const ids: string[] = [];
  for (const variant of variants) {
    const id = (variant as { id?: unknown } | null)?.id;
    if (typeof id !== 'string' || !OPENCODE_VARIANT_ID.test(id)) continue;
    if (id === 'default' || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
}

/**
 * Canonical daemon model id for one SDK catalog entry. The SDK reports the
 * parts separately (`providerID` + `modelID`; `id` is often the bare model
 * id), while the daemon's picker, remembered live models, and fallback ids
 * all use the CLI-established `provider/model` form. Compose that form so
 * the identity stays stable across the CLI→SDK migration; accept an `id`
 * that already carries it.
 */
export function sdkModelId(entry: OpenCodeSdkModelEntry): string | null {
  if (typeof entry.id === 'string' && OPENCODE_MODEL_ID.test(entry.id)) {
    return entry.id;
  }
  if (typeof entry.providerID === 'string' && typeof entry.modelID === 'string') {
    const composed = `${entry.providerID}/${entry.modelID}`;
    if (OPENCODE_MODEL_ID.test(composed)) return composed;
  }
  return null;
}

/**
 * Map the SDK `model.list()` catalog (`{ data: ModelInfo[] }`) onto the
 * daemon's model options. Variant ids become reasoning options, mirroring
 * what the old `models --verbose` CLI parse advertised. Returns null when
 * the catalog carries no usable model so detection falls back to the static
 * list instead of presenting a Default-only picker.
 */
export function mapOpenCodeSdkModels(data: unknown): RuntimeModelOption[] | null {
  if (!Array.isArray(data)) return null;
  const models: RuntimeModelOption[] = [DEFAULT_MODEL_OPTION];
  const seen = new Set<string>();
  for (const raw of data) {
    const entry = (raw ?? {}) as OpenCodeSdkModelEntry;
    const id = sdkModelId(entry);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const variantIds = sdkVariantIds(entry);
    models.push({
      id,
      label: id,
      ...(variantIds.length > 0
        ? { reasoningOptions: reasoningOptions(variantIds) }
        : {}),
    });
  }
  return models.length > 1 ? models : null;
}

/**
 * Discover models through the in-process SDK host (`host.model.list()`)
 * instead of spawning `opencode models [--verbose]`. No CLI binary is
 * resolved or executed; the `_resolvedBin` / `_env` parameters only preserve
 * the `fetchModels` signature detection calls with. A host boot or catalog
 * failure resolves to null so detection falls back to the static list.
 */
async function fetchOpenCodeModels(
  _resolvedBin: string,
  _env: RuntimeEnv,
): Promise<RuntimeModelOption[] | null> {
  let host: Awaited<ReturnType<typeof acquireSharedSdkHost>> | null = null;
  try {
    host = await acquireSharedSdkHost();
    const listed = await Promise.race([
      (host as unknown as OpenCodeSdkModelListHost).model.list(),
      new Promise<null>((resolve) => {
        const timer = setTimeout(() => resolve(null), OPENCODE_LIST_MODELS_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]);
    if (!listed || typeof listed !== 'object') return null;
    return mapOpenCodeSdkModels((listed as { data?: unknown }).data);
  } catch {
    return null;
  } finally {
    if (host) await releaseSharedSdkHost();
  }
}

const OPENCODE_FALLBACK_MODELS: RuntimeModelOption[] = [
  DEFAULT_MODEL_OPTION,
  {
    id: 'anthropic/claude-sonnet-4-5',
    label: 'anthropic/claude-sonnet-4-5',
  },
  {
    id: 'openai/gpt-5.6-sol',
    label: 'openai/gpt-5.6-sol',
  },
  {
    id: 'openai/gpt-5.6-terra',
    label: 'openai/gpt-5.6-terra',
  },
  {
    id: 'openai/gpt-5.6-luna',
    label: 'openai/gpt-5.6-luna',
  },
  { id: 'openai/gpt-5', label: 'openai/gpt-5' },
  { id: 'google/gemini-2.5-pro', label: 'google/gemini-2.5-pro' },
];

export const opencodeAgentDef = {
    id: 'opencode',
    name: 'OpenCode',
    // SDK-only transport: `opencode run --format json` spawning was removed.
    // `bin` / `versionArgs` / `streamFormat` / `buildArgs` remain only because
    // `RuntimeAgentDef` still requires them; they are not consulted on the
    // SDK path (`opencode-sdk-host.ts` + `opencode-sdk-events.ts`).
    bin: 'opencode',
    versionArgs: ['--version'],
    fetchModels: fetchOpenCodeModels,
    fallbackModels: OPENCODE_FALLBACK_MODELS,
    // The SDK `model.list()` catalog carries each model's exact variant ids
    // (`variants: [{ id, ... }]`), which become the advertised reasoning
    // options. The fallback keeps Sol/Terra/Luna model ids usable during a
    // catalog outage but does not guess their variants.
    buildArgs: (_prompt, _imagePaths, _extraAllowedDirs, _options, _runtimeContext) => {
      throw new Error('CLI removed, use SDK');
    },
    streamFormat: 'json-event-stream',
    // Native SDK is the default and only transport for the opencode family.
    transport: 'sdk' as const,
} satisfies RuntimeAgentDef;
