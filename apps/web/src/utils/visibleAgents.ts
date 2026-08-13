import type { AgentInfo } from '../types';

const RETIRED_LOCAL_CLI_AGENT_IDS = new Set(['gemini']);
const HIDDEN_LOCAL_CLI_AGENT_IDS = new Set([
  'byok-opencode',
  ...RETIRED_LOCAL_CLI_AGENT_IDS,
]);

export function isRetiredLocalCliAgentId(
  agentId: string | null | undefined,
): boolean {
  return typeof agentId === 'string' && RETIRED_LOCAL_CLI_AGENT_IDS.has(agentId);
}

export function isVisibleLocalCliAgent(agent: Pick<AgentInfo, 'id'>): boolean {
  return !HIDDEN_LOCAL_CLI_AGENT_IDS.has(agent.id);
}
