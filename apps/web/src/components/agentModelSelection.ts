import type { AgentInfo, AgentModelChoice, AppConfig } from '../types';
import { agentModelDisplayName } from '../utils/agentLabels';
import { apiProtocolAgentId, apiProtocolModelLabel } from '../utils/apiProtocol';

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

export function effectiveAgentModelId(
  agent: AgentModelSource,
  choice: AgentModelChoice | undefined,
): string | null {
  const configuredModel = effectiveAgentModelChoice(agent, choice)?.model?.trim();
  return configuredModel && configuredModel !== 'default'
    ? configuredModel
    : defaultAgentModelId(agent);
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

/**
 * Who a turn sent right now would be answered by: the identity stamped on the
 * assistant placeholder of a real turn and of the optimistic first turn a
 * Home send draws (OPEND-3334). One resolution, so the role row reads the
 * same on both sides of that hand-off.
 */
export function selectedAssistantIdentity(
  config: AppConfig,
  agents: readonly AgentInfo[],
): { agentId: string | undefined; agentName: string | undefined } {
  if (config.mode === 'daemon') {
    const selectedAgent = config.agentId
      ? agents.find((agent) => agent.id === config.agentId) ?? null
      : null;
    const selectedChoice = config.agentId ? config.agentModels?.[config.agentId] : undefined;
    const effectiveChoice = effectiveAgentModelChoice(selectedAgent, selectedChoice);
    return {
      agentId: config.agentId ?? undefined,
      agentName: agentModelDisplayName(config.agentId, selectedAgent?.name, effectiveChoice?.model),
    };
  }
  return {
    agentId: apiProtocolAgentId(config.apiProtocol),
    agentName: apiProtocolModelLabel(config.apiProtocol, config.model),
  };
}
