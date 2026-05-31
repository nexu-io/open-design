import type { AgentInfo, AgentModelChoice } from '../types';

type AgentModelSource = Pick<AgentInfo, 'id' | 'models'> | null | undefined;

export function normalizeAgentModelChoice(
  agent: AgentModelSource,
  choice: AgentModelChoice | undefined,
): AgentModelChoice | null {
  const configuredModel =
    typeof choice?.model === 'string' && choice.model ? choice.model : null;
  if (agent?.id !== 'amr' || !configuredModel) return null;

  const modelIds = agent.models?.map((model) => model.id) ?? [];
  if (modelIds.length === 0 || modelIds.includes(configuredModel)) {
    return null;
  }

  return {
    ...choice,
    model: modelIds[0],
  };
}

export function effectiveAgentModelChoice(
  agent: AgentModelSource,
  choice: AgentModelChoice | undefined,
): AgentModelChoice | undefined {
  return normalizeAgentModelChoice(agent, choice) ?? choice;
}
