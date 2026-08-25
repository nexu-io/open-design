import type { ProjectMetadata } from '@open-design/contracts';

import { findSkillById, type SkillInfo } from '../../skills.js';
import {
  captureFrozenSkillPackageFromSelections,
  createEmptyFrozenSkillPackage,
  normalizeSelectedSkillIds,
  type FrozenSkillPackageV1,
  type ResolvedFrozenSkillSourceV1,
} from './frozen-skill-package.js';
import {
  resolveProjectExampleSkillSource,
  type ResolveLocalPluginBySource,
} from './example-skill-source.js';

/** Lists the Skill-like entries this run may resolve a selection from. */
export type ListSessionSkillCatalog = () => Promise<readonly SkillInfo[]>;

export interface OdNextSessionSkillSelection {
  /** `ChatRequest.skillId`, falling back to the project row's persisted Skill. */
  skillId?: unknown;
  /** `ChatRequest.skillIds` — the composer's per-turn @-mentions. */
  skillIds?: unknown;
}

/**
 * The frozen Skill package an admitted OD Next task starts from.
 *
 * The invariant: **naming a Skill refines the task; it does not claim the
 * route.** A Skill the user @-mentioned, and an official example card they
 * picked, are both material the session selected inside a task type OD Next
 * already owns. Neither pins a plugin and neither diverts the run to the
 * ordinary route — they ride in through `session_skills/user_selected_skills`,
 * where the strategy's own conflict order puts them above the general
 * orchestration Skill and the task-type Skill.
 *
 * One task freezes ONE package, so both channels converge here before capture:
 * the package identity is a digest over the whole selection list, and two
 * packages would mean two identities for one task.
 *
 * Fail-soft throughout, for the same reason the example rail is: a Skill that
 * was deleted between picking and running, a catalogue that will not list, a
 * selection larger than the package bounds — each is a reason to run the task
 * without that material, never a reason to fail the user's run. The ordinary
 * route drops an unresolvable Skill silently too (`findSkillById` simply
 * misses), so this is the same contract, not a new leniency.
 */
export async function captureOdNextSessionSkillPackage(input: {
  metadata: ProjectMetadata | null | undefined;
  getLocalPluginBySource: ResolveLocalPluginBySource | undefined;
  selection: OdNextSessionSkillSelection;
  listSkillCatalog: ListSessionSkillCatalog | undefined;
}): Promise<FrozenSkillPackageV1> {
  const sources: ResolvedFrozenSkillSourceV1[] = [];
  const exampleSource = await resolveProjectExampleSkillSource({
    metadata: input.metadata,
    getLocalPluginBySource: input.getLocalPluginBySource,
  });
  if (exampleSource) sources.push(exampleSource);
  const skills = await resolveSessionSelectedSkills(input.selection, input.listSkillCatalog);
  if (skills.length === 0 && sources.length === 0) return createEmptyFrozenSkillPackage();
  try {
    return await captureFrozenSkillPackageFromSelections({ skills, sources });
  } catch (error) {
    warn(`selected Skills could not be frozen: ${describe(error)}`);
  }
  // Retry without the named Skills so a selection this daemon cannot freeze
  // never costs the project the example card it is bound to — the card is part
  // of how the project was created, the @-mention is one turn's choice.
  if (skills.length > 0 && sources.length > 0) {
    try {
      return await captureFrozenSkillPackageFromSelections({ sources });
    } catch (error) {
      warn(`example card could not be frozen either: ${describe(error)}`);
    }
  }
  return createEmptyFrozenSkillPackage();
}

/**
 * Resolve the Skills this turn named, dropping the ones this daemon cannot
 * see. Order follows the request: `skillId` first, then `skillIds`.
 */
async function resolveSessionSelectedSkills(
  selection: OdNextSessionSkillSelection,
  listSkillCatalog: ListSessionSkillCatalog | undefined,
): Promise<SkillInfo[]> {
  let requested: string[];
  try {
    requested = normalizeSelectedSkillIds(selection);
  } catch (error) {
    warn(`selected Skill ids were rejected; running without them: ${describe(error)}`);
    return [];
  }
  if (requested.length === 0) return [];
  if (!listSkillCatalog) {
    warn('no Skill catalogue is wired into this run route; running without selected Skills');
    return [];
  }
  let catalog: readonly SkillInfo[];
  try {
    catalog = await listSkillCatalog();
  } catch (error) {
    warn(`Skill catalogue could not be listed; running without selected Skills: ${describe(error)}`);
    return [];
  }
  const resolved: SkillInfo[] = [];
  for (const canonicalId of requested) {
    const skill = findSkillById(catalog, canonicalId);
    if (!skill || typeof skill.dir !== 'string' || !skill.dir) {
      warn(`selected Skill ${canonicalId} is unavailable; running without it`);
      continue;
    }
    resolved.push(skill);
  }
  return resolved;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function warn(message: string): void {
  console.warn(`[od-next-session-skills] ${message}`);
}
