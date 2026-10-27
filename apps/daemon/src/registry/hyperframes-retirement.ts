import path from 'node:path';
import {
  isRetiredHyperFramesPlugin,
  isRetiredHyperFramesPromptTemplate,
  isRetiredHyperFramesSkillId,
  type ProjectMetadata,
  type AppliedPluginSnapshot,
} from '@open-design/contracts';
import { resolveSkillId } from '../skills.js';
import { readVerifiedProjectExampleBinding } from '../plugins/example-binding.js';
import { readVerifiedProjectStrategyBinding } from '../plugins/strategy-binding.js';

/** Cheap candidate screening keeps unrelated requests off the filesystem catalogue. */
export function retiredSkillCandidateIds(ids: readonly string[]): string[] {
  return ids.map((id) => String(resolveSkillId(id.trim())))
    .filter((id) => isRetiredHyperFramesSkillId(id));
}

/** Existing routine choices belong to their exact persisted target. */
export function persistedRoutineSkillIdsForTarget(
  target: { mode?: unknown; projectId?: unknown },
  row: { projectMode?: unknown; projectId?: unknown; skillId?: unknown; contextJson?: unknown } | null | undefined,
  execution = false,
): string[] {
  if (!row || row.projectMode !== target.mode
    || (target.mode === 'reuse' && row.projectId !== target.projectId)
    || (execution && target.mode !== 'reuse')) return [];
  let context: { skillIds?: unknown } = {};
  try { context = typeof row.contextJson === 'string' ? JSON.parse(row.contextJson) as typeof context : {}; } catch { /* Malformed history grants no additional selections. */ }
  return [row.skillId, ...(Array.isArray(context?.skillIds) ? context.skillIds : [])]
    .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()));
}

export function persistedRoutinePluginIdsForTarget(
  target: { mode?: unknown; projectId?: unknown },
  row: { projectMode?: unknown; projectId?: unknown; contextJson?: unknown } | null | undefined,
): string[] {
  if (!row || target.mode !== 'reuse' || row.projectMode !== 'reuse' || row.projectId !== target.projectId) return [];
  try {
    const context = typeof row.contextJson === 'string' ? JSON.parse(row.contextJson) as { pluginIds?: unknown } : null;
    return Array.isArray(context?.pluginIds) ? context.pluginIds.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

/** Shared configuration/runner preflight; unrelated Skills never resolve a catalogue. */
export async function hasRetiredRoutineSkillSelection(input: {
  ids: readonly string[];
  target: { mode?: unknown; projectId?: unknown };
  execution?: boolean;
  officialRoots: readonly (string | undefined)[];
  resolve: () => Promise<{
    catalog: readonly { id: string; dir?: string }[];
    projectSkillId?: string | null | undefined;
    persistedRoutine?: Parameters<typeof persistedRoutineSkillIdsForTarget>[1];
  }>;
}): Promise<boolean> {
  const ids = retiredSkillCandidateIds(input.ids);
  if (ids.length === 0) return false;
  const resolved = await input.resolve();
  const allowedIds = input.execution && input.target.mode !== 'reuse' ? [] : [
    ...(resolved.projectSkillId ? [resolved.projectSkillId] : []),
    ...persistedRoutineSkillIdsForTarget(input.target, resolved.persistedRoutine, input.execution),
  ];
  return hasNewRetiredSkillSelection({ ids, allowedIds, catalog: resolved.catalog, officialRoots: input.officialRoots });
}

/** Catalog provenance comes from its actual root, never the display source pill. */
export function isRetiredOfficialSkill(
  skill: { id: string; dir?: string },
  officialRoots: readonly (string | undefined)[],
): boolean {
  if (!isRetiredHyperFramesSkillId(String(resolveSkillId(skill.id))) || !skill.dir) return false;
  const directory = path.resolve(skill.dir);
  return officialRoots.some((root) => {
    if (!root) return false;
    const relative = path.relative(path.resolve(root), directory);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
}

export function officialSkillRootsForBundledPlugins(bundledPluginsDir?: string): string[] {
  if (!bundledPluginsDir) return [];
  const resourceRoot = path.resolve(bundledPluginsDir, '..', '..');
  return [path.join(resourceRoot, 'skills'), path.join(resourceRoot, 'design-templates')];
}

export function hasNewRetiredSkillSelection(input: {
  ids: readonly string[];
  catalog: readonly { id: string; dir?: string }[];
  officialRoots: readonly (string | undefined)[];
  allowedIds?: readonly string[];
}): boolean {
  const allowed = new Set((input.allowedIds ?? []).map((id) => resolveSkillId(id)));
  return input.ids.some((id) => {
    if (allowed.has(resolveSkillId(id))) return false;
    const skill = input.catalog.find((entry) => entry.id === resolveSkillId(id));
    return Boolean(skill && isRetiredOfficialSkill(skill, input.officialRoots));
  });
}

/** Snapshots outlive registry rows. An unknown legacy candidate cannot become a new selection. */
export function isRetiredOfficialSnapshot(
  snapshot: Pick<AppliedPluginSnapshot, 'pluginId' | 'resolvedSource'>,
  bundledPluginsDir?: string,
): boolean {
  if (!isRetiredHyperFramesPlugin({ id: snapshot.pluginId, sourceKind: 'bundled' })) return false;
  if (snapshot.resolvedSource) {
    if (isRetiredHyperFramesPlugin({ id: snapshot.pluginId, resolvedSource: snapshot.resolvedSource })) return true;
    if (path.isAbsolute(snapshot.resolvedSource)) {
      if (!bundledPluginsDir) return false;
      const relative = path.relative(path.resolve(bundledPluginsDir), path.resolve(snapshot.resolvedSource));
      return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
    }
    // A concrete remote source outside the official repository is affirmative
    // third-party provenance, even if its path happens to contain _official.
    if (/^(?:https?:|github:|team:)/i.test(snapshot.resolvedSource)) return false;
  }
  return true;
}

/** Resolve only known official repository/resource paths, never third-party names or tags. */
export function isRetiredOfficialInstallSource(source: string, bundledPluginsDir: string): boolean {
  const normalized = source.replaceAll('\\', '/').replace(/\/$/, '');
  let relative: string | null = null;
  if (/^github:nexu-io\/open-design(?:@[^\s]+)?\/plugins\/_official\//i.test(normalized)) {
    relative = normalized.slice(normalized.indexOf('/plugins/_official/') + '/plugins/_official/'.length);
  } else if (!/^[a-z]+:/i.test(source)) {
    const candidate = path.relative(path.resolve(bundledPluginsDir), path.resolve(source));
    if (candidate !== '..' && !candidate.startsWith(`..${path.sep}`) && !path.isAbsolute(candidate)) relative = candidate.split(path.sep).join('/');
  }
  if (!relative) return false;
  const [tier, directory] = relative.split('/');
  const id = tier === 'examples' ? `example-${directory}` : tier === 'video-templates' ? `video-template-${directory}` : tier;
  return isRetiredHyperFramesPlugin({ id, sourceKind: 'bundled' });
}

/** Only an unchanged persisted selection is a history reference. */
export function addsRetiredProjectMetadata(
  next: ProjectMetadata | null | undefined,
  previous?: ProjectMetadata | null,
): boolean {
  if (next?.intent === 'hyperframes' && previous?.intent !== 'hyperframes') return true;
  const template = next?.promptTemplate;
  return Boolean(template && isRetiredHyperFramesPromptTemplate(template.surface, template.id)
    && (previous?.promptTemplate?.surface !== template.surface || previous.promptTemplate.id !== template.id));
}

/** The caller's projectId only selects a row; all compatibility facts come from that row. */
export function projectAlreadyUsesRetiredPlugin(
  db: { prepare(sql: string): { get(...params: unknown[]): unknown } },
  projectId: unknown,
  plugin: { id?: string | undefined; sourceKind?: string | undefined; source?: string | undefined; sourceMarketplaceId?: string | undefined; resolvedSource?: string | undefined },
): boolean {
  if (!isRetiredHyperFramesPlugin(plugin) || typeof projectId !== 'string' || !projectId) return false;
  const row = db.prepare(`
    SELECT p.metadata_json AS metadataJson, s.plugin_id AS pluginId,
           s.project_id AS snapshotProjectId, s.resolved_source AS source
      FROM projects p LEFT JOIN applied_plugin_snapshots s ON s.id = p.applied_plugin_snapshot_id
     WHERE p.id = ?
  `).get(projectId) as { metadataJson?: string; pluginId?: string; snapshotProjectId?: string; source?: string } | undefined;
  if (!row) return false;
  if (row.pluginId === plugin.id && row.snapshotProjectId === projectId
    && (!row.source || row.source === plugin.source)) return true;
  let metadata: ProjectMetadata | undefined;
  try { metadata = row.metadataJson ? JSON.parse(row.metadataJson) as ProjectMetadata : undefined; } catch { return false; }
  const example = readVerifiedProjectExampleBinding(metadata);
  if (example && example.pluginId === plugin.id && example.pluginSource === plugin.source) return true;
  if (plugin.id !== 'example-hyperframes') return false;
  return readVerifiedProjectStrategyBinding(metadata)?.taskProfile === 'hyperframes'
    // Pre-binding project rows have only their persisted legacy intent. New
    // create/PATCH routes cannot introduce this intent after retirement.
    || metadata?.intent === 'hyperframes';
}
