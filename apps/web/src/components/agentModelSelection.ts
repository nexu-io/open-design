import type { AgentInfo, AgentModelChoice } from '../types';

type AgentModelSource =
  | {
      id: AgentInfo['id'];
      models?: Array<{ id: string; enabled?: boolean; default?: boolean }>;
    }
  | null
  | undefined;

export function defaultAgentModelId(agent: AgentModelSource): string | null {
  const models = agent?.models ?? [];
  return (
    models.find((model) => model.default === true && model.enabled !== false)?.id ??
    models.find((model) => model.enabled !== false)?.id ??
    null
  );
}

export function normalizeAgentModelChoice(
  agent: AgentModelSource,
  choice: AgentModelChoice | undefined,
): AgentModelChoice | null {
  const configuredModel =
    typeof choice?.model === 'string' && choice.model ? choice.model : null;
  if (agent?.id !== 'amr' || !configuredModel) return null;
  if (configuredModel === 'default') return null;

  const matchingModel = agent.models?.find((model) => model.id === configuredModel) ?? null;
  if (!matchingModel && (agent.models?.length ?? 0) === 0) {
    return null;
  }
  if (matchingModel && matchingModel.enabled !== false) return null;

  const fallbackModel = defaultAgentModelId(agent);
  if (!fallbackModel || fallbackModel === configuredModel) return null;

  return {
    ...choice,
    model: fallbackModel,
  };
}

export function effectiveAgentModelChoice(
  agent: AgentModelSource,
  choice: AgentModelChoice | undefined,
): AgentModelChoice | undefined {
  return normalizeAgentModelChoice(agent, choice) ?? choice;
}

/**
 * Whether `modelId` may be OFFERED to the user as a selectable model.
 *
 * This is the single definition of "locked" for every model-list surface — the
 * home composer's compact list, the execution-settings picker, and the project
 * composer's `AvatarMenu` list all ask it instead of re-deriving the rule. Only
 * AMR's catalog carries plan entitlement (`enabled: false` is what `vela model
 * list --json` reports for a model above the caller's plan); every other agent's
 * list is its own model ids and stays fully selectable.
 *
 * The invariant that makes it safe: this predicate is AT LEAST as strict as
 * `normalizeAgentModelChoice`. Every model normalization would coerce away is
 * unselectable here, so a surface that gates its rows on this can never offer a
 * pick that gets written and then silently reverted — which is exactly what the
 * compact list shipped with: the click was accepted, re-normalized back to the
 * default, and the chip snapped to the previous model with no explanation.
 * `agentModelSelection.test.ts` pins the strictness relation directly, so a
 * future change to either function that broke it would fail rather than quietly
 * reopen the silent-revert hole.
 */
export function agentModelIsSelectable(
  agent: AgentModelSource,
  modelId: string | null | undefined,
): boolean {
  if (!modelId) return false;
  if (agent?.id !== 'amr') return true;
  if (modelId === 'default') return true;
  const models = agent.models ?? [];
  // No catalog yet (vela not queried) — nothing to gate against, and no surface
  // can render a row for a model it has not been told about.
  if (models.length === 0) return true;
  const option = models.find((model) => model.id === modelId) ?? null;
  return option !== null && option.enabled !== false;
}
