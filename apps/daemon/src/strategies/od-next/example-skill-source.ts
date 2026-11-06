import type {
  OdNextStrategyStableRequestContextV2,
  PluginManifest,
  ProjectExampleBinding,
  ProjectMetadata,
} from '@open-design/contracts';
import { resolveLocalizedText } from '@open-design/contracts';

import { readVerifiedProjectExampleBinding } from '../../plugins/example-binding.js';
import { renderPluginBriefTemplate } from '../../plugins/share-helpers.js';
import type { ResolvedFrozenSkillSourceV1 } from './frozen-skill-package.js';

/** The subset of an installed plugin record this resolver needs. */
export interface ResolvedExamplePluginRecord {
  id?: unknown;
  source?: unknown;
  fsPath?: unknown;
  title?: unknown;
  manifest?: unknown;
}

export type ResolveLocalPluginBySource = (
  id: string,
  source: string,
) => Promise<ResolvedExamplePluginRecord | null>;

/**
 * Resolve the project's official example card to a capture source, or null.
 *
 * The invariant this exists to hold: **an example card never changes the
 * route.** Picking one is a more specific choice inside a task type OD Next
 * already owns, not a claim on the strategy, so the card rides along in
 * `session_skills/user_selected_skills` instead of pinning a plugin. Capture
 * itself happens in `captureOdNextSessionSkillPackage`, because a task freezes
 * ONE package across every channel the session selected material through.
 *
 * It is deliberately fail-soft. Every reason resolution can fail — the example
 * was uninstalled, its manifest moved on from the digest the project pinned,
 * the folder is unreadable — is a reason to run this task without the example,
 * never a reason to fail the user's run or to divert it off the automatic
 * route it already qualified for. Failures are warned about, then swallowed,
 * and null means "run without the card".
 */
export async function resolveProjectExampleSkillSource(input: {
  metadata: ProjectMetadata | null | undefined;
  getLocalPluginBySource: ResolveLocalPluginBySource | undefined;
}): Promise<ResolvedFrozenSkillSourceV1 | null> {
  const binding = readVerifiedProjectExampleBinding(input.metadata);
  if (!binding) return null;
  try {
    if (!input.getLocalPluginBySource) {
      throw new Error('no local plugin resolver is wired into this run route');
    }
    // Re-resolve rather than trusting anything the project stored beyond the
    // identity itself: the record's own path is the only path we read from.
    const record = await input.getLocalPluginBySource(
      binding.pluginId,
      binding.pluginSource,
    );
    if (
      !record
      || record.id !== binding.pluginId
      || record.source !== binding.pluginSource
      || typeof record.fsPath !== 'string'
      || !record.fsPath
    ) {
      throw new Error(`example plugin ${binding.pluginId} no longer resolves locally`);
    }
    return {
      dir: record.fsPath,
      // Locale-independent on purpose: this string is hashed into the
      // package identity, which has to stay stable across restarts and
      // across a user switching languages mid-project.
      name: typeof record.title === 'string' && record.title.trim()
        ? record.title.trim()
        : binding.pluginId,
      expectedManifestDigest: binding.manifestSourceDigest,
      label: `Example card ${binding.pluginId}`,
    };
  } catch (error) {
    console.warn(
      `[od-next-example] example ${binding.pluginId} could not be frozen; running without it: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

/**
 * The card's own answers to its declared inputs.
 *
 * `od.useCase.query` is a template — `example-web-prototype`'s brief alone
 * carries `{{artifactKind}}`, `{{fidelity}}`, `{{audience}}`, `{{designSystem}}`
 * and `{{template}}`. The ordinary plugin route fills those from the applied
 * snapshot's `inputs`; an example card deliberately creates no snapshot, so
 * without this the brief reaches the Agent with its placeholders raw, which
 * reads as a broken template rather than an assignment.
 *
 * Every shipped example declares a `default` for the inputs its brief
 * interpolates. A field with no default is left unrendered on purpose:
 * `renderPluginBriefTemplate` keeps the original `{{token}}` rather than
 * inventing an answer the card never gave.
 */
function manifestInputDefaults(
  manifest: PluginManifest | null,
): Record<string, string | number | boolean | null | undefined> {
  const declared = (manifest?.od as { inputs?: unknown } | undefined)?.inputs;
  if (!Array.isArray(declared)) return {};
  const defaults: Record<string, string | number | boolean | null | undefined> = {};
  for (const field of declared) {
    if (!field || typeof field !== 'object') continue;
    const { name, default: fallback } = field as { name?: unknown; default?: unknown };
    if (typeof name !== 'string' || !name.trim()) continue;
    if (
      typeof fallback === 'string'
      || typeof fallback === 'number'
      || typeof fallback === 'boolean'
    ) defaults[name] = fallback;
  }
  return defaults;
}

/**
 * Name the example card in the Bundle's stable request context.
 *
 * Two things the frozen Skill body cannot say on its own: WHICH card the user
 * pointed at, and WHAT it is for. The card's SKILL.md teaches how to build
 * things of its kind; the assignment lives in the manifest's
 * `od.useCase.query`, which the composer deliberately does not seed (it seeds
 * the short human-readable description instead). Carry it here or the run
 * keeps the craft and loses the brief.
 *
 * Returns undefined — omitting the fact entirely — when the record does not
 * re-resolve to the exact bound identity: an example that no longer resolves
 * must go unnamed rather than let a same-id record from somewhere else speak
 * for it.
 */
export function odNextExampleReferenceFact(input: {
  binding: ProjectExampleBinding;
  record: ResolvedExamplePluginRecord | null;
  locale?: string | undefined;
}): OdNextStrategyStableRequestContextV2['exampleReference'] {
  const { binding, record } = input;
  if (
    !record
    || record.id !== binding.pluginId
    || record.source !== binding.pluginSource
  ) return undefined;
  const manifest = (record.manifest ?? null) as PluginManifest | null;
  const title = resolveLocalizedText(manifest?.title_i18n, input.locale)
    || (typeof record.title === 'string' ? record.title : '')
    || (typeof manifest?.title === 'string' ? manifest.title : '');
  const brief = renderPluginBriefTemplate(
    resolveLocalizedText(manifest?.od?.useCase?.query, input.locale),
    manifestInputDefaults(manifest),
  );
  return {
    pluginId: binding.pluginId,
    ...(title.trim() ? { title: title.trim() } : {}),
    ...(brief.trim() ? { brief: brief.trim() } : {}),
  };
}
