// Plugin apply pipeline. Spec §11.5 / plan F4 invariants:
//
//   - Pure: no SQLite writes, no FS mutation, no network. Side effects
//     belong to the caller (snapshots.ts persists, server.ts wires the
//     SSE response, project create stages assets).
//   - Inputs are validated against `manifest.od.inputs`; missing required
//     fields raise `MissingInput` which the CLI/HTTP layer surfaces as 422.
//   - The output `ApplyResult` is the contract between apply and:
//       (a) `POST /api/projects` (project metadata + assets to stage)
//       (b) `runs.ts`           (snapshotId → systemPrompt block)
//       (c) the chip strip      (resolvedContext.items)
//
// The function is intentionally synchronous; future async resolution
// (e.g. live MCP capability probing) belongs in a wrapper that calls this.

import {
  manifestSourceDigest,
  resolveAppliedPipeline,
  resolveContext,
  type RegistryView,
} from '@open-design/plugin-runtime';
import {
  renderPluginBlock,
  resolveLocalizedText,
  type AppliedPluginSnapshot,
  type ApplyResult,
  type InstalledPluginRecord,
  type McpServerSpec,
  type PluginAssetRef,
  type PluginConnectorBinding,
  type PluginConnectorRef,
  type PluginManifest,
  type PluginProjectMetadataPatch,
  type TrustTier,
} from '@open-design/contracts';
import { resolveCapabilitiesGranted, requiredCapabilities } from './trust.js';
import {
  deriveAutoOAuthPrompts,
  mergeAutoOAuthPrompts,
  resolveConnectorBindings,
  type ConnectorProbe,
} from './connector-gate.js';
import { deriveAutoAtomSurfaces } from './atoms/auto-surfaces.js';

export class MissingInputError extends Error {
  readonly fields: string[];
  constructor(fields: string[]) {
    super(`Missing required plugin inputs: ${fields.join(', ')}`);
    this.fields = fields;
    this.name = 'MissingInputError';
  }
}

// Apply result narrows the trust tier to 'trusted' | 'restricted'. The
// installed-plugin record can carry 'bundled' (per §5.3); we coerce to
// 'trusted' at apply time so the snapshot's permission contract is binary.
export type ApplyTrust = 'trusted' | 'restricted';

export interface ApplyInput {
  plugin: InstalledPluginRecord;
  inputs: Record<string, unknown>;
  registry: RegistryView;
  trust?: TrustTier | undefined;
  // The active project's design system, if any. Plugins that declared
  // `od.context.designSystem.primary: true` without a concrete ref get
  // bound to this id at apply time.
  activeProjectDesignSystem?: { id: string; title?: string } | undefined;
  // UI locale used to resolve localized manifest strings. Snapshots store
  // the resolved string so historical runs never change when translations do.
  locale?: string | undefined;
  // Sync probe over the connector catalog + status maps. When supplied,
  // apply resolves `od.connectors.*` against the live catalog and
  // auto-derives an `oauth-prompt` GenUI surface for any not-yet-connected
  // required connector (spec §10.3.1). When omitted (legacy callers, unit
  // tests), the connector bindings stay in `pending` status and no
  // auto-prompt is derived.
  connectorProbe?: ConnectorProbe | undefined;
}

export interface ApplyComputed {
  result: ApplyResult;
  // The manifestSourceDigest for the apply-time inputs. Distinct from the
  // ApplyResult so callers can pass it to snapshots.createSnapshot without
  // re-hashing.
  manifestSourceDigest: string;
  warnings: string[];
}

export function applyPlugin(input: ApplyInput): ApplyComputed {
  const manifest = input.plugin.manifest;
  const rawTrust: TrustTier = input.trust ?? input.plugin.trust;
  const trust: ApplyTrust = rawTrust === 'restricted' ? 'restricted' : 'trusted';

  const validated = validateInputs(manifest, input.inputs);
  if (validated.missing.length > 0) {
    throw new MissingInputError(validated.missing);
  }

  const resolved = resolveContext(manifest, {
    registry: {
      ...input.registry,
      activeProjectDesignSystem: input.activeProjectDesignSystem,
    },
    warnOnMissing: true,
  });

  const digest = manifestSourceDigest({
    manifest,
    inputs: validated.coerced,
    resolvedContextRefs: resolved.digestRefs,
  });

  const assets = buildAssetRefs(manifest);
  const mcpServers = manifest.od?.context?.mcp?.slice() ?? [];
  const { resolved: connectorsResolved, required: connectorsRequired } =
    resolveConnectorBindings(manifest, input.connectorProbe);
  const required = requiredCapabilities(manifest);
  const granted = resolveCapabilitiesGranted({ manifest, trust });
  const taskKind = (manifest.od?.taskKind ?? 'new-generation') as AppliedPluginSnapshot['taskKind'];

  // Spec §23.3.3: when the plugin omits `od.pipeline`, fall back to
  // the bundled scenario whose taskKind matches. The registry view
  // carries the lookup; daemon callers populate it from the
  // `installed_plugins` table filtered to source_kind='bundled' AND
  // od.kind='scenario'. Tests + non-daemon callers can pass an empty
  // list, in which case the pipeline stays undefined.
  const pipelineResolution = resolveAppliedPipeline({
    manifest,
    scenarios: input.registry.scenarios,
  });
  const appliedPipeline = pipelineResolution.pipeline;

  const declaredSurfaces = manifest.od?.genui?.surfaces ?? [];
  const autoOAuth = input.connectorProbe
    ? deriveAutoOAuthPrompts(connectorsResolved)
    : [];
  // Spec §10.3.1 / §21.5: auto-derive surfaces for first-party atom
  // stages (diff-review → choice surface). Plugin-author surfaces
  // with the same id win; the merge helper handles the dedupe.
  // We use the EFFECTIVE pipeline (appliedPipeline) so a plugin that
  // inherits the bundled scenario's diff-review stage still gets
  // the auto-surface.
  const autoAtom = deriveAutoAtomSurfaces({ pipeline: appliedPipeline });
  const genuiSurfaces = mergeAutoOAuthPrompts(
    mergeAutoOAuthPrompts(declaredSurfaces, autoOAuth),
    autoAtom,
  );

  const projectMetadata: PluginProjectMetadataPatch = {
    name: manifest.title ?? manifest.name,
    taskKind,
  };
  const skillRef = pickFirstSkillId(manifest);
  if (skillRef) projectMetadata.skillId = skillRef;
  const dsId = pickDesignSystemId(manifest, input.activeProjectDesignSystem);
  if (dsId) projectMetadata.designSystemId = dsId;
  if (Array.isArray(manifest.od?.context?.craft) && manifest.od!.context!.craft!.length > 0) {
    projectMetadata.craftRequires = manifest.od!.context!.craft!.slice();
  }

  const queryText = resolveLocalizedText(manifest.od?.useCase?.query, input.locale);

  const appliedAt = Date.now();
  const snapshot: AppliedPluginSnapshot = {
    snapshotId:           '',
    pluginId:             input.plugin.id,
    pluginSpecVersion:    manifest.specVersion,
    pluginVersion:        input.plugin.version,
    manifestSourceDigest: digest,
    sourceMarketplaceId:  input.plugin.sourceMarketplaceId,
    sourceMarketplaceEntryName: input.plugin.sourceMarketplaceEntryName,
    sourceMarketplaceEntryVersion: input.plugin.sourceMarketplaceEntryVersion,
    marketplaceTrust:     input.plugin.marketplaceTrust,
    resolvedSource:       input.plugin.resolvedSource,
    resolvedRef:          input.plugin.resolvedRef,
    archiveIntegrity:     input.plugin.archiveIntegrity,
    pinnedRef:            input.plugin.pinnedRef,
    inputs:               validated.coerced,
    resolvedContext:      resolved.context,
    capabilitiesGranted:  granted,
    capabilitiesRequired: required,
    assetsStaged:         assets,
    taskKind,
    appliedAt,
    connectorsRequired,
    connectorsResolved,
    mcpServers,
    pipeline:             appliedPipeline,
    genuiSurfaces,
    pluginTitle:          manifest.title ?? manifest.name,
    pluginDescription:    manifest.description,
    query:                queryText || undefined,
    status:               'fresh',
  };

  const result: ApplyResult = {
    query:               queryText,
    contextItems:        resolved.context.items,
    inputs:              manifest.od?.inputs ?? [],
    assets,
    mcpServers,
    pipeline:            appliedPipeline,
    genuiSurfaces,
    projectMetadata,
    trust,
    capabilitiesGranted: granted,
    capabilitiesRequired: required,
    appliedPlugin: snapshot,
  };

  return { result, manifestSourceDigest: digest, warnings: resolved.warnings };
}

interface ValidationResult {
  coerced: Record<string, string | number | boolean>;
  missing: string[];
}

function validateInputs(manifest: PluginManifest, raw: Record<string, unknown>): ValidationResult {
  const fields = manifest.od?.inputs ?? [];
  const coerced: Record<string, string | number | boolean> = {};
  const missing: string[] = [];

  for (const field of fields) {
    const name = field.name;
    if (!name) continue;
    const provided = raw[name];
    if (provided === undefined || provided === null || provided === '') {
      const fallback = field.default;
      if (fallback !== undefined && fallback !== null && fallback !== '') {
        coerced[name] = coerceScalar(fallback as unknown);
      } else if (field.required === true) {
        missing.push(name);
      }
      continue;
    }
    coerced[name] = coerceScalar(provided);
  }

  // Forward-compat: pass through any extra keys the plugin author may have
  // defined elsewhere (e.g. via `od.useCase` later). This keeps inputs lossy
  // but predictable; the digest captures whatever survives coercion.
  for (const [key, value] of Object.entries(raw)) {
    if (key in coerced) continue;
    if (value === undefined || value === null) continue;
    coerced[key] = coerceScalar(value);
  }

  return { coerced, missing };
}

function coerceScalar(value: unknown): string | number | boolean {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.join(', ');
  return JSON.stringify(value);
}

function buildAssetRefs(manifest: PluginManifest): PluginAssetRef[] {
  const out: PluginAssetRef[] = [];
  for (const raw of manifest.od?.context?.assets ?? []) {
    if (typeof raw !== 'string' || raw.length === 0) continue;
    const path = raw;
    out.push({ path, src: path, stageAt: 'run-start' });
  }
  return out;
}

// Pick a global skill id from od.context.skills[]. Two ref shapes are
// accepted:
//
//   - `{ ref: 'skill-id' }` — registry id; returned as-is.
//   - `{ path: 'subdir/SKILL.md' }` — plugin-local file; returned as
//     undefined so the project record never stores a non-existent skill
//     id like 'SKILL.md'. Plugin-local SKILL.md bodies are sourced
//     directly by the daemon at prompt-compose time from the installed
//     plugin's fsPath (see server.ts) — they do NOT roam into the
//     global skills registry.
function pickFirstSkillId(manifest: PluginManifest): string | undefined {
  for (const ref of manifest.od?.context?.skills ?? []) {
    if (typeof ref?.ref === 'string' && ref.ref.trim().length > 0) {
      return ref.ref.trim();
    }
    const rawPath = typeof ref?.path === 'string' ? ref.path.trim() : '';
    if (!rawPath) continue;
    if (isPluginLocalPath(rawPath)) continue;
    return rawPath;
  }
  return undefined;
}

function isPluginLocalPath(value: string): boolean {
  return (
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.includes('/')
  );
}

// Return the first plugin-local skill ref path (relative to plugin
// fsPath), if any. Used by the daemon prompt composer to read a
// plugin's SKILL.md body without re-walking the manifest. Mirrors the
// detection inside `pickFirstSkillId` so the two stay in lockstep.
export function pickFirstLocalSkillPath(manifest: PluginManifest): string | undefined {
  for (const ref of manifest.od?.context?.skills ?? []) {
    if (typeof ref?.ref === 'string' && ref.ref.trim().length > 0) continue;
    const rawPath = typeof ref?.path === 'string' ? ref.path.trim() : '';
    if (!rawPath) continue;
    if (!isPluginLocalPath(rawPath)) continue;
    return rawPath;
  }
  return undefined;
}

function pickDesignSystemId(
  manifest: PluginManifest,
  active?: { id: string; title?: string },
): string | undefined {
  const ds = manifest.od?.context?.designSystem;
  if (ds && typeof ds.ref === 'string' && ds.ref.trim()) return ds.ref.trim();
  if (ds && active?.id) return active.id;
  return undefined;
}

// Plugin prompt block renderer. Lives in
// `packages/contracts/src/prompts/plugin-block.ts` so the daemon and the
// contracts-side composer share one definition (spec §11.8 PB1).
// Re-exported here for back-compat with daemon-internal callers.
export const pluginPromptBlock = renderPluginBlock;

export type { McpServerSpec };
