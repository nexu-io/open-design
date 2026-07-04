import type {
  ContextItem,
  PluginManifest,
  PluginPipeline,
  ResolvedContext,
} from '@open-design/contracts';

// Pure context resolver. Given a parsed PluginManifest and a registry view
// (skills/design-systems/craft already discovered by the daemon), turn
// `od.context.*` refs into the typed ContextItem chips the UI / CLI render.
//
// This module never reads the filesystem; the daemon passes the registry
// snapshots in. Tests and the web preview sandbox can supply mocks.

export interface RegistryView {
  skills: ReadonlyArray<{ id: string; title?: string; description?: string }>;
  designSystems: ReadonlyArray<{ id: string; title?: string }>;
  craft: ReadonlyArray<{ id: string; title?: string }>;
  atoms: ReadonlyArray<{ id: string; label?: string }>;
  // Project-level design-system override for SKILL.md authors that wrote
  // `od.design_system.requires: true` without a concrete ref. Daemon
  // supplies the active project's design system here.
  activeProjectDesignSystem?: { id: string; title?: string } | undefined;
  // Spec §23.3.3: bundled scenario plugins. When a non-scenario plugin
  // omits `od.pipeline`, apply consults this list and uses the
  // matching scenario's pipeline (chosen by `taskKind`). The first
  // entry that matches wins; later entries are ignored. Daemons that
  // don't bundle scenarios pass an empty list — apply then leaves the
  // pipeline undefined and the agent falls back to its default loop.
  scenarios?: ReadonlyArray<ScenarioRegistryEntry> | undefined;
}

export interface ScenarioRegistryEntry {
  // The scenario plugin's id (e.g. 'od-code-migration'). Used by tests
  // and audits to attribute the fallback choice.
  id: string;
  // The taskKind enum value this scenario claims to default for. Apply
  // matches against `manifest.od.taskKind` (or 'new-generation' when
  // absent).
  taskKind: 'new-generation' | 'figma-migration' | 'code-migration' | 'tune-collab';
  // The scenario plugin's `od.pipeline`. Copied verbatim into the
  // applied snapshot when the consumer plugin lacks one of its own.
  pipeline: PluginPipeline;
}

export interface ResolveOptions {
  registry: RegistryView;
  // When true, missing references emit a warning entry; otherwise they're
  // silently skipped (the daemon prefers warnings; the web preview prefers
  // strict drop).
  warnOnMissing?: boolean;
}

export interface ResolveResult {
  context: ResolvedContext;
  warnings: string[];
  // Flat list of ref pairs intended for the digest input — order-stable.
  digestRefs: Array<{ kind: string; ref: string }>;
}

type DigestRef = { kind: string; ref: string };
type PluginContext = NonNullable<NonNullable<PluginManifest['od']>['context']>;

// Order-stable output threaded through the per-kind resolvers. Each resolver
// appends in a fixed sequence; digestRefs order is load-bearing because it
// feeds the manifest source digest.
interface ResolveAccumulator {
  items: ContextItem[];
  digestRefs: DigestRef[];
  warnings: string[];
}

export function resolveContext(manifest: PluginManifest, opts: ResolveOptions): ResolveResult {
  const registry = opts.registry;
  const warnOnMissing = opts.warnOnMissing;
  const ctx = manifest.od?.context;

  const acc: ResolveAccumulator = { items: [], digestRefs: [], warnings: [] };

  if (ctx) {
    resolveSkills(ctx, registry, warnOnMissing, acc);
    resolveDesignSystem(ctx, registry, warnOnMissing, acc);
    resolveCraft(ctx, registry, warnOnMissing, acc);
    resolveAssets(ctx, acc);
    resolveMcp(ctx, acc);
    resolveClaudePlugins(ctx, acc);
    resolveAtoms(ctx, registry, acc);
  }

  resolvePipelineAtoms(manifest, acc);

  return {
    context: {
      items: acc.items,
      atoms: ctx?.atoms ? Array.from(ctx.atoms) : undefined,
    },
    warnings: acc.warnings,
    digestRefs: acc.digestRefs,
  };
}

function resolveSkills(
  ctx: PluginContext,
  registry: RegistryView,
  warnOnMissing: boolean | undefined,
  acc: ResolveAccumulator,
): void {
  for (const ref of ctx.skills ?? []) {
    const id = (ref.ref ?? ref.path ?? '').trim();
    if (!id) continue;
    const skill = registry.skills.find((s) => s.id === id || s.id === stripDotSlash(id));
    if (!skill) {
      if (warnOnMissing) acc.warnings.push(`Unknown skill ref: '${id}'`);
      continue;
    }
    acc.items.push({ kind: 'skill', id: skill.id, label: skill.title ?? skill.id });
    acc.digestRefs.push({ kind: 'skill', ref: skill.id });
  }
}

// An explicit ref wins; a blank ref falls back to the active project design
// system (SKILL.md authors that wrote `requires: true` without a concrete ref).
function resolveDesignSystem(
  ctx: PluginContext,
  registry: RegistryView,
  warnOnMissing: boolean | undefined,
  acc: ResolveAccumulator,
): void {
  if (!ctx.designSystem) return;
  const dsRef = ctx.designSystem;
  const explicitRef = typeof dsRef.ref === 'string' ? dsRef.ref.trim() : '';
  if (explicitRef) {
    const ds = registry.designSystems.find((d) => d.id === explicitRef);
    if (ds) {
      acc.items.push({ kind: 'design-system', id: ds.id, label: ds.title ?? ds.id, primary: true });
      acc.digestRefs.push({ kind: 'design-system', ref: ds.id });
    } else if (warnOnMissing) {
      acc.warnings.push(`Unknown design-system ref: '${explicitRef}'`);
    }
  } else if (registry.activeProjectDesignSystem) {
    const ds = registry.activeProjectDesignSystem;
    acc.items.push({ kind: 'design-system', id: ds.id, label: ds.title ?? ds.id, primary: true });
    acc.digestRefs.push({ kind: 'design-system', ref: ds.id });
  }
}

function resolveCraft(
  ctx: PluginContext,
  registry: RegistryView,
  warnOnMissing: boolean | undefined,
  acc: ResolveAccumulator,
): void {
  for (const slug of ctx.craft ?? []) {
    const id = String(slug).trim();
    if (!id) continue;
    const c = registry.craft.find((x) => x.id === id);
    if (!c) {
      if (warnOnMissing) acc.warnings.push(`Unknown craft slug: '${id}'`);
      continue;
    }
    acc.items.push({ kind: 'craft', id: c.id, label: c.title ?? c.id });
    acc.digestRefs.push({ kind: 'craft', ref: c.id });
  }
}

// Asset paths are kept as-is and validated by the installer at apply time.
// The chip strip uses the basename as the label.
function resolveAssets(ctx: PluginContext, acc: ResolveAccumulator): void {
  for (const rawPath of ctx.assets ?? []) {
    const p = String(rawPath).trim();
    if (!p) continue;
    const label = p.split('/').pop() ?? p;
    acc.items.push({ kind: 'asset', path: p, label });
    acc.digestRefs.push({ kind: 'asset', ref: p });
  }
}

function resolveMcp(ctx: PluginContext, acc: ResolveAccumulator): void {
  for (const mcp of ctx.mcp ?? []) {
    if (!mcp.name) continue;
    acc.items.push({
      kind: 'mcp',
      name: mcp.name,
      label: mcp.name,
      command: typeof mcp.command === 'string' ? mcp.command : undefined,
    });
    acc.digestRefs.push({ kind: 'mcp', ref: mcp.name });
  }
}

function resolveClaudePlugins(ctx: PluginContext, acc: ResolveAccumulator): void {
  for (const ref of ctx.claudePlugins ?? []) {
    const id = (ref.ref ?? ref.path ?? '').trim();
    if (!id) continue;
    acc.items.push({ kind: 'claude-plugin', id, label: id });
    acc.digestRefs.push({ kind: 'claude-plugin', ref: id });
  }
}

function resolveAtoms(ctx: PluginContext, registry: RegistryView, acc: ResolveAccumulator): void {
  for (const atomId of ctx.atoms ?? []) {
    const id = String(atomId).trim();
    if (!id) continue;
    const atom = registry.atoms.find((a) => a.id === id);
    const label = atom?.label ?? id;
    acc.items.push({ kind: 'atom', id, label });
    acc.digestRefs.push({ kind: 'atom', ref: id });
  }
}

// Pipeline stages flag additional atoms that may not have appeared in
// ctx.atoms; record them as digest refs so two manifests with different
// pipelines produce distinct digests.
function resolvePipelineAtoms(manifest: PluginManifest, acc: ResolveAccumulator): void {
  for (const stage of manifest.od?.pipeline?.stages ?? []) {
    for (const atomId of stage.atoms) {
      acc.digestRefs.push({ kind: 'pipeline-atom', ref: `${stage.id}:${atomId}` });
    }
  }
}

function stripDotSlash(value: string): string {
  return value.startsWith('./') ? value.slice(2) : value;
}
