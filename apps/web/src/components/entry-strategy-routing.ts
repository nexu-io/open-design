import {
  automaticStrategyTaskProfileForProjectMetadata,
  type CreateProjectExampleReference,
  type ProjectMetadata,
  type ProjectScenarioTaskProfile,
} from '@open-design/contracts';

interface EntryStrategyRoutingInput {
  automaticStrategyTaskProfile?: ProjectScenarioTaskProfile | null;
  /** Official example card picked under an automatic OD Next route. */
  exampleReference?: CreateProjectExampleReference | null;
  skillId?: string | null;
  pluginInputs?: Record<string, unknown> | null;
}

export type EntryStrategyRoutingFields = {
  skillId: string | null;
  automaticStrategyTaskProfile?: ProjectScenarioTaskProfile;
  exampleReference?: CreateProjectExampleReference;
  pluginInputs?: Record<string, unknown>;
};

/**
 * Keep the Home-to-create handoff fail-closed: a claimed automatic route is
 * accepted only when the exact project metadata describes the same OD Next
 * task. Ordinary routes retain the existing Skill/plugin-input behavior.
 *
 * An `exampleReference` only means anything alongside the route it was claimed
 * for, so it rides the automatic branch exclusively — when re-validation
 * collapses the claim, the reference is dropped with it rather than smuggled
 * onto a project that is no longer on an OD Next route.
 *
 * A `skillId` crosses both branches. It used to be dropped on the automatic
 * one, back when a Skill and the automatic route were mutually exclusive
 * authorities; the daemon now freezes an explicitly selected Skill into
 * `session_skills/user_selected_skills` instead, so dropping it here would
 * silently discard the Skill the user @-mentioned. The claim is still
 * re-derived from the exact metadata, so this carries a Skill onto a route,
 * never onto a route it failed to prove.
 */
export function entryStrategyRoutingFields(
  input: EntryStrategyRoutingInput,
  metadata: ProjectMetadata,
): EntryStrategyRoutingFields {
  const automaticStrategyTaskProfile = input.automaticStrategyTaskProfile
    && input.automaticStrategyTaskProfile
      === automaticStrategyTaskProfileForProjectMetadata(metadata)
      ? input.automaticStrategyTaskProfile
      : null;
  if (automaticStrategyTaskProfile) {
    return {
      skillId: input.skillId ?? null,
      automaticStrategyTaskProfile,
      ...(input.exampleReference ? { exampleReference: input.exampleReference } : {}),
    };
  }
  return {
    skillId: input.skillId ?? null,
    ...(input.pluginInputs ? { pluginInputs: input.pluginInputs } : {}),
  };
}
