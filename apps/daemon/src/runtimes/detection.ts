import { execAgentFile } from './invocation.js';
import { AGENT_DEFS } from './registry.js';
import { DEFAULT_MODEL_OPTION, rememberLiveModels } from './models.js';
import { resolveAgentExecutable } from './executables.js';
import { spawnEnvForAgent } from './env.js';
import { agentCapabilities } from './capabilities.js';
import { installMetaForAgent } from './metadata.js';
import type {
  DetectedAgent,
  RuntimeAgentDef,
  RuntimeCapabilityMap,
  RuntimeModelOption,
} from './types.js';

async function fetchModels(
  def: RuntimeAgentDef,
  resolvedBin: string,
  env: NodeJS.ProcessEnv,
): Promise<RuntimeModelOption[]> {
  if (typeof def.fetchModels === 'function') {
    try {
      const parsed = await def.fetchModels(resolvedBin, env);
      if (!parsed || parsed.length === 0) return def.fallbackModels;
      return parsed;
    } catch {
      return def.fallbackModels;
    }
  }
  if (!def.listModels) return def.fallbackModels;
  try {
    const { stdout } = await execAgentFile(resolvedBin, def.listModels.args, {
      env,
      timeout: def.listModels.timeoutMs ?? 5000,
      // Models lists from popular CLIs (e.g. opencode) easily exceed the
      // default 1MB buffer once you include every openrouter model. Bump
      // it so we don't truncate the listing.
      maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = def.listModels.parse(String(stdout));
    // Empty / null parse result means the CLI didn't actually return a
    // usable list (e.g. cursor-agent's "No models available"); fall back
    // to the static hint so the picker isn't stuck on Default-only.
    if (!parsed || parsed.length === 0) return def.fallbackModels;
    return parsed;
  } catch {
    return def.fallbackModels;
  }
}

async function probe(
  def: RuntimeAgentDef,
  configuredEnv: Record<string, string> = {},
): Promise<DetectedAgent> {
  const resolved = resolveAgentExecutable(def, configuredEnv);
  if (!resolved) {
    return {
      ...stripFns(def),
      models: def.fallbackModels ?? [DEFAULT_MODEL_OPTION],
      available: false,
      ...installMetaForAgent(def.id),
    };
  }
  const probeEnv = spawnEnvForAgent(
    def.id,
    {
      ...process.env,
      ...(def.env || {}),
    },
    configuredEnv,
  );
  let version = null;
  try {
    const { stdout } = await execAgentFile(resolved, def.versionArgs, {
      env: probeEnv,
      timeout: 3000,
    });
    version = String(stdout).trim().split('\n')[0] ?? null;
  } catch {
    // binary exists but --version failed; still mark available
  }
  // Probe `--help` once per agent and record which flags the installed CLI
  // advertises. Cached on `agentCapabilities` for buildArgs to consult.
  if (def.helpArgs && def.capabilityFlags) {
    const caps: RuntimeCapabilityMap = {};
    try {
      const { stdout } = await execAgentFile(resolved, def.helpArgs, {
        env: probeEnv,
        timeout: 5000,
        maxBuffer: 4 * 1024 * 1024,
      });
      for (const [flag, key] of Object.entries(def.capabilityFlags)) {
        caps[key] = String(stdout).includes(flag);
      }
    } catch {
      // If --help fails, leave caps empty — buildArgs falls back to the safe
      // baseline (no optional flags).
    }
    agentCapabilities.set(def.id, caps);
  }
  const models = await fetchModels(def, resolved, probeEnv);
  return {
    ...stripFns(def),
    models,
    available: true,
    path: resolved,
    version,
    ...installMetaForAgent(def.id),
  };
}

function stripFns(
  def: RuntimeAgentDef,
): Omit<DetectedAgent, 'models' | 'available' | 'path' | 'version'> {
  // Drop the buildArgs / listModels closures but keep declarative metadata
  // (reasoningOptions, streamFormat, name, bin, etc.). `models` is
  // populated separately by `fetchModels`, so we strip the static
  // `fallbackModels` slot here too. `helpArgs` / `capabilityFlags` /
  // `fallbackBins` / `maxPromptArgBytes` / `env` are probe-or-spawn-only
  // metadata and shouldn't bleed into the API response either.
  const {
    buildArgs,
    listModels,
    fetchModels,
    fallbackModels,
    helpArgs,
    capabilityFlags,
    fallbackBins,
    maxPromptArgBytes,
    env,
    ...rest
  } = def;
  return rest;
}

export async function detectAgents(
  configuredEnvByAgent: Record<string, Record<string, string>> = {},
) {
  const results = await Promise.all(
    AGENT_DEFS.map((def) => probe(def, configuredEnvByAgent?.[def.id] ?? {})),
  );
  // Refresh the validation cache from whatever we just surfaced to the UI
  // so /api/chat can accept any model the user could have just picked,
  // including ones that only showed up after a CLI re-auth.
  for (const agent of results) {
    rememberLiveModels(agent.id, agent.models);
  }
  return results;
}
