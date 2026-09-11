import type { AgentInfo, AppConfig } from '../types';
import type { AgentReasoningOption, AgentModelPrefs } from '@open-design/contracts';

/** Model-owned options override the runtime fallback, including an empty list. */
export function reasoningOptionsForModel(
  agent: AgentInfo | null | undefined,
  modelId?: string | null,
): AgentReasoningOption[] {
  const model = agent?.models?.find((m) => m.id === modelId);
  const options = model?.reasoningOptions ?? agent?.reasoningOptions ?? [];
  if (agent?.id !== 'codex' || model?.reasoningOptions === undefined) return options;
  return [
    agent?.reasoningOptions?.find((r) => r.id === 'default') ?? { id: 'default', label: 'Default' },
    ...options.filter((r) => r.id !== 'default'),
  ];
}

/** Persist only choices the next model can use; Default delegates to the CLI. */
export function reconcileAgentChoice(
  agent: AgentInfo | null | undefined,
  previous: AgentModelPrefs,
  patch: AgentModelPrefs = {},
): AgentModelPrefs {
  const next = { ...previous, ...patch };
  if (agent?.id !== 'codex' || !next.reasoning || next.reasoning === 'default') return next;
  const options = reasoningOptionsForModel(agent, next.model ?? agent.models?.[0]?.id);
  return options.some((r) => r.id === next.reasoning)
    ? next : { ...next, reasoning: 'default' };
}

/** Reconcile loaded/refreshed metadata without causing a persistence render loop. */
export function reconcileAgentPreferences(config: AppConfig, agents: AgentInfo[]): AppConfig {
  let agentModels = config.agentModels;
  for (const agent of agents) {
    const previous = agentModels?.[agent.id];
    if (!previous) continue;
    const next = reconcileAgentChoice(agent, previous);
    if (next.reasoning !== previous.reasoning) {
      agentModels = { ...agentModels, [agent.id]: next };
    }
  }
  return agentModels === config.agentModels ? config : { ...config, agentModels };
}
