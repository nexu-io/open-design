import { DEFAULT_MODEL_OPTION } from './shared.js';
import {
  OPENCODE_PERMISSION_CAPABILITY,
  appendOpenCodePermissionBypass,
  appendOpenCodeWorkspaceDir,
  isOpenCode2xCapabilities,
  shouldUseOpenCodeVariantFlag,
} from '../opencode-permissions.js';
import { getRememberedLiveModels } from '../models.js';
import { execAgentFile } from '../invocation.js';
import type { RuntimeAgentDef, RuntimeModelOption } from '../types.js';

const OPENCODE_VARIANT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const OPENCODE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._/:@-]*$/u;

function reasoningOptions(ids: readonly string[]): RuntimeModelOption[] {
  return [
    { id: 'default', label: 'Default' },
    ...ids.map((id) => ({ id, label: id })),
  ];
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

function parseVerboseModelMetadata(
  lines: string[],
  start: number,
): { value: Record<string, unknown> | null; end: number } {
  let buffer = '';
  for (let index = start; index < lines.length; index += 1) {
    buffer += `${lines[index]}\n`;
    if (!lines[index]!.trimEnd().endsWith('}')) continue;
    try {
      const parsed = JSON.parse(buffer) as unknown;
      return {
        value: parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : null,
        end: index,
      };
    } catch {
      // Nested objects close before the outer metadata object. Keep reading
      // until the complete JSON value parses.
    }
  }
  return { value: null, end: start - 1 };
}

/**
 * Parse `opencode models --verbose`, retaining each model's exact variant
 * names. Plain one-id-per-line output remains accepted as a compatibility
 * fallback, but only verbose metadata can advertise reasoning choices.
 */
export function parseOpenCodeModels(stdout: string): RuntimeModelOption[] | null {
  const lines = String(stdout || '').split('\n');
  const models: RuntimeModelOption[] = [DEFAULT_MODEL_OPTION];
  const seen = new Set<string>();
  for (let index = 0; index < lines.length; index += 1) {
    const id = lines[index]!.trim();
    if (!OPENCODE_MODEL_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    const next = lines[index + 1]?.trimStart();
    const metadata = next?.startsWith('{')
      ? parseVerboseModelMetadata(lines, index + 1)
      : { value: null, end: index };
    const variants = metadata.value?.['variants'];
    const variantIds = variants && typeof variants === 'object' && !Array.isArray(variants)
      ? Object.keys(variants).filter((variant) => OPENCODE_VARIANT_ID.test(variant))
      : [];
    models.push({
      id,
      label: id,
      ...(variantIds.length > 0
        ? { reasoningOptions: reasoningOptions(variantIds) }
        : {}),
    });
    index = Math.max(index, metadata.end);
  }
  return models.length > 1 ? models : null;
}

function supportsOpenCodeVariant(
  modelId: string | null | undefined,
  variant: string | null | undefined,
): variant is string {
  if (!modelId || modelId === 'default' || !variant || variant === 'default') return false;
  const live = getRememberedLiveModels('opencode').find((model) => model.id === modelId);
  return Boolean(live?.reasoningOptions?.some((option) => option.id === variant));
}

/**
 * Read the 2.x server model catalog, the only 2.x surface that advertises
 * variants. `opencode api GET /api/model` returns the records the TUI picker
 * uses: `providerID`, `modelID`, and `variants[].id` (verified on 2.0.24,
 * where 5 of 9 local models exposed low/high/max-style variants). Plain
 * `opencode models` prints ids only, so without this every 2.x user loses the
 * reasoning picker and an existing variant choice would be dropped silently.
 */
function parseOpenCodeVariantCatalog(stdout: string): Map<string, string[]> {
  const catalog = new Map<string, string[]>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(stdout || ''));
  } catch {
    return catalog;
  }
  const records: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { data?: unknown }).data)
      ? (parsed as { data: unknown[] }).data
      : [];
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
    const entry = record as Record<string, unknown>;
    const providerId = typeof entry.providerID === 'string' ? entry.providerID.trim() : '';
    const modelId = typeof entry.modelID === 'string' ? entry.modelID.trim() : '';
    if (!providerId || !modelId) continue;
    const ids: string[] = [];
    for (const variant of Array.isArray(entry.variants) ? entry.variants : []) {
      if (!variant || typeof variant !== 'object' || Array.isArray(variant)) continue;
      const id = (variant as Record<string, unknown>).id;
      if (typeof id !== 'string' || !OPENCODE_VARIANT_ID.test(id) || ids.includes(id)) continue;
      ids.push(id);
    }
    if (ids.length > 0) catalog.set(`${providerId}/${modelId}`, ids);
  }
  return catalog;
}

function withCatalogVariants(
  models: RuntimeModelOption[],
  catalog: Map<string, string[]>,
): RuntimeModelOption[] {
  if (catalog.size === 0) return models;
  return models.map((model) => {
    if (model.reasoningOptions && model.reasoningOptions.length > 0) return model;
    const ids = catalog.get(model.id);
    return ids && ids.length > 0 ? { ...model, reasoningOptions: reasoningOptions(ids) } : model;
  });
}

/**
 * Carry forward variant metadata this process already knew for a model.
 *
 * A 2.x catalog read can come back without variants (server not up yet, api
 * surface unavailable, model temporarily missing) while the user already has a
 * variant selected. Dropping `reasoningOptions` there would make
 * `supportsOpenCodeVariant` reject the pick, so `buildArgs` would launch the
 * base model and the choice would disappear without a word. Retaining the last
 * known options keeps the selection working; it never invents a variant, since
 * only ids this build already surfaced are kept.
 */
function withRememberedVariants(models: RuntimeModelOption[]): RuntimeModelOption[] {
  const remembered = new Map(
    getRememberedLiveModels('opencode').map((model) => [model.id, model] as const),
  );
  if (remembered.size === 0) return models;
  return models.map((model) => {
    if (model.reasoningOptions && model.reasoningOptions.length > 0) return model;
    const known = remembered.get(model.id)?.reasoningOptions;
    return known && known.length > 0
      ? { ...model, reasoningOptions: known.map((option) => ({ ...option })) }
      : model;
  });
}

export const opencodeAgentDef = {
    id: 'opencode',
    name: 'OpenCode',
    bin: 'opencode-cli',
    fallbackBins: ['opencode'],
    versionArgs: ['--version'],
    ...OPENCODE_PERMISSION_CAPABILITY,
    // `opencode models` prints `provider/model` per line. Real-world
    // `opencode models` calls can take >8s (network round-trip to the
    // provider registry), so the previous 8s budget timed out and fell back
    // to the hardcoded `fallbackModels`, hiding the user's actual catalog.
    // 15s matches the listModels budget the rest of the agent defs use
    // (devin, hermes, kiro, kilo, kimi, trae-cli, vibe, reasonix).
    listModels: {
      args: ['models', '--verbose'],
      parse: parseOpenCodeModels,
      timeoutMs: 15_000,
    },
    // OpenCode's model catalog changed shape between CLI lines, and the two
    // shapes are chosen from the `run --help` capability probe — never from the
    // text of a failed probe. OpenCode 2.0.24 answers `models --verbose` by
    // printing `models --help` to stdout and exiting 1 with no recognizable
    // wording, so any error-text gate either misfires (falling back to the
    // static list and hiding the user's real catalog) or never fires at all.
    //
    //   1.x: `models --verbose` carries variant metadata inline.
    //   2.x: `models` prints ids only, and `/api/model` carries the variants.
    //
    // When the probe could not identify the line, the tolerant path tries the
    // verbose shape first and accepts a plain list, so an unreadable help does
    // not cost the user their catalog.
    fetchModels: async (resolvedBin, env, capabilities) => {
      const caps = await capabilities;
      const options = {
        env: env as NodeJS.ProcessEnv,
        timeout: 15_000,
        maxBuffer: 8 * 1024 * 1024,
      };
      const readModels = async (args: string[]): Promise<RuntimeModelOption[] | null> => {
        try {
          const { stdout } = await execAgentFile(resolvedBin, args, options);
          return parseOpenCodeModels(String(stdout));
        } catch {
          return null;
        }
      };
      const models = await (async () => {
        if (!isOpenCode2xCapabilities(caps)) {
          const verbose = await readModels(['models', '--verbose']);
          if (verbose) return verbose;
          return readModels(['models']);
        }
        const plain = await readModels(['models']);
        if (!plain) return null;
        try {
          const { stdout } = await execAgentFile(
            resolvedBin,
            ['api', 'GET', '/api/model'],
            options,
          );
          return withCatalogVariants(plain, parseOpenCodeVariantCatalog(String(stdout)));
        } catch {
          // The catalog is an enrichment, not a requirement: a server that is
          // not up yet must not cost the user their model list.
          return plain;
        }
      })();
      return models ? withRememberedVariants(models) : null;
    },
    fallbackModels: OPENCODE_FALLBACK_MODELS,
    // OpenCode 1.18.x exposes provider/model-specific variants. Detection
    // reads the exact live variant keys from `models --verbose`. The fallback
    // keeps Sol/Terra/Luna model ids usable during a catalog outage but does
    // not guess their variants. Unknown model/variant pairs omit `--variant`
    // rather than inventing a provider capability or preventing the base
    // model from running.
    //
    // Prompt delivered via stdin (`opencode run` with no message argv) to
    // avoid Windows `spawn ENAMETOOLONG` while preserving OpenCode's
    // structured stream. A literal `-` is parsed as a positional message by
    // OpenCode 1.14.x and can surface as "Session not found".
    buildArgs: (_prompt, _imagePaths, _extra, options = {}, runtimeContext = {}) => {
      const args = [
        'run',
        '--format',
        'json',
      ];
      appendOpenCodePermissionBypass(args, 'opencode');
      appendOpenCodeWorkspaceDir(args, runtimeContext.cwd, 'opencode');
      // Capture-style resume: OpenCode mints its own session id (reported on
      // the stream as `sessionID`, e.g. `ses_...`). On a follow-up turn the
      // daemon continues that session with `-s <id>` instead of re-sending the
      // flattened transcript, so the first upstream call reuses the warm prefix
      // cache. `-s` continues an EXISTING session (the create turn passes no id
      // and we capture the one OpenCode generated), mirroring codex.
      const resumeSessionId =
        typeof runtimeContext.resumeSessionId === 'string' &&
        runtimeContext.resumeSessionId.length > 0
          ? runtimeContext.resumeSessionId
          : null;
      if (resumeSessionId) {
        args.push('-s', resumeSessionId);
      }
      if (options.model && options.model !== 'default') {
        if (supportsOpenCodeVariant(options.model, options.reasoning)) {
          if (shouldUseOpenCodeVariantFlag('opencode')) {
            args.push('-m', options.model);
            args.push('--variant', options.reasoning);
          } else {
            // OpenCode 2.x: variant folds into `-m provider/model#variant`.
            args.push('-m', `${options.model}#${options.reasoning}`);
          }
        } else {
          args.push('-m', options.model);
        }
      }
      return args;
    },
    promptViaStdin: true,
    // OpenCode's CLI carries its own session across spawns: on a follow-up turn
    // the daemon resumes the captured session id (`-s <id>`) instead of
    // re-flattening the transcript. Capture-style — the resume handle is the
    // `sessionID` captured from the stream, not a daemon-minted id.
    resumesSessionViaCli: true,
    capturesSessionIdFromStream: true,
    streamFormat: 'json-event-stream',
    eventParser: 'opencode',
    // OpenCode reads MCP servers from its layered config (global ~/.config
    // /opencode/opencode.json + project opencode.json + OPENCODE_CONFIG
    // + OPENCODE_CONFIG_CONTENT). The env-var form lets the daemon hand
    // user-configured external MCP servers to a single `opencode run`
    // invocation without polluting the user's saved config files. See
    // <https://opencode.ai/docs/config> and issue #2142.
    externalMcpInjection: 'opencode-env-content',
} satisfies RuntimeAgentDef;
