import type { AgentInfo } from '../types';

const HIDDEN_LOCAL_CLI_AGENT_IDS = new Set(['byok-opencode']);

export function isVisibleLocalCliAgent(agent: Pick<AgentInfo, 'id'>): boolean {
  return !HIDDEN_LOCAL_CLI_AGENT_IDS.has(agent.id);
}
