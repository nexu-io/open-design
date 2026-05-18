import type { PluginManifest } from '@open-design/contracts';

// Merge a sidecar `open-design.json` PluginManifest with one or more adapter
// outputs. `open-design.json` always wins (spec §5.4); adapter values fill
// gaps so a plugin that ships only SKILL.md still reaches a fully-formed
// manifest. Foreign content lands in `compat.*` lists rather than being
// dropped.

export interface MergeInputs {
  // Highest precedence. May be undefined if the plugin is SKILL.md-only.
  sidecar?: PluginManifest | undefined;
  // Adapter outputs in priority order — first wins for any field absent
  // from the sidecar. Typical order is [agent-skill, claude-plugin].
  adapters?: PluginManifest[] | undefined;
}

export function mergeManifests(inputs: MergeInputs): PluginManifest {
  const adapters = inputs.adapters ?? [];
  const layers = inputs.sidecar ? [inputs.sidecar, ...adapters] : adapters;
  if (layers.length === 0) {
    throw new Error('mergeManifests requires at least one input layer (sidecar or adapter)');
  }

  const root = deepClonePlain(layers[0]) as PluginManifest;
  for (let i = 1; i < layers.length; i++) {
    deepMerge(root as Record<string, unknown>, layers[i] as Record<string, unknown>);
  }

  // Compat lists union, preserving sidecar order then adapter order. Compat
  // entries are the only intentionally-list-merged field; everything else
  // takes the higher-precedence layer wholesale.
  root.compat = mergeCompat(layers);
  return root;
}

type CompatList = NonNullable<NonNullable<PluginManifest['compat']>['agentSkills']>;

function mergeCompat(layers: PluginManifest[]): PluginManifest['compat'] {
  const skills: CompatList = [];
  const plugins: CompatList = [];
  const seenSkills = new Set<string>();
  const seenPlugins = new Set<string>();
  for (const layer of layers) {
    const compat = layer.compat;
    if (!compat) continue;
    for (const ref of compat.agentSkills ?? []) {
      if (!ref || typeof ref.path !== 'string') continue;
      if (seenSkills.has(ref.path)) continue;
      seenSkills.add(ref.path);
      skills.push(ref);
    }
    for (const ref of compat.claudePlugins ?? []) {
      if (!ref || typeof ref.path !== 'string') continue;
      if (seenPlugins.has(ref.path)) continue;
      seenPlugins.add(ref.path);
      plugins.push(ref);
    }
  }
  if (skills.length === 0 && plugins.length === 0) return undefined;
  const compat: NonNullable<PluginManifest['compat']> = {};
  if (skills.length > 0) compat.agentSkills = skills;
  if (plugins.length > 0) compat.claudePlugins = plugins;
  return compat;
}

function deepClonePlain<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((entry) => deepClonePlain(entry)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = deepClonePlain(v);
  }
  return out as T;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, val] of Object.entries(source)) {
    if (val === undefined) continue;
    if (key === 'compat') continue; // Handled separately to enforce union semantics.
    const existing = target[key];
    if (
      isPlainObject(existing) &&
      isPlainObject(val)
    ) {
      const cloned = deepClonePlain(existing);
      deepMerge(cloned as Record<string, unknown>, val);
      target[key] = cloned;
    } else if (existing === undefined) {
      target[key] = deepClonePlain(val);
    } else {
      // Sidecar wins; do not overwrite an existing scalar / array / null with
      // an adapter value.
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
